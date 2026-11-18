import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {validateSyntheticBootstrapNetworkEnvironment,allowsSyntheticDatabaseSocket} from '../scripts/rollback-bootstrap-network-guard.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('synthetic bootstrap network scope requires explicit marker and exact loopback database',()=>{
 const good={ROLLBACK_SYNTHETIC_BOOTSTRAP:'1',PGHOST:'127.0.0.1',PGPORT:'5432'};
 assert.deepEqual(validateSyntheticBootstrapNetworkEnvironment(good),{port:5432});
 for(const env of [{},{...good,ROLLBACK_SYNTHETIC_BOOTSTRAP:'0'},{...good,PGHOST:'localhost'},{...good,PGHOST:'169.254.169.254'},{...good,PGPORT:'0'},{...good,PGPORT:'65536'},{...good,PGPORT:'5432x'}])assert.throws(()=>validateSyntheticBootstrapNetworkEnvironment(env));
 for(const args of [[{host:'127.0.0.1',port:5432}],[5432,'127.0.0.1'],[[{host:'127.0.0.1',port:'5432'}]]])assert.equal(allowsSyntheticDatabaseSocket(args,5432),true);
 for(const args of [[{host:'example.invalid',port:5432}],[{host:'127.0.0.1',port:443}],[{host:'localhost',port:5432}],[{host:'0.0.0.0',port:5432}],[5432],[{host:'127.0.0.1',port:5432,path:'/tmp/socket'}]])assert.equal(allowsSyntheticDatabaseSocket(args,5432),false);
});
test('test-only preload permits selected local socket but denies fetch HTTP TLS DNS and other sockets',{timeout:10000},()=>{
 const script=`import assert from 'node:assert/strict';import net from 'node:net';import http from 'node:http';import https from 'node:https';import tls from 'node:tls';import dns from 'node:dns';import {installSyntheticBootstrapNetworkGuard} from './scripts/rollback-bootstrap-network-guard.mjs';
 const server=net.createServer(socket=>socket.end('synthetic'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;const guard=installSyntheticBootstrapNetworkGuard({port});
 try{const bound=net.createServer();await new Promise(r=>bound.listen(0,'0.0.0.0',r));await new Promise(r=>bound.close(r));const data=await new Promise((resolve,reject)=>{let text='';const socket=net.connect({host:'127.0.0.1',port});socket.on('data',b=>text+=b);socket.on('end',()=>resolve(text));socket.on('error',reject);});assert.equal(data,'synthetic');
 for(const action of [()=>fetch('https://example.invalid'),()=>http.get('http://example.invalid'),()=>https.request('https://example.invalid'),()=>tls.connect({host:'127.0.0.1',port}),()=>net.connect({host:'169.254.169.254',port:80}),()=>net.connect({host:'127.0.0.1',port:port===65535?port-1:port+1}),()=>dns.lookup('example.invalid',()=>{}),()=>dns.resolve4('example.invalid',()=>{}),()=>dns.lookupService('192.0.2.1',80,()=>{})])assert.throws(action,/forbids/);
 await assert.rejects(dns.promises.lookupService('192.0.2.1',80),/forbids/);assert.equal(guard.deniedOperations(),10);console.log('synthetic-network-test-passed');}finally{await new Promise(r=>server.close(r));}`;
 const result=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:root,env:{PATH:process.env.PATH},encoding:'utf8',timeout:8000});
 assert.match(result,/synthetic-network-test-passed/);assert.match(result,/"denied_operations":10/);
});
test('bootstrap rehearsal and network helper reach the image without production preload wiring',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('Dockerfile'),/^COPY scripts \.\/scripts$/m);
 assert.match(read('.dockerignore'),/^!scripts\/\*\*$/m);
 assert.match(read('.github/workflows/tests.yml'),/scripts\/verify-rollback-bootstrap-image\.mjs --synthetic-image/);
 for(const p of ['server.mjs','rollback-server.mjs','rollback-bootstrap.mjs','research-worker.mjs'])assert.doesNotMatch(read(p),/rollback-bootstrap-network-guard|ROLLBACK_SYNTHETIC_BOOTSTRAP/);
});

test('actual bootstrap harness rejects missing or unsafe database configuration before connecting',{timeout:10000},()=>{
 for(const extra of [{},{STAGING_DATABASE_URL:'not a url'},{STAGING_DATABASE_URL:'postgres://postgres:synthetic-ci-only@127.0.0.1:0/prospectpilot_test'},{STAGING_DATABASE_URL:'postgres://user:synthetic-secret@example.invalid/production'},{STAGING_DATABASE_URL:'postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test',PGHOST:'production.invalid'}]){
  assert.throws(()=>execFileSync(process.execPath,['scripts/verify-rollback-bootstrap-image.mjs','--synthetic-image'],{cwd:root,env:{PATH:process.env.PATH,...extra},stdio:'pipe',timeout:2000}),error=>{assert.equal(error.status,1);assert.doesNotMatch(String(error.stderr),/synthetic-secret@example/);return true;});
 }
});
