import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {deepParse,select,finalize,deliveries,toCSV,digest,readLedger,appendLedger,enrichmentRecords,tenureAt,seniority,csvCell,scoreParts,stintAt,scoopSignals} from '../scripts/daily-leads/engine.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';

// Every name here is fictional. Real lead data never enters this repository.
const config=JSON.parse(readFileSync(new URL('../scripts/daily-leads/config.json',import.meta.url),'utf8'));
const today='2026-09-28';
const person=(id,first,last,title,company,extra={})=>({id:String(id),type:'Contact',attributes:{firstName:first,lastName:last,jobTitle:title,company:{id:900+Number(String(id).slice(-2)),name:company},contactAccuracyScore:92,hasEmail:true,hasMobilePhone:true,mobilePhoneDoNotCall:false,directPhoneDoNotCall:false,lastUpdatedDate:'2026-09-20T00:00:00Z',...extra}});
const search=(tier,employer,rows)=>({meta:{kind:'search',tier,employer},response:JSON.stringify(JSON.stringify({data:rows,meta:{totalResults:rows.length}}))});
const scoops={meta:{kind:'scoops'},response:{data:[
  {id:'s1',attributes:{company:{id:1,name:'Example Robotics'},contacts:[{id:101,firstName:'Avery',lastName:'Sample'}],description:'Avery Sample has left Example Robotics after 22 years to join Beta Labs as COO.',link:'https://news.example.com/avery',originalPublishedDate:'2026-09-26T00:00:00Z',types:[{type:'Left Company'}]}},
  {id:'s2',attributes:{company:{id:2,name:'Gamma Foods'},contacts:[],description:'Gamma Foods to cut 400 roles.',link:'https://news.example.com/gamma',originalPublishedDate:'2026-09-24T00:00:00Z',types:[{type:'Layoffs'}]}},
]}};

test('double-encoded responses parse, and titles rank seniority',()=>{
  assert.deepEqual(deepParse(JSON.stringify(JSON.stringify({a:1}))),{a:1});
  assert.equal(seniority('Vice President, Finance').label,'VP');
  assert.equal(seniority('Chief Financial Officer').label,'C level');
  assert.equal(seniority('Senior Manager, Payroll').label,'Manager');
});

test('selection joins scoops, excludes, dedupes, spreads across employers and keeps no hard cap',()=>{
  const files=[scoops,
    search('A','',[person(101,'Avery','Sample','Chief Operating Officer','Beta Labs')]),
    search('B','Example Robotics',[person(102,'Blair','Test','Director of Engineering','Delta Systems'),person(103,'Casey','Equity','Manager','Equitable Holdings'),person(104,'Drew','Advice','Financial Advisor','Wealth Co'),
      person(105,'Emery','NoPhone','Director','Epsilon',{hasMobilePhone:false}),person(101,'Avery','Sample','Chief Operating Officer','Beta Labs')]),
    // One employer shares one company id; a look-alike name is another company.
    search('C','Gamma Foods',[...Array.from({length:14},(_,i)=>person(200+i,'Pat'+i,'Long','Director, Plant '+i,'Gamma Foods',{company:{id:902,name:'Gamma Foods'}})),
      person(250,'Quinn','Lookalike','Chief Executive Officer','Gamma Foods Brewing',{company:{id:950,name:'Gamma Foods Brewing'}})])];
  const ledger=new Set(['213']);
  const {selected,counts,excluded,layoff_employers}=select(files,{config,ledger,today});
  const avery=selected.find(c=>c.person_id==='101');
  assert.equal(avery.tier,'A','the scoop names the departure');assert.match(avery.signal.why,/22 years/);assert.equal(avery.signal.url,'https://news.example.com/avery');
  assert.equal(selected[0].person_id,'101','a named, dated departure ranks first');
  assert.equal(counts.already_delivered,1,'nobody arrives twice');
  assert.deepEqual(excluded.map(e=>e.reason).sort(),['Different company with a similar name','Equitable or affiliate','Works in financial advice','ZoomInfo holds no mobile or no email']);
  assert.equal(selected.filter(c=>c.signal.employer==='Gamma Foods').length,config.per_employer_cap,'one employer never fills the day');
  assert.equal(counts.held_by_employer_cap,13-config.per_employer_cap);
  assert.equal(counts.duplicate,1);assert.deepEqual(layoff_employers,['Gamma Foods']);
  assert.deepEqual(selected.map(c=>c.rank),selected.map((_,i)=>i+1));
  assert.equal(select(files,{config,ledger,today,target:3}).selected.length,3,'the target is a setting');
});

