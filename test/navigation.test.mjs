import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('primary workspaces retain unique action targets and consistent navigation',()=>{
 for(const file of ['lab.html','prospect.html']){
  const html=read(file),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,file+' has unique control IDs');
  const nav=html.match(/<nav aria-label="Workspace">([\s\S]*?)<\/nav>/)[1];
  const primary=nav.split('<details')[0];assert.deepEqual([...primary.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['/lab','/prospect']);
  assert.match(nav,/<summary>Settings &amp; tools<\/summary>/);assert.match(nav,/href="\/settings\/linkedin"/);
 }
 const lab=read('lab.html');assert.doesNotMatch(lab,/id="startImport"|data-queue=|Choose directory contacts|Open contact directory/);
 assert.match(lab,/id="quickImport"/);assert.match(lab,/id="profileOpen"/);assert.match(lab,/id="workView"/);
 assert.match(read('prospect.html'),/id="dailyOpen"/);assert.match(read('prospect.html'),/id="sendToWorklist"/);
});
