import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {migrate} from '../migrate.mjs';
import {createStagingDatabase} from './helpers/staging-database.mjs';
import {probeIntegratedPreflight,integratedPreflightPins} from '../scripts/integrated-pair-preflight.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
for(const [phase,ref] of [['floor','6e85c69d3f1883bb4d82f7a3624aaf03567a15c6'],['successor','62c6fab8']])test('separate pinned '+phase+' source preflight proves only scoped metadata/nonexecution',{timeout:60000,skip:process.env.ROLLBACK_HISTORY_FREE_IMAGE_BUILD==='1'?'Pinned source-history fixture requires full checkout; native extracted-build diagnostic remains mandatory':false},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pp-preflight-source-'));
 const db=await createStagingDatabase({backend:'pglite'});
 try{
  const get=file=>execFileSync('git',['show',ref+':'+file],{cwd:root,timeout:10000,maxBuffer:1024*1024});
  const code=get('firm-scoped-snapshot.mjs'),sql=get('schema-drafts/firm-preview-boundary.sql');
  for(const [file,bytes] of [['firm-scoped-snapshot.mjs',code],['schema-drafts/firm-preview-boundary.sql',sql]])assert.equal(createHash('sha256').update(bytes).digest('hex'),integratedPreflightPins[phase][file]);
  await writeFile(join(directory,'snapshot.mjs'),code);const {createFirmScopedSnapshotLoader}=await import(pathToFileURL(join(directory,'snapshot.mjs')));
  await migrate(db.pool);await db.query(sql.toString());
  const result=await probeIntegratedPreflight({db,createLoader:createFirmScopedSnapshotLoader,expectedMetadata:phase==='successor'});
  assert.equal(result.runtimeCapability,false);assert.equal(result.can_execute,false);assert.equal(result.can_transfer,false);assert.equal(result.metadataInventory,phase==='successor');assert.equal(result.privacyVerified,true);
 }finally{await db.close();await rm(directory,{recursive:true,force:true});}
});
test('integrated runtime phase excludes draft appcode and preserves all fixed safety gates',async()=>{
 const source=await readFile(new URL('../scripts/integrated-pair-phase.mjs',import.meta.url),'utf8');
 assert.match(source,/existsSync/);assert.match(source,/preflightRuntimeUnavailableBoth:true/);assert.match(source,/legacyDisclosureAbsentOnFloor:true/);assert.match(source,/sponsorIdentityCompatible:true/);
 assert.match(source,/schema035_refused:true/);assert.match(source,/fullCompatibility:false/);assert.doesNotMatch(source,/import.*from ['"].*firm-scoped-snapshot/);
});
