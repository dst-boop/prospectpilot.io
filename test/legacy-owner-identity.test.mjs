import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOwnershipTestDatabase} from './ownership-test-database.mjs';
import {createDatabase} from '../database.mjs';
import worker from '../generated/worker.mjs';

const API='/api/v3/discovery';
const csv='First Name,Last Name,Company,Title,Email\nJane,Smith,Example Consulting,Owner,jane@example.com';
async function fixture(t){
  const pg=await createOwnershipTestDatabase();t.after(()=>pg.close());
  await pg.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
  const db=createDatabase({query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})});
  async function call(path,{uid='new-owner',email='recycled@example.com',method='GET',body,env={}}={}){
    return worker.fetch(new Request('https://prospectpilot.io'+path,{method,headers:{'oai-authenticated-user-id':uid,'oai-authenticated-user-email':email,'content-type':typeof body==='string'?'text/csv':'application/json'},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),{DB:db,...env});
  }
  await call('/api/me',{uid:'admin',email:'admin@example.com'});
  const imported=await call(API+'/imports/csv',{uid:'old-owner',email:'recycled@example.com',method:'POST',body:csv});
  assert.equal(imported.status,201,await imported.clone().text());
  const original=(await pg.query('SELECT * FROM discovery_leads')).rows[0];
  // Recycle the contact email without touching the old lead's owner metadata.
  await call('/api/me',{uid:'old-owner',email:'changed@example.com'});
  await call('/api/me');
  return {pg,db,call,original};
}

test('legacy reads, patches, research, bulk and exports reject recycled-email and blank-owner records',async t=>{
  const {pg,call,original}=await fixture(t);
  await pg.query('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',['blank-owner',original.team,'','RECYCLED@EXAMPLE.COM',original.payload]);
  for(const id of [original.id,'blank-owner']){
    for(const path of [API+'/leads/'+id,'/api/research/records?lead_id='+id,'/api/research/job?lead_id='+id])assert.equal((await call(path)).status,404,path);
    assert.equal((await call(API+'/leads/'+id,{method:'PATCH',body:{notes:'unauthorized'}})).status,404);
    assert.equal((await call('/api/research/save',{method:'POST',body:{lead_id:id,source:'warn',excerpt:'Example Consulting',source_date:'2026-09-01',url:'https://example.com'}})).status,404);
    for(const action of ['update','delete','assign','reclaim','share']){
      const response=await call(API+'/leads/bulk',{method:'PATCH',body:{lead_ids:[id],action,follow_up_status:'Contacted',advisor_email:'recycled@example.com'}});
      assert.equal(response.status,200);const result=(await response.json()).result;assert.equal(result.updated,0,action);assert.equal(result.skipped,1,action);
    }
    assert.equal((await call('/api/enrichment/export',{method:'POST',body:{provider:'zoominfo',lead_ids:[id]}})).status,422);
    assert.equal((await call('/api/beta/calls',{method:'POST',body:{id:'synthetic_call_0001',lead_id:id,outcome:'Meeting booked'}})).status,404);
  }
  assert.equal((await (await call(API+'/leads')).json()).total,0);
  assert.equal((await (await call('/api/research/leads')).json()).leads.length,0);
  assert.equal((await (await call('/api/enrichment/leads')).json()).leads.length,0);
  assert.equal((await (await call('/api/beta/week')).json()).total_owned,0);
  const rows=(await pg.query('SELECT * FROM discovery_leads ORDER BY id')).rows;
  assert.equal(rows.length,2);for(const row of rows){assert.equal(row.payload,original.payload);assert.equal(row.owner_user_id,row.id==='blank-owner'?'':'old-owner');}
});

