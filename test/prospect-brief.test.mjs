import test from 'node:test';
import assert from 'node:assert/strict';
import {prospectBrief,validatePersonalEvent,workflowViewMatches,contextualDraft} from '../prospect-brief.mjs';
const now=new Date('2026-10-05T12:00:00Z');
const quality={identity_signature:'anchor',status:'incomplete',target:'rollover_100k',gates:{contact:{state:'unknown',reason:'Needs ownership evidence'}},plans:[]};
const event={field:'personal_event',verdict:'confirmed',source:'Company announcement',url:'https://example.com/news',observed_at:'2026-10-01',reviewed_at:'2026-10-02',reviewer:'advisor',identity_signature:'anchor',note:'New role reported.',value:{type:'job_change',event_date:'2026-09-01',identity_confirmed:true,identity_basis:'Employer, title and professional profile match.'}};
test('recent personal events are distinct from context and do not imply financial qualification',()=>{
 const b=prospectBrief({},quality,[event],now);assert.equal(b.signal.rank,2);assert.equal(b.qualification,'Financial qualification not confirmed');
 assert.equal(prospectBrief({}, {...quality,plans:[{}]},[],now).signal.kind,'employer_context');
 for(const change of [{identity_signature:'other'},{verdict:'unknown'},{url:'javascript:alert(1)'},{observed_at:'2030-01-01'},{reviewed_at:'2030-01-01'}, {value:{...event.value,identity_confirmed:false}}])assert.equal(prospectBrief({},quality,[{...event,...change}],now).signal.rank,0);
 assert.equal(prospectBrief({}, {...quality,status:'identity_review'},[event],now).signal.rank,0);
 assert.equal(prospectBrief({},quality,[{...event,value:{...event.value,event_date:'2020-01-01'}}],now).signal.rank,0);
});
test('event evidence rejects missing identity basis, future dates and unsupported types',()=>{
 for(const change of [{identity_basis:''},{event_date:'2030-01-01'},{type:'wealth'},{identity_confirmed:false}])assert.throws(()=>validatePersonalEvent({...event.value,...change},event.observed_at),{status:422});
 assert.throws(()=>validatePersonalEvent(event.value,''),{status:422});
});
test('aggregated queues preserve existing buckets',()=>{
 assert.equal(workflowViewMatches('research','enrich'),true);assert.equal(workflowViewMatches('research','review'),true);assert.equal(workflowViewMatches('research','closed'),false);
 for(const bucket of ['due','scheduled','meetings','resting'])assert.equal(workflowViewMatches('followups',bucket),true);
 assert.equal(workflowViewMatches('ready','review'),false);
});
test('only a reviewed fresh personal event personalizes the initial email',()=>{
 const draft={step:'opener',channel:'email',body:'Hi Jamie,\n\nA planning introduction.',needs:[]};
 const brief=prospectBrief({},quality,[event],now);assert.match(contextualDraft(draft,brief).body,/recent role change/);
 assert.equal(contextualDraft(draft,prospectBrief({},quality,[],now)),draft);
 const follow={...draft,step:'followup'};assert.equal(contextualDraft(follow,brief),follow);
 assert.doesNotMatch(contextualDraft(draft,brief).body,/100,000|balance|eligible/);
});
test('contact routes retain unknown provenance and include reviewed corrections',()=>{
 const b=prospectBrief({email:'a@example.com'}, {...quality,gates:{contact:{state:'confirmed',evidence:{value:{channel:'email',address:'b@example.com'},source:'Participant',observed_at:'2026-10-01'}}}},[],now);
 assert.equal(b.contacts.length,2);assert.equal(b.contacts[0].source,'Participant');assert.equal(b.contacts[1].observed_at,null);
});
