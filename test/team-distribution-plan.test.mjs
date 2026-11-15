import test from 'node:test';
import assert from 'node:assert/strict';
import {createTeamDistributionPlanner, DISTRIBUTION_PLAN_VERSION} from '../team-distribution-plan.mjs';
import {createTeamLeadHub} from '../team-lead-hub.mjs';
const actor={uid:'boss'}, input={source_uid:'departed',recipient_uids:['a','b']};
function fixture() {
 const snapshot={complete:true,firmId:'firm',version:'v1',asOf:'2026-11-15T12:00:00.000Z',source:{uid:'departed',firmId:'firm',status:'departed'},
 recipients:['a','b'].map(uid=>({uid,firmId:'firm',status:'active',emailVerified:true,disabled:false,version:'v1',activeAssignments:0,capacity:2})),
 leads:[1,2,3,4,5].map(n=>({id:'l'+n,version:'v1',firmId:'firm',advisorUid:'departed',followUpAt:n===1?'2026-11-14T12:00:00.000Z':null,holds:n===1?['dnc']:[],recipientRights:['a','b'].map(uid=>({uid,decision:'allowed',version:'v1'}))}))};
 let reads=0,checks=0;
 const adapters={firmId:'firm',authorize:async scope=>{checks++;return {...scope,scope:DISTRIBUTION_PLAN_VERSION,approved:true};},loadSnapshot:async()=>{reads++;return snapshot;}};
 return {snapshot,adapters,plan:(body=input,who=actor)=>createTeamDistributionPlanner(adapters)(body,who),reads:()=>reads,checks:()=>checks};
}
test('balanced bounded preview preserves holds without granting outreach or execution',async()=>{
 const f=fixture(), p=await f.plan(); assert.deepEqual(p.counts,{total:5,planned:4,held:1});
 assert.deepEqual(p.assignments.map(r=>r.recipientUid),['a','b','a','b']);
 assert.equal(p.assignments[0].overdue,true);assert.deepEqual(p.assignments[0].preservedHolds,['dnc']);
 assert.ok(p.assignments.every(r=>r.outreachAuthorized===false));assert.equal(p.can_execute,false);
 assert.deepEqual(p.held,[{leadId:'l5',reason:'capacity'}]);assert.equal(f.checks(),2);
 assert.ok(f.snapshot.leads.every(l=>l.advisorUid==='departed'),'no mutation');
});
test('relative load and explicit rights guide allocation, not inferred recipient suitability',async()=>{
 const f=fixture();f.snapshot.recipients[0].activeAssignments=1;f.snapshot.recipients[1].capacity=4;
 f.snapshot.leads[0].recipientRights[1].decision='review';
 const p=await f.plan(); assert.equal(p.assignments[0].recipientUid,'a');assert.ok(p.assignments.slice(1).every(r=>r.recipientUid==='b'));
});
test('unknown rights holds records and capacity zero is never exceeded',async()=>{
 const f=fixture();f.snapshot.leads.forEach(l=>l.recipientRights.forEach(r=>r.decision='review'));
 assert.ok((await f.plan()).held.every(r=>r.reason==='recipient_rights_review'));
 f.snapshot.leads.forEach(l=>l.recipientRights.forEach(r=>r.decision='allowed'));f.snapshot.recipients.forEach(r=>r.capacity=0);
 assert.equal((await f.plan()).assignments.length,0);
});
test('deterministic ordering/fingerprint survives database array order',async()=>{
 const f=fixture(),p=await f.plan();f.snapshot.recipients.reverse();f.snapshot.leads.reverse();f.snapshot.leads.forEach(l=>l.recipientRights.reverse());
 assert.deepEqual(await f.plan({...input,recipient_uids:['b','a']}),p);
});
test('snapshot and rights version changes invalidate fingerprint',async()=>{
 const f=fixture(),p=await f.plan();f.snapshot.leads[0].recipientRights[0].version='v2';assert.notEqual((await f.plan()).fingerprint,p.fingerprint);
});
test('authorization denies before inventory reads and after revocation',async()=>{
 const f=fixture();f.adapters.authorize=async()=>null;await assert.rejects(f.plan(),{status:403});assert.equal(f.reads(),0);
 let count=0;f.adapters.authorize=async s=>({...s,scope:DISTRIBUTION_PLAN_VERSION,approved:++count===1});await assert.rejects(f.plan(),{status:403});assert.equal(f.reads(),1);
});
for (const [name, mutate] of [
 ['foreign firm',s=>s.leads[0].firmId='foreign'],['wrong owner',s=>s.leads[0].advisorUid='outsider'],
 ['missing recipient rights',s=>s.leads[0].recipientRights.pop()],['unknown hold',s=>s.leads[0].holds=['guess']],
 ['active source',s=>s.source.status='active'],['inactive recipient',s=>s.recipients[0].status='departed'],
 ['unverified recipient',s=>s.recipients[0].emailVerified=false],['incomplete inventory',s=>s.complete=false],
 ['duplicate lead',s=>s.leads.push(s.leads[0])],['duplicate recipient',s=>s.recipients[1]=s.recipients[0]],
 ['negative capacity',s=>s.recipients[0].capacity=-1],['invalid date',s=>s.leads[0].followUpAt='tomorrow'],
 ]) test('rejects '+name,async()=>{const f=fixture();mutate(f.snapshot);await assert.rejects(f.plan(),{status:409});});
