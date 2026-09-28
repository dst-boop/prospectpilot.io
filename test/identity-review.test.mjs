import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createResearchLab,personKey} from '../research-lab.mjs';

// An arrival that could be more than one person, or a namesake at the same
// company in another place, is put in front of the advisor instead of being
// dropped or silently merged.
const MIGRATIONS=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1));
const now=new Date('2026-09-28T15:00:00Z');
const owner={uid:'owner',email:'owner@example.com'},other={uid:'other',email:'other@example.com'};
const header='First Name,Last Name,Company,Title,Email,LinkedIn URL,City,State,Country\n';
const people=header+'Jamie,Rivera,Example Manufacturing,Director,jamie@example.com,https://www.linkedin.com/in/jamie-rivera,Austin,TX,US\nPat,Lee,Other Company,Controller,pat@other.example,,Albany,NY,US';
const moved=header+'Jamie,Rivera,Example Manufacturing,Vice President,,,San Diego,CA,US';
// Pat's email with Jamie's LinkedIn: two records claim this row.
const unclear=header+'Pat,Lee,Other Company,Chief Financial Officer,pat@other.example,https://www.linkedin.com/in/jamie-rivera,Albany,NY,US';

async function fixture(){
  const db=new PGlite();
  for(const file of MIGRATIONS)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const lab=createResearchLab({pool,now:()=>now,sources:{readiness:{}}});
  const call=(user,method,path,body)=>lab.route(new Request('https://prospectpilot.io'+path,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body)}),user);
  const leadId=async name=>(await db.query("SELECT id FROM discovery_leads WHERE payload::jsonb->>'first_name'=$1 ORDER BY created_at",[name])).rows.map(r=>r.id);
  return {db,lab,call,leadId};
}
const openReviews=async db=>Number((await db.query("SELECT count(*) AS n FROM lab_identity_reviews WHERE status='open'")).rows[0].n);

test('the probable key ignores punctuation and needs name and company',()=>{
  assert.equal(personKey({first_name:'Jamie',last_name:'Rivera',company:'Example, Inc.'}),personKey({first_name:'jamie',last_name:'RIVERA',company:'Example Inc'}));
  assert.equal(personKey({first_name:'Jamie',last_name:'Rivera'}),'');
});

test('an arrival matching two records is held for review, once, and merged where the advisor says',async()=>{
  const {db,lab,call,leadId}=await fixture();try{
    await lab.importCSV(owner,{csv:people});
    const result=await lab.importCSV(owner,{csv:unclear});
    assert.equal(result.result.ambiguous,1);assert.equal(result.result.added,0);
    assert.equal(await openReviews(db),1,'held, not dropped');
    await lab.importCSV(owner,{csv:unclear+'\n'},);
    assert.equal(await openReviews(db),1,'the same arrival again does not add a copy');
    const {total,reviews}=await call(owner,'GET','/api/lab/identity-reviews');
    assert.equal(total,1);
    const [review]=reviews;
    assert.equal(review.kind,'unresolved');assert.equal(review.arrival.id,null);assert.equal(review.arrival.title,'Chief Financial Officer');
    assert.deepEqual(review.matches.map(m=>m.name).sort(),['Jamie Rivera','Pat Lee']);assert.equal(review.held_elsewhere,0);
    assert.equal((await call(other,'GET','/api/lab/identity-reviews')).total,0,'reviews are private to the advisor');
    await assert.rejects(call(other,'POST','/api/lab/identity-reviews/'+review.id,{decision:'discard'}),{status:404});
    await assert.rejects(call(owner,'POST','/api/lab/identity-reviews/'+review.id,{decision:'same'}),{status:400});
    await assert.rejects(call(owner,'POST','/api/lab/identity-reviews/'+review.id,{decision:'merge',target_id:'someone-else'}),{status:400});
    const [pat]=await leadId('Pat');
    assert.deepEqual(await call(owner,'POST','/api/lab/identity-reviews/'+review.id,{decision:'merge',target_id:pat}),{status:'merged',lead_id:pat});
    const saved=JSON.parse((await db.query('SELECT payload FROM discovery_leads WHERE id=$1',[pat])).rows[0].payload);
    assert.deepEqual(saved.field_values.current_title.map(v=>v.value),['Controller','Chief Financial Officer'],'both titles kept with their sources');
    const row=(await db.query('SELECT status,candidate,key_hashes FROM lab_identity_reviews WHERE id=$1',[review.id])).rows[0];
    assert.equal(row.status,'merged');assert.deepEqual(row.candidate,{});assert.deepEqual(row.key_hashes,[],'the held copy is dropped once decided');
    await assert.rejects(call(owner,'POST','/api/lab/identity-reviews/'+review.id,{decision:'discard'}),{status:409});
  }finally{await db.close();}
});