test('a foreign mobile marks the lead abroad and never becomes a US number',()=>{
  const sel=[{person_id:'1',first_name:'A',last_name:'B',tier:'B',signal:{employer:'X'}}];
  const [sg]=finalize(sel,new Map([['1',{mobilePhone:'+65 9138 0756',email:'a@x.example'}]]),{today});
  assert.equal(sg.mobile,'');assert.equal(sg.abroad,true);
  const [us]=finalize(sel,new Map([['1',{mobilePhone:'(212) 555-0100',email:'a@x.example'}]]),{today});
  assert.equal(us.mobile,'+12125550100');assert.equal(us.abroad,false);
});

test('long tenure is not claimed when the history shows the stint ended',()=>{
  const sel=[{person_id:'1',first_name:'A',last_name:'B',title:'CFO',tier:'C',signal:{type:'Long tenure',employer:'Gamma Foods'}}];
  const history=[{company:{companyName:'Gamma Foods'},fromDate:'2005-01-01',toDate:'2011-06-01'}];
  const [lead]=finalize(sel,new Map([['1',{employmentHistory:history}]]),{today});
  assert.match(lead.why_now,/ending 2011\. Confirm on LinkedIn/);assert.doesNotMatch(lead.why_now,/10 years or more/);
});

test('tenure rejects similarly named companies but accepts ordinary legal suffixes',()=>{
  const history=[{companyName:'Cisco Brewers',fromDate:'1990-01-01',toDate:'2020-01-01'},
    {companyName:'Cisco, Inc.',fromDate:'2010-01-01',toDate:'2015-01-01'},
    {companyName:'Cisco Corporation',fromDate:'2013-01-01',toDate:'2020-01-01'}];
  const matched=stintAt(history,'Cisco',today);
  assert.equal(matched.first,'2010-01-01');assert.equal(matched.years,10,'overlapping roles are counted once');
  assert.equal(stintAt([{companyName:'Cisco Brewers',fromDate:'1990-01-01'}],'Cisco',today),null);
  assert.equal(stintAt([{companyName:'Cisco',fromDate:'1990-01-01'}],'Cisco Brewers',today),null);
  assert.equal(stintAt([{companyName:'Company Builders',fromDate:'1990-01-01'}],'Builders',today),null,'legal-looking words inside a brand are not stripped');
});

test('invalid or future career dates cannot invent tenure or a completed departure',()=>{
  for(const change of [{fromDate:'2026-02-30'},{fromDate:'2027-01-01'},{toDate:'not-a-date'},{toDate:'2026-02-30'}])
    assert.equal(stintAt([{companyName:'Example Co',fromDate:'2010-01-01',...change}],'Example Co',today),null);
  const planned=stintAt([{companyName:'Example Co',fromDate:'2010-01-01',toDate:'2030-01-01'}],'Example Co',today);
  assert.equal(planned.last,today);assert.equal(planned.current,true);assert.ok(planned.years<17);
  const [lead]=finalize([{person_id:'1',tier:'B',company:'Other Co',signal:{employer:'Example Co'}}],new Map([['1',{employmentHistory:[{companyName:'Example Co',fromDate:'2010-01-01'}]}]]),{today});
  assert.match(lead.why_now,/still lists a role/);assert.doesNotMatch(lead.why_now,/^Left /);
});

