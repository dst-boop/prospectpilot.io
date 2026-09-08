import test from 'node:test';import assert from 'node:assert/strict';import {createNativeResearch} from '../native-research.mjs';
test('registry requires exact company and matching city before saving structured facts',async()=>{
 const lead={id:'r',company:'Example LLC',city:'Albany'};
 const get=async url=>({text:JSON.stringify(String(url).includes('gleif.org')?{data:[
 {attributes:{lei:'123',entity:{legalName:{name:'Example LLC'},legalAddress:{city:'Albany',country:'US'},status:'ACTIVE'},registration:{lastUpdateDate:'2026-09-01'}}},
 {attributes:{lei:'456',entity:{legalName:{name:'Example LLC'},legalAddress:{city:'Boston'}}}},
 {attributes:{lei:'789',entity:{legalName:{name:'Other LLC'},legalAddress:{city:'Albany'}}}}
 ]}:{articles:[]})});
 const result=await createNativeResearch({get})(lead,'registry');
 assert.equal(result.records.length,1);assert.equal(result.records[0].facts.find(f=>f.field==='legal_entity_identifier').value,'123');
});
test('MWBE rejects longer names containing the company but accepts exact DBA',async()=>{const lead={id:'m',company:'Example',city:'Albany'};let rows=[{vendor_formal_name:'Example Unrelated Services',city:'Albany'}];const get=async u=>({text:JSON.stringify(String(u).includes('cityofnewyork')?rows:{articles:[]})});assert.equal((await createNativeResearch({get})(lead,'mwbe')).records.length,0);rows=[{vendor_formal_name:'Registered Company LLC',vendor_dba:'Example',city:'Albany'}];assert.equal((await createNativeResearch({get})(lead,'mwbe')).records.length,1);rows=[{vendor_formal_name:'Example',city:'Boston'}];assert.equal((await createNativeResearch({get})(lead,'mwbe')).records.length,0);});