test('save as new and discard close the review; another advisor\'s record is counted, never shown',async()=>{
  const {db,lab,call,leadId}=await fixture();try{
    await lab.importCSV(owner,{csv:people});
    await lab.importCSV(other,{csv:unclear});
    const {reviews}=await call(other,'GET','/api/lab/identity-reviews');
    assert.equal(reviews[0].matches.length,0);assert.equal(reviews[0].held_elsewhere,2);
    const [jamie]=await leadId('Jamie');
    await assert.rejects(call(other,'POST','/api/lab/identity-reviews/'+reviews[0].id,{decision:'merge',target_id:jamie}),{status:403});
    const saved=await call(other,'POST','/api/lab/identity-reviews/'+reviews[0].id,{decision:'save_new'});
    assert.equal(saved.status,'saved');
    const row=(await db.query('SELECT owner_user_id FROM discovery_leads WHERE id=$1',[saved.lead_id])).rows[0];
    assert.equal(row.owner_user_id,'other');
    await lab.importCSV(owner,{csv:unclear.replace('Chief Financial Officer','Treasurer')});
    const [again]=(await call(owner,'GET','/api/lab/identity-reviews')).reviews;
    assert.deepEqual(await call(owner,'POST','/api/lab/identity-reviews/'+again.id,{decision:'discard'}),{status:'discarded',lead_id:null});
  }finally{await db.close();}
});

test('a namesake in another place is saved and queued; "same person" folds it into the first record',async()=>{
  const {db,lab,call,leadId}=await fixture();try{
    await lab.importCSV(owner,{csv:people});
    await lab.importCSV(owner,{csv:moved});
    const ids=await leadId('Jamie');
    assert.equal(ids.length,2,'saved, not dropped');
    const [review]=(await call(owner,'GET','/api/lab/identity-reviews')).reviews;
    assert.equal(review.kind,'probable');assert.equal(review.arrival.id,ids[1]);assert.equal(review.arrival.location,'San Diego, CA');
    assert.deepEqual(review.matches.map(m=>[m.id,m.location]),[[ids[0],'Austin, TX']]);
    assert.deepEqual(await call(owner,'POST','/api/lab/identity-reviews/'+review.id,{decision:'same',target_id:ids[0]}),{status:'merged',lead_id:ids[0]});
    assert.deepEqual(await leadId('Jamie'),[ids[0]],'the newer record is gone');
    const kept=JSON.parse((await db.query('SELECT payload FROM discovery_leads WHERE id=$1',[ids[0]])).rows[0].payload);
    assert.deepEqual(kept.field_values.state.map(v=>v.value),['TX','CA'],'both locations are kept with their sources');
    assert.equal(Number((await db.query('SELECT count(*) AS n FROM lab_run_leads WHERE lead_id=$1',[ids[0]])).rows[0].n),2,'both runs still show the person');
  }finally{await db.close();}
});

test('"same person" never throws away work on the newer record; "separate" keeps both',async()=>{
  const {db,lab,call,leadId}=await fixture();try{
    await lab.importCSV(owner,{csv:people});await lab.importCSV(owner,{csv:moved});
    const ids=await leadId('Jamie');
    const [review]=(await call(owner,'GET','/api/lab/identity-reviews')).reviews;
    await db.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES($1,'owner','age','{}')",[ids[1]]);
    await assert.rejects(call(owner,'POST','/api/lab/identity-reviews/'+review.id,{decision:'same',target_id:ids[0]}),{status:409});
    assert.equal((await leadId('Jamie')).length,2);
    assert.equal((await call(owner,'POST','/api/lab/identity-reviews/'+review.id,{decision:'separate'})).status,'separate');
    assert.equal((await leadId('Jamie')).length,2);assert.equal(await openReviews(db),0);
  }finally{await db.close();}
});

test('deleting the person removes the reviews that hold or point at them',async()=>{
  const {db,lab,call,leadId}=await fixture();try{
    await lab.importCSV(owner,{csv:people});
    await lab.importCSV(owner,{csv:unclear});
    await lab.importCSV(owner,{csv:moved});
    assert.equal(await openReviews(db),2);
    const [pat]=await leadId('Pat');
    // Deleting Pat removes the held arrival carrying Pat's email.
    await call(owner,'DELETE','/api/lab/leads/'+encodeURIComponent(pat));
    assert.deepEqual((await call(owner,'GET','/api/lab/identity-reviews')).reviews.map(r=>r.kind),['probable']);
    // Deleting the newer Jamie takes its review with it.
    const ids=await leadId('Jamie');
    await call(owner,'DELETE','/api/lab/leads/'+encodeURIComponent(ids[1]));
    assert.equal(Number((await db.query('SELECT count(*) AS n FROM lab_identity_reviews')).rows[0].n),0);
  }finally{await db.close();}
});
