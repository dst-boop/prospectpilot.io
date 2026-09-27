import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab,labConfiguration,titleMatches} from '../research-lab.mjs';

// A campaign by place: companies near a ZIP first, then people on each
// company's own pages, keeping only the titles asked for. The business
// directory and the pages are stubs; nothing leaves the test.
const migrations=['006-research-lab','017-forget','012-plan-catalog-summary','007-quality-v2','008-prospect-workspace','013-advisor-workflow','014-outreach-cadence','015-dial-budget','016-inbound-contact','020-lab-companies'];
async function fixture({companies,people={},marketFails=false,quote=()=>0,unmatched=[],marketStatus='completed',marketErrors=[]}={}) {
  const db=new PGlite();
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
  for(const name of migrations)await db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>pool.query(...a),release(){}})};
  const calls={market:[],run:[]};
  const sources={readiness:{},quote,
    market:async input=>{calls.market.push(input);if(marketFails)throw Error('directory down');return {status:marketStatus,companies,errors:marketErrors,unmatched_terms:unmatched,location:{label:'Huntington, NY'},radius_miles:input.radius_miles,industry_labels:['Electrical contractors'],provider:'OpenStreetMap',attribution:'© OpenStreetMap contributors · ODbL'};},
    run:async(source,employer)=>{calls.run.push([source,employer.company]);return {status:'completed',candidates:people[employer.company]||[]};}};
  return {db,calls,lab:createResearchLab({pool,sources}),user:{uid:'owner',email:'owner@example.com'}};
}
const drain=async lab=>{let n=0;while(await lab.tick())n++;return n;};
const co=(name,miles)=>({name,website:`https://${name.toLowerCase().replace(/\W+/g,'')}.example`,location:'Huntington, NY',distance_miles:miles,industries:['Electrical contractors'],source:'OpenStreetMap business directory',source_url:'https://www.openstreetmap.org/node/1'});
const person=(name,title,company)=>({name,company,current_title:title,email:`${name.split(' ')[0].toLowerCase()}@${company.toLowerCase().replace(/\W+/g,'')}.example`,country:'US'});

test('a campaign by place needs both a place and a business type, and keeps its settings',()=>{
  assert.throws(()=>labConfiguration({location:'11747'}),{status:422});
  assert.throws(()=>labConfiguration({industries:['Electrical contractors']}),{status:422});
  const c=labConfiguration({location:' 11747 ',industries:['Electrical contractors','Electrical contractors'],titles:['Owner',' VP ']});
  assert.deepEqual([c.location,c.radius_miles,c.industries,c.titles],['11747',25,['Electrical contractors'],['Owner','VP']]);
  assert.throws(()=>labConfiguration({location:'11747',industries:['x'],radius_miles:500}),{status:422});
  assert.equal(labConfiguration().location,'','an employer-only configuration is unchanged');
});

test('title terms match whole words and read common abbreviations both ways',()=>{
  assert.equal(titleMatches('Vice President, Operations',['VP']),true);
  assert.equal(titleMatches('VP Finance',['Vice President']),true);
  assert.equal(titleMatches('Chief Executive Officer',['CEO']),true);
  assert.equal(titleMatches('Director of Operations',['Director']),true);
  assert.equal(titleMatches('Ownership Analyst',['Owner']),false);
  assert.equal(titleMatches('Chief Financial Analyst',['CFO']),false,'an abbreviation means the whole title');
  assert.equal(titleMatches('Chief Executive Assistant',['CEO']),false);
  assert.equal(titleMatches('Vice President, Sales',['President']),false,'President does not keep every Vice President');
  assert.equal(titleMatches('President and CEO',['President']),true);
  assert.equal(titleMatches('Vice President, Sales',['Vice President']),true);
  assert.equal(titleMatches('',['Owner']),false);
  assert.equal(titleMatches('Anything',[]),true,'no titles means everyone is kept');
});