test('search-only context does not claim an exact tenure or recent start and name-only scoop index is removed',()=>{
  const rows=finalize([{person_id:'1',tier:'C',company:'Example Co',signal:{employer:'Example Co',layoff:true}},
    {person_id:'2',tier:'B',company:'Other Co',signal:{employer:'Example Co'}}],new Map(),{today});
  assert.match(rows[0].why_now,/career dates need confirmation/);
  assert.doesNotMatch(rows.map(r=>r.why_now).join(' '),/10 years or more|last 90 days|announced layoffs this month/);
  const parsed=scoopSignals(scoops.response);
  assert.equal(parsed.byPerson.has('101'),true);assert.equal('byName' in parsed,false);
});

test('enrichment merges whatever envelope arrives; missing numbers are left for the advisor',()=>{
  const {selected}=select([scoops,search('A','',[person(101,'Avery','Sample','Chief Operating Officer','Beta Labs')]),search('B','Example Robotics',[person(102,'Blair','Test','Director','Delta Systems')])],{config,today});
  const response=JSON.stringify({contact_1:{success:true,input:{personId:101},data:{result:[{id:101,firstName:'Avery',email:'Avery.Sample@betalabs.example',mobilePhone:'(212) 555-0100',mobilePhoneDoNotCall:true,
    externalUrls:[{type:'linkedin.com',url:'http://www.linkedin.com/in/avery-sample'}],employmentHistory:[{company:{companyName:'Example Robotics'},fromDate:'2004-01-01',toDate:'2026-08-31'}]}]}},
    contact_2:{success:false,input:{personId:102},error:'Limit exceeded'}});
  const enrichment=enrichmentRecords(response);
  assert.deepEqual([...enrichment.keys()],['101'],'a failed contact contributes nothing');
  const leads=finalize(selected,enrichment,{today});
  const avery=leads.find(l=>l.person_id==='101'),blair=leads.find(l=>l.person_id==='102');
  assert.equal(avery.email,'avery.sample@betalabs.example');assert.equal(avery.mobile,'+12125550100');assert.equal(avery.linkedin_url,'https://www.linkedin.com/in/avery-sample');
  assert.equal(avery.mobile_dnc,true);assert.equal(avery.enriched,true);assert.equal(avery.tenure_years,22.7);
  assert.equal(blair.enriched,false);assert.equal(blair.email,'');assert.match(blair.why_now,/^Reported former employer: Example Robotics; current role Director at Delta Systems/,'no departure date is claimed without the history');
  assert.match(blair.linkedin_search,/^https:\/\/www\.linkedin\.com\/search\/results\/people\/\?keywords=Blair%20Test%20Delta%20Systems$/);
  assert.equal(tenureAt([{company:{companyName:'Other'},fromDate:'2000-01-01'}],'Example Robotics',today),null);
});

test('the CSV cannot carry formulas, and the digest carries no phone or email',()=>{
  assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+12125550100'),'"+12125550100"');assert.equal(csvCell('-1785933767'),'"-1785933767"');
  const {selected}=select([scoops,search('A','',[person(101,'Avery','Sample','=cmd|x','Beta Labs')])],{config,today});
  const leads=finalize(selected,enrichmentRecords({contact_1:{success:true,data:{id:101,email:'a@b.example',mobilePhone:'2125550100'}}}),{today});
  const csv=toCSV(leads,{today});
  assert.match(csv,/"'=cmd\|x"/);
  const mail=digest(leads,{today,counts:{found:1,already_delivered:0,excluded:0,employers:1},goal:50,links:{csv:'https://drive.example/csv',app:'https://prospectpilot.io/prospect'}});
  assert.doesNotMatch(mail.html+mail.text,/2125550100|a@b\.example/);
  assert.match(mail.subject,/1 rollover prospects with mobile numbers$/);assert.match(mail.summary,/^Short day: only 1 new prospects/);assert.match(mail.html,/not verified balances/);
});

