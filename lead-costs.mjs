// Cost per lead, per advisor, over time.
//
// Leads come from lead_acquisitions: one row per person added to an advisor's
// contact directory or first found by their Research Lab discovery run,
// written by database triggers and never deleted (migrations 027-029).
// Spend comes from three ledgers, each kept as it was recorded:
//  - prospect_charges: paid lookups the server reserved at configured prices.
//    This is what plan allowances count. For searches it also records the
//    records returned, giving a provider-cost estimate below the reservation;
//  - lab_costs: Research Lab spend, reserved or entered by the advisor;
//  - prospect_external_usage: enrichment credits on the advisor's own ZoomInfo
//    subscription, as stated by the delivery they imported. They are valued
//    only when PROSPECT_ZOOMINFO_CREDIT_MICROS is set, at that current rate.
// Cost per lead for a period is that period's spend over that period's new
// leads. Counts and money only: nothing here names a person.
const fail=(status,message)=>Object.assign(Error(message),{status});
export const PERIODS={day:{default:30,max:400},week:{default:12,max:260},month:{default:6,max:120}};
export const MIN_SAMPLE=10;
export const LEAD_SOURCES=['csv_import','zoominfo_import','daily_leads','provider_search','research_lab'];
export const LOOKUP_ACTIONS=['search','enrich','verify','check_phone','web_research','profile_image'];

