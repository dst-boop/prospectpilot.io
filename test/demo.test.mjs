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
  env:{...process.env,NODE_ENV:'test',DEMO_PORT:String(port)},stdio:['ignore','pipe','pipe']
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
 }finally{
  clearTimeout(timer);child.kill();await closed;
 }
});
