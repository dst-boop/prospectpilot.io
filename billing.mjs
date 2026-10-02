import {createHmac,timingSafeEqual} from 'node:crypto';

// Stripe billing for ProspectPilot memberships (MERGE-PLAN decision 8).
//
// Checkout signs an advisor up, Stripe's customer portal manages cards, plan
// changes and cancellation, and the signed webhook is the only writer of an
// advisor's plan and subscription status. Plans and their Stripe prices are
// settings (PROSPECT_PLANS); the plan allowance itself is enforced in
// prospect-jobs.mjs. Card details never touch this server.

const fail=(status,message)=>Object.assign(Error(message),{status});
// Subscription states that keep paid lookups available. Anything else
// (past_due, unpaid, canceled, incomplete, paused) allows nothing until paid.
export const PAYING_STATUSES=['active','trialing'];
// Subscription states that are over; a new Checkout is allowed after these.
const ENDED=['canceled','incomplete_expired'];
const SIGNATURE_TOLERANCE_SECONDS=300;

export function readBilling(env=process.env){
 const secretKey=env.STRIPE_SECRET_KEY||'',webhookSecret=env.STRIPE_WEBHOOK_SECRET||'';
 if(!secretKey&&!webhookSecret)return null;
 if(!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(secretKey))throw Error('Invalid STRIPE_SECRET_KEY');
 if(!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret))throw Error('STRIPE_WEBHOOK_SECRET is required with STRIPE_SECRET_KEY');
 return {secretKey,webhookSecret};
}

// Stripe's form encoding: nested keys as a[b][c]=value.
export function formEncode(params,prefix='',out=new URLSearchParams()){
 for(const [key,value] of Object.entries(params)){
  if(value===undefined||value===null)continue;
  const name=prefix?`${prefix}[${key}]`:key;
  if(typeof value==='object')formEncode(value,name,out);else out.append(name,String(value));
 }
 return out;
}

// Kept under the database's 15 s idle-in-transaction limit: Checkout calls Stripe inside a transaction.
export function createStripeClient({secretKey,fetch=globalThis.fetch,timeoutMs=10000}){
 async function call(method,path,params){
  const response=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:'Bearer '+secretKey,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:params?formEncode(params).toString():undefined,signal:AbortSignal.timeout(timeoutMs)});
  let body;try{body=await response.json();}catch{body={};}
  // Stripe's own message names the problem (a missing price, a deleted customer)
  // and carries no card data; the key never appears in it.
  if(!response.ok)throw Object.assign(Error('Stripe request failed: '+(body.error?.message||response.status)),{status:502,stripeStatus:response.status});
  return body;
 }
 return {post:(path,params)=>call('POST',path,params),get:path=>call('GET',path)};
}

// Stripe-Signature: t=<unix seconds>,v1=<hex hmac of "t.body">[,v1=...]
export function verifySignature(rawBody,header,secret,now=Date.now()){
 const parts=String(header||'').split(',').map(p=>p.split('=')),t=parts.find(([k])=>k==='t')?.[1],signatures=parts.filter(([k])=>k==='v1').map(([,v])=>v);
 if(!/^\d+$/.test(t||'')||!signatures.length)return false;
 if(Math.abs(now/1000-Number(t))>SIGNATURE_TOLERANCE_SECONDS)return false;
 const expected=Buffer.from(createHmac('sha256',secret).update(`${t}.${rawBody}`).digest('hex'));
 return signatures.some(s=>{const given=Buffer.from(s);return given.length===expected.length&&timingSafeEqual(given,expected);});
}

async function tx(pool,fn){const c=await pool.connect();let broken;try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){try{await c.query('ROLLBACK');}catch(b){broken=b;}throw e;}finally{c.release(broken);}}

