import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('legacy tools disclose paused writes and incomplete parity before navigation',()=>{
 const page=read('lab.html'),section=page.match(/<details data-legacy-tool hidden>(.*?)<\/details>/s)?.[1];
 assert.ok(section);
 assert.match(section,/<summary>Legacy tools · limited access<\/summary>/);
 assert.match(section,/Legacy identity-changing writes are paused/);
 assert.match(section,/some viewing and export functions/);
 assert.match(section,/href="\/prospect\?import=1"/);
 for(const path of ['/lab','#researchTools','#historicalReviews'])assert.ok(section.includes(`href="${path}"`));
 assert.match(section,/assignment, bulk deletion and provider-specific workflows do not have full replacements/);
 assert.match(section,/Administrator visibility does not grant team assignment authority/);
 for(const path of ['/discovery','/research','/enrichment'])assert.ok(section.includes(`href="${path}"`));
 assert.ok(section.indexOf('Legacy identity-changing writes are paused')<section.indexOf('href="/discovery"'));
});
test('legacy disclosure stays hidden unless the server grants existing administrator visibility',()=>{
 assert.match(read('lab-client.js'),/link.hidden=me.capabilities\?\.legacy_tools!==true/);
 assert.match(read('handler.mjs'),/legacy_tools:!!ownerEmail&&claims.email.toLowerCase\(\)===ownerEmail.toLowerCase\(\)/);
});