test('search duplicates retain restrictions from excluded rows in either file order',()=>{
  const good=search('B','Example Robotics',[person(101,'Avery','Sample','Director','Delta Systems')]);
  const blocked=search('B','Example Robotics',[person(101,'Avery','Sample','Director','Delta Systems',{mobilePhoneDoNotCall:true,directPhoneDoNotCall:true,hasEmail:false})]);
  const unrelated=search('B','Example Robotics',[person(102,'Avery','Sample','Director','Delta Systems')]);
  for(const files of [[good,blocked,unrelated],[blocked,unrelated,good]]){
    const {selected}=select(files,{config,today});
    const lead=selected.find(c=>c.person_id==='101');
    assert.equal(lead.mobile_dnc,true);assert.equal(lead.direct_dnc,true);assert.equal(lead.parts.callable,0);
    assert.equal(selected.find(c=>c.person_id==='102').mobile_dnc,false,'names do not join restrictions');
    const [enriched]=finalize([lead],enrichmentRecords({id:101,email:'avery@example.com',mobilePhone:'2125550100',mobilePhoneDoNotCall:false}),{today});
    assert.equal(enriched.mobile_dnc,true);
    assert.doesNotMatch(digest([enriched],{today,counts:{},goal:1}).subject,/ready to call/);
  }
});

test('future or invalid dates do not earn freshness points and missing mobile does not earn availability points',()=>{
  const candidate={tier:'B',title:'Director',accuracy:90,has_mobile:true,signal:{date:'2026-09-27'},updated:'2026-09-27'};
  const fresh=scoreParts(candidate,today);
  for(const date of ['2026-09-29','not-a-date','']){
    const bad=scoreParts({...candidate,signal:{date},updated:date},today);
    assert.equal(bad.trigger,fresh.trigger-10);assert.equal(bad.data,fresh.data-5);
  }
  assert.equal(scoreParts({...candidate,has_mobile:false},today).callable,0);
});

test('duplicate enrichment keeps restrictions and withholds conflicting contact fields across files',()=>{
  const first={id:101,email:'avery@one.example',mobilePhone:'(212) 555-0100',mobilePhoneDoNotCall:true};
  const second={id:101,email:'avery@two.example',mobilePhone:'+12125550100',mobilePhoneDoNotCall:false};
  for(const rows of [[first,second],[second,first]]){
    const records=enrichmentRecords(rows[0],{source:'enrich-a.json'});
    enrichmentRecords(rows[1],{records,source:'enrich-b.json'});
    // A third response agreeing with one side must not erase the unresolved conflict.
    enrichmentRecords(first,{records,source:'enrich-c.json'});
    const record=records.get('101');
    assert.equal(record.email,undefined);
    assert.equal(record.mobilePhoneDoNotCall,true);
    assert.equal(record.enrichment_conflicts.email.length,3);
    assert.match(record.enrichment_conflicts.email[1].source,/enrich-b.json/);
    assert.equal(record.enrichment_conflicts.mobilePhone,undefined,'formatting is not a conflict');
    const [lead]=finalize([{person_id:'101',first_name:'Avery',last_name:'Sample',tier:'B',signal:{employer:'Example'}}],records,{today});
    assert.equal(lead.email,'');assert.equal(lead.mobile,'+12125550100');assert.equal(lead.mobile_dnc,true);
    assert.equal(lead.enriched,false);assert.match(lead.why_now,/Conflicting enrichment requires review: email/);
    assert.doesNotMatch(toCSV([lead],{today}),/avery@one|avery@two/);
  }
  assert.equal(first.email,'avery@one.example','source responses remain untouched');
});

