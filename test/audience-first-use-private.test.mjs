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
