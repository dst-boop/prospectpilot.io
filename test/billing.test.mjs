import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createBilling,createStripeClient,verifySignature,formEncode,readBilling} from '../billing.mjs';
import {createProspectJobs} from '../prospect-jobs.mjs';
import {createHandler} from '../handler.mjs';
import {billingContent} from '../prospect-jobs-client.js';

// Stripe billing. Stripe itself is a stub: no request leaves the test and no
// card is ever involved. Webhooks are signed exactly as Stripe signs them.
const SECRET='whsec_testsecret';
const PLANS={starter:{name:'Starter',monthly_allowance_micros:2000,stripe_price_id:'price_starter'},pro:{name:'Pro',monthly_allowance_micros:10000,stripe_price_id:'price_pro'},internal:{name:'Internal',monthly_allowance_micros:500}};
const advisor={uid:'advisor-a',email:'advisor@example.com'};
const sign=(body,{secret=SECRET,t=Math.floor(Date.now()/1000)}={})=>`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${body}`).digest('hex')}`;
const subscription=(over={})=>({id:'sub_1',created:1780000000,customer:'cus_1',status:'active',metadata:{uid:advisor.uid},items:{data:[{price:{id:'price_starter'},current_period_end:1790000000}]},...over});

function stubStripe(){
  const calls=[];let current=subscription();let failNext=false;const subs={};const sessions={};let n=0;
  return {calls,sessions,set:sub=>{current=sub;},put:sub=>{subs[sub.id]=sub;},failOnce:()=>{failNext=true;},
    post:async(path,params)=>{calls.push({method:'POST',path,params});
      if(path==='checkout/sessions'){const id='cs_'+(++n);sessions[id]={status:'open'};return {id,url:'https://checkout.stripe.com/c/pay/'+id};}
      if(path.endsWith('/expire')){sessions[path.split('/')[2]].status='expired';return {};}
      return {url:'https://billing.stripe.com/p/session/test'};},
    get:async path=>{calls.push({method:'GET',path});if(failNext){failNext=false;throw Object.assign(Error('Stripe request failed: timeout'),{status:502});}
      if(path.startsWith('checkout/sessions/'))return structuredClone(sessions[path.split('/')[2]]);
      const id=decodeURIComponent(path.split('/')[1]);return structuredClone(subs[id]||current);}};
}

async function fixture(fn,extra={}){
  const db=new PGlite();
  try{
    for(const name of ['008-prospect-workspace','020-list-sharing','009-prospect-jobs','011-email-domain-check','017-forget','019-web-research','023-memberships','024-billing','025-topups'])await db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const stripe=stubStripe(),logs=[];
    const config={dailyBudgetMicros:1000000,prices:{search:1000},plans:PLANS,defaultPlan:'internal',...extra};
    const billing=createBilling({pool,stripe,config,webhookSecret:SECRET,logger:{log:l=>logs.push(l)}});
    let n=0;
    const jobs=createProspectJobs({pool,config,pacingMs:{pdl:0},providers:{readiness:{search:true},search:async()=>({contacts:[],retrieved:0,total:0})}});
    const search=async()=>{const job=await jobs.enqueue(advisor,{action:'search',filters:{company:'Example'},size:1,max_cost_micros:1000,idempotency_key:'billing-search-'+(++n)});while(await jobs.tick());return (await jobs.jobs(advisor,job.id)).tasks[0];};
    const deliver=async(event,signature)=>{const body=JSON.stringify(event);return billing.webhook(body,signature??sign(body));};
    const row=async()=>(await db.query('SELECT * FROM prospect_memberships WHERE user_id=$1',[advisor.uid])).rows[0];
    await fn({db,billing,stripe,jobs,search,deliver,row,logs,config});
  }finally{await db.close();}
}
const completed=(id='evt_1')=>({id,type:'checkout.session.completed',data:{object:{mode:'subscription',subscription:'sub_1',client_reference_id:advisor.uid,customer:'cus_1'}}});
const updated=(id)=>({id,type:'customer.subscription.updated',data:{object:{id:'sub_1'}}});

test('signatures: only Stripe-signed, current, untampered bodies are accepted',()=>{
  const body='{"id":"evt"}';
  assert.equal(verifySignature(body,sign(body),SECRET),true);
  assert.equal(verifySignature(body,sign(body,{secret:'whsec_other'}),SECRET),false);
  assert.equal(verifySignature(body+' ',sign(body),SECRET),false,'a changed body fails');
  assert.equal(verifySignature(body,sign(body,{t:Math.floor(Date.now()/1000)-600}),SECRET),false,'a replay outside five minutes fails');
  assert.equal(verifySignature(body,`${sign(body,{secret:'whsec_other'})},v1=${sign(body).split('v1=')[1]}`,SECRET),true,'any listed v1 may match during secret rotation');
  for(const bad of ['',null,'t=abc,v1=00','v1=00','t=1'])assert.equal(verifySignature(body,bad,SECRET),false);
});

test('settings: billing is off without keys, and a half-configured key fails loudly',()=>{
  assert.equal(readBilling({}),null);
  assert.deepEqual(readBilling({STRIPE_SECRET_KEY:'sk_test_abc',STRIPE_WEBHOOK_SECRET:'whsec_abc'}),{secretKey:'sk_test_abc',webhookSecret:'whsec_abc'});
  assert.throws(()=>readBilling({STRIPE_SECRET_KEY:'sk_test_abc'}),/STRIPE_WEBHOOK_SECRET/);
  assert.throws(()=>readBilling({STRIPE_SECRET_KEY:'pk_live_abc',STRIPE_WEBHOOK_SECRET:'whsec_abc'}),/Invalid STRIPE_SECRET_KEY/);
  assert.equal(formEncode({line_items:[{price:'price_x',quantity:1}],subscription_data:{metadata:{uid:'u'}},skip:undefined}).toString(),'line_items%5B0%5D%5Bprice%5D=price_x&line_items%5B0%5D%5Bquantity%5D=1&subscription_data%5Bmetadata%5D%5Buid%5D=u');
});

test('the Stripe client sends form-encoded requests with the key and surfaces Stripe errors',async()=>{
  const seen=[];
  const client=createStripeClient({secretKey:'sk_test_abc',fetch:async(url,init)=>{seen.push({url,init});return seen.length===1?Response.json({id:'cs_1'}):Response.json({error:{message:'No such price'}},{status:400});}});
  assert.deepEqual(await client.post('checkout/sessions',{mode:'subscription'}),{id:'cs_1'});
  assert.equal(seen[0].url,'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(seen[0].init.headers.Authorization,'Bearer sk_test_abc');
  assert.equal(seen[0].init.body,'mode=subscription');
  await assert.rejects(client.get('subscriptions/sub_x'),e=>e.status===502&&/No such price/.test(e.message)&&!/sk_test/.test(e.message));
});

test('a completed checkout puts the advisor on the plan they paid for, once',()=>fixture(async({deliver,row,stripe,jobs,logs})=>{
  const first=await (await deliver(completed())).json();
  assert.equal(first.outcome,'applied');
  const r=await row();
  assert.deepEqual([r.plan,r.status,r.stripe_customer_id,r.stripe_subscription_id],['starter','active','cus_1','sub_1']);
  assert.equal(new Date(r.current_period_end).getTime(),1790000000*1000);
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,2000);
  // Stripe retries deliveries; the same event is acknowledged and not re-applied.
  const calls=stripe.calls.length;
  assert.equal((await (await deliver(completed())).json()).outcome,'duplicate');
  assert.equal(stripe.calls.length,calls);
  assert.ok(logs.every(l=>!l.includes('advisor@example.com')),'webhook logs carry ids, not emails');
}));

test('plan changes, lapses and cancellation follow the subscription; lapsed plans pause paid lookups',()=>fixture(async({deliver,row,stripe,jobs,search})=>{
  await deliver(completed());
  stripe.set(subscription({items:{data:[{price:{id:'price_pro'},current_period_end:1790000000}]}}));
  await deliver(updated('evt_2'));
  assert.equal((await row()).plan,'pro');
  assert.equal((await search()).status,'completed');
  stripe.set(subscription({status:'past_due',items:{data:[{price:{id:'price_pro'}}]}}));
  await deliver(updated('evt_3'));
  const plan=(await jobs.summary(advisor)).plan;
  assert.equal(plan.status,'past_due');assert.equal(plan.monthly_allowance_micros,0);
  const paused=await search();
  assert.equal(paused.status,'skipped');assert.match(paused.result.message,/subscription is not active \(past_due\).*nothing was charged/);
  stripe.set(subscription({status:'canceled',items:{data:[{price:{id:'price_pro'}}]}}));
  await deliver({id:'evt_4',type:'customer.subscription.deleted',data:{object:{id:'sub_1'}}});
  assert.equal((await row()).status,'canceled');
  assert.equal((await search()).status,'skipped');
}));

test('events are applied from Stripe’s current state, so out-of-order delivery cannot resurrect a plan',()=>fixture(async({deliver,row,stripe})=>{
  await deliver(completed());
  stripe.set(subscription({status:'canceled'}));
  // An older "active" update arriving late still reads the subscription as it is now.
  await deliver({id:'evt_late',type:'customer.subscription.updated',data:{object:{id:'sub_1',status:'active'}}});
  assert.equal((await row()).status,'canceled');
}));

test('a price no plan names allows nothing; unrelated events are acknowledged and ignored',()=>fixture(async({deliver,row,stripe,jobs})=>{
  stripe.set(subscription({items:{data:[{price:{id:'price_unknown'}}]}}));
  assert.equal((await (await deliver(completed())).json()).outcome,'unmapped_price');
  assert.equal((await row()).plan,'unmapped');
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,0);
  assert.equal((await (await deliver({id:'evt_inv',type:'invoice.paid',data:{object:{}}})).json()).outcome,'ignored');
}));

test('a bad signature changes nothing, and a failure mid-apply is retried cleanly',()=>fixture(async({db,deliver,row,stripe})=>{
  const bad=await deliver(completed(),'t=1,v1=00');
  assert.equal(bad.status,400);
  assert.equal(await row(),undefined);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM billing_events')).rows[0].n,0);
  stripe.failOnce();
  await assert.rejects(deliver(completed('evt_retry')),/timeout/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM billing_events')).rows[0].n,0,'the failed attempt left no record, so the retry is not mistaken for a duplicate');
  assert.equal((await (await deliver(completed('evt_retry'))).json()).outcome,'applied');
}));

test('checkout and the portal hand back Stripe links and never double-subscribe',()=>fixture(async({db,billing,stripe,deliver})=>{
  await assert.rejects(billing.checkout(advisor,{plan:'internal'},'https://prospectpilot.io'),{status:422});
  await assert.rejects(billing.checkout(advisor,{plan:'nope'},'https://prospectpilot.io'),{status:422});
  await assert.rejects(billing.portal(advisor,'https://prospectpilot.io'),{status:409});
  const {url}=await billing.checkout(advisor,{plan:'pro'},'https://prospectpilot.io');
  assert.match(url,/^https:\/\/checkout\.stripe\.com\//);
  const sent=stripe.calls.at(-1).params;
  assert.deepEqual([sent.mode,sent.line_items[0].price,sent.client_reference_id,sent.subscription_data.metadata.uid,sent.customer_email],['subscription','price_pro',advisor.uid,advisor.uid,advisor.email]);
  assert.equal(sent.success_url,'https://prospectpilot.io/prospect?billing=success');
  await deliver(completed());
  await assert.rejects(billing.checkout(advisor,{plan:'pro'},'https://prospectpilot.io'),{status:409});
  assert.match((await billing.portal(advisor,'https://prospectpilot.io')).url,/^https:\/\/billing\.stripe\.com\//);
  assert.equal(stripe.calls.at(-1).params.customer,'cus_1');
  // After cancelling, choosing again reuses the same Stripe customer.
  await db.query("UPDATE prospect_memberships SET status='canceled' WHERE user_id=$1",[advisor.uid]);
  await billing.checkout(advisor,{plan:'starter'},'https://prospectpilot.io');
  assert.equal(stripe.calls.at(-1).params.customer,'cus_1');assert.equal(stripe.calls.at(-1).params.customer_email,undefined);
  const state=await billing.status(advisor);
  assert.deepEqual(state.plans.map(p=>[p.id,p.purchasable]),[['starter',true],['pro',true],['internal',false]]);
}));

test('the webhook route needs no session or origin, while billing pages need a session',async()=>{
  const origin='https://prospectpilot.io',claims={uid:'u1',email:'u1@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
  const got=[];
  const billing={webhook:async(body,signature)=>{got.push({body,signature});return Response.json({received:true});},route:async(request,user)=>({uid:user.uid,path:new URL(request.url).pathname})};
  const handler=createHandler({auth:{verifySessionCookie:async c=>{if(c!=='valid')throw Error('no');return claims;}},origins:[origin],billing,prospect:{route:async()=>({prospect:true})},prospectPage:'p',worker:{fetch:async()=>new Response('legacy')}});
  const hook=await handler(new Request(origin+'/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':'t=1,v1=ab'},body:'{"id":"evt"}'}));
  assert.equal(hook.status,200);assert.deepEqual(got,[{body:'{"id":"evt"}',signature:'t=1,v1=ab'}]);
  assert.equal((await handler(new Request(origin+'/api/prospect/billing'))).status,401);
  const mine=await handler(new Request(origin+'/api/prospect/billing',{headers:{cookie:'__session=valid'}}));
  assert.deepEqual(await mine.json(),{uid:'u1',path:'/api/prospect/billing'});
  assert.equal((await handler(new Request(origin+'/api/prospect/billing/checkout',{method:'POST',headers:{cookie:'__session=valid',origin:'https://evil.example'},body:'{}'}))).status,403,'checkout keeps the same-origin check');
  assert.equal((await handler(new Request('https://evil.example/api/stripe/webhook',{method:'POST',body:'{}'}))).status,403,'the webhook still answers only on the site address');
});

test('the billing panel offers plans, then management, and says when lookups are paused',()=>{
  const plans=[{id:'starter',name:'Starter',monthly_allowance_micros:25000000,purchasable:true},{id:'internal',name:'<Internal>',monthly_allowance_micros:1,purchasable:false}];
  const fresh=billingContent({enabled:true,membership:null,plans});
  assert.match(fresh,/not chosen a plan/);assert.match(fresh,/data-billing-plan="starter"/);assert.match(fresh,/\$25\.00 of paid lookups a month/);
  assert.doesNotMatch(fresh,/Internal/);assert.doesNotMatch(fresh,/Manage billing/);
  const active=billingContent({enabled:true,membership:{plan:'starter',plan_name:'Starter',status:'active',current_period_end:'2026-11-02T00:00:00.000Z',manageable:true},plans});
  assert.match(active,/renews 2026-11-02/);assert.match(active,/Manage billing/);assert.doesNotMatch(active,/data-billing-plan/);
  const lapsed=billingContent({enabled:true,membership:{plan:'starter',plan_name:'Starter',status:'past_due',manageable:true},plans});
  assert.match(lapsed,/past due/);assert.match(lapsed,/Paid lookups are paused/);assert.match(lapsed,/data-billing-plan/);
  assert.match(billingContent({enabled:false,membership:null,plans:[]}),/not set up/);
  assert.match(billingContent({enabled:true,membership:{plan:'x',plan_name:'<b>',status:null,manageable:false},plans:[]}),/&lt;b&gt;/);
});

test('a late event about a replaced subscription cannot overwrite the newer one',()=>fixture(async({deliver,row,stripe})=>{
  await deliver(completed());
  stripe.put(subscription({status:'canceled'}));
  stripe.put(subscription({id:'sub_2',created:1785000000,items:{data:[{price:{id:'price_pro'},current_period_end:1795000000}]}}));
  await deliver({id:'evt_new',type:'customer.subscription.created',data:{object:{id:'sub_2'}}});
  assert.deepEqual([(await row()).stripe_subscription_id,(await row()).plan,(await row()).status],['sub_2','pro','active']);
  // The old subscription's cancellation arrives afterwards: it is ignored.
  assert.equal((await (await deliver({id:'evt_old',type:'customer.subscription.deleted',data:{object:{id:'sub_1'}}})).json()).outcome,'superseded');
  assert.deepEqual([(await row()).stripe_subscription_id,(await row()).status],['sub_2','active']);
}));

test('a purchase clears a hand-set allowance; an override set afterwards survives routine updates',()=>fixture(async({db,deliver,row,stripe,jobs})=>{
  await db.query("INSERT INTO prospect_memberships(user_id,plan,monthly_allowance_micros) VALUES($1,'internal',999999)",[advisor.uid]);
  await deliver(completed());
  assert.equal((await row()).monthly_allowance_micros,null);
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,2000);
  await db.query('UPDATE prospect_memberships SET monthly_allowance_micros=3000 WHERE user_id=$1',[advisor.uid]);
  await deliver(updated('evt_same'));
  assert.equal(Number((await row()).monthly_allowance_micros),3000,'same plan, same subscription: kept');
  stripe.set(subscription({items:{data:[{price:{id:'price_pro'}}]}}));
  await deliver(updated('evt_upgrade'));
  assert.equal((await row()).monthly_allowance_micros,null,'a plan change resets it');
}));

test('one open checkout per advisor: repeats reuse it, a new plan replaces it, a paid one blocks another',()=>fixture(async({billing,stripe})=>{
  const site='https://prospectpilot.io';
  // PGlite has one connection, so the per-advisor lock cannot be exercised
  // concurrently here; on Postgres it makes the second request wait for the first.
  const a=await billing.checkout(advisor,{plan:'pro'},site),b=await billing.checkout(advisor,{plan:'pro'},site);
  assert.equal(a.url,b.url,'a second tab or click gets the same checkout');
  assert.equal(stripe.calls.filter(c=>c.path==='checkout/sessions').length,1);
  assert.ok(stripe.calls.find(c=>c.path==='checkout/sessions').params.expires_at>Date.now()/1000);
  const other=await billing.checkout(advisor,{plan:'starter'},site);
  assert.notEqual(other.url,a.url);
  assert.equal(stripe.sessions.cs_1.status,'expired','the abandoned checkout for the other plan is closed first');
  stripe.sessions.cs_2.status='complete';
  await assert.rejects(billing.checkout(advisor,{plan:'starter'},site),e=>e.status===409&&/being activated/.test(e.message));
}));

test('a scheduled cancellation shows the end date, not a renewal',()=>fixture(async({deliver,billing,stripe})=>{
  stripe.set(subscription({cancel_at_period_end:true}));
  await deliver(completed());
  const state=await billing.status(advisor);
  assert.equal(state.membership.cancels_at,new Date(1790000000*1000).toISOString());
  const html=billingContent(state);
  assert.match(html,/ends \d{4}-\d{2}-\d{2} \(cancellation scheduled\)/);assert.doesNotMatch(html,/renews/);
}));

// Hybrid pricing: annual prices, one free trial, promotion codes and top-up packs.
const PRICED={...PLANS,starter:{...PLANS.starter,stripe_annual_price_id:'price_starter_yr',trial_days:14,trial_allowance_micros:500,monthly_price_cents:14900,annual_price_cents:149000}};
const TOPUPS={small:{name:'Small top-up',stripe_price_id:'price_small',allowance_micros:1500,price_cents:5000}};
const priced=fn=>fixture(fn,{plans:PRICED,topups:TOPUPS,leadCostMicros:500});
const paidTopup=(id,over={})=>({id,type:'checkout.session.completed',data:{object:{id:'cs_top_'+id,mode:'payment',payment_status:'paid',client_reference_id:advisor.uid,metadata:{uid:advisor.uid,kind:'topup',pack:'small',allowance_micros:'1500'},...over}}});

test('yearly checkout uses the annual price; the free trial is offered once; promotion codes are allowed',()=>priced(async({db,billing,stripe,deliver})=>{
  const site='https://prospectpilot.io';
  await billing.checkout(advisor,{plan:'starter',interval:'annual'},site);
  let sent=stripe.calls.at(-1).params;
  assert.equal(sent.line_items[0].price,'price_starter_yr');assert.equal(sent.allow_promotion_codes,true);assert.equal(sent.subscription_data.trial_period_days,14);
  // Switching to monthly is a different choice, so the open yearly checkout is closed first.
  await billing.checkout(advisor,{plan:'starter',interval:'monthly'},site);
  assert.equal(stripe.calls.at(-1).params.line_items[0].price,'price_starter');assert.equal(stripe.sessions.cs_1.status,'expired');
  await assert.rejects(billing.checkout(advisor,{plan:'pro',interval:'annual'},site),{status:422});
  // After a first subscription, no second trial.
  await deliver(completed());
  await db.query("UPDATE prospect_memberships SET status='canceled' WHERE user_id=$1",[advisor.uid]);
  await billing.checkout(advisor,{plan:'starter',interval:'monthly'},site);
  assert.equal(stripe.calls.at(-1).params.subscription_data.trial_period_days,undefined);
  assert.equal((await billing.status(advisor)).plans.find(p=>p.id==='starter').trial_days,null);
}));

test('an annual price maps back to its plan when Stripe reports the subscription',()=>priced(async({deliver,row,stripe})=>{
  stripe.set(subscription({items:{data:[{price:{id:'price_starter_yr'},current_period_end:1790000000}]}}));
  await deliver(completed());
  assert.equal((await row()).plan,'starter');
}));

test('a trial gets the smaller trial allowance until the first payment',()=>priced(async({deliver,stripe,jobs})=>{
  stripe.set(subscription({status:'trialing'}));
  await deliver(completed());
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,500);
  stripe.set(subscription({status:'active'}));
  await deliver(updated('evt_paid'));
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,2000);
}));

test('top-ups: only for active plans, credited once when paid, this month only, paused if the plan lapses',()=>priced(async({db,billing,stripe,deliver,jobs})=>{
  const site='https://prospectpilot.io';
  await assert.rejects(billing.topup(advisor,{pack:'small'},site),{status:409});
  await deliver(completed());
  await assert.rejects(billing.topup(advisor,{pack:'huge'},site),{status:422});
  const {url}=await billing.topup(advisor,{pack:'small'},site);
  assert.match(url,/^https:\/\/checkout\.stripe\.com\//);
  const sent=stripe.calls.at(-1).params;
  assert.deepEqual([sent.mode,sent.line_items[0].price,sent.customer,sent.metadata.kind,sent.metadata.pack,sent.metadata.allowance_micros],['payment','price_small','cus_1','topup','small','1500']);
  // An unpaid session (bank debit still clearing) credits nothing yet.
  assert.equal((await (await deliver(paidTopup('1',{payment_status:'unpaid'}))).json()).outcome,'unpaid');
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,2000);
  assert.equal((await (await deliver({...paidTopup('2'),type:'checkout.session.async_payment_succeeded'})).json()).outcome,'topup_credited');
  let plan=(await jobs.summary(advisor)).plan;
  assert.deepEqual([plan.monthly_allowance_micros,plan.topup_micros,plan.plan_allowance_micros],[3500,1500,2000]);
  // The same paid session delivered again under a new event id is not credited twice.
  assert.equal((await (await deliver(paidTopup('3',{id:'cs_top_2'}))).json()).outcome,'duplicate');
  // The purchased terms are credited even if the pack was removed or changed before payment completed.
  assert.equal((await (await deliver(paidTopup('4',{metadata:{uid:advisor.uid,kind:'topup',pack:'retired',allowance_micros:'700'}}))).json()).outcome,'topup_credited');
  assert.equal((await jobs.summary(advisor)).plan.topup_micros,2200);
  assert.equal((await (await deliver(paidTopup('5',{metadata:{uid:advisor.uid,kind:'topup',pack:'small'}}))).json()).outcome,'invalid_terms');
  await db.query("DELETE FROM billing_topups WHERE pack='retired'");
  // Last month's top-up does not count this month.
  await db.query("UPDATE billing_topups SET purchased_at=date_trunc('month',now())-interval '1 day'");
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,2000);
  await db.query("UPDATE billing_topups SET purchased_at=now()");
  stripe.set(subscription({status:'past_due'}));
  await deliver(updated('evt_lapse'));
  plan=(await jobs.summary(advisor)).plan;
  assert.deepEqual([plan.monthly_allowance_micros,plan.topup_micros],[0,0]);
}));

test('the billing panel shows prices, the trial, yearly billing, top-ups and leads instead of dollars alone',()=>{
  const plans=[{id:'starter',name:'Starter',monthly_allowance_micros:40000000,purchasable:true,annual:true,monthly_price_cents:14900,annual_price_cents:149000,trial_days:14}];
  const html=billingContent({enabled:true,membership:null,plans,topups:[],lead_cost_micros:500000});
  assert.match(html,/\$149\/month/);assert.match(html,/about 80 fully worked leads/);assert.match(html,/14-day free trial/);
  assert.match(html,/Start free trial/);assert.match(html,/data-billing-interval="annual"/);assert.match(html,/\$1,490\/year/);assert.match(html,/promotion code/);
  const member={plan:'starter',plan_name:'Starter',status:'active',manageable:true};
  const topups=[{id:'small',name:'Small top-up',allowance_micros:35000000,price_cents:5000,purchasable:true}];
  const active=billingContent({enabled:true,membership:member,plans,topups,lead_cost_micros:500000});
  assert.match(active,/data-billing-topup="small"/);assert.match(active,/\$50 adds \$35\.00 of paid lookups \(about 70 fully worked leads\)/);assert.match(active,/expires when your allowance resets/);
  assert.doesNotMatch(billingContent({enabled:true,membership:{...member,status:'past_due'},plans,topups:[{...topups[0],purchasable:false}],lead_cost_micros:500000}),/data-billing-topup/);
  assert.doesNotMatch(billingContent({enabled:true,membership:null,plans,topups:[]}),/fully worked leads/,'no estimate without a configured lead cost');
});

test('no top-up is sold on a subscription whose price matches no configured plan',()=>priced(async({billing,stripe,deliver})=>{
  stripe.set(subscription({items:{data:[{price:{id:'price_unknown'}}]}}));
  await deliver(completed());
  const before=stripe.calls.length;
  await assert.rejects(billing.topup(advisor,{pack:'small'},'https://prospectpilot.io'),e=>e.status===409&&/would not count/.test(e.message));
  assert.equal(stripe.calls.length,before,'no Stripe checkout was created');
}));
