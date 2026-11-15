import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTeamLeadHub} from '../team-lead-hub.mjs';
import {createSyntheticTeamHubAdapters} from '../scripts/team-hub-demo.mjs';
import {createHandler} from '../handler.mjs';
import {loginDestination} from '../login-destination.mjs';
const origin = 'https://preview.example.test';
const actor = {uid:'synthetic-demo', email:'supervisor@example.test', email_verified:true, firebase:{sign_in_provider:'password'}};
const input = {source_uid:'demo-departing', target_uid:'demo-receiver'};
const request = (path, {method='GET', body, headers={}} = {}) => new Request(origin + path, {method, headers:{origin, 'Content-Type':'application/json', ...headers}, ...(body === undefined ? {} : {body:typeof body === 'string' ? body : JSON.stringify(body)})});
function fixture() {
  const options = createSyntheticTeamHubAdapters(); let reads = 0;
  for (const [object, key] of [[options,'listAdvisors'], [options.plannerAdapters,'resolveAccount'], [options.plannerAdapters,'loadSnapshot']]) {
    const original = object[key]; object[key] = async (...args) => { reads++; return original(...args); };
  }
  const hub = createTeamLeadHub({...options, page:'<h1>Team Lead Hub</h1>', script:'void 0;', style:'body{}', synthetic:true});
  return {options, hub, reads:() => reads, run:(body=input, who=actor, headers={}) => hub.route(request('/api/team-hub/preview',{method:'POST',body,headers}),who)};
}
test('supervisor context is minimized and cannot execute', async () => {
  const f = fixture(), response = await f.hub.route(request('/api/team-hub/context'), actor), data = await response.json();
  assert.equal(response.status,200); assert.equal(data.can_execute,false); assert.equal(data.synthetic,true); assert.equal(data.advisors.length,3);
  assert.deepEqual(Object.keys(data.advisors[0]).sort(),['disabled','email_verified','label','uid']);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('preview returns blockers and exact IDs, remains stable and read-only when repeated', async () => {
  const f=fixture(), a=await (await f.run()).json(), b=await (await f.run()).json();
  assert.deepEqual(a,b); assert.equal(a.can_execute,false); assert.equal(a.counts.contacts,3); assert.deepEqual(a.proposed_record_ids.contacts,['demo-contact-1','demo-contact-2','demo-contact-3']);
  for (const code of ['identity_collision','unfinished_work','existing_shares','departed_access_not_revoked','data_rights_review','apply_not_implemented']) assert.ok(a.blockers.some(row=>row.code===code));
});
for (const path of ['/team-hub','/team-hub-client.js','/team-hub.css','/api/team-hub/context','/api/team-hub/preview']) test('non-supervisor is refused before reads at '+path, async () => {
  const f=fixture(), response=await f.hub.route(request(path),{uid:'advisor',role:'admin',team:'synthetic-firm',email:actor.email});
  assert.equal(response.status,403); assert.equal(f.reads(),0);
});
test('anonymous, absent policy and malformed policy fail closed', async () => {
  const f=fixture(); assert.equal((await f.run(input,null)).status,401); assert.equal(f.reads(),0);
  assert.equal((await createTeamLeadHub().route(request('/team-hub'),actor)).status,503);
  for (const grant of [true, {approved:true,scope:'other',actorUid:actor.uid,team:'firm'}, {approved:true,scope:'team-lead-hub-preview',actorUid:'other',team:'firm'}]) {
    const hub=createTeamLeadHub({authorizeSupervisor:async()=>grant,listAdvisors:()=>{throw Error('must not run');}});
    assert.equal((await hub.route(request('/api/team-hub/context'),actor)).status,403);
  }
});
test('cross-team pair grants cannot use a supervisor grant from a different team', async () => {
  const f=fixture(); f.options.plannerAdapters.authorize=async()=>({approved:true,scope:'advisor-reassignment-preview',sourceUid:input.source_uid,targetUid:input.target_uid,team:'foreign-firm'});
  const response=await f.run(); assert.equal(response.status,403); assert.equal(f.reads(),1,'only authorized roster was read');
});
test('missing pair authorization and outside-team IDs never resolve accounts or snapshot', async () => {
  const f=fixture(); delete f.options.plannerAdapters.authorize; assert.equal((await f.run()).status,403); assert.equal(f.reads(),1);
  assert.equal((await f.run({...input,target_uid:'foreign'})).status,403); assert.equal(f.reads(),2);
});
for (const [name,body,status] of [['extra role',{...input,role:'admin'},422], ['client snapshot',{...input,snapshot:{}},422], ['same account',{...input,target_uid:input.source_uid},422], ['malformed JSON','{',400], ['array',[],422], ['null','null',422], ['oversized',' '.repeat(2049),413]]) test('rejects '+name+' without roster reads',async()=>{
  const f=fixture();assert.equal((await f.run(body)).status,status);assert.equal(f.reads(),0);
});
test('exact same origin and JSON are required for the non-mutating POST',async()=>{
  const f=fixture();assert.equal((await f.run(input,actor,{origin:'https://elsewhere.test'})).status,403);assert.equal((await f.run(input,actor,{'Content-Type':'text/plain'})).status,415);assert.equal(f.reads(),0);
});
test('no apply, transfer, unknown operation or preview GET exists',async()=>{
  const f=fixture();for(const path of ['/api/team-hub/apply','/api/team-hub/transfer','/team-hub/apply'])assert.equal((await f.hub.route(request(path,{method:'POST',body:input}),actor)).status,404);
  const response=await f.hub.route(request('/api/team-hub/preview'),actor);assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'POST');assert.equal(f.reads(),0);
});
test('receiving account eligibility is rechecked on the server',async()=>{
  const f=fixture();assert.equal((await f.run({...input,target_uid:'demo-unverified'})).status,422);
});
test('internal adapter errors are redacted',async()=>{
  for(const status of [undefined,500,409,503,599]) {
    const f=fixture();f.options.plannerAdapters.loadSnapshot=async()=>{throw Object.assign(Error('database secret with contact email'),{status});};
    const response=await f.run();assert.equal(response.status,[409,503].includes(status)?status:500);assert.doesNotMatch(await response.text(),/secret|contact email/);
  }
});
test('sign-in resumes the hub without preserving arbitrary query data',()=>{
  assert.equal(loginDestination('/team-hub'),'/team-hub');assert.equal(loginDestination('/team-hub?source_uid=private'),'/team-hub');assert.equal(loginDestination('//evil.test/team-hub'),'/lab');
});
test('reversed demo preview uses the same source and recipient ownership inventory',async()=>{
  const f=fixture(), forward=await (await f.run()).json(), reverse=await (await f.run({source_uid:input.target_uid,target_uid:input.source_uid})).json();
  assert.equal(forward.counts.contacts,reverse.counts.targetContacts);assert.equal(forward.counts.targetContacts,reverse.counts.contacts);assert.deepEqual(reverse.proposed_record_ids.contacts,['demo-existing-1']);
});
test('Firebase handler authenticates and reserves hub paths before any legacy fallback',async()=>{
  let legacy=0;
  const f=fixture(), handler=createHandler({auth:{verifySessionCookie:async cookie=>{if(cookie!=='valid')throw Error();return actor;}},origins:[origin],ownerEmail:actor.email,worker:{fetch:()=>{legacy++;return Response.json({legacy:true});}},teamHub:f.hub});
  assert.equal((await handler(request('/api/team-hub/context'))).status,401);
  const page=await handler(request('/team-hub'));assert.equal(page.status,303);assert.match(page.headers.get('location'),/login/);
  const response=await handler(request('/api/team-hub/preview',{method:'POST',body:input,headers:{cookie:'__session=valid'}}));assert.equal(response.status,200);
  assert.equal((await handler(request('/api/team-hub/apply',{method:'POST',body:input,headers:{cookie:'__session=valid'}}))).status,404);assert.equal(legacy,0);
});
test('production default has no synthetic policy or data adapter',()=>{
  const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/createSyntheticTeamHubAdapters|team-hub-demo|authorizeSupervisor:|plannerAdapters:/);
  for(const name of ['team-lead-hub.mjs','advisor-reassignment-preview.mjs','team-hub.html','team-hub-client.js','team-hub.css']) {
    assert.ok(readFileSync(new URL('../Dockerfile',import.meta.url),'utf8').includes(name));
    assert.ok(readFileSync(new URL('../.dockerignore',import.meta.url),'utf8').includes('!'+name));
  }
});
