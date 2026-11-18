import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTwoImageEnvironment,validateTwoImagePins,validateTwoImageChanges,parseTwoImageOutput} from '../scripts/two-image-safety.mjs';
const url='postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test';
const pins={floor:{commit:'a'.repeat(40),tree:'b'.repeat(40)},successor:{commit:'c'.repeat(40),tree:'d'.repeat(40)},allowedChangedFiles:['plan-catalog.mjs','research-lab.mjs','lab-client.js','test/plan-sponsor-identity.test.mjs','PLAN-SPONSOR-IDENTITY.md']};
test('two-image requires literal disposable native destination without inherited connection overrides',()=>{
 assert.equal(validateTwoImageEnvironment({STAGING_DATABASE_URL:url}).config.host,'127.0.0.1');
 for(const override of [{NODE_ENV:'production'},{DOCKER_HOST:'tcp://remote'},{DOCKER_CONTEXT:'remote'},{PGHOST:'127.0.0.1'},{STAGING_DATABASE_URL:url.replace('127.0.0.1','localhost')},{STAGING_DATABASE_URL:url.replace('prospectpilot_test','prod')},{STAGING_DATABASE_URL:url+'?sslmode=require'},{STAGING_DATABASE_URL:''}])assert.throws(()=>validateTwoImageEnvironment({STAGING_DATABASE_URL:url,...override}));
});
test('two-image pins require distinct exact trees and genuine narrow application changes',()=>{
 assert.equal(validateTwoImagePins(pins),pins);validateTwoImageChanges(pins.allowedChangedFiles,pins);
 for(const files of [['plan-catalog.mjs'],[...pins.allowedChangedFiles,'server.mjs'],[...pins.allowedChangedFiles,'migrations/035.sql']])assert.throws(()=>validateTwoImageChanges(files,pins));
 assert.throws(()=>validateTwoImagePins({...pins,successor:pins.floor}));
 assert.throws(()=>validateTwoImagePins({...pins,allowedChangedFiles:['server.mjs']}));
});
test('two-image requires installed network guard and clean bounded fixture-bound receipts',()=>{
 const identity={nonce:'a'.repeat(24),schema:'pp_two_'+'a'.repeat(24)};
 const receipt={version:1,...identity,digest:'b'.repeat(64)};
 const output=(r=receipt,n=0)=>'SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED\nTWO_IMAGE_RECEIPT:'+JSON.stringify(r)+'\n'+JSON.stringify({synthetic_bootstrap_network_guard:true,denied_operations:n});
 assert.deepEqual(parseTwoImageOutput(output(),identity),receipt);
 for(const bad of [output(receipt,1),output({...receipt,nonce:'wrong'}),output().replace('SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED',''),output()+'\nTWO_IMAGE_RECEIPT:'+JSON.stringify(receipt)])assert.throws(()=>parseTwoImageOutput(bad,identity));
 const floor={verified:true,...identity,external_calls:0,fullCompatibility:false};
 assert.deepEqual(parseTwoImageOutput(output().replace('TWO_IMAGE_RECEIPT:'+JSON.stringify(receipt),'TWO_IMAGE_RESULT:'+JSON.stringify(floor)),identity,'floor'),floor);
});

test('overlay base uses run-owned tag with exact immutable ID and sanitized failure categories',async()=>{
 const {twoImageBaseTag,verifyTwoImageTagId,classifyTwoImageBuildFailure}=await import('../scripts/two-image-safety.mjs');
 const tag=twoImageBaseTag('a'.repeat(24),'floor');assert.equal(tag,'pp-two-image-'+'a'.repeat(24)+'-floor:synthetic');
 for(const [nonce,phase] of [['../bad','floor'],['a'.repeat(24),'production']])assert.throws(()=>twoImageBaseTag(nonce,phase));
 const id='sha256:'+'b'.repeat(64);verifyTwoImageTagId(id+'\n',id);assert.throws(()=>verifyTwoImageTagId('sha256:'+'c'.repeat(64),id));
 assert.throws(()=>verifyTwoImageTagId('not-id','not-id'));
 assert.equal(classifyTwoImageBuildFailure('secret: pull access denied'),'base-resolution');
 assert.equal(classifyTwoImageBuildFailure('invalid reference format private-value'),'invalid-reference');
 assert.equal(classifyTwoImageBuildFailure('unknown private-value'),'unspecified');
});

test('overlay orchestration checks local tag before and after build and only removes run-owned tag names',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../scripts/two-image-rehearsal.mjs',import.meta.url),'utf8');
 assert.match(source,/image','tag',built\[phase\],tag/);
 assert.equal((source.match(/await verifyTag\(\);/g)||[]).length,2);
 assert.match(source,/FROM \$\{tag\}/);assert.match(source,/'build','--pull=false'/);
 assert.match(source,/docker\(\['image','rm',tag\]/);assert.doesNotMatch(source,/\['image','rm',(?:id|built\[)/);
 assert.match(source,/stage:"base-built"/);assert.match(source,/stage:"runtime-hashes-verified"/);
});
