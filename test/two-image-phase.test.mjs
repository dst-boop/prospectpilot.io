import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTwoImageEnvironment,validateTwoImageReceipt} from '../scripts/two-image-phase.mjs';
const nonce='a'.repeat(24),schema='pp_two_'+nonce;
const env={TWO_IMAGE_SYNTHETIC:'1',ROLLBACK_SYNTHETIC_BOOTSTRAP:'1',TWO_IMAGE_NONCE:nonce,TWO_IMAGE_SCHEMA:schema,TWO_IMAGE_KEY:'synthetic-two-image-'+'b'.repeat(64),STAGING_DATABASE_URL:'postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test',PGHOST:'127.0.0.1',PGPORT:'5432'};
test('two-image phase restricts fixture/database/key settings',()=>{
 assert.equal(validateTwoImageEnvironment(env).schema,schema);
 for(const changes of [{NODE_ENV:'production'},{TWO_IMAGE_SYNTHETIC:'0'},{ROLLBACK_SYNTHETIC_BOOTSTRAP:'0'},{TWO_IMAGE_NONCE:'x'},{TWO_IMAGE_SCHEMA:'public'},{TWO_IMAGE_KEY:'real-key'},{PGOPTIONS:'-c search_path=public'},{PGPASSWORD:'anything'},{FORGET_TOMBSTONE_KEY:'anything'},{PGPORT:'5433'},{PGHOST:'localhost'},{STAGING_DATABASE_URL:env.STAGING_DATABASE_URL.replace(':5432',':0')},{STAGING_DATABASE_URL:env.STAGING_DATABASE_URL.replace('127.0.0.1','remote.example')},{STAGING_DATABASE_URL:env.STAGING_DATABASE_URL+'?sslmode=require'}])assert.throws(()=>validateTwoImageEnvironment({...env,...changes}));
});
test('two-image receipt contains bounded digest and exact synthetic binding only',()=>{
 const receipt={version:1,nonce,schema,digest:'c'.repeat(64)};
 assert.deepEqual(validateTwoImageReceipt(JSON.stringify(receipt),{nonce,schema}),receipt);
 for(const bad of [{...receipt,nonce:'d'.repeat(24)},{...receipt,schema:'public'},{...receipt,key:'secret'},{...receipt,digest:'notsha256'},{...receipt,version:2},null,[]])assert.throws(()=>validateTwoImageReceipt(JSON.stringify(bad),{nonce,schema}));
 assert.throws(()=>validateTwoImageReceipt('x'.repeat(16385),{nonce,schema}));assert.throws(()=>validateTwoImageReceipt('{',{nonce,schema}));
});
test('phase is image-contained, does not own schema deletion, and declares product incompatibility',()=>{
 const source=readFileSync(new URL('../scripts/two-image-phase.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/DROP SCHEMA|CREATE SCHEMA|spawnSync|execFile/);
 assert.match(source,/startRollbackRuntime/);assert.match(source,/fullCompatibility:false/);assert.match(source,/schema035_refused:true/);
 assert.match(source,/Every successor row retained before floor writes/);
});