test('request cannot supply firm, roles, roster or records',async()=>{
 for(const extra of [{firmId:'other'},{role:'admin'},{records:[]},{recipient_uids:['a','a']},{recipient_uids:['departed']},{recipient_uids:[]}]) {
 const f=fixture();await assert.rejects(f.plan({...input,...extra}),{status:422});assert.equal(f.reads(),0);
 }
});
test('missing actor and missing configured boundary fail closed',async()=>{
 const f=fixture();await assert.rejects(f.plan(input,null),{status:401});assert.equal(f.reads(),0);
 assert.throws(()=>createTeamDistributionPlanner(),{status:503});
});
test('extra private adapter fields never leave planner',async()=>{
 const f=fixture();f.snapshot.leads[0].privateEmail='private@example.test';f.snapshot.secret='do-not-return';
 assert.doesNotMatch(JSON.stringify(await f.plan()),/private@example|do-not-return/);
});
test('hub route remains opt-in, same-origin, JSON and firm bounded',async()=>{
 const f=fixture(),opts={authorizeSupervisor:async()=>({approved:true,actorUid:'boss',scope:'team-lead-hub-preview',team:'firm'}),distributionPlanner:f.plan};
 const req=(body=input,origin='https://hub.test')=>new Request('https://hub.test/api/team-hub/distribution-preview',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await createTeamLeadHub(opts).route(req(),actor)).status,200);
 assert.equal((await createTeamLeadHub(opts).route(req(input,'https://evil.test'),actor)).status,403);
 assert.equal((await createTeamLeadHub({...opts,distributionPlanner:undefined}).route(req(),actor)).status,503);
 assert.equal((await createTeamLeadHub({...opts,distributionPlanner:async()=>({firmId:'other',mode:'preview_only',can_execute:false})}).route(req(),actor)).status,403);
 assert.equal((await createTeamLeadHub({...opts,distributionPlanner:async()=>{throw Error('secret');}}).route(req(),actor)).status,500);
});
test('capacity matching moves flexible proposals instead of stranding restricted leads',async()=>{
 const f=fixture();f.snapshot.leads=f.snapshot.leads.slice(0,2);f.snapshot.recipients.forEach(r=>r.capacity=1);
 f.snapshot.leads[1].recipientRights[1].decision='denied';
 const p=await f.plan();assert.equal(p.counts.held,0);assert.deepEqual(p.assignments.map(r=>r.recipientUid),['b','a']);
});
test('calendar-overflow timestamp is rejected',async()=>{
 const f=fixture();f.snapshot.leads[0].followUpAt='2026-02-31T12:00:00.000Z';await assert.rejects(f.plan(),{status:409});
});
test('hub supervisor firm is bound before planner inventory read',async()=>{
 const f=fixture(),planner=createTeamDistributionPlanner(f.adapters);
 const hub=createTeamLeadHub({authorizeSupervisor:async()=>({approved:true,actorUid:'boss',scope:'team-lead-hub-preview',team:'other'}),distributionPlanner:planner});
 const response=await hub.route(new Request('https://hub.test/api/team-hub/distribution-preview',{method:'POST',headers:{origin:'https://hub.test','content-type':'application/json'},body:JSON.stringify(input)}),actor);
 assert.equal(response.status,403);assert.equal(f.reads(),0);assert.equal(f.checks(),0);
});
test('exhaustive small rights graphs never strand an assignable lead',async()=>{
 for(let graph=0;graph<64;graph++) {
   const f=fixture();f.snapshot.leads=f.snapshot.leads.slice(0,3);f.snapshot.recipients.forEach(r=>r.capacity=1);
   f.snapshot.leads.forEach((l,i)=>l.recipientRights.forEach((r,j)=>r.decision=(graph & (1<<(i*2+j)))?'allowed':'denied'));
   function maximum(i,used) { if(i===3)return 0;let n=maximum(i+1,used);for(let j=0;j<2;j++)if(!(used&(1<<j))&&(graph&(1<<(i*2+j))))n=Math.max(n,1+maximum(i+1,used|(1<<j)));return n; }
   assert.equal((await f.plan()).counts.planned,maximum(0,0),'graph '+graph);
 }
});
test('snapshot changes do not clear existing holds or over-allocate existing work',async()=>{
 const f=fixture();f.snapshot.recipients.forEach(r=>r.activeAssignments=3);
 const p=await f.plan();assert.equal(p.counts.planned,0);assert.ok(p.recipients.every(r=>r.proposed===3));
});