test('empty enrichment never removes recorded values and identity conflicts withhold every contact channel',()=>{
  const records=enrichmentRecords([{id:101,firstName:'Avery',email:'avery@example.com',mobilePhone:'2125550100'},
    {id:101,firstName:'Avery',email:'',mobilePhone:null}]);
  assert.equal(records.get('101').email,'avery@example.com');
  enrichmentRecords({id:101,firstName:'Blair',email:'avery@example.com'},{records});
  const [lead]=finalize([{person_id:'101',first_name:'Avery',last_name:'Sample',tier:'B',signal:{employer:'Example'}}],records,{today});
  assert.equal(lead.email,'');assert.equal(lead.mobile,'');assert.equal(lead.enriched,false);
  assert.match(lead.why_now,/firstName/);
});

test('the ledger keeps a person out for the configured window',()=>{
  const csv=appendLedger('',[{person_id:'1'},{person_id:'-2'}],{today:'2026-01-01'});
  assert.deepEqual([...readLedger(csv,{today,days:365})],['1','-2']);
  assert.equal(readLedger(csv,{today,days:180}).size,0);
  assert.match(appendLedger(csv,[{person_id:'3',outcome:'no_mobile'}],{today}),/^zoominfo_contact_id,delivered_on,outcome\n1,2026-01-01,delivered\n-2,2026-01-01,delivered\n3,2026-09-28,no_mobile\n$/);
  assert.match(appendLedger('zoominfo_contact_id,delivered_on\n1,2026-01-01\n',[{person_id:'3'}],{today}),/^zoominfo_contact_id,delivered_on,outcome\n1,2026-01-01\n3,2026-09-28,delivered\n$/,'an older two-column ledger keeps its rows');
});

test('only leads with a mobile number are delivered; enriched misses are recorded, never re-enriched',()=>{
  const base=id=>({person_id:id,first_name:'A',last_name:'B',tier:'B',signal:{employer:'Example'}});
  const all=finalize(['1','2','3','4'].map(base),new Map([
    ['1',{mobilePhone:'2125550100'}],
    ['2',{email:'b@x.example'}],
    ['3',{mobilePhone:'+65 9138 0756',email:'c@x.example'}],
  ]),{today});
  const {leads,recorded,waiting}=deliveries(all);
  assert.deepEqual(leads.map(l=>l.person_id),['1'],'a mobile without an email is delivered; an email alone is not');
  assert.deepEqual(recorded.map(l=>[l.person_id,l.outcome]),[['1','delivered'],['2','no_mobile'],['3','abroad']]);
  assert.deepEqual(waiting.map(l=>l.person_id),['4'],'not enriched: no credit spent, eligible again');
  const ledger=readLedger(appendLedger('',recorded,{today}),{today,days:180});
  assert.deepEqual([...ledger].sort(),['1','2','3']);
  const mail=digest(leads,{today,counts:{found:4,already_delivered:0,excluded:0,employers:1,no_mobile:1,waiting:1},goal:1});
  assert.match(mail.summary,/1 rollover prospects for .*, each with a mobile number \(0 also with email\)/);
  assert.match(mail.html,/1 enriched without a usable mobile, left off · 1 not enriched today/);
});

