// Autopilot: approve a budget once, and the ladder runs itself.
//
// This is Lead Qualifier's autopilot, moved onto the job queue. Its own comment
// described the compromise it was making -- "the loop runs in the page" -- so a
// closed tab paused the run and the operator had to keep a browser open to
// spend their own money. ProspectPilot has a worker and a five-minute
// scheduler, so here the run is a row and the queue walks it.
//
// Two things make it worth having rather than clicking each step by hand:
//
//   Cheapest first. The steps are ordered by their configured price, free
//   ahead of paid, and a step is enqueued only once the one before it has
//   finished. That ordering is the saving: the free domain check writes a
//   recorded failure, and the paid verification then skips that contact
//   without reserving anything. Pay for the cheap answer first and the
//   expensive question is asked of fewer people.
//
//   One approval. The operator sees the worst case, approves it once, and the
//   run cannot exceed it. Before each step the run adds what it has already
//   reserved to the next step's quote; over the approved figure it pauses and
//   says so rather than spending and explaining afterwards.
//
// The order is read from the prices rather than written down here. Lead
// Qualifier hardcoded free -> ZoomInfo -> WhitePages -> web -> QC; a price
// change made that ladder wrong and nothing noticed. Here a repricing reorders
// the ladder, and a step with no configured price is simply not offered.
import {randomUUID} from 'node:crypto';

const fail=(status,message)=>{const e=Error(message);e.status=status;return e;};
const tx=async(pool,fn)=>{const c=await pool.connect();try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out;}catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}finally{c.release();}};

// Every action Autopilot will walk, in the order used to break a price tie.
// `search` is absent on purpose: it finds new people rather than working the
// ones already chosen. So is `profile_image`, which the queue only accepts
// through its own entry point and would refuse here.
export const AUTOPILOT_ACTIONS=['check_domain','check_phone','enrich','verify','web_research'];
export const STEP_LABELS={check_domain:'Check the email domain',check_phone:'Check the phone line',
  enrich:'Fill in missing contact details',verify:'Verify the email address',
  web_research:'Research them on the web'};
// A run is only ever walked one step at a time, and one job carries at most
// this many contacts, so a longer list becomes several jobs in the same step.
export const CHUNK=500;

/**
 * The ladder, cheapest first.
 *
 * Price decides, so this follows a repricing. Ties keep AUTOPILOT_ACTIONS'
 * order, which puts the cheap certain answers before the costly uncertain
 * ones at equal price. An action the deployment has not priced or has no
 * credentials for is left out: Autopilot never offers a step it cannot run.
 */
export function ladder(enabled,{prices={},actions={}}={}) {
  const chosen=[...new Set(enabled||[])].filter(a=>AUTOPILOT_ACTIONS.includes(a)&&actions[a]===true);
  return chosen
    .map(action=>({action,label:STEP_LABELS[action],price_micros:action==='check_domain'?0:Number(prices[action]??NaN)}))
    .filter(step=>Number.isFinite(step.price_micros)&&step.price_micros>=0)
    .sort((a,b)=>a.price_micros-b.price_micros||AUTOPILOT_ACTIONS.indexOf(a.action)-AUTOPILOT_ACTIONS.indexOf(b.action));
}

