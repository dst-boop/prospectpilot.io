import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('initial034 CI retains immutable floor rehearsal independently of successor source',()=>{
 const runner=read('scripts/verify-pinned034-upgrade.mjs');
 assert.match(runner,/pinned034='9f840ac9e07a9051055bdd3eb97857f0d2645392'/);
 assert.match(runner,/\['worktree','add','--detach',dir,pinned034\]/);
 assert.match(runner,/initial034ChildEnvironment\(process.env\)/);
 assert.match(runner,/if\(result.status!==0\)throw/);
 const workflow=read('.github/workflows/tests.yml');
 assert.match(workflow,/run: node scripts\/verify-pinned034-upgrade.mjs --postgres/);
 assert.match(workflow,/run: node scripts\/initial034-rehearsal.mjs --postgres/);
});
test('successor source check remains exact HEAD while copied fixture provenance stays frozen',()=>{
 const source=read('test/initial034.rehearsal.mjs');
 assert.match(source,/target='358e0c9d8d737fb6c1082fae829c17f96cafb7dc'/);
 assert.match(source,/runtimeTarget=git\(\['rev-parse','HEAD\^\{commit\}'\]\)/);
 assert.match(source,/git\(\['ls-tree','-r','--name-only',runtimeTarget\]\)/);
 assert.ok(source.includes("git(['show',runtimeTarget+':'+file])"));
 assert.match(source,/git\(\['show',target\+':test\/full-upgrade.rehearsal.mjs'\]\)/);
});
