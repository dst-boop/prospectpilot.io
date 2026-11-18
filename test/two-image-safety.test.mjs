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