test('the command line keeps work files out of the repository and writes the day',()=>{
  const cli=fileURLToPath(new URL('../scripts/daily-leads/run.mjs',import.meta.url));
  assert.throws(()=>execFileSync(process.execPath,[cli,'select','--work',fileURLToPath(new URL('..',import.meta.url)),'--date',today],{stdio:'pipe'}),/outside the repository/);
  const plan=JSON.parse(execFileSync(process.execPath,[cli,'plan','--date',today,'--extra','Gamma Foods']).toString());
  assert.equal(plan.employers[0],'Gamma Foods');assert.equal(plan.credit_cap,80);
  assert.ok(plan.queries.every(q=>q.tool==='search_scoops'||(q.params.requiredFieldsList.join()==='mobilePhone,email'&&q.params.state.length<=500)),'every contact search requires a mobile and an email');
  assert.ok(!/\b(AK|HI)\b/.test(plan.queries[2].params.state),'contiguous US only');
  const dir=mkdtempSync(join(tmpdir(),'daily-leads-'));
  writeFileSync(join(dir,'scoops-moves.json'),JSON.stringify(scoops));
  writeFileSync(join(dir,'search-a-0.json'),JSON.stringify(search('A','',[person(101,'Avery','Sample','Chief Operating Officer','Beta Labs')])));
  const chosen=JSON.parse(execFileSync(process.execPath,[cli,'select','--work',dir,'--date',today]).toString());
  assert.deepEqual(chosen.enrich_batches,[['101']]);assert.equal(chosen.counts.selected,1);
  writeFileSync(join(dir,'enrich-0.json'),JSON.stringify({contact_1:{success:true,data:{id:101,email:'a@b.example',mobilePhone:'2125550100'}}}));
  const done=JSON.parse(execFileSync(process.execPath,[cli,'finalize','--work',dir,'--date',today]).toString());
  assert.equal(done.delivered,1);assert.equal(done.with_mobile_and_email,1);
  assert.ok(existsSync(join(dir,`daily-leads-${today}.csv`))&&existsSync(join(dir,'digest.html'))&&existsSync(join(dir,'ledger.csv')));
});

