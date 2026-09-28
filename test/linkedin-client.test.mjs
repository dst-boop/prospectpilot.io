import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){
 const elements=new Map(),calls=[],navigation=[];let response={configured:true,connection:null},failed=false;
 const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,disabled:false,focus(){}});return elements.get(id);};
 const context=vm.createContext({URL,URLSearchParams,Date,history:{replaceState(){}},location:{search:'?result=connected',pathname:'/settings/linkedin',assign:url=>navigation.push(url)},document:{getElementById:el,querySelectorAll:()=>['connect','disconnect','remove','cancel','reload'].map(el)},fetch:async(url,options)=>{calls.push({url,options});if(failed)throw Error('Offline');return {ok:true,json:async()=>response};}});
 vm.runInContext(readFileSync(new URL('../linkedin-client.js',import.meta.url),'utf8').replace('void action(async()=>{});',''),context);
 return {el,calls,navigation,run:code=>vm.runInContext(code,context),respond:value=>{response=value;},fail:value=>{failed=value;}};
}
test('connection UI covers setup, connected, expired, and retry after network failure',async()=>{
 const f=fixture();f.respond({configured:false,connection:null});await f.run('action(async()=>{})');assert.equal(f.el('connect').disabled,true);assert.equal(f.el('setup').hidden,false);
 f.respond({configured:true,connection:{name:'Synthetic Member',expired:false,expiresAt:'2026-11-01',connectedAt:'2026-09-01'}});await f.run('action(async()=>{})');assert.equal(f.el('status').textContent,'Connected');assert.equal(f.el('disconnect').hidden,false);
 f.respond({configured:true,connection:{name:'Synthetic Member',expired:true,expiresAt:'2026-01-01',connectedAt:'2025-09-01'}});await f.run('action(async()=>{})');assert.match(f.el('status').textContent,/expired/);assert.equal(f.el('connect').textContent,'Reconnect LinkedIn');
 f.fail(true);await f.run('action(async()=>{})');assert.equal(f.el('connect').disabled,true);assert.match(f.el('status').textContent,/unavailable/);
 f.fail(false);await f.el('reload').onclick();assert.equal(f.el('connect').disabled,false);
});
test('disconnect requires explicit confirmation and cancelling performs no request',async()=>{
 const f=fixture();f.el('disconnect').onclick();assert.equal(f.el('confirm').hidden,false);f.el('cancel').onclick();assert.equal(f.el('confirm').hidden,true);assert.equal(f.calls.length,0);
 await f.el('remove').onclick();assert.equal(f.calls.filter(c=>c.url.endsWith('/disconnect')&&c.options.method==='POST').length,1);
});
test('connect refuses off-domain redirects and navigates only to LinkedIn',async()=>{
 const f=fixture();f.respond({url:'https://evil.example/authorize'});await f.el('connect').onclick();assert.equal(f.navigation.length,0);assert.match(f.el('message').textContent,/Invalid authorization/);
 f.respond({url:'https://www.linkedin.com/oauth/v2/authorization?state=synthetic'});await f.el('connect').onclick();assert.equal(f.navigation.length,1);
});