// A YYYY-MM-DD string that is a real calendar day, or null. Date.parse alone
// accepts 2026-02-30.
export const calendarDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value?value:null;
export function readZoomInfoCreditCost(env=process.env){
 const raw=env.PROSPECT_ZOOMINFO_CREDIT_MICROS;if(raw===undefined||raw==='')return null;
 const n=Number(raw);if(!Number.isSafeInteger(n)||n<0||n>100000000)throw Error('Invalid PROSPECT_ZOOMINFO_CREDIT_MICROS');return n;
}
const zones=new Set([...(Intl.supportedValuesOf?.('timeZone')||[]),'UTC']);
const shift=(day,period,n)=>{const d=new Date(day+'T00:00:00Z');if(period==='month')d.setUTCMonth(d.getUTCMonth()+n,1);else d.setUTCDate(d.getUTCDate()+n*(period==='week'?7:1));return d.toISOString().slice(0,10);};
const startOf=(day,period)=>{const d=new Date(day+'T00:00:00Z');if(period==='month')d.setUTCDate(1);if(period==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};

// Validated report window: whole periods, in the advisor's time zone.
export function leadCostWindow(input={},now=new Date()){
 const period=input.period||'month';if(!Object.hasOwn(PERIODS,period))throw fail(422,'Choose day, week or month.');
 const tz=input.tz||'America/New_York';if(!zones.has(tz))throw fail(422,'Choose a valid time zone.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 for(const key of ['from','to'])if(input[key]!==undefined&&input[key]!==''&&!calendarDay(input[key]))throw fail(422,`Use YYYY-MM-DD for ${key}.`);
 const to=input.to||today,from=startOf(input.from||shift(startOf(to,period),period,1-PERIODS[period].default),period);
 if(from>to)throw fail(422,'The start date is after the end date.');
 let periods=[];for(let day=from;day<=to&&periods.length<=PERIODS[period].max;day=shift(day,period,1))periods.push(day);
 if(periods.length>PERIODS[period].max)throw fail(422,`Choose at most ${PERIODS[period].max} ${period}s.`);
 return {period,tz,from,to,periods};
}

const rate=(micros,leads)=>leads>0?Math.round(micros/leads):null;
function finish(row,previous,creditMicros){
 const zoominfo=creditMicros==null?null:row.spend.zoominfo_credits*creditMicros;
 row.spend.zoominfo_micros=zoominfo;
 row.spend.total_micros=row.spend.lookups_micros+row.spend.research_lab_micros+(zoominfo||0);
 row.cost_per_lead_micros=rate(row.spend.total_micros,row.leads.total);
 row.contacts_cost_per_lead_micros=rate(row.spend.lookups_micros+(zoominfo||0),row.leads.contacts);
 row.research_lab_cost_per_lead_micros=rate(row.spend.research_lab_micros,row.leads.research_lab);
 row.low_sample=row.leads.total<MIN_SAMPLE;
 // A trend needs enough leads on both sides; a rate on four leads is noise.
 row.change_pct=previous&&!previous.low_sample&&!row.low_sample&&previous.cost_per_lead_micros>0
  ?Math.round((row.cost_per_lead_micros-previous.cost_per_lead_micros)/previous.cost_per_lead_micros*1000)/10:null;
 return row;
}
const emptyRow=period_start=>({period_start,leads:{total:0,contacts:0,research_lab:0,by_source:Object.fromEntries(LEAD_SOURCES.map(s=>[s,0]))},
 spend:{lookups_micros:0,lookups_provider_estimate_micros:0,lookups:0,lookups_on_known_leads:0,by_action:{},research_lab_micros:0,zoominfo_credits:0,zoominfo_micros:null,total_micros:0}});

// userId null reports every advisor (operator use only); otherwise one advisor.
export async function leadCosts(db,input={},{userId=null,creditMicros=readZoomInfoCreditCost(),now=new Date()}={}){
 const w=leadCostWindow(input,now);
 // $1 tz, $2 period, $3 first day, $4 last day (inclusive, local), $5 advisor or NULL.
 const params=[w.tz,w.period,w.from,w.to,userId];
 const range=column=>`${column}>=($3::date::timestamp AT TIME ZONE $1) AND ${column}<(($4::date+1)::timestamp AT TIME ZONE $1) AND ($5::text IS NULL OR user_id=$5)`;
 const bucket=column=>`to_char(date_trunc($2,${column} AT TIME ZONE $1),'YYYY-MM-DD')`;
 const [leads,charges,lab,usage]=await Promise.all([
  db.query(`SELECT user_id,${bucket('acquired_at')} AS period,source,count(*)::int AS n FROM lead_acquisitions WHERE ${range('acquired_at')} GROUP BY 1,2,3`,params),
  db.query(`SELECT user_id,${bucket('reserved_at')} AS period,COALESCE(action,'unknown') AS action,count(*)::int AS n,
    COALESCE(sum(reserved_micros),0)::bigint AS reserved,
    COALESCE(sum(CASE WHEN delivered_units IS NOT NULL AND unit_price_micros IS NOT NULL THEN delivered_units*unit_price_micros ELSE reserved_micros END),0)::bigint AS estimate,
    COALESCE(sum(units),0)::bigint AS units,COALESCE(sum(delivered_units),0)::bigint AS delivered,count(lead_id)::int AS on_leads
   FROM prospect_charges WHERE ${range('reserved_at')} GROUP BY 1,2,3`,params),
  db.query(`SELECT user_id,${bucket('created_at')} AS period,COALESCE(sum(amount_micros),0)::bigint AS micros FROM lab_costs WHERE ${range('created_at')} GROUP BY 1,2`,params),
  // Credits are dated by the delivery day they belong to, which has no time zone.
  db.query(`SELECT user_id,to_char(date_trunc($2,COALESCE(usage_date,(recorded_at AT TIME ZONE $1)::date)::timestamp),'YYYY-MM-DD') AS period,COALESCE(sum(units),0)::bigint AS credits
   FROM prospect_external_usage WHERE COALESCE(usage_date,(recorded_at AT TIME ZONE $1)::date) BETWEEN $3::date AND $4::date AND ($5::text IS NULL OR user_id=$5) GROUP BY 1,2`,params)]);
 const users=new Map(),row=(uid,period)=>{
  if(!users.has(uid))users.set(uid,new Map(w.periods.map(p=>[p,emptyRow(p)])));
  return users.get(uid).get(period);
 };
 for(const r of leads.rows){const x=row(r.user_id,r.period);if(!x)continue;x.leads.by_source[r.source]=(x.leads.by_source[r.source]||0)+r.n;x.leads[r.source==='research_lab'?'research_lab':'contacts']+=r.n;x.leads.total+=r.n;}
 for(const r of charges.rows){const x=row(r.user_id,r.period);if(!x)continue;const s=x.spend;
  s.lookups_micros+=Number(r.reserved);s.lookups_provider_estimate_micros+=Number(r.estimate);s.lookups+=r.n;s.lookups_on_known_leads+=r.on_leads;
  s.by_action[r.action]={count:r.n,reserved_micros:Number(r.reserved),units:Number(r.units),...(r.action==='search'?{delivered_units:Number(r.delivered)}:{})};}
 for(const r of lab.rows){const x=row(r.user_id,r.period);if(x)x.spend.research_lab_micros+=Number(r.micros);}
 for(const r of usage.rows){const x=row(r.user_id,r.period);if(x)x.spend.zoominfo_credits+=Number(r.credits);}
 if(userId&&!users.size)row(userId,w.periods[0]);
 const report=[...users].sort(([a],[b])=>a<b?-1:1).map(([user_id,map])=>{
  const rows=[];for(const p of w.periods)rows.push(finish(map.get(p),rows.at(-1),creditMicros));
  const totals=finish(rows.reduce((t,r)=>{
   for(const k of ['total','contacts','research_lab'])t.leads[k]+=r.leads[k];
   for(const s of LEAD_SOURCES)t.leads.by_source[s]+=r.leads.by_source[s];
   for(const k of ['lookups_micros','lookups_provider_estimate_micros','lookups','lookups_on_known_leads','research_lab_micros','zoominfo_credits'])t.spend[k]+=r.spend[k];
   for(const [a,v] of Object.entries(r.spend.by_action)){const o=t.spend.by_action[a]||={count:0,reserved_micros:0,units:0};o.count+=v.count;o.reserved_micros+=v.reserved_micros;o.units+=v.units;if(v.delivered_units!==undefined)o.delivered_units=(o.delivered_units||0)+v.delivered_units;}
   return t;},emptyRow(w.from)),null,creditMicros);
  delete totals.period_start;delete totals.change_pct;
  return {user_id,rows,totals};
 });
 return {period:w.period,tz:w.tz,from:w.from,to:w.to,zoominfo_credit_micros:creditMicros,min_sample:MIN_SAMPLE,users:report,
  notes:['Cost per lead is a period\'s spend divided by the leads first added in that period. Spend on leads from earlier periods counts in the period it was spent.',
   'Paid lookups are the amounts reserved at configured prices; your plan allowance counts these. The provider estimate counts searches by records actually returned.',
   creditMicros==null?'ZoomInfo is your own subscription: its enrichment credits are counted but not priced. Set a per-credit value to include them in cost per lead.':'ZoomInfo credits are valued at the current per-credit setting.',
   `Changes are shown only when both periods have at least ${MIN_SAMPLE} new leads.`]};
}

// Rows for the operator's CSV: one per advisor and period. Ids, counts and money only.
export const LEAD_COST_COLUMNS=['user_id','period_start','new_leads','contact_leads','research_lab_leads',...LEAD_SOURCES.map(s=>'leads_'+s),
 'lookups','lookups_reserved_usd','lookups_provider_estimate_usd','research_lab_usd','zoominfo_credits','zoominfo_usd','total_usd','cost_per_lead_usd','contacts_cost_per_lead_usd','research_lab_cost_per_lead_usd','change_pct','low_sample'];
export function leadCostCSV(report){
 const usd=micros=>micros==null?'':(Number(micros)/1000000).toFixed(4);
 const lines=[LEAD_COST_COLUMNS.join(',')];
 for(const u of report.users)for(const r of u.rows)lines.push([u.user_id,r.period_start,r.leads.total,r.leads.contacts,r.leads.research_lab,...LEAD_SOURCES.map(s=>r.leads.by_source[s]),
  r.spend.lookups,usd(r.spend.lookups_micros),usd(r.spend.lookups_provider_estimate_micros),usd(r.spend.research_lab_micros),r.spend.zoominfo_credits,usd(r.spend.zoominfo_micros),usd(r.spend.total_micros),
  usd(r.cost_per_lead_micros),usd(r.contacts_cost_per_lead_micros),usd(r.research_lab_cost_per_lead_micros),r.change_pct??'',r.low_sample].map(v=>/[",\n]/.test(String(v))?`"${String(v).replaceAll('"','""')}"`:v).join(','));
 return lines.join('\n')+'\n';
}