test('the delivery imports into Contacts and drives the daily review to the goal',async()=>{
  const db=new PGlite();
  try{
    for(const file of readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1)))
      await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const app=createProspectWorkspace({pool}),user={uid:'advisor',email:'advisor@example.com'},other={uid:'other',email:'other@example.com'};
    const call=(who,method,path,body)=>app.route(new Request('https://prospectpilot.io/api/prospect/'+path,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),who);
    const {selected}=select([scoops,search('A','',[person(101,'Avery','Sample','Chief Operating Officer','Beta Labs')]),search('B','Example Robotics',[person(102,'Blair','Test','Director','Delta Systems'),person(-3,'Casey','Neg','Manager','Zeta Co')])],{config,today});
    const enriched=enrichmentRecords({contact_1:{success:true,data:{id:101,email:'avery@betalabs.example',mobilePhone:'2125550100',mobilePhoneDoNotCall:true,externalUrls:['https://www.linkedin.com/in/avery-sample']}}});
    const csv=toCSV(finalize(selected,enriched,{today}),{today});
    const list=await call(user,'POST','lists',{name:'Daily leads — '+today});
    const imported=await call(user,'POST','import',{csv,format:'zoominfo',source:'ProspectPilot daily leads (ZoomInfo)',list_id:list.id});
    assert.equal(imported.added,3);assert.equal(imported.rejected,0);
    const review=await call(user,'GET','daily-review');
    assert.equal(review.list.id,list.id,'the newest delivery opens by default');
    assert.deepEqual(review.counts,{total:3,pending:3,kept:0,passed:0,quality:0,kept_missing_contact:0});
    const avery=review.items.find(i=>i.first_name==='Avery');
    assert.equal(review.items[0].first_name,'Avery','delivered rank order');
    assert.equal(avery.signal.type,'Left company','the event itself, not the tier');assert.match(avery.signal.basis,/^Trigger \d+\/50 · Seniority 25\/25 · Data \d+\/20 · Mobile on file 5\/5$/);assert.equal(avery.signal.credits,1);
    assert.equal(review.items.find(i=>i.first_name==='Blair').signal.credits,0);assert.equal(avery.signal.url,'https://news.example.com/avery');assert.match(avery.signal.linkedin_search,/linkedin\.com\/search/);
    assert.equal(avery.mobile_phone,'+12125550100');assert.equal(avery.mobile_do_not_call,true);assert.equal(avery.linkedin_url,'https://www.linkedin.com/in/avery-sample');
    assert.equal(review.items.find(i=>i.first_name==='Casey').zoominfo_id,'-3','negative ZoomInfo IDs survive');
    const kept=await call(user,'POST',`contacts/${avery.id}/review`,{list_id:list.id,decision:'keep'});
    assert.equal(kept.quality,true,'kept with both routes: a quality lead');
    const blair=review.items.find(i=>i.first_name==='Blair');
    assert.equal((await call(user,'POST',`contacts/${blair.id}/review`,{list_id:list.id,decision:'keep'})).quality,false,'kept without a mobile and email does not count yet');
    await assert.rejects(call(user,'POST',`contacts/${blair.id}/review`,{list_id:list.id,decision:'pass'}),{status:422});
    await assert.rejects(call(user,'POST',`contacts/${blair.id}/review`,{decision:'keep'}),{status:422},'a decision names its delivery');
    await assert.rejects(call(other,'POST',`contacts/${blair.id}/review`,{list_id:list.id,decision:'keep'}),{status:404});
    // The advisor adds Blair's numbers from ZoomInfo on the card.
    const fresh=(await call(user,'GET','daily-review')).items.find(i=>i.id===blair.id);
    await call(user,'PATCH',`contacts/${blair.id}`,{fields:{mobile_phone:'+1 (646) 555-0101',email:'blair@delta.example'},revision:fresh.revision,reason:'Added from ZoomInfo during daily review'});
    const casey=review.items.find(i=>i.first_name==='Casey');
    await call(user,'POST',`contacts/${casey.id}/review`,{list_id:list.id,decision:'pass',reason:'no_rollover_likely'});
    const after=await call(user,'GET','daily-review?list_id='+list.id);
    assert.deepEqual(after.counts,{total:3,pending:0,kept:2,passed:1,quality:2,kept_missing_contact:0});
    assert.equal(after.goal,50);
    // A ZoomInfo export dropped back in fills the numbers by ZoomInfo ID.
    await call(user,'POST',`contacts/${casey.id}/review`,{list_id:list.id,decision:'reset'});
    const back=await call(user,'POST','import',{csv:'First Name,Last Name,Company Name,ZoomInfo Contact ID,Mobile Phone,Email Address\nCasey,Neg,Zeta Co,-3,+1 212 555 0102,casey@zeta.example',format:'zoominfo',source:'ZoomInfo CSV export',list_id:list.id});
    assert.equal(back.duplicates,1);
    const filled=(await call(user,'GET','daily-review')).items.find(i=>i.id===casey.id);
    assert.equal(filled.email,'casey@zeta.example');assert.equal(filled.mobile_phone,'+12125550102');assert.equal(filled.signal.rank,3,'the signal survives the export');
    assert.equal((await call(other,'GET','daily-review')).list,null,'another advisor sees nothing');
    // A contact on another list for another reason stays out of that list's
    // review; a later delivery keeps the earlier decision.
    const other_list=await call(user,'POST','lists',{name:'Conference follow-ups'});
    await call(user,'POST',`lists/${other_list.id}/members`,{ids:[avery.id]});
    assert.equal((await call(user,'GET','daily-review')).lists.some(l=>l.id===other_list.id),false,'a plain list is not a delivery');
    const later=await call(user,'POST','lists',{name:'Daily leads — 2027-04-01'});
    const again=await call(user,'POST','import',{csv:csv.replace(/2026-09-28/g,'2027-04-01'),format:'zoominfo',source:'ProspectPilot daily leads (ZoomInfo)',list_id:later.id});
    assert.equal(again.duplicates,3);
    assert.deepEqual((await call(user,'GET','daily-review?list_id='+later.id)).counts,{total:3,pending:3,kept:0,passed:0,quality:0,kept_missing_contact:0},'a new delivery starts its own review');
    assert.equal((await call(user,'GET','daily-review?list_id='+list.id)).counts.kept,2,'the earlier delivery keeps its decisions');
    // Delete this person takes the signal and the review with the contact.
    await call(user,'DELETE',`contacts/${avery.id}`);
    assert.equal((await call(user,'GET','daily-review')).counts.total,2);
  }finally{await db.close();}
});
