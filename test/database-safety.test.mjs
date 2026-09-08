import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase,postgresSQL} from '../database.mjs';
test('SQL parameters ignore comments, quoted identifiers, and dollar quoted bodies',()=>{
 const sql=`SELECT '?' AS "?", $$?$$, $body$?$body$, ? /* ? /* ? */ */ -- ?\n, ?`;
 assert.equal(postgresSQL(sql),sql.replace(', ? /*',', $1 /*').replace('\n, ?','\n, $2'));
 assert.equal(postgresSQL("SELECT 'json_each(?)', json_each(?)"),"SELECT 'json_each(?)', jsonb_array_elements_text($1::jsonb)");
 assert.equal(postgresSQL(' INSERT OR IGNORE INTO t VALUES(?);'),' INSERT INTO t VALUES($1) ON CONFLICT DO NOTHING');
});
test('values remain parameters, never interpolated into SQL',async()=>{
 let seen;const db=createDatabase({query:async(sql,values)=>{seen={sql,values};return {rows:[]};}});
 const payload="x'; DROP TABLE discovery_leads; --";
 await db.prepare('SELECT * FROM discovery_leads WHERE id=?').bind(payload).all();
 assert.equal(seen.sql,'SELECT * FROM discovery_leads WHERE id=$1');assert.deepEqual(seen.values,[payload]);
});
test('failed rollback evicts connection and preserves original failure',async()=>{
 const original=new Error('statement failed'),rollback=new Error('connection lost');let released;
 const db=createDatabase({connect:async()=>({query:async sql=>{if(sql==='BEGIN')return {};if(sql==='ROLLBACK')throw rollback;throw original;},release:error=>released=error})});
 await assert.rejects(db.batch([db.prepare('SELECT ?').bind(1)]),error=>error===original);assert.equal(released,rollback);
});
test('empty transactions do not acquire connections',async()=>{
 const db=createDatabase({connect:()=>{throw Error('unexpected connect');}});assert.deepEqual(await db.batch([]),[]);
});
