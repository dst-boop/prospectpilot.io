import test from 'node:test';
import assert from 'node:assert/strict';
import {previewAdvisorReassignment} from '../advisor-reassignment-preview.mjs';

function fixture() {
  const source = {uid:'departed', disabled:true, emailVerified:true};
  const target = {uid:'receiver', disabled:false, emailVerified:true};
  const snapshot = {complete:true,
    contacts:[{id:'contact-1', user_id:source.uid, identity_keys:['email:synthetic@example.test'], payload:{notes:'Keep this note', suppressed:true, source_history:[{provider:'zoominfo'}]}}],
    targetContacts:[], lists:[{id:'list-1', user_id:source.uid}],
    listMembers:[{list_id:'list-1', contact_id:'contact-1'}], shares:[],
    discoveryLeads:[{id:'lead-1', owner_user_id:source.uid, team:'firm-fixture', payload:{follow_up_date:'2026-12-01', imported_dnc:['synthetic-phone']}}],
    contactLinks:[{contact_id:'contact-1', lead_id:'lead-1', user_id:source.uid}],
    observations:[{lead_id:'lead-1', user_id:source.uid, field:'contact', payload:{reviewed:true}}],
    activities:[{id:'activity-1', lead_id:'lead-1', user_id:source.uid, outcome:'no_answer'}], jobs:[]};
  const request = {actor:{uid:'manager'}, sourceUid:source.uid, targetUid:target.uid};
  let reads = 0;
  const adapters = {
    authorize:async () => ({approved:true, scope:'advisor-reassignment-preview', sourceUid:'departed', targetUid:'receiver', team:'firm-fixture'}),
    resolveAccount:async uid => {reads++; return uid === source.uid ? source : target;},
    loadSnapshot:async scope => {reads++; assert.deepEqual(scope,{sourceUid:source.uid,targetUid:target.uid,team:'firm-fixture'}); return snapshot;}
  };
  return {request,adapters,snapshot,source,target,reads:() => reads,run:() => previewAdvisorReassignment(request,adapters)};
}
const rejects = (f,status) => assert.rejects(f.run(), error => error.status === status);
const codes = result => result.blockers.map(issue => issue.code);

test('preview preserves all inputs and never offers execution or reveals payloads',async () => {
  const f=fixture(), before=structuredClone(f.snapshot), result=await f.run();
  assert.equal(result.mode,'preview_only'); assert.equal(result.can_execute,false);
  assert.deepEqual(result.proposed_record_ids,{contacts:['contact-1'],lists:['list-1'],discovery_leads:['lead-1']});
  assert.deepEqual(f.snapshot,before); assert.ok(codes(result).includes('apply_not_implemented'));
  assert.ok(codes(result).includes('data_rights_review')); assert.equal(result.fingerprint.length,64);
  for(const secret of ['synthetic@example.test','Keep this note','synthetic-phone','2026-12-01']) assert.ok(!JSON.stringify(result).includes(secret));
});

test('fails closed without a server-side authorization adapter',async () => {
  const f=fixture(); delete f.adapters.authorize; await rejects(f,403); assert.equal(f.reads(),0);
});
for(const grant of [null,{},true,{approved:true},
  {approved:true,scope:'other',sourceUid:'departed',targetUid:'receiver',team:'firm-fixture'},
  {approved:true,scope:'advisor-reassignment-preview',sourceUid:'departed',targetUid:'other',team:'firm-fixture'},
  {approved:true,scope:'advisor-reassignment-preview',sourceUid:'departed',targetUid:'receiver',team:''}]) {
  test('rejects incomplete or mismatched authorization '+JSON.stringify(grant),async () => {
    const f=fixture(); f.adapters.authorize=async()=>grant; await rejects(f,403); assert.equal(f.reads(),0);
  });
}
test('client role and email do not authorize cross-advisor reads',async () => {
  const f=fixture(); f.request.actor={uid:'outsider',role:'admin',email:'manager@example.test'};
  f.adapters.authorize=async()=>({approved:false}); await rejects(f,403); assert.equal(f.reads(),0);
});
for(const [name,change,status] of [
  ['anonymous',f=>f.request.actor=null,401], ['same account',f=>f.request.targetUid='departed',422],
  ['whitespace UID',f=>f.request.sourceUid=' departed',422], ['control UID',f=>f.request.sourceUid='a\nb',422],
  ['inactive target',f=>f.target.disabled=true,422], ['unknown target status',f=>delete f.target.disabled,422],
  ['unverified target',f=>f.target.emailVerified=false,422], ['wrong account',f=>f.target.uid='other',422],
  ['missing resolver',f=>delete f.adapters.resolveAccount,503], ['incomplete snapshot',f=>f.snapshot.complete=false,409],
  ['missing collection',f=>delete f.snapshot.observations,409], ['malformed row',f=>f.snapshot.contacts=[null],409],
  ['foreign contact',f=>f.snapshot.contacts[0].user_id='other',409], ['foreign lead',f=>f.snapshot.discoveryLeads[0].owner_user_id='other',409],
  ['wrong team',f=>f.snapshot.discoveryLeads[0].team='another-firm',409], ['foreign target contact',f=>f.snapshot.targetContacts=[{id:'other',user_id:'other'}],409],
  ['missing identity keys',f=>delete f.snapshot.contacts[0].identity_keys,409], ['invalid identity keys',f=>f.snapshot.contacts[0].identity_keys=[42],409],
  ['duplicate IDs',f=>f.snapshot.contacts.push({...f.snapshot.contacts[0]}),409], ['missing ID',f=>delete f.snapshot.contacts[0].id,409],
  ['unrelated share',f=>f.snapshot.shares=[{list_id:'other',recipient_uid:'outsider'}],409],
  ['oversize',f=>f.snapshot.contacts=Array.from({length:10001},()=>({})),413]
]) test(name,async()=>{const f=fixture();change(f);await rejects(f,status);});

