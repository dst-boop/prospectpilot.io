"""Prepared only: fixed isolated staging bootstrap. Never prints credential material."""
import os
import json
import secrets
import subprocess
import urllib.request
import time
import sys
import re

PROJECT = 'prospectpilot-stg-261118'
INSTANCE = 'prospectpilot-stg-db'
SECRET = 'prospectpilot-stg-bootstrap-postgres-password'
BASE = 'https://sqladmin.googleapis.com/v1/projects/' + PROJECT
phase = 'preflight'
env = {**os.environ, 'CLOUDSDK_CORE_LOG_HTTP': 'false', 'CLOUDSDK_CORE_VERBOSITY': 'error'}


def gc(args, data=None):
    result = subprocess.run(
        ['gcloud', *args, '--project', PROJECT, '--quiet', '--verbosity=error'],
        input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, check=False)
    if result.returncode:
        raise RuntimeError('gcloud failed')
    return result.stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('Unexpected redirect')


def main():
    global phase
    # API cannot prove that postgres currently has no password. A fresh-state
    # attestation is mandatory; inventory below independently rejects app state.
    if os.environ.get('STAGING_CONFIRM_FRESH_UNSET_POSTGRES') != PROJECT + ':' + INSTANCE:
        raise RuntimeError('Explicit fresh-state attestation required')
    forbidden = {'http_proxy', 'https_proxy', 'all_proxy', 'ssl_cert_file',
                 'ssl_cert_dir', 'requests_ca_bundle', 'curl_ca_bundle',
                 'cloudsdk_core_custom_ca_certs_file'}
    for key, value in os.environ.items():
        lower = key.lower()
        if value and (lower in forbidden or lower.startswith('cloudsdk_api_endpoint_overrides_') or lower.startswith('cloudsdk_proxy_')):
            raise RuntimeError('Transport override forbidden')
    # Reading local gcloud configuration is not a network action. Reject persisted
    # endpoint/proxy/custom-CA overrides before retrieving credentials or secrets.
    configuration = json.loads(gc(['config', 'list', '--format=json']))
    if any(configuration.get('api_endpoint_overrides', {}).values()) or any(configuration.get('proxy', {}).values()) or configuration.get('core', {}).get('custom_ca_certs_file'):
        raise RuntimeError('Persisted transport override forbidden')
    token = gc(['auth', 'print-access-token']).decode().strip()
    if not token:
        raise RuntimeError('No credential')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)

    def api(path, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            BASE + path, data=data, method='GET' if body is None else 'PUT',
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with opener.open(request, timeout=45) as response:
            return json.load(response)

    def inventory():
        instance = api('/instances/' + INSTANCE)
        expected = {'name': INSTANCE, 'region': 'us-central1',
                    'databaseVersion': 'POSTGRES_16', 'state': 'RUNNABLE',
                    'connectionName': PROJECT + ':us-central1:' + INSTANCE}
        if any(instance.get(k) != v for k, v in expected.items()):
            raise RuntimeError('Instance identity/state mismatch')
        if instance.get('masterInstanceName') or instance.get('replicaNames'):
            raise RuntimeError('Not an isolated standalone instance')
        users = api('/instances/' + INSTANCE + '/users')
        databases = api('/instances/' + INSTANCE + '/databases')
        # Do not silently ignore pagination or API warnings/partial inventories.
        if users.get('nextPageToken') or databases.get('nextPageToken') or users.get('warnings') or databases.get('warnings'):
            raise RuntimeError('Incomplete inventory')
        entries = users.get('items')
        if not isinstance(entries, list) or len(entries) != 1:
            raise RuntimeError('Unexpected existing users')
        user = entries[0]
        if user.get('name') != 'postgres' or user.get('type', 'BUILT_IN') != 'BUILT_IN':
            raise RuntimeError('Unexpected existing user')
        entries = databases.get('items')
        if not isinstance(entries, list) or not entries:
            raise RuntimeError('Missing database inventory')
        names = [entry.get('name') for entry in entries]
        # Cloud SQL manages postgres and internal template/cloudsqladmin DBs.
        # Never permit any application database, even if it looks empty.
        if 'postgres' not in names or any(name not in {'postgres', 'template0', 'template1', 'cloudsqladmin'} for name in names):
            raise RuntimeError('Unexpected existing database')

    inventory()
    password = secrets.token_urlsafe(48)
    phase = 'persist bootstrap secret'
    # Atomic create rejects existing SECRET. Never replace it or rotate on retry.
    gc(['secrets', 'create', SECRET, '--replication-policy=automatic', '--data-file=-'], password.encode())
    phase = 'repeat fresh-state inventory'
    inventory()
    phase = 'set isolated postgres password'
    operation = api('/instances/' + INSTANCE + '/users?name=postgres',
                    {'name': 'postgres', 'password': password})
    name = operation.get('name', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', name):
        raise RuntimeError('Unexpected operation')
    phase = 'wait for SQL operation'
    deadline = time.monotonic() + 300
    while operation.get('status') != 'DONE':
        if time.monotonic() >= deadline:
            raise RuntimeError('Operation pending')
        time.sleep(3)
        operation = api('/operations/' + name)
    if operation.get('error'):
        raise RuntimeError('SQL operation failed')
    # Deliberately silent on success. Exit status is the local result; independently
    # verify operation metadata and actual DB login before claiming deploy readiness.


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never output exception objects, response bodies, secrets, tokens or args.
        print('Stopped during ' + phase + '. Inspect staging metadata before any retry.', file=sys.stderr)
        sys.exit(1)
