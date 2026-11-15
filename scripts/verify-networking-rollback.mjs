// Non-deploying release gate. Test the actual reviewed rollback module in its
// extracted source tree against a disposable PostgreSQL database. A pass is
// behavioral evidence, not proof of which image is currently serving.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateRollbackTestURL, withRollbackDatabase, verifyNetworkingRollback} from '../test/helpers/networking-rollback.mjs';

validateRollbackTestURL(process.env.POSTGRES_TEST_URL);
const args = process.argv.slice(2);
if (args.length && (args.length !== 4 || args[0] !== '--forget-module' || args[2] !== '--contact-keys-module'))
  throw Error('Usage: node scripts/verify-networking-rollback.mjs [--forget-module path/to/rollback/forget.mjs --contact-keys-module path/to/rollback/prospect-workspace.mjs]');
const moduleURL = args.length ? pathToFileURL(resolve(args[1])) : new URL('../forget.mjs', import.meta.url);
const keysURL = args.length ? pathToFileURL(resolve(args[3])) : new URL('../prospect-workspace.mjs', import.meta.url);
const {forgetPerson} = await import(moduleURL.href);
const {identityLookupKeys: contactKeys} = await import(keysURL.href);
if (typeof forgetPerson !== 'function') throw Error('Rollback module must export forgetPerson');
if (typeof contactKeys !== 'function') throw Error('Rollback contact-key module must export identityLookupKeys');
const result = await withRollbackDatabase('postgres', pool => verifyNetworkingRollback(pool, forgetPerson, {contactKeys}));
const sha256 = url => createHash('sha256').update(readFileSync(url)).digest('hex');
console.log(JSON.stringify({gate: 'networking-rollback-privacy', status: 'passed',
  forget_sha256: sha256(moduleURL), contact_keys_module_sha256: sha256(keysURL), ...result}));