test('identity collisions are held without returning identifiers or merging evidence',async()=>{
  const f=fixture();f.snapshot.targetContacts=[{id:'existing',user_id:'receiver',identity_keys:['email:synthetic@example.test'],payload:{suppressed:false}}];
  const result=await f.run();assert.deepEqual(result.identity_collisions,[{source_contact_id:'contact-1',target_contact_ids:['existing']}]);
  assert.ok(codes(result).includes('identity_collision'));assert.equal(f.snapshot.contacts[0].payload.suppressed,true);
});
test('name alone cannot create a duplicate match',async()=>{
  const f=fixture();f.snapshot.contacts[0].payload.first_name='Synthetic';
  f.snapshot.targetContacts=[{id:'existing',user_id:'receiver',identity_keys:['email:different@example.test'],payload:{first_name:'Synthetic'}}];
  assert.deepEqual((await f.run()).identity_collisions,[]);
});
test('unresolved identities and cross-owner relationships require review',async()=>{
  const f=fixture();f.snapshot.contacts[0].identity_keys=[];
  f.snapshot.listMembers.push({list_id:'list-1',contact_id:'outside'});
  f.snapshot.contactLinks[0].lead_id='outside';f.snapshot.activities[0].lead_id='outside';
  const result=await f.run();for(const code of ['identity_unresolved','mixed_owner_list','linked_record_outside_transfer','shared_history_outside_transfer'])assert.ok(codes(result).includes(code));
});
for(const status of ['pending','queued','running','waiting','paused','needs_attention'])test('blocks unfinished '+status+' work',async()=>{
  const f=fixture();f.snapshot.jobs=[{id:'job-1',user_id:'departed',status}];assert.ok(codes(await f.run()).includes('unfinished_work'));
});
test('terminal jobs stay historical; unknown states fail closed',async()=>{
  const f=fixture();f.snapshot.jobs=[{id:'old',user_id:'departed',status:'completed'},{id:'unknown',user_id:'departed',status:'new_state'}];
  const result=await f.run();assert.ok(codes(result).includes('unknown_job_state'));assert.ok(!codes(result).includes('unfinished_work'));
});
test('shares and departed access are separate review gates, not automatically changed',async()=>{
  const f=fixture();f.source.disabled=false;f.snapshot.shares=[{list_id:'list-1',recipient_uid:'former-colleague'}];
  const result=await f.run();assert.ok(codes(result).includes('existing_shares'));assert.ok(codes(result).includes('departed_access_not_revoked'));
  assert.equal(f.source.disabled,false);assert.equal(f.snapshot.shares.length,1);
});
test('fingerprint is stable across row order, but changes for notes, evidence, access and actor',async()=>{
  const f=fixture();f.snapshot.contacts.push({id:'contact-2',user_id:'departed',identity_keys:['email:second@example.test'],payload:{}});
  const a=(await f.run()).fingerprint;f.snapshot.contacts.reverse();assert.equal((await f.run()).fingerprint,a);
  for(const change of [()=>f.snapshot.contacts[1].payload.notes='changed',()=>f.snapshot.observations[0].payload.reviewed=false,
    ()=>f.source.disabled=false,()=>f.request.actor.uid='different-manager']) {
    const before=(await f.run()).fingerprint;change();assert.notEqual((await f.run()).fingerprint,before);
  }
});
test('empty inventories remain preview-only and require an explicit data-rights decision',async()=>{
  const f=fixture();for(const key of Object.keys(f.snapshot))if(Array.isArray(f.snapshot[key]))f.snapshot[key]=[];
  const result=await f.run();assert.deepEqual(result.proposed_record_ids,{contacts:[],lists:[],discovery_leads:[]});assert.equal(result.can_execute,false);
});


test('unresolved receiver identities prevent claiming a clean duplicate review',async()=>{
  const f=fixture();f.snapshot.targetContacts=[{id:'unresolved',user_id:'receiver',identity_keys:[]}];
  assert.ok(codes(await f.run()).includes('target_identity_unresolved'));
});
test('collision pair expansion has an aggregate limit below the inventory ceiling',async()=>{
  const f=fixture();f.snapshot.contacts=Array.from({length:101},(_,i)=>({id:'source-'+i,user_id:'departed',identity_keys:['shared-key']}));
  f.snapshot.targetContacts=Array.from({length:100},(_,i)=>({id:'target-'+i,user_id:'receiver',identity_keys:['shared-key']}));
  await rejects(f,413);
});
test('repeated keys do not multiply collision pairs',async()=>{
  const f=fixture();f.snapshot.contacts[0].identity_keys=['same','same'];
  f.snapshot.targetContacts=[{id:'existing',user_id:'receiver',identity_keys:['same','same']}];
  assert.deepEqual((await f.run()).identity_collisions,[{source_contact_id:'contact-1',target_contact_ids:['existing']}]);
});
for(const [name,keys] of [['too many',Array(33).fill('key')],['too long',['x'.repeat(2049)]]])test(name+' identity keys are bounded',async()=>{
  const f=fixture();f.snapshot.contacts[0].identity_keys=keys;await rejects(f,413);
});

test('aggregate identity-key inventory is bounded',async()=>{
  const f=fixture();f.snapshot.contacts=Array.from({length:3126},(_,i)=>({id:'source-'+i,user_id:'departed',identity_keys:Array(32).fill('key')}));
  await rejects(f,413);
});
