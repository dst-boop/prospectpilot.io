#!/usr/bin/env node
// Pricing for ProspectPilot memberships (PRICING.md).
//
//   node scripts/pricing/pricing.mjs margins
//     prints the margin of every plan, billing interval, founding discount
//     and top-up at full allowance use, under the assumptions in recommended.json
//   node scripts/pricing/pricing.mjs env stripe-prices.json
//     prints PROSPECT_PLANS, PROSPECT_TOPUPS, PROSPECT_DEFAULT_PLAN and
//     PROSPECT_LEAD_COST_MICROS with your Stripe price ids filled in, e.g.
//     {"starter":{"monthly":"price_...","annual":"price_..."},"topup:small":"price_..."}
import {readFileSync} from 'node:fs';
import {readPlans} from '../../prospect-jobs.mjs';

export const recommended=JSON.parse(readFileSync(new URL('./recommended.json',import.meta.url),'utf8'));

// Profit and margin at full allowance use. Allowances are reserved maximums at
// configured prices, so real provider cost is at most this.
export function margins(rec=recommended){
  const a=rec.assumptions,fee=cents=>cents*a.stripe_percent/100+a.stripe_fixed_cents;
  const rows=[];
  const add=(name,kind,cents,months,allowanceMicros,overhead=true)=>{
    const perMonth=cents/months,cost=allowanceMicros/10000+fee(cents)/months+(overhead?a.overhead_cents_per_advisor_month:0);
    rows.push({name,kind,price_cents:cents,per_month_cents:Math.round(perMonth),profit_cents:Math.round(perMonth-cost),margin_percent:Math.round((perMonth-cost)/perMonth*1000)/10,leads:Math.floor(allowanceMicros/a.lead_cost_micros)});
  };
  for(const [id,p] of Object.entries(rec.plans)){
    if(p.monthly_price_cents==null)continue;
    add(p.name+' monthly','plan',p.monthly_price_cents,1,p.monthly_allowance_micros);
    if(p.annual_price_cents!=null)add(p.name+' annual','plan',p.annual_price_cents,12,p.monthly_allowance_micros);
    add(p.name+' founding','plan',Math.round(p.monthly_price_cents*(100-a.founding_discount_percent)/100),1,p.monthly_allowance_micros);
  }
  for(const t of Object.values(rec.topups))add(t.name,'topup',t.price_cents,1,t.allowance_micros,false);
  return rows;
}

export function environment(prices,rec=recommended){
  const plans={};
  for(const [id,p] of Object.entries(rec.plans)){
    const {...plan}=p;const ids=prices[id]||{};
    if(ids.monthly)plan.stripe_price_id=ids.monthly;
    if(ids.annual)plan.stripe_annual_price_id=ids.annual;
    plans[id]=plan;
  }
  const topups={};
  for(const [id,t] of Object.entries(rec.topups)){const price=prices['topup:'+id];if(price)topups[id]={...t,stripe_price_id:price};}
  const env={PROSPECT_PLANS:JSON.stringify(plans),PROSPECT_TOPUPS:JSON.stringify(topups),PROSPECT_DEFAULT_PLAN:rec.default_plan,PROSPECT_LEAD_COST_MICROS:String(rec.assumptions.lead_cost_micros)};
  readPlans(env); // fails loudly on anything the server would reject
  return env;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [command,file]=process.argv.slice(2);
  if(command==='margins'){
    const dollars=c=>'$'+(c/100).toFixed(2);
    console.log('| Option | Price | Per month | Profit/month at full use | Margin | Leads at assumed cost |\n|---|---|---|---|---|---|');
    for(const r of margins())console.log(`| ${r.name} | ${dollars(r.price_cents)} | ${dollars(r.per_month_cents)} | ${dollars(r.profit_cents)} | ${r.margin_percent}% | ${r.leads} |`);
  }else if(command==='env'&&file){
    for(const [k,v] of Object.entries(environment(JSON.parse(readFileSync(file,'utf8')))))console.log(`${k}=${v}`);
  }else{console.error('Usage: pricing.mjs margins | pricing.mjs env stripe-prices.json');process.exit(2);}
}