export function createProspectAutopilot({pool,jobs,config={prices:{}}}) {
  /** The contacts a run works: the list's, or the workspace's, minus suppressed. */
  async function members(c,user,listId) {
    const rows=listId
      ? (await c.query(`SELECT pc.id FROM prospect_contacts pc JOIN prospect_list_members m ON m.contact_id=pc.id
          WHERE pc.user_id=$1 AND m.list_id=$2 AND COALESCE((pc.payload->>'suppressed')::boolean,false)=false ORDER BY pc.id`,[user.uid,listId])).rows
      : (await c.query(`SELECT id FROM prospect_contacts WHERE user_id=$1
          AND COALESCE((payload->>'suppressed')::boolean,false)=false ORDER BY id`,[user.uid])).rows;
    return rows.map(r=>r.id);
  }

  /**
   * What a run would cost at most, before anything is approved.
   *
   * The total is an upper bound and is labelled as one. It prices every step
   * for every contact, which is what the operator is being asked to approve,
   * but the earlier steps remove people from the later ones -- a contact with
   * no phone, or one a recorded check already answered, is skipped and
   * reserves nothing. Real spend comes in under this, and the run reports what
   * it actually reserved as it goes.
   */
  async function plan(user,input={}) {
    const listId=input.list_id?String(input.list_id):null;
    if(listId&&!(await pool.query('SELECT id FROM prospect_lists WHERE user_id=$1 AND id=$2',[user.uid,listId])).rows.length)throw fail(404,'List not found.');
    const summary=await jobs.summary(user);
    const steps=ladder(input.steps??AUTOPILOT_ACTIONS,{prices:summary.prices,actions:summary.actions});
    const contacts=await members(pool,user,listId);
    const quotes=steps.map(step=>({...step,contacts:contacts.length,
      worst_case_micros:step.price_micros*contacts.length,
      chunks:Math.ceil(contacts.length/CHUNK)||0}));
    const worst=quotes.reduce((n,s)=>n+s.worst_case_micros,0);
    // Why a step is not on offer. The readiness flag alone cannot say: it is
    // false both for a missing key and for a missing price, and those are
    // different things to fix.
    const priced=a=>a==='check_domain'||Number.isFinite(Number(summary.prices?.[a]))&&Number(summary.prices[a])>=0;
    const unavailable=(input.steps??AUTOPILOT_ACTIONS)
      .filter(a=>AUTOPILOT_ACTIONS.includes(a)&&!steps.some(s=>s.action===a))
      .map(a=>({action:a,label:STEP_LABELS[a],
        reason:priced(a)?'This provider is not configured.':'No price is configured for this step.'}));
    return {list_id:listId,contacts:contacts.length,steps:quotes,unavailable,
      worst_case_micros:worst,
      plan:summary.plan,daily_budget_micros:summary.daily_budget_micros,reserved_today_micros:summary.reserved_today_micros,
      basis:'The most this run can reserve, at configured prices, if every step runs for every contact. '
        +'Cheaper steps run first and rule people out, so the real figure is lower: a contact with no phone, '
        +'or one a recorded check has already answered, is skipped without reserving anything.'};
  }

  /** Reserved so far by this run's own jobs. The run's ceiling is cumulative. */
  async function spent(c,run) {
    const ids=Array.isArray(run.job_ids)?run.job_ids:[];
    if(!ids.length)return 0;
    const row=(await c.query(`SELECT COALESCE(sum(ch.reserved_micros),0) AS micros FROM prospect_charges ch
      JOIN prospect_tasks t ON t.id=ch.task_id WHERE t.job_id=ANY($1::text[])`,[ids])).rows[0];
    return Number(row.micros);
  }

  /** Whether every task this run has queued has reached a final state. */
  async function settled(c,run) {
    const ids=Array.isArray(run.job_ids)?run.job_ids:[];
    if(!ids.length)return true;
    const row=(await c.query(`SELECT count(*)::int AS open FROM prospect_tasks
      WHERE job_id=ANY($1::text[]) AND status IN ('pending','running','waiting')`,[ids])).rows[0];
    return row.open===0;
  }

  async function finishRun(c,run,status,note) {
    await c.query('UPDATE prospect_autopilot_runs SET status=$1,note=$2,updated_at=now() WHERE id=$3',[status,note,run.id]);
    return {id:run.id,status,note};
  }

  /**
   * Queue the step at the cursor, or settle the run.
   *
   * Called with the run's row already locked. Returns true when it did
   * something, so the worker loop knows whether to keep going.
   */
  async function step(c,user,run) {
    const steps=Array.isArray(run.steps)?run.steps:[];
    if(run.cursor>=steps.length){await finishRun(c,run,'done','Every approved step has run.');return true;}
    const current=steps[run.cursor];
    const contacts=await members(c,user,run.list_id);
    if(!contacts.length){await finishRun(c,run,'done','No contacts are left to work.');return true;}
    const quote=current.price_micros*contacts.length;
    const already=await spent(c,run);
    // The approval was for a figure, so the figure is what binds. Pausing
    // rather than failing keeps the work done so far and lets the operator
    // approve more if they want to.
    if(already+quote>run.approved_micros) {
      await finishRun(c,run,'paused',
        `${STEP_LABELS[current.action]} would reserve more than the approved maximum for this run. `
        +'Nothing was sent. Start a new run with a higher maximum to continue.');
      return true;
    }
    const queued=[];
    try {
      for(let i=0;i<contacts.length;i+=CHUNK) {
        const slice=contacts.slice(i,i+CHUNK);
        const job=await jobs.enqueue(user,{action:current.action,ids:slice,
          max_cost_micros:current.price_micros*slice.length,
          idempotency_key:`ap-${run.id}-${run.cursor}-${i/CHUNK}`});
        queued.push(job.id);
      }
    } catch(e) {
      // Paused, not skipped on to the next step. The operator approved this
      // ladder in this order, and the step that is missing is the cheap one
      // more often than not -- carrying on would run the dear steps against
      // everyone the cheap one would have ruled out. Pausing also stops the
      // run coming back every pass to fail again.
      await finishRun(c,run,'paused',
        `${STEP_LABELS[current.action]} is no longer available: ${e.message} `
        +'Nothing was sent for it. Start a new run once the provider is configured again.');
      return true;
    }
    // Appended, never replaced. `spent` reads these ids, so dropping the
    // earlier steps would make the run's own ceiling blind to everything but
    // the step it had just queued -- which is the whole property this is for.
    await c.query(`UPDATE prospect_autopilot_runs SET cursor=cursor+1,
      job_ids=COALESCE(job_ids,'[]'::jsonb)||$1::jsonb,note=$2,updated_at=now() WHERE id=$3`,
      [JSON.stringify(queued),`${STEP_LABELS[current.action]} is running for ${contacts.length} contact${contacts.length===1?'':'s'}.`,run.id]);
    return true;
  }

  /**
   * Start a run against an approved maximum.
   *
   * The ladder is recomputed here rather than taken from the request, so a
   * tampered or stale step list cannot smuggle in an unpriced step or reorder
   * the ladder to put a paid step before a free one.
   */
  async function start(user,input={}) {
    const listId=input.list_id?String(input.list_id):null;
    const approved=Number(input.approved_micros);
    if(!Number.isSafeInteger(approved)||approved<0||approved>1000000000)throw fail(422,'Approve a maximum between 0 and 1,000,000,000 micros.');
    const quoted=await plan(user,{list_id:listId,steps:input.steps});
    if(!quoted.steps.length)throw fail(422,'No step in this ladder is configured to run. Configure a provider and its price first.');
    if(!quoted.contacts)throw fail(422,'This list has no contacts to work.');
    // The operator approved a figure against a quote they were shown. If the
    // quote has since risen, their approval no longer covers it, so the run
    // does not start rather than starting and pausing at the first step.
    if(quoted.worst_case_micros>approved)throw fail(422,'The approved maximum is below this run’s worst case. Review the quote and approve again.');
    return tx(pool,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect-autopilot:${user.uid}`]);
      if(listId&&!(await c.query('SELECT id FROM prospect_lists WHERE user_id=$1 AND id=$2',[user.uid,listId])).rows.length)throw fail(404,'List not found.');
      const live=(await c.query("SELECT id FROM prospect_autopilot_runs WHERE user_id=$1 AND COALESCE(list_id,'')=COALESCE($2,'') AND status IN ('running','paused')",[user.uid,listId])).rows[0];
      if(live)throw fail(409,'A run is already open here. Stop it before starting another.');
      const id=randomUUID();
      await c.query('INSERT INTO prospect_autopilot_runs(id,user_id,list_id,steps,approved_micros,note) VALUES($1,$2,$3,$4::jsonb,$5,$6)',
        [id,user.uid,listId,JSON.stringify(quoted.steps.map(s=>({action:s.action,price_micros:s.price_micros}))),approved,'Approved. The first step starts on the next worker pass.']);
      const run=(await c.query('SELECT * FROM prospect_autopilot_runs WHERE id=$1 FOR UPDATE',[id])).rows[0];
      await step(c,user,run);
      return {id,status:'running'};
    });
  }

  /** Stop a run. Work already queued is left to finish; nothing new is sent. */
  async function stop(user,id) {
    return tx(pool,async c=>{
      const run=(await c.query("SELECT * FROM prospect_autopilot_runs WHERE id=$1 AND user_id=$2 AND status IN ('running','paused') FOR UPDATE",[id,user.uid])).rows[0];
      if(!run)throw fail(404,'No open run with that id.');
      return finishRun(c,run,'stopped','Stopped. Steps already queued will finish; no further step was sent.');
    });
  }

  /** What the page shows: the open run here, with its progress and real spend. */
  async function state(user,{list_id=null}={}) {
    const listId=list_id?String(list_id):null;
    const run=(await pool.query(`SELECT * FROM prospect_autopilot_runs WHERE user_id=$1 AND COALESCE(list_id,'')=COALESCE($2,'')
      ORDER BY created_at DESC LIMIT 1`,[user.uid,listId])).rows[0];
    if(!run)return {run:null};
    const steps=Array.isArray(run.steps)?run.steps:[];
    const ids=Array.isArray(run.job_ids)?run.job_ids:[];
    const tasks=ids.length?(await pool.query(`SELECT status,count(*)::int AS n FROM prospect_tasks WHERE job_id=ANY($1::text[]) GROUP BY status`,[ids])).rows:[];
    return {run:{id:run.id,list_id:run.list_id,status:run.status,note:run.note,
      approved_micros:Number(run.approved_micros),reserved_micros:await spent(pool,run),
      step:run.cursor,total_steps:steps.length,
      // The step being worked is the one before the cursor: the cursor is where
      // the next one will come from.
      current:run.cursor>0&&steps[run.cursor-1]?{...steps[run.cursor-1],label:STEP_LABELS[steps[run.cursor-1].action]}:null,
      remaining:steps.slice(run.cursor).map(s=>({...s,label:STEP_LABELS[s.action]})),
      tasks:Object.fromEntries(tasks.map(r=>[r.status,r.n])),
      updated_at:run.updated_at}};
  }

  /**
   * Advance every run whose current step has finished.
   *
   * This is what replaces the open browser tab. One run per pass, oldest
   * first, so a long ladder cannot starve another operator's run.
   */
  async function tick() {
    return tx(pool,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(505011)');
      const run=(await c.query(`SELECT * FROM prospect_autopilot_runs WHERE status='running'
        ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
      if(!run)return false;
      if(!await settled(c,run)){
        // Still working. Touch it so the next pass looks at another run first.
        await c.query('UPDATE prospect_autopilot_runs SET updated_at=now() WHERE id=$1',[run.id]);
        return false;
      }
      return step(c,{uid:run.user_id},run);
    });
  }

  async function route(request,user) {
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(!user?.uid)throw fail(401,'Sign in.');
    if(path==='/api/prospect/autopilot'&&method==='GET'){
      const list=url.searchParams.get('list_id');
      return url.searchParams.get('plan')==='1'
        ? plan(user,{list_id:list,steps:url.searchParams.getAll('step').length?url.searchParams.getAll('step'):undefined})
        : state(user,{list_id:list});
    }
    if(path==='/api/prospect/autopilot'&&method==='POST'){
      let input;try{input=await request.json();}catch{throw fail(422,'Invalid JSON.');}
      return start(user,input);
    }
    const match=path.match(/^\/api\/prospect\/autopilot\/([^/]+)$/);
    if(match&&method==='DELETE')return stop(user,match[1]);
    throw fail(404,'Autopilot endpoint not found.');
  }

  return {route,plan,start,stop,state,tick};
}
