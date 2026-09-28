import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLinkedInConnection,parseLinkedInSnapshot} from '../generated/worker.mjs';
test('connection export preserves reported first-degree provenance, profile, employer and position',()=>{
 const row=normalizeLinkedInConnection({'First Name':'Synthetic','Last Name':'Example','URL':'https://www.linkedin.com/in/synthetic-example','Company':'Example Company','Position':'Engineering Manager','Connected On':'12 Sep 2026'});
 assert.equal(row.company,'Example Company');assert.equal(row.current_title,'Engineering Manager');assert.equal(row.connection_degree,1);
 assert.equal(row.linkedin_url,'https://www.linkedin.com/in/synthetic-example');assert.ok(row.evidence.some(e=>e.field==='relationship'&&e.source==='LinkedIn connections export'));
});
test('authorized snapshots retain profile context and separately sourced activity without inventing connections',()=>{
 const rows=parseLinkedInSnapshot(JSON.stringify({profiles:[{full_name:'Synthetic Example',profile_url:'https://www.linkedin.com/in/synthetic-example',experience:[{current:true,title:'Director',company_name:'Example Company'}]}],activities:[{author_name:'Synthetic Example',author_url:'https://www.linkedin.com/in/synthetic-example',text:'A professional update',post_url:'https://www.linkedin.com/feed/update/synthetic',occurred_at:'2026-09-01'}]}));
 assert.equal(rows.length,2);assert.equal(rows[0].company,'Example Company');assert.equal(rows[0].current_title,'Director');
 assert.ok(rows[1].activity_signals.some(s=>s.source_url==='https://www.linkedin.com/feed/update/synthetic'));assert.notEqual(rows[0].connection_degree,1);
 assert.throws(()=>parseLinkedInSnapshot('not valid JSON'));
});
