import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab,mergeWithHistory,withFieldHistory,fieldConflicts,sourceStrength,reportedFields,reconciled} from '../research-lab.mjs';

// A second source never silently erases the first: every reported value is
// kept with its source, the strongest source's value is the working one, and
// disagreements are shown rather than resolved behind the advisor's back.
const base={first_name:'Jamie',last_name:'Rivera',company:'Example Manufacturing',country:'US',source_names:['Public website']};

test('the strongest source decides the working value, and every value is kept',()=>{
  const a=withFieldHistory({...base,current_title:'Director of Operations'},'2026-09-01T00:00:00Z');
  const b=mergeWithHistory(a,{...base,current_title:'Vice President, Operations',estimated_age_range:'61',source_names:['SEC proxy filing']},'2026-09-10T00:00:00Z');
  assert.equal(b.current_title,'Vice President, Operations','a filing outranks a company page');
  const c=mergeWithHistory(b,{...base,current_title:'Plant Manager',source_names:['News article']},'2026-09-20T00:00:00Z');
  assert.equal(c.current_title,'Vice President, Operations','news does not override a filing, even when newer');
  assert.deepEqual(c.field_values.current_title.map(v=>[v.value,v.source]),[['Director of Operations','Public website'],['Vice President, Operations','SEC proxy filing'],['Plant Manager','News article']]);
  const conflict=fieldConflicts(c).find(f=>f.field==='current_title');
  assert.equal(conflict.working,'Vice President, Operations');assert.equal(conflict.values.length,3);
  assert.deepEqual(conflict.values.map(v=>v.strength),['Company website','Regulatory filing','News article']);
});

test('among equally strong sources the newest wins; the same value in another format is not a conflict',()=>{
  const a=withFieldHistory({...base,current_title:'Director',phone:'(212) 555-0199',email:'Jamie@Example.com'},'2026-09-01T00:00:00Z');
  const b=mergeWithHistory(a,{...base,current_title:'Senior Director',phone:'+1 212 555 0199',email:'jamie@example.com'},'2026-09-15T00:00:00Z');
  assert.equal(b.current_title,'Senior Director');
  const fields=fieldConflicts(b).map(f=>f.field);
  assert.deepEqual(fields,['current_title'],'phone and email formats differ but the values agree');
  const again=mergeWithHistory(b,{...base,current_title:'Senior Director'},'2026-09-20T00:00:00Z');
  assert.equal(again.field_values.current_title.length,2,'a repeat sighting updates last_seen instead of adding a row');
  assert.equal(again.field_values.current_title[1].last_seen,'2026-09-20T00:00:00Z');
});

test('records saved before this change are seeded from what they already hold',()=>{
  const legacy={...base,current_title:'Owner',updated_at:'2025-01-01T00:00:00Z',source_names:['Research CSV']};
  const merged=mergeWithHistory(legacy,{...base,current_title:'Founder',source_names:['Public website']},'2026-09-01T00:00:00Z');
  assert.equal(merged.current_title,'Owner','an imported list outranks a company page');
  assert.deepEqual(merged.field_values.current_title.map(v=>[v.value,v.source,v.first_seen]),[['Owner','Research CSV','2025-01-01T00:00:00Z'],['Founder','Public website','2026-09-01T00:00:00Z']]);
  assert.equal(sourceStrength('ZoomInfo CSV').label,'Licensed export');assert.equal(sourceStrength('Acme company page').label,'Company website');assert.equal(sourceStrength('Something').rank,0);
});

test('the history bound never evicts the strongest source or the working value',()=>{
  let lead=withFieldHistory({...base,current_title:'Chief Executive Officer',source_names:['ZoomInfo CSV']},'2026-01-01T00:00:00Z');
  for(let i=0;i<25;i++)lead=mergeWithHistory(lead,{...base,current_title:`Title ${i}`,source_names:['News article']},`2026-02-${String(i+1).padStart(2,'0')}T00:00:00Z`);
  assert.equal(lead.current_title,'Chief Executive Officer');
  assert.ok(lead.field_values.current_title.length<=20);
  assert.equal(lead.field_values.current_title[0].source,'ZoomInfo CSV','the licensed value is still there');
  assert.equal(lead.field_values.current_title.at(-1).value,'Title 24','the newest weaker report is kept');
});

