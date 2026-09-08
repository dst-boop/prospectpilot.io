import {randomUUID} from 'node:crypto';
export const SOURCES=['website','registry','license','professional','announcement','news','association','maps','sec','expertise','warn','mwbe'];
export function createResearchJobs({pool,dispatch=async()=>false,runSource}){
 async function enqueue(leadId,user,signature){
  const id=randomUUID();
  const result=await pool.query("INSERT INTO research_jobs(id,lead_id,user_id,user_email,identity_signature) VALUES($1,$2,$3,$4,$5) ON CONFLICT(lead_id,user_id) WHERE status IN ('queued','running') DO UPDATE SET updated_at=research_jobs.updated_at RETURNING id,status,next_source",[id,leadId,user.user_id,user.email,signature]);
  let dispatched=false;if(result.rows[0].id===id){try{dispatched=await dispatch();}catch{}}
  return {...result.rows[0],dispatched};
 }
 async function status(leadId,user){
  const row=(await pool.query('SELECT id,status,next_source,reports,created_at,updated_at FROM research_jobs WHERE lead_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[leadId,user.user_id])).rows[0];
  return row||null;
 }
 async function tick(){
  const token=randomUUID();
  const row=(await pool.query("UPDATE research_jobs SET status='running',lease_token=$1,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=(SELECT id FROM research_jobs WHERE available_at<=now() AND (status='queued' OR (status='running' AND lease_until<now())) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",[token])).rows[0];
  if(!row)return false;
  const started=performance.now();
  const source=SOURCES[row.next_source];let report,failed=false,terminal=false;
  try{report=await runSource(row,source);failed=['partial','failed'].includes(report.status);}catch(e){failed=true;terminal=[403,404,409].includes(e.status);report={source,status:'failed',limitations:[terminal?'Lead access or identity changed.':'Source request failed.']};}
  const {records,discovered_urls,signature,...summary}=report;
  report={...summary,saved_record_count:Array.isArray(records)?records.length:0,source,last_attempt_ms:Math.max(0,Math.round(performance.now()-started)),attempt_count:row.attempts+1};
  const retry=failed&&!terminal&&report.retryable!==false&&row.attempts<2;
  const reports=Array.isArray(row.reports)?row.reports:JSON.parse(row.reports);
  const next=retry?row.next_source:row.next_source+1;
  if(!retry)reports.push(report);
  const state=terminal?'failed':next===SOURCES.length?(reports.some(r=>['failed','partial'].includes(r.status))?'completed_with_gaps':'completed'):'queued';
  // Lease ownership prevents an expired worker from overwriting newer progress.
  await pool.query("UPDATE research_jobs SET status=$1,next_source=$2,attempts=$3,reports=$4::jsonb,lease_until=NULL,lease_token=NULL,available_at=now()+($5 * interval '1 second'),updated_at=now() WHERE id=$6 AND lease_token=$7",[state,next,retry?row.attempts+1:0,JSON.stringify(reports),retry?70:0,row.id,token]);
  return true;
 }
 return {enqueue,status,tick};
}
