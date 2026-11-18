import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

test('synthetic demo starts with current migrations and serves its contact fixtures', {timeout:90000}, async()=>{
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
 const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(process.execPath,['scripts/demo.mjs'],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),
  env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',DEMO_PORT:String(port)},stdio:['ignore','pipe','pipe']
 });
 const closed=once(child,'close');let output='',errors='',timer;
 try{
  await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('Demo startup timed out')),60000);
   child.on('error',reject);
   child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-2000);});
   child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('Synthetic ProspectPilot demo:'))resolve();});
   child.on('exit',code=>reject(Error(`Demo exited before readiness (${code}): ${errors}`)));
  });
  clearTimeout(timer);
  const response=await fetch(`http://127.0.0.1:${port}/api/prospect/contacts`,{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.total,6,'three workflow fixtures and three synthetic daily leads');
  const review=await (await fetch(`http://127.0.0.1:${port}/api/prospect/daily-review`,{signal:AbortSignal.timeout(10000)})).json();
  assert.equal(review.counts.total,3,'the Daily review has a synthetic delivery to show');
  const origin=`http://127.0.0.1:${port}`;
  const audience=await fetch(origin+'/audience');assert.equal(audience.status,200);
  assert.match(audience.headers.get('content-security-policy'),/connect-src 'none'/);
  const audienceHTML=await audience.text();assert.match(audienceHTML,/SYNTHETIC DEMONSTRATION/);assert.match(audienceHTML,/id="download"/);
  for(const [path,type] of [['/audience-client.js','text/javascript'],['/audience-catalog.mjs','text/javascript'],['/audience.css','text/css']]){
   const asset=await fetch(origin+path);assert.equal(asset.status,200,path);assert.match(asset.headers.get('content-type'),new RegExp(type));assert.ok((await asset.text()).length>0);
  }
  const afterAudience=await (await fetch(origin+'/api/prospect/contacts')).json();assert.deepEqual(afterAudience,data,'manual guide does not mutate contacts');
  const wrongOrigin=await fetch(origin+'/api/prospect/lists',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(wrongOrigin.status,403);
  const hub=await fetch(origin+'/team-hub');assert.equal(hub.status,200);assert.match(await hub.text(),/Nothing moves here/);
  const context=await (await fetch(origin+'/api/team-hub/context')).json();assert.equal(context.synthetic,true);assert.equal(context.can_execute,false);
  const preview=await fetch(origin+'/api/team-hub/preview',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({source_uid:'demo-departing',target_uid:'demo-receiver'})});
  assert.equal(preview.status,200);const plan=await preview.json();assert.equal(plan.can_execute,false);assert.equal(plan.counts.contacts,3);
  const after=await (await fetch(origin+'/api/prospect/contacts')).json();assert.deepEqual(after,data,'hub preview does not mutate the contact workspace');
  const apply=await fetch(origin+'/api/team-hub/apply',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(apply.status,404);
 }finally{
  clearTimeout(timer);child.kill();await closed;
 }
});
