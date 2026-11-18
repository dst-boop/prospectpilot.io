import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('both deletion views disclose limits and retention without guaranteeing reimport prevention or DNC status',()=>{
 for(const path of ['prospect-client.js','lab.html']){
  const text=read(path);
  assert.match(text,/Existing do-not-call blocks, identity markers and accounting records are retained/);
  assert.match(text,/Older import reports may retain details/);
  assert.match(text,/Reimport checks may not recognize older or changed identifiers/);
  assert.doesNotMatch(text,/They will not be imported|Nothing about this person remains|A do-not-call block keeps the number/);
 }
});
test('both deletion success messages avoid claiming full erasure',()=>{
 for(const path of ['prospect-client.js','lab-client.js']){
  const text=read(path);
  assert.match(text,/Deletion completed\. Existing do-not-call blocks, identity markers and accounting records are retained\. Older import reports may retain details\./);
  assert.doesNotMatch(text,/Nothing about this person remains/);
 }
});