test('same UID retains ownership after email change; explicit sharing remains read/workflow access only',async t=>{
  const {pg,call,original}=await fixture(t);
  const owner={uid:'old-owner',email:'changed@example.com'};
  assert.equal((await call(API+'/leads/'+original.id,owner)).status,200);
  assert.equal((await (await call(API+'/leads?ownership=mine',owner)).json()).total,1);
  assert.equal((await (await call('/api/beta/week',owner)).json()).total_owned,1);
  assert.equal((await (await call('/api/enrichment/leads',owner)).json()).leads.length,1);
  assert.equal((await call(API+'/leads/'+original.id,{...owner,method:'PATCH',body:{company:'Changed Company'}})).status,200);
  assert.equal((await call(API+'/leads/'+original.id,{uid:'admin',email:'admin@example.com'})).status,200);
  const current=(await pg.query('SELECT payload FROM discovery_leads WHERE id=$1',[original.id])).rows[0];
  await pg.query('UPDATE discovery_leads SET payload=$1 WHERE id=$2',[JSON.stringify({...JSON.parse(current.payload),shared_with:['RECYCLED@EXAMPLE.COM']}),original.id]);
  assert.equal((await call(API+'/leads/'+original.id)).status,200);
  assert.equal((await (await call(API+'/leads?ownership=mine')).json()).total,0);
  assert.equal((await (await call(API+'/leads?ownership=shared')).json()).total,1);
  assert.equal((await call(API+'/leads/'+original.id,{method:'PATCH',body:{company:'Unauthorized'}})).status,403);
  assert.equal((await call(API+'/leads/'+original.id,{method:'PATCH',body:{notes:'Shared workflow note'}})).status,200);
  assert.equal((await call('/api/research/save',{method:'POST',body:{lead_id:original.id}})).status,403);
  assert.equal((await (await call('/api/enrichment/leads')).json()).leads.length,0);
  const result=(await (await call(API+'/leads/bulk',{method:'PATCH',body:{action:'delete',lead_ids:[original.id]}})).json()).result;
  assert.equal(result.updated,0);assert.equal(result.skipped,1);
  const row=(await pg.query('SELECT owner_user_id,owner_email FROM discovery_leads WHERE id=$1',[original.id])).rows[0];
  assert.equal(row.owner_user_id,'old-owner');assert.equal(row.owner_email,'recycled@example.com');
});

test('legacy imports deduplicate only writable ownership scope, never a recycled-email record',async t=>{
  const {pg,call,original}=await fixture(t);
  for(let i=0;i<2;i++){
    const response=await call(API+'/imports/csv',{method:'POST',body:csv});assert.equal(response.status,201,await response.clone().text());
    const result=await response.json();assert.equal(result.saved,i===0?1:0);assert.equal(result.duplicates,i===0?0:1);
  }
  const rows=(await pg.query('SELECT * FROM discovery_leads')).rows;assert.equal(rows.length,2);
  const old=rows.find(r=>r.id===original.id);assert.equal(old.payload,original.payload);assert.equal(old.owner_user_id,'old-owner');
  assert.equal(rows.filter(r=>r.owner_user_id==='new-owner').length,1);
});

test('enrichment commit rejects a same-email UID reassignment after preview',async t=>{
  const {pg,call,original}=await fixture(t);
  const owner={uid:'old-owner',email:'changed@example.com'};
  const response=await call('/api/enrichment/preview',{...owner,method:'POST',body:{provider:'zoominfo',csv:'Email,Business Phone\njane@example.com,6315550123'}});
  assert.equal(response.status,200,await response.clone().text());const plan=await response.json();assert.equal(plan.counts.ready,1);
  await pg.query('UPDATE discovery_leads SET owner_user_id=$1 WHERE id=$2',['new-owner',original.id]);
  assert.equal((await call('/api/enrichment/commit',{...owner,method:'POST',body:{batch_id:plan.batch_id}})).status,409);
  assert.equal((await pg.query('SELECT payload FROM discovery_leads WHERE id=$1',[original.id])).rows[0].payload,original.payload);
});

test('atomic enrichment guard rejects UID transfer between ownership read and commit',async t=>{
  const {pg,db,call,original}=await fixture(t);
  const owner={uid:'old-owner',email:'changed@example.com'};
  await pg.query('UPDATE discovery_leads SET owner_email=$1 WHERE id=$2',[owner.email,original.id]);
  const preview=await call('/api/enrichment/preview',{...owner,method:'POST',body:{provider:'zoominfo',csv:'Email,Business Phone\njane@example.com,6315550123'}});
  assert.equal(preview.status,200);const plan=await preview.json();assert.equal(plan.counts.ready,1);
  const batch=db.batch.bind(db);let transferred=false;
  db.batch=async statements=>{
    if(!transferred){transferred=true;await pg.query('UPDATE discovery_leads SET owner_user_id=$1 WHERE id=$2',['new-owner',original.id]);}
    return batch(statements);
  };
  const committed=await call('/api/enrichment/commit',{...owner,method:'POST',body:{batch_id:plan.batch_id}});
  assert.equal(committed.status,409,await committed.clone().text());assert.equal(transferred,true);
  const row=(await pg.query('SELECT owner_user_id,payload FROM discovery_leads WHERE id=$1',[original.id])).rows[0];
  assert.equal(row.owner_user_id,'new-owner');assert.equal(row.payload,original.payload);
  assert.equal((await pg.query('SELECT status FROM enrichment_batches WHERE id=$1',[plan.batch_id])).rows[0].status,'preview');
});
