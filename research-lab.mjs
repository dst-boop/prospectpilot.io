import {randomUUID} from 'node:crypto';
import {normalizeLead, mergeLead, isUsableStoredLead} from './generated/worker.mjs';
import {assessLead, candidateKeys, leadIdentity, validateObservation, nameKey, US_STATES, researchCSV, hash, QUALITY_VERSION} from './lead-quality.mjs';
import {matchPlans, selectEmployers, catalogSummary} from './plan-catalog.mjs';
import {SOURCE_CATALOG} from './source-catalog.mjs';
import {csvRows} from './warn.mjs';

const TEAM='wealth-management';
const fail=(status,message)=>Object.assign(Error(message),{status});
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const integer=(value,min,max,fallback)=>{const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw fail(422,'A setting is outside its allowed range.');return n;};
const cleanList=(values,max=100)=>[...new Set((Array.isArray(values)?values:[]).map(v=>String(v).trim().slice(0,200)).filter(Boolean))].slice(0,max);
export function mapResearchRow(raw) {
  const columns=new Map(Object.entries(raw).map(([k,v])=>[nameKey(k).replaceAll(' ',''),v]));
  const pick=(...keys)=>keys.map(k=>columns.get(nameKey(k).replaceAll(' ',''))).find(v=>v!==undefined&&v!=='');
  return {...raw,company:pick('Company','Company Name','Current Company','Employer')||raw.company,
    estimated_age_range:pick('Estimated Age Range','Est. Age Range','Age Range','Age Estimate','Age')||raw.estimated_age_range,
    former_employers:pick('Former Employers','Previous Company','Previous Employer')||raw.former_employers,
    signals:pick('401(k) Rollover Signal','401(k) Rollover Opportunity','Life Event Signal','Signals')||raw.signals};
}
export function labConfiguration(input={}) {
  const states=cleanList(input.states,51).map(v=>v.toUpperCase());
  if(states.some(v=>!US_STATES.has(v)))throw fail(422,'Use two-letter US state codes.');
  const sources=cleanList(input.sources||['public_web','sec','warn'],4);
  if(sources.some(v=>!['public_web','sec','warn','web_search'].includes(v)))throw fail(422,'Unsupported discovery source.');
  return {states,employers:cleanList(input.employers,50),sources,max_companies:integer(input.max_companies,1,50,10),
    websites:(Array.isArray(input.websites)?input.websites:[]).slice(0,50).map(v=>String(v).trim().slice(0,500)),daily_budget_micros:integer(input.daily_budget_micros,0,100000000,0)};
}
async function transaction(pool,fn) {
  const client=await pool.connect();let broken;
  try {await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}
  catch(error){try{await client.query('ROLLBACK');}catch(e){broken=e;}throw error;}
  finally{client.release(broken);}
}
const visibleSQL=`team=$1 AND (owner_user_id=$2 OR lower(owner_email)=lower($3) OR EXISTS(SELECT 1 FROM discovery_users WHERE user_id=$2 AND role='admin'))`;

export async function assessInventory(ids,assess,{clock=()=>performance.now(),budgetMs=60000}={}) {
  const started=clock();let assessed=0,failed=0,skipped=0;
  for(const id of ids){
    // Stop starting new work well before the two-minute task lease expires.
    if(clock()-started>=budgetMs)break;
    try{await assess(id);assessed++;}catch(error){if(error.status===404)skipped++;else failed++;}
  }
  const remaining=ids.length-assessed-failed-skipped,errors=[];
  if(failed)errors.push(`${failed} records could not be assessed. Run Assess saved leads again to retry.`);
  if(remaining)errors.push(`The batch time limit left ${remaining} records unattempted. Run Assess saved leads again to continue.`);
  return {status:failed||remaining?'partial':'completed',assessed,failed,skipped,remaining,errors,candidates:[]};
}

