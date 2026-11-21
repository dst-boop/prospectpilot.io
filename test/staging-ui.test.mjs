import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stagingPage,stagingProspectScript,blockedStagingControls,stagingUIScript,stagingUIStyle} from '../scripts/staging-ui.mjs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function fixture(path='/lab'){
 const listeners={},elements=[],nav=[];let mutation;
 function element(id,href){const attrs=href?{href}:{};const e={id,disabled:false,tabIndex:0,textContent:'',getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>attrs[k]=v,closest(selector){return selector.split(',').some(s=>s==='#'+id||s==='a[href]'&&href||s==='a[href="'+href+'"]')?e:null;}};elements.push(e);return e;}
 const status=element('stagingUiStatus');
 const document={documentElement:{},readyState:'complete',getElementById:id=>elements.find(e=>e.id===id),querySelectorAll:()=>elements,addEventListener:(type,fn,options)=>{assert.equal(options,true);listeners[type]=fn;}};
 const html=stagingPage(read(path==='/lab'?'lab.html':'prospect.html'));const script=stagingUIScript;
 vm.runInNewContext(script,{document,URL,location:{pathname:path,href:'http://127.0.0.1:1234'+path,origin:'http://127.0.0.1:1234',assign:u=>nav.push(u)},MutationObserver:class{constructor(fn){mutation=fn;}observe(){}}});
 function dispatch(type,target,key){let prevented=false,stopped=false;listeners[type]({target,key,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});return {prevented,stopped};}
 return {element,dispatch,apply:()=>mutation(),status,nav,html};
}
test('staging rendering adds early control protection and fictional-only exercise guidance',()=>{
 for(const file of ['lab.html','prospect.html','audience.html']){const html=stagingPage(read(file));assert.ok(html.indexOf('src="/staging-ui.js"')<html.indexOf('type="module"'));assert.match(stagingUIStyle,/data-staging-unavailable="true".*display:none!important/);assert.match(html,/href="\/staging-ui.css"/);assert.doesNotMatch(html,/<script>/);assert.match(html,/UI safeguard, not general network isolation/);}
 assert.match(stagingPage(read('audience.html')),/Do not search for real people or purchase exports/);
});
test('original launch IDs blocked under clicks, auxclicks, keyboard and dynamic re-enabling',()=>{
 const f=fixture();
 for(const id of ['draftOutlook','draftMailApp','draftLinkedIn','inviteOutlook','inviteICS']){
  const e=f.element(id);f.apply();assert.equal(e.disabled,true);assert.equal(e.tabIndex,-1);assert.equal(e.getAttribute('aria-disabled'),'true');
  e.disabled=false;f.apply();assert.equal(e.disabled,true);
  for(const [event,key] of [['click'],['auxclick'],['keydown','Enter'],['keydown',' ']])assert.deepEqual(f.dispatch(event,e,key),{prevented:true,stopped:true});
 }
});
test('external anchors and server-disabled forms blocked, allowed local actions preserved',()=>{
 const f=fixture();for(const url of ['mailto:fiction@example.test','tel:+15555550100','https://outlook.office.com/mail/deeplink/compose','/settings/linkedin','/discovery','/research','/enrichment']){const a=f.element('',url);assert.equal(f.dispatch('click',a).stopped,true);}
 for(const id of ['runForm','shareListForm','costForm'])assert.equal(f.dispatch('submit',f.element(id)).stopped,true);
 for(const id of ['draftCopy','saveActivity','saveReview','profileForm','quickImport'])assert.equal(f.dispatch('click',f.element(id)).stopped,false);
 for(const url of ['/prospect?import=1','/lab','/audience','blob:http://127.0.0.1:1234/local'])assert.equal(f.dispatch('click',f.element('',url)).stopped,false);
 const discovery=f.element('findProspects');assert.equal(f.dispatch('click',discovery).stopped,true);assert.deepEqual(f.nav,[]);assert.equal(f.dispatch('click',f.element('buildSearchPlan')).stopped,false);f.apply();assert.equal(discovery.disabled,true);assert.equal(discovery.getAttribute('data-staging-unavailable'),'true');
 const contacts=fixture('/prospect');for(const id of ['importOpen','export','prepareContact','sendToWorklist','newListOpen'])assert.equal(contacts.dispatch('click',contacts.element(id)).stopped,false);
});
test('only staging-served Contacts script skips provider jobs and identifies unsupported list control',()=>{
 const original=read('prospect-client.js'),stage=stagingProspectScript(original);
 assert.match(original,/initProviderUI\(\{api/);assert.doesNotMatch(stage,/initProviderUI\(\{api/);assert.match(stage,/manageButton.id='manageListOpen'/);assert.match(stage,/Domain\/provider checks and outreach are disabled/);
 assert.throws(()=>stagingProspectScript(original.replace('initProviderUI({api','changed({api')),/needs review/);
 assert.ok(blockedStagingControls.includes('profileImageRead'));
});

test('staged audience has an explicit fictional mode and no real export instruction sequence',()=>{const html=stagingPage(read('audience.html'));assert.match(html,/data-fictional-exercise="true"/);assert.match(html,/fixed test dataset, not search results/);assert.match(html,/Open fictional CSV exercise/);assert.doesNotMatch(html,/Use the arrow beside Export|In Advanced Search, choose Contacts/);assert.match(read('audience.html'),/Use the arrow beside Export/);assert.doesNotMatch(read('audience.html'),/data-fictional-exercise/);});
