import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeResearch,identityMatch} from '../native-research.mjs';
import {validateAccuracy} from '../research-release-gate.mjs';
const lead={id:'jane',first_name:'Jane',last_name:'Smith',company:'Example Consulting',city:'Albany'};
test('same-name same-city and distant employer text cannot establish identity',()=>{
 assert.equal(identityMatch(lead,'Jane Smith works at Another Business in Albany.','person'),false);
 assert.equal(identityMatch(lead,'Jane Smith in Albany. '+('unrelated text '.repeat(50))+'Example Consulting','person'),false);
 assert.equal(identityMatch(lead,'Jane Smith leads Example Consulting in Albany.','person'),true);
});
test('Crossref affiliation belongs to the matched author, not a coauthor',async()=>{
 const run=own=>createNativeResearch({get:async url=>{
 if(String(url).includes('crossref'))return {text:JSON.stringify({message:{items:[{URL:'https://doi.org/10.1/test',title:['Research'],author:[{given:'Jane',family:'Smith',affiliation:[{name:own}]},{given:'Other',family:'Author',affiliation:[{name:'Example Consulting'}]}]}]}})};
 return {text:'{"articles":[]}'};
 }})(lead,'expertise');
 assert.equal((await run('Another University')).records.length,0);
 assert.equal((await run('Example Consulting')).records.length,1);
});
test('release gate rejects missing, stale, insufficient or erroneous validation',()=>{
 assert.ok(validateAccuracy(null,'hash'));
 const categories=['website','registry','license','professional','announcement','news','association','maps','sec','expertise','warn','mwbe'];
 const report={source_fingerprint:'hash',independent_review:true,reviewer:'fixture reviewer',implementable:true,cases:Array.from({length:600},(_,i)=>({id:String(i),category:categories[i%12],source_url:'https://example.com/'+i,reviewed_by:'fixture',correct:true}))};
 assert.equal(validateAccuracy(report,'hash'),null);
 assert.ok(validateAccuracy(report,'changed'));assert.ok(validateAccuracy({...report,cases:report.cases.slice(0,100)},'hash'));
 report.cases[0].correct=false;assert.ok(validateAccuracy(report,'hash'));
});

test('full profiles do not report unsaved evidence as saved, and other users cannot trigger research',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readFileSync}=await import('node:fs');const {createDatabase}=await import('../database.mjs');const {default:worker}=await import('../generated/worker.mjs');
 const pg=new PGlite();try{
 await pg.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));const db=createDatabase({query:(...a)=>pg.query(...a),connect:async()=>({query:(...a)=>pg.query(...a),release(){}})});
 let calls=0;const call=(path,body,user='owner')=>worker.fetch(new Request('https://prospectpilot.io/api/'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.com'},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),{DB:db,NATIVE_RESEARCH:async()=>{calls++;return {source:'website',status:'matched',checked_at:new Date().toISOString(),records:[{source:'website',url:'https://example.com/new',excerpt:'Jane Smith at Example Consulting',status:'machine_matched'}]};}});
 await call('me');await call('v3/discovery/imports/csv','First Name,Last Name,Company,Title,Email\nJane,Smith,Example Consulting,Owner,jane@example.com');
 const row=(await pg.query('SELECT id,payload FROM discovery_leads')).rows[0],lead=JSON.parse(row.payload);
 lead.research_records=Array.from({length:100},(_,i)=>({source:'website',url:'https://example.com/'+i,excerpt:'User reviewed '+i,status:'reviewed_by_user'}));
 await pg.query('UPDATE discovery_leads SET payload=$1 WHERE id=$2',[JSON.stringify(lead),row.id]);
 assert.equal((await call('research/auto',{lead_id:row.id,source:'website'},'stranger')).status,404);
 const result=await (await call('research/auto',{lead_id:row.id,source:'website'})).json();assert.equal(result.records.length,0);assert.equal(result.omitted_records,1);assert.equal(result.status,'partial');assert.equal(calls,1);
 const saved=await (await call('research/records?lead_id='+row.id)).json();assert.equal(saved.records.length,100);assert.equal(saved.profile.source_pages,100);
 }finally{await pg.close();}
});
