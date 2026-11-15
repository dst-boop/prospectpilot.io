import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {prospectBrief} from '../prospect-brief.mjs';
import {assessLead} from '../lead-quality.mjs';
const source=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8');
const now=new Date('2026-10-05T12:00:00Z');
function view(action={bucket:'review',label:'Verify contact ownership',reason:'Review ownership before contact.'}){
  const sections=[],created=[],reviews=[];
  const element=tag=>{const e={tag,innerHTML:'',children:[],append(child){this.children.push(child);}};created.push(e);return e;};
  const context=vm.createContext({URL,document:{createElement:element,getElementById:()=>({append:e=>sections.unshift(e)})},
    renderGuidedReview(){},startEvidence:field=>reviews.push(field)});
  vm.runInContext(source.slice(0,source.indexOf('let offset=')),context);
  vm.runInContext(source.slice(source.indexOf('function briefCitation('),source.indexOf('\nfunction renderGuidedReview(')),context);
  const lead={first_name:'Jamie',last_name:'Example',company:'Example Co',current_title:'Director'};
  const brief=prospectBrief(lead,assessLead(lead,[],{now}),[],now);
  context.currentWorkflow={action,brief};
  return {context,sections,reviews,render:()=>vm.runInContext('renderBriefSummary()',context)};
}
test('advisor brief shows actual queue reason, dated citations and evidence distinctions without adding outreach controls',()=>{
  const c=view();c.render();const section=c.sections[0];
  assert.match(section.innerHTML,/Why this is on your worklist.*Verify contact ownership.*Review ownership/);
  for(const label of ['Reviewed facts','Reported professional context','Interpretation, not a fact','Unknowns and holds','Source date: Unknown','Observed: Unknown','Reviewed: Unknown','source link not recorded','Nothing has been sent'])assert.ok(section.innerHTML.includes(label),label);
  assert.doesNotMatch(section.innerHTML,/mailto:|tel:|Send now/);
  assert.equal(section.children.length,1);section.children[0].onclick();assert.deepEqual(c.reviews,['personal_event']);
});
test('terminal worklists show their hold rather than inviting a personal-event review or conversation',()=>{
  for(const bucket of ['closed','clients']){
    const c=view({bucket,label:'Prospecting finished',reason:'Do not contact this person.'});c.render();
    assert.match(c.sections[0].innerHTML,/Prospecting finished.*Do not contact/);
    assert.doesNotMatch(c.sections[0].innerHTML,/Two questions to start with/);
    assert.equal(c.sections[0].children.length,0);
  }
});
test('citation rendering rejects executable and credential-bearing links and escapes all report text',()=>{
  const c=view();const summary=c.context.currentWorkflow.brief.evidence_summary;
  summary.reported=[{field:'company',label:'<script>bad</script>',statement:'<img src=x onerror=alert(1)>',citation:{source:'<b>Source</b>',url:'javascript:alert(1)',source_date:null,first_seen:'2026-10-05',last_seen:'2026-10-05'}}];
  c.context.currentWorkflow.action.reason='<script>reason</script>';
  c.render();let html=c.sections[0].innerHTML;
  assert.doesNotMatch(html,/<script>|<img|href="javascript:/);
  assert.match(html,/&lt;script&gt;reason/);assert.match(html,/&lt;img/);assert.match(html,/record dates, not source publication dates/);
  summary.reported[0].citation.url='https://person:secret@example.com/source';c.render();
  assert.doesNotMatch(c.sections[0].innerHTML,/person:secret/);
  summary.reported[0].citation.url='https://example.com/source?x=1&y=2';c.render();
  assert.match(c.sections[0].innerHTML,/href="https:\/\/example.com\/source\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"/);
});
test('older brief responses still render and repeated render reads only current workflow',()=>{
  const c=view();delete c.context.currentWorkflow.brief.evidence_summary;c.render();
  assert.match(c.sections[0].innerHTML,/Research signal/);
  c.context.currentWorkflow.action={bucket:'resting',label:'Resting',reason:'Wait until the saved date.'};c.render();
  assert.match(c.sections[0].innerHTML,/Resting.*Wait until/);
  assert.doesNotMatch(c.sections[0].innerHTML,/Verify contact ownership/);
});
