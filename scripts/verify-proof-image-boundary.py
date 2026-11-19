"""Disposable local Docker proof only. No running containers or deployment.
Compare full exported filesystems, not only /app. No path exclusions.
"""
import hashlib
import json
import re
import subprocess
import sys
import tarfile
import threading
from pathlib import Path, PurePosixPath

PROOFS = {
    'runtime': ['scripts/verify-readonly-image.mjs'],
    'rollback': ['scripts/verify-rollback-image.mjs', 'scripts/verify-rollback-bootstrap-image.mjs', 'scripts/rollback-bootstrap-network-guard.mjs'],
}
CONFIG_KEYS = ['Env', 'Cmd', 'Entrypoint', 'User', 'WorkingDir', 'ExposedPorts', 'Volumes', 'Healthcheck', 'StopSignal', 'Labels', 'Shell', 'OnBuild']


def snapshot(stream):
    result = {}
    with tarfile.open(fileobj=stream, mode='r|*') as archive:
        for entry in archive:
            name = entry.name.removeprefix('./').removeprefix('/')
            if not name or name == '.':
                continue
            if '..' in name.split('/') or str(PurePosixPath(name)) != name or name in result:
                raise ValueError('Unsafe or duplicate export entry')
            if not (entry.isfile() or entry.isdir() or entry.issym() or entry.islnk()):
                raise ValueError('Unsupported export entry type: ' + name)
            digest = None
            if entry.isfile():
                h = hashlib.sha256()
                with archive.extractfile(entry) as content:
                    for block in iter(lambda: content.read(1024 * 1024), b''):
                        h.update(block)
                digest = h.hexdigest()
            metadata = {key: value for key, value in entry.pax_headers.items() if key not in ('mtime', 'atime', 'ctime')}
            result[name] = [entry.type.decode('ascii'), entry.mode, entry.uid, entry.gid, entry.linkname, digest, metadata]
    return result


def compare(parent_info, child_info, parent, child, proof_hashes):
    if parent_info['Id'] == child_info['Id']:
        raise ValueError('Proof must be a distinct child image')
    for info in (parent_info, child_info):
        if info['Config'].get('Volumes'):
            raise ValueError('Volumes prevent complete filesystem proof')
    if parent_info['Config'] != child_info['Config']:
        raise ValueError('Image configuration changed')
    for key in ('Os', 'Architecture', 'Variant'):
        if parent_info.get(key) != child_info.get(key):
            raise ValueError('Image platform changed')
    before = parent_info['RootFS']['Layers']
    after = child_info['RootFS']['Layers']
    if not before or len(after) != len(before) + 1 or after[:len(before)] != before:
        raise ValueError('Proof is not one added layer on the pinned parent')
    if set(parent) - set(child):
        raise ValueError('Parent filesystem entry removed')
    for name, value in parent.items():
        if child[name] != value:
            raise ValueError('Parent filesystem entry changed: ' + name)
    added = set(child) - set(parent)
    if added != set(proof_hashes):
        raise ValueError('Unexpected proof filesystem additions')
    for name, digest in proof_hashes.items():
        value = child[name]
        if value != ['0', 0o644, 0, 0, '', digest, {}]:
            raise ValueError('Proof script content or metadata differs: ' + name)


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True, timeout=120)


def export(image):
    container = docker('create', '--network', 'none', '--read-only', image).strip()
    if not re.fullmatch(r'[a-f0-9]{64}', container):
        raise ValueError('Unexpected container identifier')
    process = None
    timer = None
    try:
        process = subprocess.Popen(['docker', 'export', container], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        timer = threading.Timer(120, process.kill)
        timer.start()
        result = snapshot(process.stdout)
        if process.wait(timeout=120):
            raise ValueError('Filesystem export failed')
        return result
    finally:
        if timer:
            timer.cancel()
        if process and process.poll() is None:
            process.kill()
            process.wait()
        docker('rm', '-v', container)


def main(args):
    if len(args) != 3 or args[2] not in PROOFS or any(not re.fullmatch(r'sha256:[a-f0-9]{64}', v) for v in args[:2]):
        raise ValueError('Use immutable parent SHA, proof SHA, and runtime|rollback')
    parent_id, child_id, kind = args
    parent_info, child_info = (json.loads(docker('image', 'inspect', value))[0] for value in (parent_id, child_id))
    if parent_info['Id'] != parent_id or child_info['Id'] != child_id:
        raise ValueError('Image identity mismatch')
    root = Path(__file__).resolve().parent.parent
    hashes = {'app/' + path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in PROOFS[kind]}
    compare(parent_info, child_info, export(parent_id), export(child_id), hashes)
    print(json.dumps({'verified': True, 'parent': parent_id, 'proof': child_id, 'kind': kind, 'scope': 'full exported filesystem and application config; exact added proof scripts only; containers never started; no rollout or authentication proof'}))


if __name__ == '__main__':
    main(sys.argv[1:])
