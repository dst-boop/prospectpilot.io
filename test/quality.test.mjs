import test from 'node:test';import assert from 'node:assert/strict';
import {parsePublicWebPage,normalizeLead,qualifyLead,isUsableStoredLead,discoverCampaignSources} from '../generated/worker.mjs';
test('headings, former roles and missing companies do not become web prospects',()=>{
 for(const html of ['<h2>Other Boards</h2><p>Chief Executive Officer</p>','<h2>Anne Margulies</h2><p>Former Vice President</p>'])assert.equal(parsePublicWebPage(html,'https://example.com/team','Example Shop').length,0);
 assert.equal(parsePublicWebPage('<h2>Jane Smith</h2><p>Owner</p>','https://example.com/team').length,0);
 assert.equal(parsePublicWebPage('<h2>Jane Smith</h2><p>Owner</p>','https://example.com/team','Example Shop').length,1);
});
test('a previous person title is not assigned to the next person',()=>{
 const results=parsePublicWebPage('<h2>Jane Smith</h2><p>Owner</p><h2>John Jones</h2><p>Biography</p>','https://example.com/team','Example Shop');
 assert.deepEqual(results.map(r=>r.name),['Jane Smith']);
});
test('existing invalid public records are filtered and evidence repetition cannot inflate coverage',()=>{
 const bad=normalizeLead({name:'Other Boards',current_title:'CEO',source_names:['Public website']},{source:'Public website'});assert.equal(isUsableStoredLead(bad),false);
 const former=normalizeLead({name:'Jane Smith',company:'Example Shop',current_title:'Former President',source_names:['Public website']},{source:'Public website'});assert.equal(isUsableStoredLead(former),false);
 const lead=normalizeLead({name:'Jane Smith',current_title:'CEO',source_names:['Public website']},{source:'Public website'});
 const initial=lead.confidence;lead.evidence=[...lead.evidence,...lead.evidence,...lead.evidence];qualifyLead(lead);assert.equal(lead.confidence,initial);assert.ok(lead.confidence<=40);assert.equal(lead.estimated_income.high,null);
});
test('an empty local market never falls back to unrelated corporate directories',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{assert.match(String(url),/overpass/);return new Response(JSON.stringify({elements:[]}));};
 try{
 const r=await discoverCampaignSources({industries:['autobody'],locations:['Suffolk County, NY'],radius_miles:25,employers:['Henry Schein'],target_companies:['Henry Schein'],seed_urls:['https://example.com/board'],market_discovery:{location:{query:'Suffolk County, NY',lat:40.8,lon:-73,south:40,north:41,west:-74,east:-72}}});
 assert.deepEqual(r.seed_urls,[]);assert.deepEqual(r.source_plan,[]);
 }finally{globalThis.fetch=original;}
});
