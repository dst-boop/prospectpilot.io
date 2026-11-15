// Non-deploying release gate. Test the actual reviewed rollback module in its
// extracted source tree against a disposable PostgreSQL database. A pass is
// behavioral evidence, not proof of which image is currently serving.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateRollbackTestURL, withRollbackDatabase, verifyNetworkingRollback} from '../test/helpers/networking-rollback.mjs';

validateRollbackTestURL(process.env.POSTGRES_TEST_URL);
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--forget-module'))
  throw Error('Usage: node scripts/verify-networking-rollback.mjs [--forget-module path/to/rollback/forget.mjs]');
const moduleURL = args.length ? pathToFileURL(resolve(args[1])) : new URL('../forget.mjs', import.meta.url);
const {forgetPerson} = await import(moduleURL.href);
if (typeof forgetPerson !== 'function') throw Error('Rollback module must export forgetPerson');
const result = await withRollbackDatabase('postgres', pool => verifyNetworkingRollback(pool, forgetPerson));
console.log(JSON.stringify({gate: 'networking-rollback-privacy', status: 'passed', ...result}));
