import test from 'node:test';
import assert from 'node:assert/strict';
import {prospectBrief} from '../prospect-brief.mjs';
import {assessLead, leadIdentity} from '../lead-quality.mjs';
const now = new Date('2026-10-05T12:00:00Z');
const lead = {first_name:'Jamie',last_name:'Example',company:'Example Manufacturing',current_title:'Director',email:'jamie@example.com'};
const review = (field,value,change={}) => ({field,value,verdict:'confirmed',source:'Synthetic authorized disclosure',note:'Synthetic evidence for testing only.',url:'https://example.com/evidence',observed_at:'2026-10-01',reviewed_at:'2026-10-02',reviewer:'advisor',identity_signature:leadIdentity(lead),...change});
const event = review('personal_event',{type:'job_change',event_date:'2026-09-01',identity_confirmed:true,identity_basis:'Employer, role and professional profile match.'});
function brief(record=lead, observations=[], target='rollover_100k') {
  return prospectBrief(record,assessLead(record,observations,{now,target}),observations,now);
}
test('brief separates reviewed facts, reports, interpretation and unknowns without changing qualification',()=>{
  const observations=[event,review('contact',{channel:'email',address:lead.email,identity_confirmed:true})];
  const before=JSON.stringify({lead,observations});
  const b=brief(lead,observations),s=b.evidence_summary;
  assert.deepEqual(s.reviewed.map(r=>r.field),['personal_event','contact']);
  assert.equal(s.reviewed[0].event_date,'2026-09-01');
  assert.equal(s.reviewed[0].citation.observed_at,'2026-10-01T00:00:00.000Z');
  assert.equal(s.reviewed[0].citation.reviewed_at,'2026-10-02T00:00:00.000Z');
  assert.equal(s.reviewed[0].citation.source_date,null,'review date is not publication date');
  assert.deepEqual(s.reported.map(r=>r.field),['company','current_title']);
  assert.ok(s.unknowns.some(r=>r.field==='movable_assets'));
  assert.ok(!s.unknowns.some(r=>['age','net_worth'].includes(r.field)),'use active target only');
  assert.match(s.interpretation,/does not establish a financial need/);
  assert.match(s.limits,/not a recommendation.*permission to contact/);
  assert.match(b.qualification,/not confirmed/);
  assert.equal(JSON.stringify({lead,observations}),before);
});
test('a recorded source URL and publication date stay on their exact field/value',()=>{
  const record={...lead,company_website:'https://example.com/home',updated_at:now.toISOString(),source_names:['Unrelated source'],
    field_values:{current_title:[{value:'Director',source:'Synthetic import',first_seen:'2026-10-04',last_seen:'2026-10-05'}]},
    evidence:[{field:'current_title',value:'Director',source:'Company biography',source_url:'https://example.com/team/jamie',source_date:'2025-01-02'},
      {field:'estimated_age_range',value:'62',source:'Filing',source_url:'https://example.com/filing',source_date:'2026-09-01'}]};
  const s=brief(record).evidence_summary;
  const published=s.reported.find(r=>r.citation.url);
  assert.equal(published.field,'current_title');assert.equal(published.citation.url,'https://example.com/team/jamie');
  assert.equal(published.citation.source_date,'2025-01-02T00:00:00.000Z');
  const imported=s.reported.find(r=>r.citation.source==='Synthetic import');
  assert.equal(imported.citation.source_date,null);assert.equal(imported.citation.observed_at,null);
  assert.equal(imported.citation.last_seen,'2026-10-05T00:00:00.000Z');
  const employer=s.reported.find(r=>r.field==='company');
  assert.equal(employer.citation.url,null);assert.equal(employer.citation.source,'Source not recorded');
  assert.doesNotMatch(JSON.stringify(s),/example.com\/home|example.com\/filing|Unrelated source/);
});
test('professional disagreements preserve each report and never become personal facts',()=>{
  const record={...lead,city:'Albany',field_values:{current_title:[{value:'Director',source:'Company page'},{value:'Founder',source:'Old import'}],city:[{value:'Albany',source:'Company office'}]},
    evidence:[{field:'company',value:'Former Employer',source:'Prior biography',source_url:'https://example.com/old'}]};
  const s=brief(record).evidence_summary;
  assert.equal(s.reviewed.length,0);
  assert.deepEqual(s.reported.filter(r=>r.field==='current_title').map(r=>r.statement),['Director','Founder']);
  assert.ok(s.unknowns.some(r=>r.field==='current_title'&&r.state==='conflicting'));
  assert.ok(s.unknowns.some(r=>r.field==='company'&&r.state==='conflicting'));
  assert.ok(s.unknowns.some(r=>r.field==='residence'));
});
test('stale, rejected and identity-mismatched reviews remain unknown and do not become reviewed facts',()=>{
  for(const change of [{observed_at:'2024-01-01'},{verdict:'unknown'},{verdict:'rejected'},{identity_signature:'someone-else'},{reviewed_at:'2030-01-01'}]){
    const s=brief(lead,[review('contact',{channel:'email',address:lead.email,identity_confirmed:true},change)]).evidence_summary;
    assert.equal(s.reviewed.length,0);assert.ok(s.unknowns.some(r=>r.field==='contact'));
  }
  const stale=brief(lead,[review('contact',{channel:'email',address:lead.email,identity_confirmed:true},{observed_at:'2024-01-01'})]).evidence_summary;
  assert.equal(stale.unknowns.find(r=>r.field==='contact').citation.observed_at,'2024-01-01T00:00:00.000Z');
});
test('suppression and identity review remain prominent even with current evidence',()=>{
  const observations=[event,review('contact',{channel:'email',address:lead.email,identity_confirmed:true})];
  for(const change of [{suppressed:true},{identity_status:'review'},{identity_status:'excluded'}]){
    const s=brief({...lead,...change},observations).evidence_summary;
    assert.equal(s.reviewed.length,0);assert.match(s.unknowns[0].reason,/identifiers|restricted/);
    assert.match(s.limits,/restrictions/);
  }
});
test('old personal event remains historical context with a refresh warning; withdrawn event does not revive',()=>{
  const old={...event,value:{...event.value,event_date:'2024-01-01'}};
  const s=brief(lead,[old]).evidence_summary;
  assert.equal(s.reviewed[0].event_date,'2024-01-01');
  assert.ok(s.unknowns.some(r=>r.field==='personal_event'&&r.state==='stale'));
  const withdrawal={...event,verdict:'unknown',value:null,reviewed_at:'2026-10-04'};
  assert.ok(!brief(lead,[event,withdrawal]).evidence_summary.reviewed.some(r=>r.field==='personal_event'));
});
test('unsafe links, impossible/future dates and record timestamps are not promoted into citations',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hello','https://name:secret@example.com/evidence','not a url']){
    const record={...lead,created_at:'2026-10-05',evidence:[{field:'company',value:lead.company,source_url:url,source_date:'2030-01-01',observed_at:'bad-date',reviewed_at:'2030-01-01'}]};
    const s=brief(record).evidence_summary;
    assert.equal(s.reported[0].citation.url,null);assert.equal(s.reported[0].citation.source_date,null);
    assert.equal(s.reported[0].citation.observed_at,null);assert.equal(s.reported[0].citation.reviewed_at,null);
  }
});
test('citation calendar validation refuses normalized impossible dates and ambiguous formats',()=>{
  for(const source_date of ['2026-02-30','2026-02-29','2026-04-31','2026-02-30T12:00:00Z','03/04/2026','2026-2-1']){
    const record={...lead,evidence:[{field:'company',value:lead.company,source_date}]};
    assert.equal(brief(record).evidence_summary.reported[0].citation.source_date,null,source_date);
  }
  for(const source_date of ['2024-02-29','2026-04-30','2026-04-30T12:00:00.123Z','2026-04-30T12:00:00-04:00']){
    const record={...lead,evidence:[{field:'company',value:lead.company,source_date}]};
    assert.equal(brief(record).evidence_summary.reported[0].citation.source_date,new Date(source_date).toISOString(),source_date);
  }
});
