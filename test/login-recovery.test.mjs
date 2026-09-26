import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {loginDestination} from '../login-destination.mjs';

const source=readFileSync(new URL('../login-client.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
function setup({deliveryFails=false,verified=false,next='/prospect'}={}){
  const elements=new Map(),calls={created:0,signedIn:0,sent:0};
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:true,setAttribute(){},reportValidity(){return true;},focus(){this.focused=true;}});return elements.get(id);};
  const message={textContent:''},user={emailVerified:verified,getIdToken:async()=> 'synthetic-token'};
  const context=vm.createContext({URL,loginDestination,location:{href:'https://example.test/login?next='+encodeURIComponent(next),assign:value=>{calls.destination=value;}},fetch:async()=>({ok:true}),document:{getElementById:element,querySelector:()=>message,querySelectorAll:()=>[]},initializeApp:()=>({}),config:{},getAuth:()=>({}),setPersistence:async()=>{},inMemoryPersistence:{},signOut:async()=>{},createUserWithEmailAndPassword:async()=>{calls.created++;return {user};},signInWithEmailAndPassword:async()=>{calls.signedIn++;return {user};},sendEmailVerification:async()=>{calls.sent++;if(deliveryFails)throw {code:'auth/network-request-failed'};}});
  vm.runInContext(source,context);
  element('email').value='workflow@example.test';element('password').value='synthetic-only';
  return {element,message,calls,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('account creation transitions to sign-in and explains password re-entry',async()=>{
  const app=setup();app.element('signUpMode').onclick();app.element('emailForm').onsubmit({preventDefault(){}});await app.flush();
  assert.equal(app.calls.created,1);assert.equal(app.calls.sent,1);
  assert.equal(app.element('submitEmail').textContent,'Sign in');
  assert.equal(app.element('password').value,'');assert.match(app.message.textContent,/re-enter your password/);
  app.element('resendVerification').onclick();assert.equal(app.element('password').focused,true);assert.equal(app.calls.signedIn,0);
  app.element('password').value='synthetic-only';app.element('emailForm').onsubmit({preventDefault(){}});await app.flush();
  assert.equal(app.calls.created,1);assert.equal(app.calls.signedIn,1);
});
test('failed verification delivery preserves created-account recovery',async()=>{
  const app=setup({deliveryFails:true});app.element('signUpMode').onclick();app.element('emailForm').onsubmit({preventDefault(){}});await app.flush();
  assert.match(app.message.textContent,/account was created, but/);assert.match(app.message.textContent,/Resend verification email/);
  assert.equal(app.element('submitEmail').textContent,'Sign in');assert.equal(app.element('resendVerification').hidden,false);assert.equal(app.element('password').value,'');
});
test('verified sign-in resumes the workspace but refuses an external return URL',async()=>{
 for(const [next,expected] of [['/prospect','/prospect'],['/lab?lead=abc-123','/lab?lead=abc-123'],['https://evil.example','/lab']]){
  const app=setup({verified:true,next});app.element('emailForm').onsubmit({preventDefault(){}});await app.flush();
  assert.equal(app.calls.destination,expected);assert.equal(app.element('password').value,'');
 }
});
