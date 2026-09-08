import test from 'node:test';
import assert from 'node:assert/strict';
import {createDomainChecker,recentDomainFailure} from '../prospect-domain-check.mjs';
const contact={email:'synthetic@example.com'};
const missing=()=>Promise.reject(Object.assign(Error('No record'),{code:'ENODATA'}));
test('domain checking distinguishes MX, null MX, address fallback and transient failures',async()=>{
 for(const [mx,v4,v6,expected] of [
  [async()=>[{priority:10,exchange:'mx.example.com'}],missing,missing,'mx_present'],
  [async()=>[{priority:0,exchange:''}],missing,missing,'null_mx'],
  [async()=>[{priority:0,exchange:'.'},{priority:10,exchange:'mx.example.com'}],missing,missing,'unknown'],
  [missing,async()=>['192.0.2.1'],missing,'address_fallback'],
  [missing,missing,missing,'no_mail_route'],
  [async()=>{throw Object.assign(Error(),{code:'ENOTFOUND'});},missing,missing,'no_domain'],
  [async()=>{throw Object.assign(Error(),{code:'ETIMEOUT'});},missing,missing,'unknown'],
  [missing,async()=>{throw Object.assign(Error(),{code:'ESERVFAIL'});},missing,'unknown'],
 ]){const check=createDomainChecker({resolver:{resolveMx:mx,resolve4:v4,resolve6:v6}});assert.equal((await check(contact)).status,expected);}
});
test('checks cache by domain without refreshing observation time or leaking another address',async()=>{
 let calls=0,time=Date.now();const check=createDomainChecker({now:()=>time,resolver:{resolveMx:async()=>{calls++;return [{priority:0,exchange:''}];}}});
 const first=await check(contact);time+=1000;const second=await check({email:'different@example.com'});
 assert.equal(calls,1);assert.equal(second.cached,true);assert.equal(second.email,'different@example.com');assert.equal(second.checked_at,first.checked_at);
 time+=16*60000;await check(contact);assert.equal(calls,2);
 await assert.rejects(check({...contact,suppressed:true}),{status:422});await assert.rejects(check({email:'person@localhost'}),{status:422});
});
test('only a recent matching definitive domain result avoids paid verification',()=>{
 const now=Date.now(),base={...contact,email_domain_check:{domain:'example.com',status:'null_mx',checked_at:new Date(now).toISOString()}};
 assert.equal(recentDomainFailure(base,now),true);
 for(const patch of [{domain:'other.example'},{status:'unknown'},{checked_at:'bad'},{checked_at:new Date(now+1000).toISOString()},{checked_at:new Date(now-16*60000).toISOString()}])assert.equal(recentDomainFailure({...base,email_domain_check:{...base.email_domain_check,...patch}},now),false);
});
test('special-use domains are not queried through the resolver',async()=>{
 const check=createDomainChecker({resolver:{resolveMx:()=>{throw Error('Unexpected query');}}});
 for(const email of ['a@example.invalid','a@company.internal','a@local.test'])assert.equal((await check({email})).status,'special_use');
});
