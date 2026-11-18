import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {conversationGuidance} from '../advisor-conversation-guidance.mjs';
const source=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8');
const quality={status:'incomplete',gates:{contact:{state:'confirmed'}}};
const action={bucket:'ready',contact:{channel:'email',address:'synthetic@example.com'}};
function fixture(){
  const sections=[],elements={outcomeDetails:{open:false},activityNote:{value:'Keep my actual note',focus(){this.focused=true;}}};
  const context=vm.createContext({URL,current:{lead:{id:'synthetic'}},activitySaving:false,
    document:{getElementById:id=>id==='conversationBrief'?{append:e=>sections.push(e)}:elements[id],createElement:tag=>({tag,innerHTML:'',children:[],append(e){this.children.push(e);}})}});
  vm.runInContext(source.slice(0,source.indexOf('let offset=')),context);
  vm.runInContext(source.slice(source.indexOf('function renderConversationGuide(){'),source.indexOf('let historicalRows=')),context);
  context.currentWorkflow={action,conversation_guidance:conversationGuidance(action,quality)};
  return {context,sections,elements,render:()=>vm.runInContext('renderConversationGuide()',context)};
}

test('coaching is collapsed, escaped, and contains no sending controls',()=>{
  const c=fixture();c.context.currentWorkflow.conversation_guidance.opening='<img src=x onerror=alert(1)>';
  c.render();const view=c.sections[0];assert.equal(view.tag,'details');assert.equal(view.open,undefined);
  assert.match(view.innerHTML,/First conversation guide.*Draft coaching/);
  assert.match(view.innerHTML,/&lt;img/);assert.doesNotMatch(view.innerHTML,/<img|mailto:|tel:|Send now/);
  assert.equal(view.children.length,1);assert.equal(view.children[0].type,'button');
});

test('record button opens existing form without prefill, save, or repeated-click mutation',()=>{
  const c=fixture();c.render();const button=c.sections[0].children[0];button.onclick();button.onclick();
  assert.equal(c.elements.outcomeDetails.open,true);assert.equal(c.elements.activityNote.focused,true);
  assert.equal(c.elements.activityNote.value,'Keep my actual note');
});

test('stale and saving-state buttons cannot act on a newer prospect',()=>{
  for(const state of ['changed','closed','saving']){
    const c=fixture();c.render();const button=c.sections[0].children[0];
    if(state==='changed')c.context.currentWorkflow={...c.context.currentWorkflow};
    if(state==='closed')c.context.current=null;
    if(state==='saving')c.context.activitySaving=true;
    button.onclick();assert.equal(c.elements.outcomeDetails.open,false);assert.equal(c.elements.activityNote.focused,undefined);
  }
});

test('holds contain only the reason, terminal records and older responses omit coaching',()=>{
  const c=fixture();c.context.currentWorkflow.conversation_guidance=conversationGuidance({...action,held:true,reason:'<script>Wait</script>'},quality);c.render();
  assert.match(c.sections[0].innerHTML,/Before outreach.*&lt;script&gt;Wait/);assert.equal(c.sections[0].children.length,0);
  assert.doesNotMatch(c.sections[0].innerHTML,/Discover what matters|Respond without pressure/);
  for(const bucket of ['closed','clients']){c.context.currentWorkflow.action={bucket};c.render();}
  c.context.currentWorkflow={action};c.render();assert.equal(c.sections.length,1);
});

test('guide remains after the authoritative next action and before evidence; note privacy help is associated',()=>{
  assert.ok(source.indexOf('Next action:')<source.indexOf('  renderConversationGuide();'));
  assert.ok(source.indexOf('  renderConversationGuide();')<source.indexOf('  renderBriefSummary();'));
  const page=readFileSync(new URL('../lab.html',import.meta.url),'utf8');
  assert.match(page,/id="activityNote"[^>]*aria-describedby="conversationNoteHelp"/);
  assert.match(page,/id="conversationNoteHelp">Record only what was said or agreed/);
});
