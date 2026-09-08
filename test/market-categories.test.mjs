import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCategories,resolveCategories} from '../market-categories.mjs';
import {patchMarket} from '../patch-market.mjs';
import {readFileSync} from 'node:fs';
import {discoverMarketCompanies} from '../generated/worker.mjs';
test('every catalog alias resolves to its intended category',()=>{
 for(const c of readCategories()) for(const alias of [c.label,...c.aliases]) assert.ok(resolveCategories([alias]).labels.includes(c.label),`${alias} -> ${c.label}`);
});
test('plural, punctuation, mixed industries, and specific categories',()=>{
 assert.deepEqual(resolveCategories(['AUTO-BODY, mechanics; Plumbers / electricians']).labels,['Autobody shops','Auto repair','Plumbers','Electrical contractors']);
 assert.deepEqual(resolveCategories(['medical laboratories']).labels,['Medical laboratories']);
 assert.deepEqual(resolveCategories(['auto repair and car dealers']).labels.sort(),['Auto repair','Automotive dealers']);
 assert.deepEqual(resolveCategories(['carpet','barley','notmapped']).labels,[]);
 assert.deepEqual(resolveCategories(['plumber','notmapped']).unmatched,['notmapped']);
});
test('future additions resolve without changing matcher',()=>{
 const catalog=readCategories([{label:'Example category',aliases:['new business term'],selectors:[['shop','example']]}]);
 assert.deepEqual(resolveCategories(['new business terms'],catalog).labels,['Example category']);
});
test('patch can be applied repeatedly without duplicating guards',()=>{
 const s=readFileSync(new URL('../generated/worker.mjs',import.meta.url),'utf8');
 const result=patchMarket(patchMarket(s));assert.equal((result.match(/industries.selectors.length > 64/g)||[]).length,1);
 assert.equal((result.match(/export const categoryRows/g)||[]).length,1);
});
test('multi-category search queries both tags and accepts an automotive business',async()=>{
 const original=globalThis.fetch;
 let query='';globalThis.fetch=async(url,opts)=>{assert.match(String(url),/overpass/);query=new URLSearchParams(opts.body).get('data');return new Response(JSON.stringify({elements:[{type:'node',id:123,lat:40.8,lon:-73,tags:{name:'Example Automotive School Road',shop:'car_repair','service:vehicle:body_repair':'yes',website:'https://example.com'}}]}));};
 try {
 const r=await discoverMarketCompanies({industries:['Autobody','Plumbers'],locations:['Suffolk County, NY'],market_discovery:{location:{query:'Suffolk County, NY',lat:40.8,lon:-73,south:40,north:41,west:-74,east:-72}},radius_miles:20});
 assert.match(query,/body_repair/);assert.match(query,/plumber/);assert.equal(r.companies.length,1);assert.deepEqual(r.errors,[]);
 }finally{globalThis.fetch=original;}
});

test('technology terms map to IT services without matching unrelated words',()=>{for(const term of ['Technology','Tech companies','Cybersecurity','SaaS','Cloud computing','App development'])assert.deepEqual(resolveCategories([term]).labels,['IT services']);assert.deepEqual(resolveCategories(['biotechnology']).labels,[]);});