export function createBilling({pool,stripe,config,webhookSecret,logger=console}){
 const plans=config.plans||{};
 const planForPrice=price=>Object.keys(plans).find(id=>plans[id].stripe_price_id===price)||null;
 const membershipRow=async(c,uid)=>(await c.query('SELECT * FROM prospect_memberships WHERE user_id=$1',[uid])).rows[0]||null;

 async function status(user){
  const row=await membershipRow(pool,user.uid);
  return {
   enabled:!!stripe,
   membership:row?{plan:row.plan,plan_name:plans[row.plan]?.name||null,status:row.status||null,current_period_end:row.current_period_end?new Date(row.current_period_end).toISOString():null,cancels_at:row.cancels_at?new Date(row.cancels_at).toISOString():null,manageable:!!row.stripe_customer_id}:null,
   plans:Object.entries(plans).map(([id,p])=>({id,name:p.name,monthly_allowance_micros:p.monthly_allowance_micros,purchasable:!!(stripe&&p.stripe_price_id)})),
  };
 }

 async function checkout(user,input,origin){
  if(!stripe)throw fail(503,'Billing is not set up on this server yet.');
  const planId=input?.plan,plan=plans[planId];
  if(!plan?.stripe_price_id)throw fail(422,'Choose a plan that is available to buy.');
  // Serialised per advisor, and at most one open Checkout each: a second tab
  // or a double click reuses it, so nobody can start two subscriptions.
  return tx(pool,async c=>{
   // Up to three Stripe calls run back to back here; allow them past the pool's 15 s idle limit.
   await c.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
   try{await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['checkout:'+user.uid]);}
   catch(e){if(e.code==='55P03')throw fail(409,'Your checkout is already being prepared in another tab. Try again in a moment.');throw e;}
   const row=await membershipRow(c,user.uid);
   // Plan changes and cancellation go through the portal, so nobody ends up paying twice.
   if(row?.stripe_subscription_id&&row.status&&!ENDED.includes(row.status))throw fail(409,'You already have a subscription. Use Manage billing to change plans.');
   const pending=(await c.query("SELECT * FROM billing_checkouts WHERE user_id=$1 AND expires_at>now()+interval '1 minute'",[user.uid])).rows[0];
   if(pending){
    const open=await stripe.get('checkout/sessions/'+encodeURIComponent(pending.session_id));
    if(open.status==='complete')throw fail(409,'Your payment went through and your plan is being activated. Refresh in a minute.');
    if(open.status==='open'){
     if(pending.plan===planId)return {url:pending.url};
     await stripe.post('checkout/sessions/'+encodeURIComponent(pending.session_id)+'/expire',{});
    }
   }
   const expires=Math.floor(Date.now()/1000)+3600;
   const session=await stripe.post('checkout/sessions',{
    mode:'subscription',line_items:[{price:plan.stripe_price_id,quantity:1}],expires_at:expires,
    client_reference_id:user.uid,metadata:{uid:user.uid},subscription_data:{metadata:{uid:user.uid}},
    ...(row?.stripe_customer_id?{customer:row.stripe_customer_id}:{customer_email:user.email}),
    success_url:origin+'/prospect?billing=success',cancel_url:origin+'/prospect?billing=cancelled',
   });
   if(typeof session.id!=='string'||typeof session.url!=='string'||!session.url.startsWith('https://'))throw fail(502,'Stripe did not return a checkout page.');
   await c.query(`INSERT INTO billing_checkouts(user_id,session_id,plan,url,expires_at) VALUES($1,$2,$3,$4,to_timestamp($5))
    ON CONFLICT(user_id) DO UPDATE SET session_id=EXCLUDED.session_id,plan=EXCLUDED.plan,url=EXCLUDED.url,expires_at=EXCLUDED.expires_at,created_at=now()`,[user.uid,session.id,planId,session.url,expires]);
   return {url:session.url};
  });
 }

 async function portal(user,origin){
  if(!stripe)throw fail(503,'Billing is not set up on this server yet.');
  const row=await membershipRow(pool,user.uid);
  if(!row?.stripe_customer_id)throw fail(409,'Choose a plan first; there is no billing account to manage yet.');
  const session=await stripe.post('billing_portal/sessions',{customer:row.stripe_customer_id,return_url:origin+'/prospect'});
  if(typeof session.url!=='string'||!session.url.startsWith('https://'))throw fail(502,'Stripe did not return a billing page.');
  return {url:session.url};
 }

 // The subscription is re-read from Stripe rather than taken from the event,
 // so deliveries that arrive out of order still leave the current state.
 async function applySubscription(c,subscriptionId,fallbackUid){
  const sub=await stripe.get('subscriptions/'+encodeURIComponent(subscriptionId));
  const uid=sub.metadata?.uid||fallbackUid;
  if(!uid)return 'no_uid';
  const item=sub.items?.data?.[0],price=item?.price?.id;
  // A price no plan names allows nothing (the allowance code treats an unknown plan as zero).
  const plan=planForPrice(price)||'unmapped';
  const periodEnd=item?.current_period_end??sub.current_period_end;
  const at=v=>Number.isFinite(v)?new Date(v*1000):null;
  const cancelsAt=at(sub.cancel_at)||(sub.cancel_at_period_end?at(periodEnd):null);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['membership:'+uid]);
  const current=await membershipRow(c,uid);
  // A late event about a subscription the advisor has since replaced must not
  // overwrite the newer one: the most recently created subscription wins.
  if(current?.stripe_subscription_id&&current.stripe_subscription_id!==sub.id&&current.subscription_created&&!(Number.isFinite(sub.created)&&sub.created*1000>new Date(current.subscription_created).getTime()))return 'superseded';
  // A new plan or subscription clears a hand-set allowance override, so a
  // purchase always gets exactly the allowance it paid for.
  await c.query(`INSERT INTO prospect_memberships(user_id,plan,stripe_customer_id,stripe_subscription_id,status,current_period_end,subscription_created,cancels_at,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
   ON CONFLICT(user_id) DO UPDATE SET
    monthly_allowance_micros=CASE WHEN prospect_memberships.plan IS DISTINCT FROM EXCLUDED.plan OR prospect_memberships.stripe_subscription_id IS DISTINCT FROM EXCLUDED.stripe_subscription_id THEN NULL ELSE prospect_memberships.monthly_allowance_micros END,
    plan=EXCLUDED.plan,stripe_customer_id=EXCLUDED.stripe_customer_id,stripe_subscription_id=EXCLUDED.stripe_subscription_id,status=EXCLUDED.status,current_period_end=EXCLUDED.current_period_end,subscription_created=EXCLUDED.subscription_created,cancels_at=EXCLUDED.cancels_at,updated_at=now()`,
   [uid,plan,typeof sub.customer==='string'?sub.customer:sub.customer?.id||null,sub.id,String(sub.status||'unknown'),at(periodEnd),at(sub.created),cancelsAt]);
  return plan==='unmapped'?'unmapped_price':'applied';
 }

 async function webhook(rawBody,signature){
  if(!webhookSecret||!stripe)return Response.json({detail:'Billing is not set up.'},{status:503});
  if(!verifySignature(rawBody,signature,webhookSecret))return Response.json({detail:'Invalid signature.'},{status:400});
  let event;try{event=JSON.parse(rawBody);}catch{return Response.json({detail:'Invalid event.'},{status:400});}
  if(typeof event?.id!=='string'||typeof event.type!=='string')return Response.json({detail:'Invalid event.'},{status:400});
  const object=event.data?.object||{};
  // Recording the event and applying it share a transaction: a failure rolls
  // both back and Stripe's retry gets a clean second attempt.
  const outcome=await tx(pool,async c=>{
   const fresh=(await c.query('INSERT INTO billing_events(id,type) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING id',[event.id,event.type])).rows.length;
   if(!fresh)return 'duplicate';
   if(event.type==='checkout.session.completed'&&object.mode==='subscription'&&object.subscription)return applySubscription(c,typeof object.subscription==='string'?object.subscription:object.subscription.id,object.client_reference_id);
   if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'].includes(event.type)&&object.id)return applySubscription(c,object.id,null);
   return 'ignored';
  });
  // Ids and outcomes only: no emails, names or card details.
  logger.log(JSON.stringify({event:'stripe_webhook',type:event.type,id:event.id,outcome}));
  return Response.json({received:true,outcome});
 }

 async function route(request,user){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/prospect/billing'&&method==='GET')return status(user);
  if(path==='/api/prospect/billing/checkout'&&method==='POST'){let input;try{input=await request.json();}catch{throw fail(422,'Invalid JSON.');}return checkout(user,input,url.origin);}
  if(path==='/api/prospect/billing/portal'&&method==='POST')return portal(user,url.origin);
  throw fail(404,'Not found.');
 }

 return {status,checkout,portal,webhook,route};
}
