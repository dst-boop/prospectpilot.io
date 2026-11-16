import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('WARN dashboard labels unavailable mirror coverage instead of presenting it as an empty complete search',async()=>{
  const element=()=>({value:'',textContent:'',children:[],append(child){this.children.push(child);},replaceChildren(){this.children=[];},querySelector(){return button;}});
  const button=element(),ids=Object.fromEntries(['state','company','from','to','status','freshness','coverage','notices','page','previous','next','filters'].map(id=>[id,element()]));
  const document={getElementById:id=>ids[id],querySelectorAll:()=>[button],createElement:element};
  const context={document,URLSearchParams,Date,fetch:async()=>({ok:true,json:async()=>({manifest_available:false,total:0,total_notices:0,
    fetched_at:'2026-11-16T12:00:00Z',published_at:null,publication_stale:null,events:[],coverage:[{state:'NY',status:'unavailable',rows:null}]})})};
  vm.runInNewContext(readFileSync(new URL('../warn-client.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(ids.freshness.textContent,/Mirror unavailable: its jurisdiction coverage is unknown/);
  assert.match(ids.notices.children[0].textContent,/Check coverage before concluding there are no notices/);
  assert.equal(ids.coverage.children[0].textContent,'NY: unavailable');
  assert.equal(ids.previous.disabled,true);assert.equal(ids.next.disabled,true);
});


test('WARN dashboard distinguishes fresh mirrors, stale datasets, unknown dates and manifest gaps',async()=>{
  const element=()=>({value:'',textContent:'',children:[],append(child){this.children.push(child);},replaceChildren(){this.children=[];},querySelector(){return button;}});
  const button=element(),ids=Object.fromEntries(['state','company','from','to','status','freshness','coverage','notices','page','previous','next','filters'].map(id=>[id,element()]));
  const document={getElementById:id=>ids[id],querySelectorAll:()=>[button],createElement:element};
  const data={manifest_available:true,total:1,total_notices:1,fetched_at:'2026-11-16T12:00:00Z',published_at:'2026-11-16T11:00:00Z',publication_stale:false,
    coverage:[{state:'NY',status:'loaded',rows:1,publication_basis:'mirror',published_at:'2026-11-16T11:00:00Z',publication_stale:false,unknown_notice_dates:1,unknown_effective_dates:1},
      {state:'TX',status:'loaded',rows:0,publication_basis:'official_dataset',published_at:'2026-07-07T18:15:59Z',publication_stale:true,unknown_notice_dates:0,unknown_effective_dates:0},
      {state:'CA',status:'not_published',rows:null}],
    events:[{employer:'Synthetic Example',state:'NY',notice_date:null,notice_date_note:'11/1/26',effective_date:null,date_note:'Winter 2026',workers:null,source_url:'https://example.gov/notice'}]};
  vm.runInNewContext(readFileSync(new URL('../warn-client.js',import.meta.url),'utf8'),{document,URLSearchParams,Date,fetch:async()=>({ok:true,json:async()=>data})});
  await new Promise(resolve=>setImmediate(resolve));
  const text=node=>[node.textContent,...node.children.map(text)].join(' ');
  assert.match(ids.freshness.textContent,/Mirror publication is not the underlying state's observation date/);
  assert.match(text(ids.coverage.children[0]),/1 unknown notice dates; 1 unknown effective dates/);
  assert.match(text(ids.coverage.children[0]),/Underlying state-source observation date: unknown/);
  assert.match(text(ids.coverage.children[1]),/Dataset updated:.*over 48 hours old/);
  assert.doesNotMatch(text(ids.coverage.children[1]),/Mirror published/);
  assert.equal(ids.coverage.children[2].textContent,'CA: not published in the mirror manifest');
  assert.match(text(ids.notices),/Notice: unknown \(source text: 11\/1\/26\)/);
  assert.match(text(ids.notices),/Effective: unknown \(source text: Winter 2026\)/);
});
