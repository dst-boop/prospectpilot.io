import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Outreach leaves from the advisor's own Outlook: the firm's tenant allows no
// third-party sign-in and must archive what is sent, so the worklist only
// prepares the message. These pin what it prepares and to whom.
const lab=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8');
function outreach(workflow){
 const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,checked:false,disabled:false});return elements.get(id);};
 const opened=[];
 const context=vm.createContext({URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},Blob,crypto,setTimeout,$:element,window:{open:(...a)=>opened.push(a)},location:{},document:{createElement:()=>({click(){}})},when:String,
  currentWorkflow:workflow,current:{lead:{first_name:'Jamie',last_name:'Rivera, Jr.'}}});
 const start=lab.indexOf('function renderDraft()'),end=lab.indexOf("$('activityOutcome').onchange");
 vm.runInContext(lab.slice(start,end),context);
 return {element,opened,run:code=>vm.runInContext(code,context)};
}
const email={action:{contact:{channel:'email',address:'jamie@example.com'},signature:'s'},draft:{channel:'email',subject:'Plan & next steps',body:'Hi Jamie,\n\nA quick note.',needs:[]},cadence:null};

test('an email draft opens in Outlook on the web, addressed to the reviewed route and nothing else',()=>{
 const c=outreach(email);c.run('renderDraft()');
 assert.equal(c.element('draftOutlook').hidden,false);assert.equal(c.element('draftMailApp').hidden,false);
 c.element('draftOutlook').onclick();
 const url=new URL(c.opened[0][0]);
 assert.equal(url.origin+url.pathname,'https://outlook.office.com/mail/deeplink/compose');
 assert.equal(url.searchParams.get('to'),'jamie@example.com');
 assert.equal(url.searchParams.get('subject'),'Plan & next steps');
 assert.equal(url.searchParams.get('body'),'Hi Jamie,\n\nA quick note.');
 assert.doesNotMatch(c.opened[0][0],/\+/,'spaces are %20, which Outlook reads literally');
 assert.match(c.element('draftCopied').textContent,/Press Send there/);
 assert.match(c.run("mailApp({to:'jamie@example.com',subject:'a b',body:'c'})"),/^mailto:jamie%40example\.com\?subject=a%20b&body=c$/);
});

test('no Outlook draft without a reviewed email route, or for a phone or LinkedIn touch',()=>{
 for(const workflow of [{...email,action:{contact:{channel:'phone',address:'+15555550100'}}},{...email,action:{contact:null}},
  {...email,draft:{...email.draft,channel:'phone'}},{...email,action:{contact:{channel:'email',address:'a@b.com\r\nBcc: x@y.com'}}}]){
  const c=outreach(workflow);c.run('renderDraft()');
  assert.equal(c.element('draftOutlook').hidden,true);c.element('draftOutlook').onclick();assert.equal(c.opened.length,0);
 }
});

test('a booked meeting prepares an Outlook invite or an .ics for the saved time, and sends nothing itself',()=>{
 const c=outreach(email);
 c.element('activityOutcome').value='meeting_booked';c.run('activityFields()');assert.equal(c.element('inviteField').hidden,false);
 c.element('activityOutcome').value='connected';c.run('activityFields()');assert.equal(c.element('inviteField').hidden,true);
 c.element('inviteOutlook').onclick();assert.equal(c.opened.length,0);assert.match(c.element('inviteNote').textContent,/Set the meeting time/);
 c.element('activityNext').value='2026-10-01T14:30';c.element('inviteLength').value='45';
 c.element('inviteOutlook').onclick();
 const url=new URL(c.opened[0][0]),start=new Date('2026-10-01T14:30');
 assert.equal(url.origin+url.pathname,'https://outlook.office.com/calendar/deeplink/compose');
 assert.equal(url.searchParams.get('rru'),'addevent');assert.equal(url.searchParams.get('to'),'jamie@example.com');
 assert.equal(url.searchParams.get('startdt'),start.toISOString());
 assert.equal(url.searchParams.get('enddt'),new Date(start.getTime()+45*60000).toISOString());
 const ics=c.run('inviteICS(meetingInvite())');
 assert.match(ics,/^BEGIN:VCALENDAR\r\n/);
 assert.doesNotMatch(ics,/METHOD:|ATTENDEE|jamie@example\.com/,'a plain appointment: a request would need an organizer the app does not know');
 assert.match(ics,new RegExp('DTSTART:'+start.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')+'\r\n'));
 c.element('inviteICS').onclick();assert.match(c.element('inviteNote').textContent,/add the guest \(jamie@example\.com\)/);
 assert.doesNotMatch(ics,/[^\r]\n/,'every line ends CRLF');
});

test('without a reviewed email the invite has no guest; the advisor adds one in Outlook',()=>{
 const c=outreach({...email,action:{contact:{channel:'phone',address:'+15555550100'}}});
 c.element('activityNext').value='2026-10-01T09:00';c.element('inviteOutlook').onclick();
 assert.equal(new URL(c.opened[0][0]).searchParams.get('to'),null);
 assert.match(c.element('inviteNote').textContent,/add the guest in Outlook/);
});

// The ZoomInfo export is recognised from its own headers; no API or login.
const directory=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
function dropped(){
 const pending=[],options=[];
 const select={value:'',add(o){options.push(o);},querySelector:()=>null};
 const context=vm.createContext({$:id=>id==='importList'?select:{},lists:[],loadLists:async()=>{context.lists=[{id:'existing',name:'Boeing VPs'}];},
  api:(path,body)=>new Promise((resolve,reject)=>pending.push({path,body,resolve,reject}))});
 vm.runInContext(directory.slice(directory.indexOf("const NEW_LIST="),directory.indexOf('async function prepareImportFile')).replace(/^const |^let /gm,'var ')+
  directory.slice(directory.indexOf('async function importList'),directory.indexOf("$('csvFile').addEventListener")),context);
 return {pending,select,context,run:code=>vm.runInContext(code,context)};
}

test('ZoomInfo exports are recognised by their headers, and the new list is named after the file',()=>{
 const c=dropped();
 assert.equal(c.context.ZOOMINFO_HEADERS.test('ZoomInfo Contact ID,First Name,Last Name,Company Name'),true);
 assert.equal(c.context.ZOOMINFO_HEADERS.test('"First Name","Last Name","Contact Accuracy Score"'),true);
 assert.equal(c.context.ZOOMINFO_HEADERS.test('First Name,Last Name,Company,Email'),false);
 assert.equal(c.run("fileListName({name:'Boeing_VPs.csv'})"),'Boeing VPs');
 assert.equal(c.run("fileListName({name:'.csv'})"),'Imported contacts');
});

test('the named list is created only on import, and an existing list of that name is reused',async()=>{
 const c=dropped();c.run("newListName='Boeing VPs'");c.select.value='__new__';
 assert.equal(await c.run('importList(false)'),undefined,'a preview creates nothing');assert.equal(c.pending.length,0);
 const created=c.run('importList(true)');assert.equal(c.pending[0].body.name,'Boeing VPs');assert.equal(c.pending[0].path,'lists');
 c.pending[0].resolve({id:'new-list'});assert.equal(await created,'new-list');
 const again=c.run('importList(true)');c.pending[1].reject(Error('A list with this name already exists.'));
 assert.equal(await again,'existing');
 c.select.value='chosen';assert.equal(await c.run('importList(true)'),'chosen');
});
