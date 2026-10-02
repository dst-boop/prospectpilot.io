import test from 'node:test';
import assert from 'node:assert/strict';
import {margins,environment,recommended} from '../scripts/pricing/pricing.mjs';
import {readPlans,readTopups,readLeadCost} from '../prospect-jobs.mjs';

// The recommended prices (PRICING.md) must stay profitable under their own
// stated assumptions, at full allowance use, for every option sold.
test('every plan, interval, founding discount and top-up clears its minimum margin',()=>{
  const min=recommended.assumptions.minimum_margin_percent,rows=margins();
  assert.ok(rows.length>=14);
  for(const r of rows)assert.ok(r.margin_percent>=(r.kind==='topup'?min.topup:min.plan),`${r.name} margin ${r.margin_percent}%`);
  const pro=rows.find(r=>r.name==='Professional monthly');
  assert.deepEqual([pro.profit_cents,pro.margin_percent,pro.leads],[22358,64.1,200]);
  assert.equal(rows.find(r=>r.name==='Producer monthly').leads,1050,'Producer covers about 50 leads a working day');
});

test('the generated settings carry the Stripe prices and are accepted by the server',()=>{
  const env=environment({starter:{monthly:'price_sm',annual:'price_sy'},professional:{monthly:'price_pm'},'topup:small':'price_ts'});
  const {plans,defaultPlan,topups,leadCostMicros}=readPlans(env);
  assert.equal(defaultPlan,'none');assert.equal(plans.none.monthly_allowance_micros,0,'unpaid advisors get no paid lookups');
  assert.deepEqual([plans.starter.stripe_price_id,plans.starter.stripe_annual_price_id,plans.starter.trial_days,plans.starter.trial_allowance_micros],['price_sm','price_sy',14,5000000]);
  assert.equal(plans.practice.stripe_price_id,undefined,'a plan without a Stripe price cannot be bought yet');
  assert.deepEqual(Object.keys(topups),['small']);assert.equal(leadCostMicros,500000);
});

test('pricing settings are validated',()=>{
  const plan=extra=>({PROSPECT_PLANS:JSON.stringify({a:{name:'A',monthly_allowance_micros:100,...extra}})});
  assert.throws(()=>readPlans(plan({trial_days:45})),/trial_days/);
  assert.throws(()=>readPlans(plan({trial_allowance_micros:200})),/trial_allowance_micros/);
  assert.throws(()=>readPlans(plan({stripe_annual_price_id:'yearly'})),/stripe_annual_price_id/);
  assert.throws(()=>readPlans(plan({monthly_price_cents:-1})),/monthly_price_cents/);
  assert.deepEqual(readTopups({}),{});
  assert.throws(()=>readTopups({PROSPECT_TOPUPS:'{"x":{"name":"X","stripe_price_id":"price_x","allowance_micros":0,"price_cents":100}}'}),/PROSPECT_TOPUPS entry x/);
  assert.throws(()=>readTopups({PROSPECT_TOPUPS:'{"x":{"name":"X","allowance_micros":10,"price_cents":100}}'}),/PROSPECT_TOPUPS entry x/);
  assert.equal(readLeadCost({}),null);assert.equal(readLeadCost({PROSPECT_LEAD_COST_MICROS:'500000'}),500000);
  assert.throws(()=>readLeadCost({PROSPECT_LEAD_COST_MICROS:'0'}),/PROSPECT_LEAD_COST_MICROS/);
});
