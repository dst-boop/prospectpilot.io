import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {createProspectWorkspace} from '../prospect-workspace.mjs';

test('daily review derives mobile hold without changing raw provider flags or crossing owners',async()=>{
 const db=new PGlite();try{
  for(const n of ['008-prospect-workspace','020-list-sharing','017-forget'])await db.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})},app=createProspectWorkspace({pool}),user={uid:'synthetic-owner'};
  await db.query("INSERT INTO prospect_lists(id,user_id,name) VALUES('synthetic-list',$1,'Synthetic delivery')",[user.uid]);
  const scenarios=[['same',{phone:'+12125550199',mobile_phone:'+12125550199',phone_origin:'mobile',phone_restrictions:{direct:true,mobile:false}},true],['distinct',{phone:'+12125550198',mobile_phone:'+12125550199',phone_origin:'direct',phone_restrictions:{direct:true,mobile:false}},false],['suppressed',{mobile_phone:'+12125550199',suppressed:true,phone_restrictions:{mobile:false}},true]];
  for(const [id,phone] of scenarios){const payload={first_name:'Synthetic',last_name:id,email:id+'@example.test',deliveries:{'synthetic-list':{}},...phone};await db.query('INSERT INTO prospect_contacts(id,user_id,payload) VALUES($1,$2,$3)',[id,user.uid,JSON.stringify(payload)]);await db.query("INSERT INTO prospect_list_members(list_id,contact_id) VALUES('synthetic-list',$1)",[id]);}
  const result=await app.route(new Request('https://synthetic.test/api/prospect/daily-review'),user);
  for(const [id,,blocked] of scenarios){const item=result.items.find(x=>x.id===id);assert.equal(item.mobile_do_not_call,false,'raw mobile claim preserved');assert.equal(item.mobile_blocked,blocked,id);}
  const kept=await app.route(new Request('https://synthetic.test/api/prospect/contacts/same/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({list_id:'synthetic-list',decision:'keep'})}),user);assert.equal(kept.mobile_blocked,true);assert.equal(kept.mobile_do_not_call,false);
  assert.deepEqual((await app.route(new Request('https://synthetic.test/api/prospect/daily-review'),{uid:'other'})).items,[]);
 }finally{await db.close();}
});
test('daily review renders effective hold and old-server raw DNC without suggesting other channels are cleared',()=>{
 const source=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8'),render=source.slice(source.indexOf('function renderDaily(){'),source.indexOf('function replaceDaily('));
 for(const [fields,blocked] of [[{mobile_do_not_call:false,mobile_blocked:true},true],[{mobile_do_not_call:false,mobile_blocked:false},false],[{mobile_do_not_call:true},true]]){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
  const context=vm.createContext({$:get,renderDailyProgress(){},dailyVisible:()=>[{id:'synthetic',first_name:'Synthetic',last_name:'Fixture',mobile_phone:'+12125550199',email:'fixture@example.test',...fields}],daily:{list:{id:'synthetic-list'}},dailyIndex:0,dailyBusy:false,encodeURIComponent});
  vm.runInContext(render+';renderDaily();',context);assert.equal(get('dailyDnc').hidden,!blocked);
 }
 const html=readFileSync(new URL('../prospect.html',import.meta.url),'utf8');assert.match(html,/Other channels still require their own outreach clearance/);
});
