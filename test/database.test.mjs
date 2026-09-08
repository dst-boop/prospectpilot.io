import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {createDatabase,postgresSQL} from '../database.mjs';import worker from '../generated/worker.mjs';
test('PostgreSQL supports app import, deduplication and atomic enrichment guards',async()=>{
const pg=new PGlite();await pg.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
const pool={query:(...args)=>pg.query(...args),connect:async()=>({query:(...args)=>pg.query(...args),release(){}})};const db=createDatabase(pool);
assert.equal(postgresSQL("SELECT '?' AS literal, ? AS value"),"SELECT '?' AS literal, $1 AS value");
const ids=await db.prepare('SELECT value FROM json_each(?)').bind('["one","two"]').all();assert.deepEqual(ids.results.map(r=>r.value),['one','two']);
const headers={'oai-authenticated-user-id':'verified-owner','oai-authenticated-user-email':'dst@financialplannersofamerica.com'};
const csv='First Name,Last Name,Email Address,Route,Age Basis,DNC Status\nTest,Person,test@example.com,HOLD_UNKNOWN_AGE,UNKNOWN,UNSCRUBBED';
for(let i=0;i<2;i++){const r=await worker.fetch(new Request('https://prospectpilot.io/api/v3/discovery/imports/csv?provider=qualifier',{method:'POST',headers,body:csv}),{DB:db});assert.equal(r.status,201,await r.clone().text());const body=await r.json();assert.equal(body.saved,i===0?1:0);assert.equal(body.duplicates,i===0?0:1);}
await db.prepare('INSERT OR IGNORE INTO lead_call_blocks(phone,lead_id,user_id,reason,created_at) VALUES(?,?,?,?,?)').bind('123','one','owner','blocked','now').run();await db.prepare('INSERT OR IGNORE INTO lead_call_blocks(phone,lead_id,user_id,reason,created_at) VALUES(?,?,?,?,?)').bind('123','one','owner','blocked','now').run();
await assert.rejects(db.batch([db.prepare('INSERT INTO enrichment_commit_guards VALUES(?,?)').bind('valid',1),db.prepare('INSERT INTO enrichment_commit_guards VALUES(?,?)').bind('invalid',0)]));assert.equal(await db.prepare('SELECT * FROM enrichment_commit_guards WHERE id=?').bind('valid').first(),null);
await db.prepare('INSERT INTO wealthfeed_connections VALUES(?,?,?,?,?)').bind('owner','encrypted','connection','today',Date.now()).run();
const result=await worker.fetch(new Request('https://prospectpilot.io/api/beta/week',{headers}),{DB:db});assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json()).ready,0);
const original=(await pg.query('SELECT payload FROM discovery_leads LIMIT 1')).rows[0].payload;
await db.prepare('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) SELECT ?,team,?,?,? FROM discovery_leads LIMIT 1').bind('other-lead','other-owner','other@example.com',original).run();
await db.prepare('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) SELECT ?,team,?,?,? FROM discovery_leads LIMIT 1').bind('email-owned','legacy-owner','DST@FINANCIALPLANNERSOFAMERICA.COM',original).run();
const owned=await worker.fetch(new Request('https://prospectpilot.io/api/beta/week',{headers}),{DB:db});assert.equal((await owned.json()).total_owned,2);
const preview=await worker.fetch(new Request('https://prospectpilot.io/api/enrichment/preview',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({provider:'zoominfo',csv:'Email,Business Phone\ntest@example.com,6315550123'})}),{DB:db});
assert.equal(preview.status,200,await preview.clone().text());const plan=await preview.json();
// Remove duplicate fixture so email matching has exactly one owned target.
if(!plan.counts.ready){await db.prepare('DELETE FROM discovery_leads WHERE id=?').bind('email-owned').run();}
const fresh=await worker.fetch(new Request('https://prospectpilot.io/api/enrichment/preview',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({provider:'zoominfo',csv:'Email,Business Phone\ntest@example.com,6315550123'})}),{DB:db});const ready=await fresh.json();assert.equal(ready.counts.ready,1);
const commitRequest=()=>new Request('https://prospectpilot.io/api/enrichment/commit',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({batch_id:ready.batch_id})});
const committed=await worker.fetch(commitRequest(),{DB:db});assert.equal(committed.status,200,await committed.clone().text());assert.equal((await committed.json()).applied,1);
const replay=await worker.fetch(commitRequest(),{DB:db});assert.equal((await replay.json()).replayed,true);
await pg.close();});
