import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInitial034Environment,initial034ChildEnvironment} from '../scripts/initial034-safety.mjs';
const url='postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test';
const good={STAGING_DATABASE_URL:url,SYNTHETIC_POSTGRES_CONTAINER:'a'.repeat(64)};
test('initial034 rehearsal requires exact native disposable destination and local container ID',()=>{
 assert.deepEqual(validateInitial034Environment(good),{connectionString:url,containerId:'a'.repeat(64)});
 for(const overrides of [{STAGING_DATABASE_URL:''},{NODE_ENV:'production'},{PGHOST:'127.0.0.1'},{SYNTHETIC_POSTGRES_CONTAINER:'postgres'},{SYNTHETIC_POSTGRES_CONTAINER:'a'.repeat(63)},{STAGING_DATABASE_URL:url.replace('127.0.0.1','localhost')},{STAGING_DATABASE_URL:url.replace('127.0.0.1','production.invalid')},{STAGING_DATABASE_URL:url.replace('prospectpilot_test','production')},{STAGING_DATABASE_URL:url+'?options=anything'},{POSTGRES_TEST_URL:url.replace('5432','5433')},{STAGING_DATABASE_URL:url.replace('5432','0')}])assert.throws(()=>validateInitial034Environment({...good,...overrides}));
});
test('initial034 runner passes only synthetic settings, excluding cloud credentials/provider keys and remote Docker context',()=>{
 const clean=initial034ChildEnvironment({...good,PATH:'/usr/bin',HOME:'/tmp/synthetic',GOOGLE_APPLICATION_CREDENTIALS:'/secret',ANTHROPIC_API_KEY:'not-a-real-key',DOCKER_HOST:'tcp://production.invalid:2375',DOCKER_CONTEXT:'production',DATABASE_URL:'private'});
 assert.deepEqual(Object.keys(clean).sort(),['NODE_ENV','INITIAL034_NATIVE_REQUIRED','SYNTHETIC_STAGING','STAGING_DATABASE_URL','POSTGRES_TEST_URL','SYNTHETIC_POSTGRES_CONTAINER','PATH','HOME'].sort());
 assert.equal(clean.STAGING_DATABASE_URL,url);assert.equal(clean.POSTGRES_TEST_URL,url);assert.equal(clean.NODE_ENV,'test');
});