test('companies are found first, saved with the run, then researched for the chosen titles only',async()=>{
  const {db,lab,user,calls}=await fixture({
    companies:[co('Bright Spark Electric',2.1),co('Equitable Wiring',3),co('Harbor Electrical',4.5)],
    people:{'Bright Spark Electric':[person('Pat Owens','Owner','Bright Spark Electric'),person('Sam Lee','Office Assistant','Bright Spark Electric')],'Harbor Electrical':[person('Robin Hale','Vice President','Harbor Electrical')]}});
  try{
    const run=await lab.enqueue(user,{location:'11747',radius_miles:10,industries:['Electrical contractors'],titles:['Owner','VP'],sources:['public_web'],idempotency_key:'place-1'});
    assert.notEqual(run.status,'completed','no employer list is needed');
    await drain(lab);
    assert.deepEqual(calls.market[0],{location:'11747',radius_miles:10,industries:['Electrical contractors'],max_companies:100});
    assert.deepEqual(calls.run.map(c=>c[1]).sort(),['Bright Spark Electric','Harbor Electrical'],'Equitable is never researched');
    const detail=await lab.runDetail(user,run.id);
    assert.deepEqual(detail.companies.map(c=>[c.name,c.queued]),[['Bright Spark Electric',true],['Harbor Electrical',true]]);
    const market=detail.tasks.find(t=>t.source==='market');
    assert.equal(market.result.companies_found,2);assert.equal(market.result.companies_queued,2);assert.match(market.result.attribution,/OpenStreetMap/);
    const names=(await db.query('SELECT payload FROM discovery_leads')).rows.map(r=>JSON.parse(r.payload)).map(l=>`${l.first_name} ${l.last_name}`).sort();
    assert.deepEqual(names,['Pat Owens','Robin Hale'],'the office assistant was not stored');
    const bright=detail.tasks.find(t=>t.payload.company==='Bright Spark Electric');
    assert.equal(bright.result.off_target,1);assert.equal(bright.result.added,1);
    assert.equal(detail.run.status,'completed');
  }finally{await db.close();}
});

test('the company limit holds, and a daily campaign moves on to companies it has not just researched',async()=>{
  const {db,lab,user,calls}=await fixture({companies:[co('Alpha Electric',1),co('Beta Electric',2),co('Gamma Electric',3)]});
  try{
    const first=await lab.enqueue(user,{location:'11747',industries:['Electrical contractors'],sources:['public_web'],max_companies:2,idempotency_key:'day-1'});
    await drain(lab);
    const firstCompanies=(await lab.runDetail(user,first.id)).companies;
    assert.deepEqual(firstCompanies.filter(c=>c.queued).map(c=>c.name),['Alpha Electric','Beta Electric']);
    assert.equal(firstCompanies.find(c=>!c.queued).skip_reason,"Beyond this run's company limit.");
    calls.run.length=0;
    const second=await lab.enqueue(user,{location:'11747',industries:['Electrical contractors'],sources:['public_web'],max_companies:2,idempotency_key:'day-2'});
    await drain(lab);
    assert.deepEqual(calls.run.map(c=>c[1]),['Gamma Electric']);
    const market=(await lab.runDetail(user,second.id)).tasks.find(t=>t.source==='market');
    assert.equal(market.result.recently_researched,2);
  }finally{await db.close();}
});

test('a directory failure is reported, not papered over, and invents no companies',async()=>{
  const {db,lab,user}=await fixture({marketFails:true});
  try{
    const run=await lab.enqueue(user,{location:'11747',industries:['Electrical contractors'],sources:['public_web'],idempotency_key:'down'});
    await drain(lab);
    const detail=await lab.runDetail(user,run.id);
    assert.equal(detail.run.status,'completed_with_gaps');assert.equal(detail.companies.length,0);
    assert.equal(detail.tasks.find(t=>t.source==='market').status,'failed');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM discovery_leads')).rows[0].n,0);
  }finally{await db.close();}
});

