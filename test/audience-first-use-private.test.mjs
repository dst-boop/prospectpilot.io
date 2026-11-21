import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../audience-catalog.mjs';
const html=readFileSync(new URL('../audience.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../audience-client.js',import.meta.url),'utf8');
function setup(){
 const nodes=new Map();let requests=0;
 const get=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='audience'?'workplace':'',hidden:id==='plan',textContent:'',focus(){this.focused=true;}});return nodes.get(id);};
 const context=vm.createContext({...model,document:{getElementById:get},navigator:{clipboard:{writeText:async()=>{}}},URL,Date,fetch(){requests++;throw Error('Unexpected network call');}});
 vm.runInContext(source.replace(/^import[^\n]+\n/,''),context);
 return {get,submit:()=>get('setupForm').onsubmit({preventDefault(){}}),requests:()=>requests};
}
test('first-use copy distinguishes plan creation from searching and contact import',()=>{
 assert.match(html,/Build search plan \(no live search\)/);
 assert.match(html,/aria-describedby="planOutcome planNext"/);
 assert.match(html,/id="planOutcome" role="status" aria-live="polite"/);
 assert.ok(html.indexOf('id="planNext"')<html.indexOf('id="filterList"'));
 assert.match(html,/Next: open your own ZoomInfo account and try the filters below/);
 assert.match(html,/href="\/prospect\?import=1">Import an existing CSV instead/);
 assert.match(html,/Preview the file first; that preview does not save contacts/);
 assert.match(html,/class="button secondary" id="uploadLink"/);
});
test('valid build announces exact outcome, focuses result, and edit clears success without network',()=>{
 const h=setup();h.get('focus').value='Partner';h.submit();
 assert.equal(h.get('planOutcome').textContent,'Search plan ready. No search was run and no contacts were saved.');
 assert.equal(h.get('plan').hidden,false);assert.equal(h.get('planTitle').focused,true);
 assert.match(h.get('stepLabel').textContent,/Next: use it in ZoomInfo/);
 h.get('back').onclick();assert.equal(h.get('planOutcome').textContent,'');assert.equal(h.get('plan').hidden,true);
 h.submit();assert.match(h.get('planOutcome').textContent,/No search was run/);assert.equal(h.requests(),0);
});

test('local professionals can propose title, industry, employee count and geography without assuming seniority',()=>{
 const h=setup();h.get('audience').value='local';h.get('audience').onchange();
 assert.equal(h.get('optionalIndustryFields').hidden,false);
 for(const [id,value] of [['location','Long Island'],['focus','Partner'],['industry','Offices of Lawyers'],['employeeCount','10–20']])h.get(id).value=value;
 h.submit();
 const plan=h.get('planText').value;
 for(const value of ['Long Island','Partner','Offices of Lawyers','10–20','Country, State, or City','Radius Around Postal Code','Location of is a separate scope control'])assert.ok(plan.includes(value),value);
 assert.doesNotMatch(plan,/Location of: Long Island|Management Level/);
 assert.match(plan,/If your region is not listed/);
 assert.equal(h.requests(),0);
 h.get('back').onclick();h.get('audience').value='employer';h.get('audience').onchange();
 assert.equal(h.get('optionalIndustryFields').hidden,true);
 assert.equal(h.get('industry').value,'');
 h.get('focus').value='Example Employer';h.submit();
 assert.doesNotMatch(h.get('planText').value,/Offices of Lawyers/);
});

test('advisor geography is optional, market-neutral, and comes only from the chosen input',()=>{
 const lab=readFileSync(new URL('../lab.html',import.meta.url),'utf8');
 assert.doesNotMatch([html,lab,model.locationGuidance].join(' '),/Long Island|Huntington, NY|11747/i);
 const h=setup();h.get('audience').value='local';h.get('audience').onchange();
 h.get('focus').value='Partner';h.submit();
 assert.equal(h.get('location').value,'');assert.doesNotMatch(h.get('planText').value,/Radius Around Postal Code/);
 for(const [place,other] of [['Austin, TX','98101 + 25 miles'],['98101 + 25 miles','Austin, TX']]){
  h.get('back').onclick();h.get('location').value=place;h.submit();
  const plan=h.get('planText').value;
  assert.ok(plan.includes(place));assert.ok(!plan.includes(other));assert.match(plan,/Location of is a separate scope control/);
 }
 assert.equal(h.requests(),0);
});
