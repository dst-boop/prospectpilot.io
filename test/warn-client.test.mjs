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