test('the place search passes the campaign to the business directory and keeps only company fields',async()=>{
  const {createLabSources}=await import('../lab-sources.mjs');
  const seen=[];
  const sources=createLabSources({discoverCompanies:async campaign=>{seen.push(campaign);return {companies:[{...co('Delta Electric',6.2),phone:'(631) 555-0100',confidence:0.8}],errors:[],provider:'OpenStreetMap',location:{label:'Huntington, NY'},radius_miles:15,industry_labels:['Electrical contractors'],attribution:'© OpenStreetMap contributors · ODbL'};}});
  const out=await sources.market({location:'11747',radius_miles:15,industries:['electrician'],max_companies:100});
  assert.deepEqual(seen[0],{locations:['11747'],radius_miles:15,industries:['electrician'],max_companies:100});
  assert.equal(out.status,'completed');assert.equal(out.companies[0].name,'Delta Electric');
  assert.equal(out.companies[0].phone,undefined,'only what the campaign uses is kept');
  assert.equal(sources.quote('market'),0,'the directory is free');
  const empty=createLabSources({discoverCompanies:async()=>({companies:[],errors:['Business type “widgets” is not recognized yet.']})});
  const none=await empty.market({location:'11747',radius_miles:25,industries:['widgets'],max_companies:100});
  assert.equal(none.status,'partial');assert.match(none.errors[0],/not recognized/);
});

test('a company counts as researched only when a source actually ran for it',async()=>{
  // The only source costs more than the day's budget, so every company task is skipped.
  const {db,lab,user}=await fixture({companies:[co('Alpha Electric',1),co('Beta Electric',2)],quote:source=>source==='sec'?1000:0});
  try{
    await lab.enqueue(user,{location:'11747',industries:['Electrical contractors'],sources:['sec'],idempotency_key:'skipped-day'});
    await drain(lab);
    assert.deepEqual((await db.query("SELECT DISTINCT status FROM lab_tasks WHERE source='sec'")).rows.map(r=>r.status),['skipped']);
    const second=await lab.enqueue(user,{location:'11747',industries:['Electrical contractors'],sources:['sec'],idempotency_key:'next-day'});
    await drain(lab);
    const market=(await lab.runDetail(user,second.id)).tasks.find(t=>t.source==='market');
    assert.equal(market.result.companies_queued,2,'skipped companies stay in the rotation');assert.equal(market.result.recently_researched,0);
  }finally{await db.close();}
});

test('business types the directory did not recognise are reported and the search is not called complete',async()=>{
  const {createLabSources}=await import('../lab-sources.mjs');
  const sources=createLabSources({discoverCompanies:async()=>({companies:[co('Echo Electric',1)],errors:[],unmatched_terms:['widgets'],provider:'OpenStreetMap',location:{label:'x'},radius_miles:25,industry_labels:['Electrical contractors']})});
  const out=await sources.market({location:'11747',radius_miles:25,industries:['electrician','widgets'],max_companies:100});
  assert.equal(out.status,'partial');assert.match(out.errors[0],/Not recognised, so not searched: widgets/);
  // The run keeps that partial answer: the companies are researched, the gap stays visible.
  const {db,lab,user}=await fixture({companies:[co('Echo Electric',1)],marketStatus:'partial',marketErrors:out.errors});
  try{
    const run=await lab.enqueue(user,{location:'11747',industries:['Electrical contractors','widgets'],sources:['public_web'],idempotency_key:'mixed'});
    await drain(lab);
    const detail=await lab.runDetail(user,run.id),market=detail.tasks.find(t=>t.source==='market');
    assert.equal(market.status,'partial');assert.equal(market.result.companies_queued,1);assert.match(market.result.errors[0],/widgets/);
    assert.equal(detail.run.status,'completed_with_gaps');
  }finally{await db.close();}
});