export function createResearchLab({pool,sources,dispatch=async()=>false,now=()=>new Date()}={}) {
  async function accessible(user,id,client=pool,lock=false) {
    const row=(await client.query(`SELECT * FROM discovery_leads WHERE ${visibleSQL} AND id=$4${lock?' FOR UPDATE':''}`,[TEAM,user.uid,user.email,id])).rows[0];
    if(!row)throw fail(404,'Lead not found or unavailable to this account.');
    return {...row,lead:{...parse(row.payload),id:row.id}};
  }
  async function observations(user,id,client=pool) {return (await client.query('SELECT payload FROM lab_observations WHERE lead_id=$1 AND user_id=$2',[id,user.uid])).rows.map(r=>parse(r.payload));}
  async function evaluate(user,lead,client=pool) {
    const quality=assessLead(lead,await observations(user,lead.id,client),{now:now(),plans:await matchPlans(client,lead)});
    await client.query(`INSERT INTO lab_qualification(lead_id,user_id,status,score,identity_signature,first_verified_at,rule_version)
      VALUES($1,$2,$3,$4,$5,CASE WHEN $3='verified' THEN $6::timestamptz ELSE NULL END,$7)
      ON CONFLICT(lead_id,user_id) DO UPDATE SET status=EXCLUDED.status,score=EXCLUDED.score,identity_signature=EXCLUDED.identity_signature,
      first_verified_at=CASE WHEN lab_qualification.rule_version=EXCLUDED.rule_version THEN COALESCE(lab_qualification.first_verified_at,EXCLUDED.first_verified_at) ELSE EXCLUDED.first_verified_at END,rule_version=EXCLUDED.rule_version,evaluated_at=now()`,[lead.id,user.uid,quality.status,quality.score,quality.identity_signature,now().toISOString(),QUALITY_VERSION]);
    return quality;
  }
  async function detail(user,id,task=null) {
    return transaction(pool,async client=>{
      if(task){
        const owned=(await client.query("SELECT id FROM lab_tasks WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() FOR UPDATE",[task.id,task.lease_token])).rows[0];
        if(!owned)throw fail(409,'Assessment lease is no longer current.');
      }
      // Serialize persisted assessments with evidence reviews and lead edits.
      const {lead}=await accessible(user,id,client,true);
      return {lead,quality:await evaluate(user,lead,client),observations:await observations(user,id,client)};
    });
  }
  async function review(user,id,input) {
    return transaction(pool,async client=>{
      const {lead}=await accessible(user,id,client,true),identity=leadIdentity(lead);
      if(input.identity_signature!==identity)throw fail(409,'This lead changed. Reload it before saving evidence.');
      const observation=validateObservation(input,{userId:user.uid,identity,now:now()});
      await client.query(`INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES($1,$2,$3,$4::jsonb)
        ON CONFLICT(lead_id,user_id,field) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`,[id,user.uid,observation.field,JSON.stringify(observation)]);
      return {quality:await evaluate(user,lead,client)};
    });
  }
  async function list(user,{offset=0,limit=50,status='',search='',compact=false}={}) {
    offset=integer(offset,0,1000000,0);limit=integer(limit,1,100,50);
    if(status&&!['verified','promising','incomplete','excluded','identity_review','unassessed'].includes(status))throw fail(422,'Invalid quality filter.');
    if(![true,false,'true','false'].includes(compact))throw fail(422,'Invalid compact result setting.');
    const needle=String(search).trim().replace(/\s+/g,' ').slice(0,100),params=[TEAM,user.uid,user.email,status,needle];
    const scope=`FROM discovery_leads d LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2
      WHERE ${visibleSQL} AND ($4='' OR COALESCE(q.status,'unassessed')=$4)
      AND ($5='' OR strpos(lower(concat_ws(' ',d.payload::jsonb->>'first_name',d.payload::jsonb->>'last_name')),lower($5))>0
        OR strpos(lower(d.payload::jsonb->>'company'),lower($5))>0)`;
    const rows=(await pool.query(`SELECT d.id,d.payload,q.status AS recorded_status,count(*) OVER()::int AS total ${scope}
      ORDER BY q.score DESC NULLS LAST,d.id LIMIT $6 OFFSET $7`,[...params,limit,offset])).rows;
    const total=rows[0]?.total??(offset>0?(await pool.query(`SELECT count(*)::int AS total ${scope}`,params)).rows[0].total:0);
    const ids=rows.map(r=>r.id);
    const records=ids.length?(await pool.query('SELECT lead_id,payload FROM lab_observations WHERE user_id=$1 AND lead_id=ANY($2::text[])',[user.uid,ids])).rows:[];
    // Live assessment prevents an expired or edited record from displaying an old verified badge.
    const leads=rows.map(row=>{
      const lead={...parse(row.payload),id:row.id},quality=assessLead(lead,records.filter(o=>o.lead_id===row.id).map(o=>parse(o.payload)),{now:now()});
      if(compact===true||compact==='true')return {
        lead:Object.fromEntries(['id','first_name','last_name','current_title','company'].map(k=>[k,lead[k]])),
        quality:{status:quality.status,score:quality.score,gaps:quality.gaps,gates:Object.fromEntries(Object.entries(quality.gates).map(([k,g])=>[k,{state:g.state,reason:g.reason}]))}
      };
      return {lead,quality};
    });
    return {leads,total,offset,limit,filter_basis:'Last inventory assessment; displayed evidence is re-evaluated now.'};
  }
  async function saveCandidates(client,user,candidates,run,source) {
    if(!candidates.length)return {added:0,duplicates:0,rejected:0,ambiguous:0};
    // Serialize imports and source completions for this team, including concurrent workers.
    await client.query('SELECT pg_advisory_xact_lock(505006)');
    const rows=(await client.query('SELECT id,payload,owner_user_id,owner_email FROM discovery_leads WHERE team=$1',[TEAM])).rows;
    const index=new Map();
    for(const r of rows)for(const key of candidateKeys(parse(r.payload))){if(!index.has(key))index.set(key,[]);index.get(key).push(r);}
    let added=0,duplicates=0,rejected=0,ambiguous=0;
    for(const raw of candidates.slice(0,5000)) {
      const lead=normalizeLead(mapResearchRow(raw),{source:raw.source_names?.[0]||source,owner_email:user.email});
      if(!lead.first_name||!lead.last_name||!isUsableStoredLead(lead)||nameKey(lead.company).includes('equitable')) {rejected++;continue;}
      const keys=candidateKeys(lead);if(!keys.length){rejected++;continue;}
      const matches=[...new Map(keys.flatMap(key=>index.get(key)||[]).map(r=>[r.id,r])).values()];
      if(matches.length>1){ambiguous++;continue;}
      let saved=lead,isNew=!matches.length;
      if(matches.length) {
        const existing=matches[0];
        // An advisor cannot overwrite another advisor's record through import deduplication.
        const admin=(await client.query("SELECT 1 FROM discovery_users WHERE user_id=$1 AND role='admin'",[user.uid])).rows.length>0;
        if(existing.owner_user_id!==user.uid&&existing.owner_email.toLowerCase()!==user.email.toLowerCase()&&!admin){duplicates++;continue;}
        saved=mergeLead(parse(existing.payload),lead);saved.id=existing.id;
        await client.query('UPDATE discovery_leads SET payload=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[JSON.stringify(saved),saved.id]);duplicates++;
      } else {
        saved.id=randomUUID();
        await client.query('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',[saved.id,TEAM,user.uid,user.email,JSON.stringify(saved)]);added++;
      }
      const stored={id:saved.id,payload:JSON.stringify(saved),owner_user_id:user.uid,owner_email:user.email};
      for(const key of candidateKeys(saved))index.set(key,[stored]);
      await client.query(`INSERT INTO lab_run_leads(run_id,lead_id,is_new,source) VALUES($1,$2,$3,$4) ON CONFLICT(run_id,lead_id) DO UPDATE SET is_new=lab_run_leads.is_new OR EXCLUDED.is_new`,[run.id,saved.id,isNew,source]);
      await evaluate(user,saved,client);
    }
    return {added,duplicates,rejected,ambiguous};
  }
  async function settings(user,input) {
    if(input) {
      const config=labConfiguration(input.configuration||input),hour=integer(input.daily_hour,0,23,13);
      await pool.query(`INSERT INTO lab_settings(user_id,user_email,daily_enabled,daily_hour,daily_budget_micros,configuration)
        VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id) DO UPDATE SET user_email=EXCLUDED.user_email,daily_enabled=EXCLUDED.daily_enabled,daily_hour=EXCLUDED.daily_hour,daily_budget_micros=EXCLUDED.daily_budget_micros,configuration=EXCLUDED.configuration,updated_at=now()`,[user.uid,user.email,input.daily_enabled===true,hour,config.daily_budget_micros,JSON.stringify(config)]);
    }
    return (await pool.query('SELECT * FROM lab_settings WHERE user_id=$1',[user.uid])).rows[0]||{daily_enabled:false,daily_hour:13,daily_budget_micros:0,configuration:labConfiguration()};
  }
  async function enqueue(user,input={}) {
    const config=labConfiguration(input),kind=input.kind==='inventory'?'inventory':'discovery';
    const key=String(input.idempotency_key||randomUUID()).slice(0,160);
    const replay=(await pool.query('SELECT * FROM lab_runs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows[0];if(replay)return {...replay,replayed:true};
    let employers=[];
    if(kind==='discovery') {
      if(!config.sources.length)throw fail(422,'Select at least one discovery source.');
      if(config.sources.includes('web_search')&&sources.quote('web_search')==null)throw fail(422,'Licensed web search is not configured. Deselect it to use free sources.');
      if(config.sources.includes('web_search')&&sources.quote('web_search')>config.daily_budget_micros)throw fail(422,'The daily provider budget cannot cover one search query. Increase the budget or deselect licensed web search.');
      const plans=await selectEmployers(pool,config,user.uid);
      employers=plans.map(p=>({company:p.sponsor,city:p.city,state:p.state,plan_id:p.id}));
      for(const [i,company] of config.employers.entries()) {
        const target=employers.find(e=>nameKey(e.company)===nameKey(company));
        if(target)target.website=config.websites[i]||'';
        else employers.push({company,website:config.websites[i]||'',state:config.states.length===1?config.states[0]:''});
      }
      if(!employers.length) {
        const saved=(await pool.query(`SELECT payload FROM discovery_leads WHERE ${visibleSQL} ORDER BY updated_at DESC LIMIT 2000`,[TEAM,user.uid,user.email])).rows;
        employers=[...new Map(saved.map(r=>parse(r.payload)).filter(l=>l.company&&(!config.states.length||config.states.includes(l.state))).map(l=>[nameKey(l.company),{company:l.company,website:l.company_website||'',city:'',state:''}])).values()];
      }
      employers=employers.filter(e=>!nameKey(e.company).includes('equitable')).slice(0,config.max_companies);
      if(!employers.length)throw fail(422,'Add an employer, import a lead list, or load the DOL plan catalog to start discovery.');
    }
    let run;
    try {
      run=await transaction(pool,async client=>{
        if(kind==='inventory'){
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['lab-inventory:'+user.uid]);
          const active=(await client.query("SELECT * FROM lab_runs WHERE user_id=$1 AND kind='inventory' AND status IN ('queued','running') ORDER BY created_at,id LIMIT 1",[user.uid])).rows[0];
          if(active)return {...active,reused_active:true};
        }
        const id=randomUUID();
        const row=(await client.query(`INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,configuration,budget_micros) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,[id,user.uid,user.email,kind,key,JSON.stringify(config),config.daily_budget_micros])).rows[0];
        if(kind==='inventory') {
          const ids=(await client.query(`SELECT d.id FROM discovery_leads d LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2 WHERE ${visibleSQL} ORDER BY q.evaluated_at ASC NULLS FIRST,d.id`,[TEAM,user.uid,user.email])).rows.map(r=>r.id);
          for(let i=0;i<ids.length;i+=100)await client.query('INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[randomUUID(),id,`inventory:${i}`,'inventory',JSON.stringify({ids:ids.slice(i,i+100)})]);
          if(!ids.length)return (await client.query("UPDATE lab_runs SET status='completed',completed_at=now(),message='No saved leads to assess.' WHERE id=$1 RETURNING *",[id])).rows[0];
        } else for(const employer of employers)for(const source of config.sources)await client.query('INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(run_id,task_key) DO NOTHING',[randomUUID(),id,hash(`${source}:${nameKey(employer.company)}`),source,JSON.stringify(employer)]);
        return row;
      });
    } catch(error) {
      if(error.code!=='23505')throw error;
      const active=(await pool.query("SELECT * FROM lab_runs WHERE user_id=$1 AND (idempotency_key=$2 OR (kind='discovery' AND status IN ('queued','running'))) ORDER BY created_at DESC LIMIT 1",[user.uid,key])).rows[0];
      if(active)return {...active,replayed:true};throw error;
    }
    if(run.status==='completed')return {...run,dispatched:false};
    let dispatched=false;try{dispatched=await dispatch();}catch{}
    return {...run,dispatched,message:run.reused_active?'Your existing assessment is still queued or running. Its progress is shown in the run history.':dispatched?'Research queued. You can close this page.':'Research queued. The background worker or recovery schedule must be active.'};
  }
  async function importCSV(user,input) {
    if(typeof input.csv!=='string'||Buffer.byteLength(input.csv)>4000000)throw fail(422,'Upload a CSV smaller than 4 MB.');
    let table;try{table=csvRows(input.csv);}catch{throw fail(422,'Malformed CSV quoting.');}
    if(table.length<2||table.length>5001)throw fail(422,'Include headers and 1 to 5,000 rows per import.');
    const headers=table[0].map(h=>h.replace(/^\uFEFF/,'').trim());
    if(new Set(headers).size!==headers.length)throw fail(422,'CSV column names must be unique.');
    if(table.slice(1).some(r=>r.length!==headers.length))throw fail(422,'Each CSV row must have the same number of columns as the header.');
    const rows=table.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
    const source=String(input.source||'Research CSV').slice(0,100);
    if(/fec|familytreenow|fastpeoplesearch/i.test(source+' '+headers.join(' ')))throw fail(422,'This source is not enabled for prospect imports.');
    const key=`import:${hash(input.csv+source)}`;
    return transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(505006)');
      const prior=(await client.query('SELECT * FROM lab_runs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows[0];if(prior)return {run:prior,replayed:true};
      const run={id:randomUUID()};
      await client.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status) VALUES($1,$2,$3,'import',$4,'running')",[run.id,user.uid,user.email,key]);
      const result=await saveCandidates(client,user,rows,run,source);
      await client.query("UPDATE lab_runs SET status='completed',message=$1,completed_at=now() WHERE id=$2",[JSON.stringify(result),run.id]);
      return {run,result,reported_rows:rows.length,note:'Imported claims remain unverified. Existing suppression is preserved.'};
    });
  }
  async function claimTask() {
    return transaction(pool,async client=>{
      // One reservation at a time across replicas protects concurrent daily budgets.
      await client.query('SELECT pg_advisory_xact_lock(505007)');
      const task=(await client.query(`SELECT t.*,r.user_id,r.user_email,r.budget_micros FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id
        WHERE r.status IN ('queued','running') AND (t.status='pending' OR (t.status='running' AND t.lease_until<now()))
        ORDER BY r.created_at,t.id LIMIT 1 FOR UPDATE OF t,r SKIP LOCKED`)).rows[0];
      if(!task)return null;
      const quote=task.source==='inventory'?0:sources.quote(task.source);
      let skip='';
      if(task.attempts>0&&Number(task.reserved_micros)>0)skip='A paid request was interrupted. Its cost is retained; automatic paid retries are disabled.';
      else if(task.attempts>=2)skip='Source recovery attempts exhausted.';
      else if(quote===null)skip='This source is not configured.';
      else if(quote>0) {
        const settingsRow=(await client.query('SELECT daily_budget_micros FROM lab_settings WHERE user_id=$1',[task.user_id])).rows[0];
        const ceiling=Math.min(Number(task.budget_micros),settingsRow?Number(settingsRow.daily_budget_micros):Number(task.budget_micros));
        const spent=Number((await client.query(`SELECT COALESCE(sum(amount_micros),0) AS n FROM lab_costs WHERE user_id=$1 AND category='provider' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,[task.user_id])).rows[0].n);
        if(spent+quote>ceiling)skip='Daily provider budget reached. No paid request made.';
      }
      if(skip){await client.query("UPDATE lab_tasks SET status='skipped',result=$1::jsonb,completed_at=now(),lease_until=NULL WHERE id=$2",[JSON.stringify({status:'skipped',errors:[skip]}),task.id]);return {...task,skipped:true};}
      if(quote>0)await client.query("INSERT INTO lab_costs(id,run_id,user_id,category,amount_micros,basis,note) VALUES($1,$2,$3,'provider',$4,'configured_estimate','Reserved before licensed search; reconcile against provider billing.')",[`task:${task.id}`,task.run_id,task.user_id,quote]);
      const token=randomUUID();
      await client.query("UPDATE lab_tasks SET status='running',lease_token=$1,lease_until=now()+interval '2 minutes',attempts=attempts+1,reserved_micros=$2,started_at=COALESCE(started_at,now()) WHERE id=$3",[token,quote,task.id]);
      await client.query("UPDATE lab_runs SET status='running' WHERE id=$1",[task.run_id]);
      return {...task,lease_token:token};
    });
  }
  async function finishRun(id) {
    await pool.query(`UPDATE lab_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM lab_tasks WHERE run_id=$1 AND status IN ('failed','partial','skipped')) THEN 'completed_with_gaps' ELSE 'completed' END,completed_at=now()
      WHERE id=$1 AND status IN ('queued','running') AND NOT EXISTS(SELECT 1 FROM lab_tasks WHERE run_id=$1 AND status IN ('pending','running'))`,[id]);
  }
  async function tick() {
    const task=await claimTask();if(!task)return false;
    if(task.skipped){await finishRun(task.run_id);return true;}
    const user={uid:task.user_id,email:task.user_email},started=performance.now();let result;
    try {
      if(task.source==='inventory') {
        result=await assessInventory(parse(task.payload).ids,async id=>{await detail(user,id,task);});
      } else result=await sources.run(task.source,parse(task.payload));
    } catch {result={status:'failed',candidates:[],errors:['Source unavailable or timed out. No lead evidence was fabricated.']};}
    await transaction(pool,async client=>{
      const owned=(await client.query('SELECT id FROM lab_tasks WHERE id=$1 AND lease_token=$2 AND status=\'running\' FOR UPDATE',[task.id,task.lease_token])).rows[0];
      if(!owned)return;
      const counts=await saveCandidates(client,user,result.candidates||[],{id:task.run_id},task.source);
      const {candidates,...summary}=result;
      const status=['completed','no_match'].includes(result.status)?'completed':result.status==='partial'?'partial':'failed';
      await client.query('UPDATE lab_tasks SET status=$1,result=$2::jsonb,completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$3',[status,JSON.stringify({...summary,...counts,discovered:candidates?.length||0,duration_ms:Math.round(performance.now()-started)}),task.id]);
    });
    await finishRun(task.run_id);return true;
  }
  async function scheduleDue() {
    const date=now(),day=date.toISOString().slice(0,10);
    const rows=(await pool.query('SELECT * FROM lab_settings WHERE daily_enabled=true AND daily_hour<=$1',[date.getUTCHours()])).rows;
    for(const row of rows) {
      const user={uid:row.user_id,email:row.user_email},key=`daily:${day}`;
      if((await pool.query('SELECT 1 FROM lab_runs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows.length)continue;
      try{await enqueue(user,{...parse(row.configuration),daily_budget_micros:Number(row.daily_budget_micros),idempotency_key:key});}
      catch(error){if(error.status===422)await pool.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status,message,completed_at) VALUES($1,$2,$3,'discovery',$4,'failed',$5,now()) ON CONFLICT(user_id,idempotency_key) DO NOTHING",[randomUUID(),user.uid,user.email,key,error.message]);else throw error;}
    }
  }
  async function runs(user) {return (await pool.query(`SELECT r.*, (SELECT count(*)::int FROM lab_tasks WHERE run_id=r.id) AS tasks,
    (SELECT count(*)::int FROM lab_tasks WHERE run_id=r.id AND status NOT IN ('pending','running')) AS finished_tasks,
    (SELECT count(*)::int FROM lab_run_leads WHERE run_id=r.id AND is_new) AS new_people,
    (SELECT COALESCE(sum(amount_micros),0) FROM lab_costs WHERE run_id=r.id) AS cost_micros,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('source',t.source,'company',t.payload->>'company','status',t.status,'errors',COALESCE(t.result->'errors','[]'::jsonb)) ORDER BY t.id),'[]'::jsonb) FROM lab_tasks t WHERE t.run_id=r.id) AS source_results
    FROM lab_runs r WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,[user.uid])).rows;}
  async function runDetail(user,id) {
    const run=(await pool.query('SELECT * FROM lab_runs WHERE id=$1 AND user_id=$2',[id,user.uid])).rows[0];if(!run)throw fail(404,'Research run not found.');
    return {run,tasks:(await pool.query('SELECT source,payload,status,result,started_at,completed_at,reserved_micros FROM lab_tasks WHERE run_id=$1 ORDER BY started_at NULLS LAST,id',[id])).rows,costs:(await pool.query('SELECT * FROM lab_costs WHERE run_id=$1',[id])).rows};
  }
  async function cost(user,input) {
    await runDetail(user,input.run_id);
    if(!['provider','labor','infrastructure','subscription'].includes(input.category))throw fail(422,'Invalid cost category.');
    const amount=integer(input.amount_micros,0,100000000000,0),id=String(input.idempotency_key||randomUUID()).slice(0,160);
    await pool.query("INSERT INTO lab_costs(id,run_id,user_id,category,amount_micros,basis,note) VALUES($1,$2,$3,$4,$5,'self_reported',$6) ON CONFLICT(id) DO NOTHING",[`${user.uid}:${id}`,input.run_id,user.uid,input.category,amount,String(input.note||'').slice(0,500)]);
    return {saved:true};
  }
  async function metrics(user,days=14) {
    days=integer(days,1,90,14);
    // Revalidate previously verified rows against live identity and expiry before reporting totals.
    let cursor='';
    for(;;) {
      const rows=(await pool.query(`SELECT d.id,d.payload FROM discovery_leads d JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2
        WHERE ${visibleSQL} AND q.status='verified' AND d.id>$4 ORDER BY d.id LIMIT 100`,[TEAM,user.uid,user.email,cursor])).rows;
      if(!rows.length)break;
      const ids=rows.map(r=>r.id),obs=(await pool.query('SELECT lead_id,payload FROM lab_observations WHERE user_id=$1 AND lead_id=ANY($2::text[])',[user.uid,ids])).rows;
      for(const row of rows){const quality=assessLead({...parse(row.payload),id:row.id},obs.filter(o=>o.lead_id===row.id).map(o=>parse(o.payload)),{now:now()});if(quality.status!=='verified')await pool.query('UPDATE lab_qualification SET status=$1,score=$2,evaluated_at=now() WHERE lead_id=$3 AND user_id=$4',[quality.status,quality.score,row.id,user.uid]);}
      cursor=ids.at(-1);
    }
    const daily=(await pool.query(`WITH days AS (SELECT generate_series((now() AT TIME ZONE 'UTC')::date-($2::int-1),(now() AT TIME ZONE 'UTC')::date,'1 day'::interval)::date AS day),
      people AS (SELECT (r.created_at AT TIME ZONE 'UTC')::date AS day,count(DISTINCT l.lead_id) FILTER(WHERE r.kind='discovery' AND l.is_new)::int AS sourced,count(DISTINCT l.lead_id) FILTER(WHERE r.kind='import' AND l.is_new)::int AS imported FROM lab_runs r JOIN lab_run_leads l ON l.run_id=r.id WHERE r.user_id=$1 GROUP BY 1),
      verified AS (SELECT (first_verified_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS n FROM lab_qualification WHERE user_id=$1 AND status='verified' AND first_verified_at IS NOT NULL GROUP BY 1),
      costs AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,sum(amount_micros) AS micros FROM lab_costs WHERE user_id=$1 GROUP BY 1)
      SELECT d.day::text,COALESCE(p.sourced,0) AS new_sourced,COALESCE(p.imported,0) AS imported,COALESCE(v.n,0) AS newly_verified,COALESCE(c.micros,0) AS cost_micros FROM days d LEFT JOIN people p USING(day) LEFT JOIN verified v USING(day) LEFT JOIN costs c USING(day) ORDER BY d.day`,[user.uid,days])).rows;
    const inventory=(await pool.query(`SELECT COALESCE(q.status,'unassessed') AS status,count(*)::int AS n FROM discovery_leads d LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2 WHERE ${visibleSQL} GROUP BY 1`,[TEAM,user.uid,user.email])).rows;
    const sourceRows=(await pool.query(`SELECT t.source,count(*)::int AS attempts,count(*) FILTER(WHERE t.status IN ('failed','partial','skipped'))::int AS gaps,COALESCE(sum((t.result->>'added')::int),0)::int AS new_people,COALESCE(sum(t.reserved_micros),0) AS cost_micros,COALESCE(sum((t.result->>'duration_ms')::bigint),0) AS duration_ms FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id WHERE r.user_id=$1 AND r.created_at>=(((now() AT TIME ZONE 'UTC')::date-($2::int-1))::timestamp AT TIME ZONE 'UTC') GROUP BY t.source`,[user.uid,days])).rows;
    // Attribute each newly acquired person to its original source, never to every
    // repeated lookup. Qualified yield is a cohort outcome, not model accuracy.
    const cohorts=(await pool.query(`SELECT l.source,count(DISTINCT l.lead_id)::int AS acquired,
      count(DISTINCT l.lead_id) FILTER(WHERE q.status='verified' AND q.rule_version=$3)::int AS qualified
      FROM lab_run_leads l JOIN lab_runs r ON r.id=l.run_id
      LEFT JOIN lab_qualification q ON q.lead_id=l.lead_id AND q.user_id=r.user_id
      WHERE r.user_id=$1 AND l.is_new AND r.created_at >= (((now() AT TIME ZONE 'UTC')::date-($2::int-1))::timestamp AT TIME ZONE 'UTC')
      GROUP BY l.source`,[user.uid,days,QUALITY_VERSION])).rows;
    for(const c of cohorts) {
      let row=sourceRows.find(s=>s.source===c.source);
      if(!row){row={source:c.source,attempts:0,gaps:0,new_people:0,cost_micros:null,duration_ms:0};sourceRows.push(row);}
      row.acquired=c.acquired;row.qualified=c.qualified;
      row.qualification_rate=c.acquired?c.qualified/c.acquired:null;
      row.reserved_cost_per_qualified=c.qualified&&row.cost_micros!==null?Number(row.cost_micros)/1000000/c.qualified:null;
    }
    const sum=(k)=>daily.reduce((s,r)=>s+Number(r[k]),0),verified=sum('newly_verified'),costs=sum('cost_micros');
    const catalog=await catalogSummary(pool);
    return {daily,inventory,sources:sourceRows,catalog,period_days:days,totals:{new_sourced:sum('new_sourced'),imported:sum('imported'),newly_verified:verified,cost_usd:costs/1000000,cost_per_verified:verified?costs/1000000/verified:null,verified_per_calendar_day:verified/days},
      notes:['Newly verified counts each currently qualified person once under the current five-criterion rule. Expired, corrected and deleted records are excluded.','Source qualified yield measures the current qualification of new people acquired in this period; repeated lookups do not create new people. It is not a predictive accuracy estimate.','Imported records are separate from newly sourced people.','Costs include only recorded provider, labor, infrastructure and subscription amounts; unrecorded costs are unknown. Source costs show reserved provider charges only.','Nonverified inventory totals reflect the last assessment; run Assess saved leads to refresh all evidence. UTC calendar days.']};
  }
  async function route(request,user) {
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
    const body=async()=>{try{return await request.json();}catch{throw fail(422,'Invalid JSON request.');}};
    if(path==='/api/lab/summary'&&request.method==='GET')return metrics(user,url.searchParams.get('days')||14);
    if(path==='/api/lab/sources'&&request.method==='GET')return {sources:SOURCE_CATALOG,readiness:sources.readiness};
    if(path==='/api/lab/settings'&&request.method==='GET')return settings(user);
    if(path==='/api/lab/settings'&&request.method==='PUT')return settings(user,await body());
    if(path==='/api/lab/leads'&&request.method==='GET')return list(user,Object.fromEntries(url.searchParams));
    if(path==='/api/lab/runs'&&request.method==='GET')return {runs:await runs(user)};
    if(path==='/api/lab/runs'&&request.method==='POST')return enqueue(user,await body());
    if(path==='/api/lab/import'&&request.method==='POST')return importCSV(user,await body());
    if(path==='/api/lab/costs'&&request.method==='POST')return cost(user,await body());
    if(path==='/api/lab/export'&&request.method==='POST') {
      const input=await body(),ids=cleanList(input.ids,1000);if(!ids.length)throw fail(422,'Select records to export (maximum 1,000).');
      const rows=[];for(const id of ids){const row=await detail(user,id);if(row.quality.status!=='excluded'&&(!input.verified_only||row.quality.status==='verified'))rows.push(row);}
      return new Response(researchCSV(rows),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="prospectpilot-research.csv"'}});
    }
    const leadMatch=path.match(/^\/api\/lab\/leads\/([^/]+)(?:\/(review))?$/);
    if(leadMatch&&request.method==='GET'&&!leadMatch[2])return detail(user,decodeURIComponent(leadMatch[1]));
    if(leadMatch&&request.method==='POST'&&leadMatch[2])return review(user,decodeURIComponent(leadMatch[1]),await body());
    const runMatch=path.match(/^\/api\/lab\/runs\/([^/]+)$/);
    if(runMatch&&request.method==='GET')return runDetail(user,decodeURIComponent(runMatch[1]));
    throw fail(404,'Research endpoint not found.');
  }
  return {route,tick,scheduleDue,enqueue,importCSV,detail,list,review,metrics,settings,cost,runDetail};
}