test('only what the source supplied is recorded, never the importer\'s defaults or inferences',()=>{
  const raw={'First Name':'Jamie','Last Name':'Rivera',Company:'Example Manufacturing',Title:'Director'};
  const lead={...base,current_title:'Director',country:'US',estimated_age_range:'55-60',source_names:['Research CSV']};
  const saved=withFieldHistory(lead,'2026-09-01T00:00:00Z',reportedFields(raw,lead));
  assert.equal(saved.field_values.country,undefined,'country US was a default');
  assert.equal(saved.field_values.estimated_age_range,undefined,'an inferred age is not a report');
  assert.equal(saved.field_values.current_title[0].value,'Director');
  const withAge=reportedFields({...raw,Country:'United States','Age Range':'60-64'},lead);
  assert.equal(withAge.country,'US');assert.equal(withAge.estimated_age_range,'55-60');
});

test('a value written without history is credited to that record rather than lost',()=>{
  const tracked=withFieldHistory({...base,current_title:'Director'},'2026-09-01T00:00:00Z');
  // The owner-only legacy tool rewrote the title without touching the history.
  const drifted={...tracked,current_title:'Managing Director',source_names:['Public website','Legacy campaign'],updated_at:'2026-09-05T00:00:00Z'};
  assert.deepEqual(fieldConflicts(reconciled(drifted,'2026-09-06T00:00:00Z')).map(c=>c.field),['current_title']);
  const merged=mergeWithHistory(drifted,{...base,current_title:'Director',source_names:['Public website']},'2026-09-10T00:00:00Z');
  assert.deepEqual(merged.field_values.current_title.map(v=>[v.value,v.source]),[['Director','Public website'],['Managing Director','Legacy campaign']]);
});

test('research runs keep both values on the saved lead and the detail shows the disagreement',async()=>{
  const db=new PGlite();
  try{
    await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
    for(const name of ['006-research-lab','017-forget','012-plan-catalog-summary','007-quality-v2','008-prospect-workspace','013-advisor-workflow','014-outreach-cadence','015-dial-budget','016-inbound-contact','021-lab-companies','022-identity-reviews'])
      await db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>pool.query(...a),release(){}})};
    const results={public_web:{status:'completed',candidates:[{name:'Jamie Rivera',company:'Example Manufacturing',current_title:'Director',email:'jamie@example.com',country:'US',source_names:['Public website']}]},
      sec:{status:'completed',candidates:[{name:'Jamie Rivera',company:'Example Manufacturing',current_title:'Chief Operating Officer',email:'jamie@example.com',estimated_age_range:'61',country:'US',source_names:['SEC proxy filing']}]}};
    const lab=createResearchLab({pool,sources:{readiness:{},quote:()=>0,run:async source=>results[source]}});
    const user={uid:'owner',email:'owner@example.com'};
    await lab.enqueue(user,{employers:['Example Manufacturing'],sources:['public_web'],idempotency_key:'one'});while(await lab.tick());
    await lab.enqueue(user,{employers:['Example Manufacturing'],sources:['sec'],idempotency_key:'two'});while(await lab.tick());
    const id=(await db.query('SELECT id FROM discovery_leads')).rows[0].id;
    const {lead}=await lab.detail(user,id);
    assert.equal(lead.current_title,'Chief Operating Officer');
    assert.deepEqual(lead.field_values.current_title.map(v=>v.value),['Director','Chief Operating Officer']);
    assert.deepEqual(lead.field_conflicts.map(c=>c.field),['current_title']);
  }finally{await db.close();}
});
