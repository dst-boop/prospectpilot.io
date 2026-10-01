const $=id=>document.getElementById(id);
const labels={age:'Age 45–73',residence:'US residence',retirement:'Transfer eligibility',contact:'Contact route',net_worth:'Net worth ≥ $250K, home excluded'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=value=>String(value||'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
// Outcomes whose stored name does not read as English once the underscores are
// gone. The generic form covers the rest, so this stays a list of exceptions.
const outcomeLabels={became_client:'Became a client',no_show:'No-show',follow_up:'Follow-up agreed',not_interested:'Not interested',do_not_contact:'Do not contact',no_answer:'No answer',meeting_booked:'Meeting booked',meeting_held:'Meeting held'};
const outcomeLabel=value=>outcomeLabels[value]||title(value);
// Prospecting is over for both of these, so neither gets conversation prompts or
// an enrichment checkbox -- a client for the happier reason, but the same result.
const terminal=action=>action.bucket==='closed'||action.bucket==='clients';
const num=value=>Number(value||0).toLocaleString();
const dollars=value=>value==null?'—':Number(value).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
const safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const link=(url,text)=>safeURL(url)?`<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`:esc(text);
const badge=(value)=>`<span class="badge ${esc(value)}">${esc(title(value))}</span>`;
let offset=0,total=0,leads=[],runs=[],current=null,busy=false,pollTimer=null,sourceReadiness=null,leadLoadVersion=0,leadDetailVersion=0,runDetailVersion=0;
const selected=new Set();
async function request(path,options={}) {
  const response=await fetch(path,{...options,headers:{'content-type':'application/json',...options.headers}});
  if(response.status===401){location.href='/login?next='+encodeURIComponent(location.pathname+location.search);throw Error('Please sign in.');}
  if(!response.ok){let data;try{data=await response.json();}catch{}throw Object.assign(Error(data?.detail||`Request failed (${response.status}).`),{status:response.status});}
  return response.headers.get('content-type')?.includes('text/csv')?response.blob():response.json();
}
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function config(){return {employers:$('employers').value.split('\n').map(s=>s.trim()).filter(Boolean),websites:$('websites').value.split('\n').map(s=>s.trim()),states:$('states').value.split(/[,;\s]+/).filter(Boolean),sources:[...document.querySelectorAll('input[name="source"]:checked')].map(e=>e.value),max_companies:Number($('maxCompanies').value),daily_budget_micros:Math.round(Number($('budget').value)*1000000),location:$('campaignLocation').value.trim(),radius_miles:Number($('radiusMiles').value)||25,industries:splitTerms($('industries').value),titles:splitTerms($('titles').value),score_weights:{qualification:Number($('weightQualification').value),opportunity:Number($('weightOpportunity').value),confidence:Number($('weightConfidence').value),contactability:Number($('weightContactability').value)}};}
function splitTerms(value){return String(value||'').split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);}
function readSettings(value){const c=value.configuration||{};$('employers').value=(c.employers||[]).join('\n');$('websites').value=(c.websites||[]).join('\n');$('states').value=(c.states||[]).join(', ');$('maxCompanies').value=c.max_companies||10;$('campaignLocation').value=c.location||'';$('radiusMiles').value=c.radius_miles||25;$('industries').value=(c.industries||[]).join(', ');$('titles').value=(c.titles||[]).join(', ');const w={qualification:4,opportunity:3,confidence:1,contactability:2,...(c.score_weights||{})};$('weightQualification').value=w.qualification;$('weightOpportunity').value=w.opportunity;$('weightConfidence').value=w.confidence;$('weightContactability').value=w.contactability;$('budget').value=Number(value.daily_budget_micros||0)/1000000;$('dailyEnabled').checked=value.daily_enabled===true;$('dailyHour').value=value.daily_hour??13;document.querySelectorAll('input[name="source"]').forEach(e=>{e.checked=(c.sources||['public_web','sec','warn']).includes(e.value);});}
function renderSummary(s){
  $('metricSourced').textContent=num(s.totals.new_sourced);$('metricVerified').textContent=num(s.totals.newly_verified);$('metricCpl').textContent=dollars(s.totals.cost_per_verified);$('metricDaily').textContent=s.totals.verified_per_calendar_day.toFixed(1);$('costBasis').textContent=`${dollars(s.totals.cost_usd)} recorded · other costs may be unrecorded`;
  const max=Math.max(1,...s.daily.flatMap(d=>[d.new_sourced,d.newly_verified]));$('dailyChart').replaceChildren();
  for(const d of s.daily){const column=document.createElement('div');column.className='chart-column';column.title=`${d.day}: ${d.new_sourced} sourced, ${d.newly_verified} verified, ${d.imported} imported`;const bars=document.createElement('div');bars.className='bars';for(const key of ['new_sourced','newly_verified']){const bar=document.createElement('div');bar.className=key==='newly_verified'?'bar verified':'bar';bar.style.height=`${Math.max(1,Number(d[key])/max*100)}%`;bars.append(bar);}const date=document.createElement('span');date.textContent=d.day.slice(5);column.append(bars,date);$('dailyChart').append(column);}
  $('inventory').innerHTML=s.inventory.map(i=>`<span class="badge ${esc(i.status)}">${esc(title(i.status))} · ${num(i.n)}</span>`).join('')||'<span class="muted">Your research inventory is empty.</span>';
  $('catalog').textContent=s.catalog.plans?`${num(s.catalog.plans)} distinct employer plans · ${num(s.catalog.filings)} filing records · latest plan year ${s.catalog.latest_plan_year}. Catalog loaded ${new Date(s.catalog.imported_at).toLocaleDateString()}; filing dates are recorded separately. These are employer records, not individual leads.`:'Employer-plan catalog not loaded yet. Start with named employers or import your existing leads.';
  $('sourceMetrics').innerHTML=s.sources.length?'<div class="table-wrap"><table><thead><tr><th>Source</th><th>Acquired</th><th>Qualified</th><th>Yield</th><th>Attempts / gaps</th><th>Reserved provider cost</th><th>Provider cost / qualified</th></tr></thead><tbody>'+s.sources.map(row=>`<tr><td>${esc(title(row.source))}</td><td>${num(row.acquired)}</td><td>${num(row.qualified)}</td><td>${row.qualification_rate==null?"—":(row.qualification_rate*100).toFixed(1)+"%"}</td><td>${num(row.attempts)} / ${num(row.gaps)}</td><td>${dollars(row.cost_micros==null?null:Number(row.cost_micros)/1000000)}</td><td>${dollars(row.reserved_cost_per_qualified)}</td></tr>`).join('')+'</tbody></table></div>':'<p class="empty">Run an experiment to compare source yield and cost.</p>';
}
function renderLeads(data){leads=data.leads;total=data.total;
  $('leadTable').innerHTML=leads.length?'<table><thead><tr><th><input id="selectPage" type="checkbox" aria-label="Select this page"></th><th>Prospect</th><th>Quality</th><th>Evidence</th><th>Criteria: age / US / assets / contact / net worth</th><th>Next review</th></tr></thead><tbody>'+leads.map(({lead:l,quality:q})=>`<tr><td><input type="checkbox" data-select="${esc(l.id)}" aria-label="Select ${esc(l.first_name)} ${esc(l.last_name)}" ${selected.has(l.id)?'checked':''}></td><td><button class="person-button" data-lead="${esc(l.id)}">${esc(l.first_name)} ${esc(l.last_name)}</button><small>${esc(l.current_title||'Title unknown')} · ${esc(l.company||'Employer unknown')}</small></td><td>${badge(q.status)}</td><td>${num(q.score)} / 100</td><td><div class="criteria">${Object.entries(q.gates).map(([key,g])=>`<span class="criterion ${esc(g.state)}" title="${esc(labels[key]+': '+g.reason)}">${g.state==='confirmed'?'✓':g.state==='candidate'?'~':g.state==='failed'?'×':'?'}</span>`).join('')}</div></td><td>${esc(labels[q.gaps[0]]||'Complete')}</td></tr>`).join('')+'</tbody></table>':'<p class="empty">No records in this view. Import candidates or run discovery to begin.</p>';
  document.querySelectorAll('[data-lead]').forEach(e=>e.onclick=()=>openLead(e.dataset.lead));document.querySelectorAll('[data-select]').forEach(e=>e.onchange=()=>{e.checked?selected.add(e.dataset.select):selected.delete(e.dataset.select);});
  if($('selectPage'))$('selectPage').onchange=e=>{leads.forEach(({lead})=>e.target.checked?selected.add(lead.id):selected.delete(lead.id));renderLeads(data);};
  $('pageInfo').textContent=total?`${num(offset+1)}–${num(Math.min(offset+50,total))} of ${num(total)} · assessed filter, live evidence`:'0 records';$('previous').disabled=offset===0;$('next').disabled=offset+50>=total;
}
async function loadLeads(){
  const version=++leadLoadVersion,query=new URLSearchParams({offset,limit:50,compact:'true',status:$('qualityFilter').value,search:$('search').value});
  try{const data=await request('/api/lab/leads?'+query);if(version!==leadLoadVersion)return;if(offset>0&&!data.leads.length&&data.total>0){const lastOffset=Math.floor((data.total-1)/50)*50;if(lastOffset!==offset){offset=lastOffset;return loadLeads();}}if(!data.total)offset=0;renderLeads(data);}
  catch(error){if(version===leadLoadVersion)throw error;}
}
function sourceIssues(run){return (run.source_results||[]).filter(t=>(t.errors||[]).length).map(t=>`<p class="muted"><strong>${esc(title(t.source))}${t.company?' · '+esc(t.company):''}:</strong> ${esc(t.errors.join(' '))}</p>`).join('');}
function renderRuns(data){runs=data.runs;$('runs').innerHTML=runs.length?runs.map(r=>`<div class="run"><div><strong>${esc(title(r.kind))}</strong> ${badge(r.status)}<small>${esc(new Date(r.created_at).toLocaleString())} · ${num(r.finished_tasks)}/${num(r.tasks)} checks · ${num(r.new_people)} new people</small>${r.kind==='discovery'&&!Number(r.new_people)&&!['queued','running'].includes(r.status)?'<p>No people were added. Review the source results below; this does not establish that no prospects exist.</p>':''}${sourceIssues(r)}</div><button class="secondary" data-run="${esc(r.id)}">Details</button></div>`).join(''):'<p class="empty">No experiments yet.</p>';
  document.querySelectorAll('[data-run]').forEach(e=>e.onclick=()=>openRun(e.dataset.run));

}
async function refresh(showNotice=true){
  if(busy)return;busy=true;clearTimeout(pollTimer);$('refresh').disabled=true;
  const sections=[['Summary',()=>request('/api/lab/summary').then(renderSummary)],['Run history',()=>request('/api/lab/runs').then(renderRuns)],['Lead results',loadLeads],['Next actions',loadWorklist],['Possible duplicates',loadIdentityReviews]];
  try{
    const results=await Promise.allSettled(sections.map(([,load])=>load()));
    const failures=results.flatMap((r,i)=>r.status==='rejected'?[sections[i][0]+': '+r.reason.message]:[]);
    if(failures.length)notice('Some sections could not refresh. Successfully loaded results are shown. '+failures.join(' '),true);
    else if(showNotice)notice('Worklist updated. Open a prospect to review evidence and save the next step.');
  }finally{
    busy=false;$('refresh').disabled=false;
    if(!document.hidden&&runs.some(r=>['queued','running'].includes(r.status)))pollTimer=setTimeout(()=>refresh(false),8000);
  }
}
// Form 5500 benefit codes 2J and 2L mark a 401(k) feature and a 403(b) arrangement.
const planType=p=>{const c=p.benefit_codes||[],t=[c.includes('2J')&&'401(k)',c.includes('2L')&&'403(b)'].filter(Boolean);return t.length?' · '+t.join(' / '):'';};
async function openLead(id){
  const version=++leadDetailVersion;current=null;$('relatedPeople').replaceChildren();$('exploreRelated').disabled=true;clearConversation();$('saveReview').disabled=true;$('activityForm').hidden=true;$('conversationBrief').textContent='Loading the conversation brief…';$('contactActions').replaceChildren();$('activityHistory').replaceChildren();
  $('personName').textContent='Loading evidence…';$('personRole').textContent='';
  for(const name of ['personGates','personSources','personPlans','reviewError','forgetError'])$(name).textContent='';
  $('forgetLead').dataset.armed='';$('forgetLead').textContent='Delete this person';
  $('reviewForm').reset();$('observedAt').value=new Date().toISOString().slice(0,10);$('observedAt').max=$('observedAt').value;reviewFields();
  if(!$('detail').open)$('detail').showModal();
  try{const data=await request('/api/lab/leads/'+encodeURIComponent(id));if(version!==leadDetailVersion)return;current=data;renderPerson();$('saveReview').disabled=false;$('exploreRelated').disabled=false;await loadActivity(id,version);}
  catch(e){if(version===leadDetailVersion){$('personName').textContent='Evidence unavailable';$('conversationBrief').innerHTML=`<p role="alert">${esc(e.message)}</p><button id="retryEvidence" class="secondary">Retry evidence</button>`;$('retryEvidence').onclick=()=>{if(version===leadDetailVersion)return openLead(id);};}}
}
// Where sources disagree: the working value, and every value each source
// reported, with how strong that source is and when it was seen. Nothing is
// resolved here; the advisor reads the sources and records a review.
const fieldLabels={current_title:'Title',company:'Employer',city:'City',state:'State',country:'Country',estimated_age_range:'Age (reported)',email:'Email',phone:'Phone',mobile_phone:'Mobile phone',linkedin_url:'LinkedIn',company_website:'Company website'};
function conflictView(conflicts){if(!conflicts?.length)return '';return `<h3>Where sources disagree</h3>${conflicts.map(c=>`<div class="conflict"><p><strong>${esc(fieldLabels[c.field]||c.field)}</strong> · using <strong>${esc(c.working)}</strong></p><ul>${c.values.map(v=>`<li>${esc(v.value)} <small>${esc(v.source)} · ${esc(v.strength)} · seen ${esc(String(v.first_seen||'').slice(0,10))}${v.last_seen&&v.last_seen!==v.first_seen?` to ${esc(String(v.last_seen).slice(0,10))}`:''}</small></li>`).join('')}</ul></div>`).join('')}<small>The strongest source is used; among equals, the newest. Both are kept until you review them.</small>`;}
const scoreNames={qualification:'Qualification',opportunity:'Opportunity',confidence:'Data confidence',contactability:'Contactability'};
// Each score with the factors that earned it, so the number can be checked.
function renderScores(scores){
  if(!scores){$('priorityLine').textContent='';$('personScores').replaceChildren();return;}
  $('priorityLine').innerHTML=`<strong>Priority ${esc(scores.priority.score)}</strong> <span class="muted">= ${esc(scores.priority.formula)}</span>`;
  $('personScores').innerHTML=Object.keys(scoreNames).map(key=>{const s=scores[key];return `<details class="score-card"><summary><span>${esc(scoreNames[key])}</span><strong>${esc(s.score)}</strong><progress class="score-bar" max="100" value="${esc(s.score)}"></progress></summary><p class="muted">${esc(s.basis)}</p><ul>${s.factors.map(f=>`<li><span>${esc(f.label)}</span> <b>${esc(f.points)}/${esc(f.max)}</b>${f.detail?`<small class="muted">${esc(f.detail)}</small>`:''}</li>`).join('')}</ul></details>`;}).join('');
}
function renderPerson(){const {lead:l,quality:q}=current;renderScores(current.scores);$('personName').textContent=[l.first_name,l.last_name].join(' ');$('personRole').textContent=[l.current_title,l.company].filter(Boolean).join(' · ');$('personGates').innerHTML=Object.entries(q.gates).map(([f,g])=>`<div class="gate-card"><strong>${esc(labels[f])}</strong> ${badge(g.state)}<p>${esc(g.reason)}</p>${g.evidence?`<small>${esc(g.evidence.source)} · ${esc(g.evidence.observed_at.slice(0,10))}</small><p>${esc(g.evidence.note)}</p>${link(g.evidence.url,'Review original source')}`:''}</div>`).join('');
  const evidence=(l.evidence||[]).filter(e=>e.source_url).slice(-8);$('personSources').innerHTML=(q.warnings.length?`<p>${esc(q.warnings.join(' '))}</p>`:'')+'<h3>Available source material</h3>'+[l.linkedin_url?`<p>${link(l.linkedin_url,'LinkedIn profile')}</p>`:'',...evidence.map(e=>`<p>${link(e.source_url,e.source||'Source')} · ${esc(e.field)}: ${esc(e.value)} <small>${esc(e.source_date||'Publication date not supplied')} · reported, not independently verified</small></p>`)].join('')+conflictView(l.field_conflicts);
  $('personPlans').innerHTML=q.plans.length?q.plans.map(p=>`<p><strong>${esc(p.sponsor)}</strong><br>${esc(p.plan_name)} · ${esc(p.plan_year)}${planType(p)}<br>Plan assets: ${dollars(p.net_assets)} · Accounts: ${num(p.participants_with_balances)}<br>Average per account: ${dollars(p.average_account_balance)} · Separated participants with future benefits: ${p.separated_future_benefits==null?'Unknown':num(p.separated_future_benefits)}<small>Employer-level figures; not this person’s balance. ${esc(p.match_basis)}</small>${link(p.source_url,'DOL source')}</p>`).join(''):'<p>No exact employer-plan match found. Absence is not proof that a plan does not exist.</p>';
}
function reviewFields(){const field=$('reviewField').value;Object.keys(labels).forEach(f=>$(f+'Fields').hidden=f!==field||$('verdict').value!=='confirmed');}
$('reviewField').onchange=reviewFields;$('verdict').onchange=reviewFields;
$('reviewForm').onsubmit=async e=>{e.preventDefault();if(!current||$('saveReview').disabled)return;const reviewed=current,version=leadDetailVersion;$('saveReview').disabled=true;$('reviewError').textContent='';try{const field=$('reviewField').value;let value=null;
  if(field==='age')value={min:$('ageMin').value===''?null:Number($('ageMin').value),max:$('ageMax').value===''?null:Number($('ageMax').value)};
  if(field==='residence')value={country:$('residenceConfirmed').checked?'US':'',scope:'residence'};
  if(field==='retirement')value={account_type:$('accountType').value,route:$('distributionRoute').value,assets_confirmed:$('assetsConfirmed').checked,eligible_distribution:$('distributionConfirmed').checked,individual:$('assetsConfirmed').checked,plan_permission:$('planPermission').checked,destination_type:$('destinationType').value,evidence_basis:$('retirementBasis').value,consent_confirmed:$('retirementConsent').checked};
  if(field==='net_worth')value={lower_bound_usd:$('worthLower').value===''?null:Number($('worthLower').value),excludes_home:$('worthHome').checked,net_of_liabilities:$('worthLiabilities').checked,evidence_basis:$('worthBasis').value,consent_confirmed:$('worthConsent').checked};
  if(field==='contact')value={channel:$('contactChannel').value,address:$('contactAddress').value,identity_confirmed:$('contactConfirmed').checked};
  await request('/api/lab/leads/'+encodeURIComponent(reviewed.lead.id)+'/review',{method:'POST',body:JSON.stringify({field,verdict:$('verdict').value,value,source:$('reviewSource').value,url:$('reviewUrl').value,note:$('reviewNote').value,observed_at:$('observedAt').value,identity_signature:reviewed.quality.identity_signature})});if(version===leadDetailVersion){const data=await request('/api/lab/leads/'+encodeURIComponent(reviewed.lead.id));if(version===leadDetailVersion){current=data;renderPerson();await loadActivity(reviewed.lead.id,version,false);$('reviewError').textContent='Review saved.';}}await refresh(false);
  }catch(err){if(version===leadDetailVersion)$('reviewError').textContent=err.message;}finally{if(version===leadDetailVersion)$('saveReview').disabled=false;}};
$('runForm').onsubmit=async e=>{e.preventDefault();$('runButton').disabled=true;try{const result=await request('/api/lab/runs',{method:'POST',body:JSON.stringify({...config(),kind:'discovery',idempotency_key:crypto.randomUUID()})});notice(result.message||'Experiment queued.');await refresh(false);}catch(err){notice(err.message,true);}finally{$('runButton').disabled=false;}};
$('saveSettings').onclick=async()=>{try{await request('/api/lab/settings',{method:'PUT',body:JSON.stringify({configuration:config(),daily_enabled:$('dailyEnabled').checked,daily_hour:Number($('dailyHour').value)})});notice($('dailyEnabled').checked?'Daily experiment saved. The background recovery schedule must be running.':'Settings saved; automatic daily runs are paused.');}catch(e){notice(e.message,true);}};
$('assess').onclick=async()=>{if($('assess').disabled)return;$('assess').disabled=true;try{const result=await request('/api/lab/runs',{method:'POST',body:JSON.stringify({kind:'inventory',idempotency_key:crypto.randomUUID()})});notice(result.message);await refresh(false);}catch(e){notice(e.message,true);}finally{$('assess').disabled=false;}};
$('refresh').onclick=()=>workspaceReady?refresh():init();$('qualityFilter').onchange=()=>{offset=0;loadLeads().catch(e=>notice(e.message,true));};let searchTimer;$('search').oninput=()=>{offset=0;leadLoadVersion++;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{offset=0;loadLeads().catch(e=>notice(e.message,true));},300);};$('previous').onclick=()=>{offset=Math.max(0,offset-50);loadLeads().catch(e=>notice(e.message,true));};$('next').onclick=()=>{offset+=50;loadLeads().catch(e=>notice(e.message,true));};
$('export').onclick=async()=>{if(!selected.size)return notice('Select one or more research records to export.',true);try{const blob=await request('/api/lab/export',{method:'POST',body:JSON.stringify({ids:[...selected]})});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='prospectpilot-research.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Research export prepared. Excluded records were omitted.');}catch(e){notice(e.message,true);}};
$('importOpen').onclick=()=>{$('importError').textContent='';$('importDialog').showModal();};$('importForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const file=$('csvFile').files[0];if(!file||file.size>4000000)throw Error('Choose a CSV smaller than 4 MB.');const result=await request('/api/lab/import',{method:'POST',body:JSON.stringify({csv:await file.text(),source:$('importSource').value})});$('importDialog').close();notice(result.replayed?'This exact file was already imported.':`Imported ${result.result.added} new people; ${result.result.duplicates} duplicates, ${result.result.rejected} rejected, ${result.result.ambiguous} ambiguous matches. Claims remain unverified.`);await refresh(false);}catch(err){$('importError').textContent=err.message;}finally{button.disabled=false;}};
$('costOpen').onclick=()=>{if(!runs.length)return notice('Create an experiment or import first, then record its costs.',true);$('costRun').innerHTML=runs.map(r=>`<option value="${esc(r.id)}">${esc(title(r.kind)+' · '+new Date(r.created_at).toLocaleString())}</option>`).join('');$('costError').textContent='';$('costDialog').showModal();};$('costForm').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await request('/api/lab/costs',{method:'POST',body:JSON.stringify({run_id:$('costRun').value,category:$('costCategory').value,amount_micros:Math.round(Number($('costAmount').value)*1000000),note:$('costNote').value,idempotency_key:crypto.randomUUID()})});$('costDialog').close();await refresh();}catch(err){$('costError').textContent=err.message;}finally{e.submitter.disabled=false;}};
// A campaign by place shows the companies it found before the people, with why
// any were passed over, so an empty run explains itself.
function marketCard(t){const r=t.result||{};return `<div class="source-card"><h3>Companies near ${esc(t.payload.location||'')} · within ${num(t.payload.radius_miles)} miles</h3>${badge(t.status)}<p>${r.companies_found==null?'Not run yet.':`${num(r.companies_found)} found · ${num(r.companies_queued)} researched in this run${r.recently_researched?` · ${num(r.recently_researched)} researched in the last 7 days`:''}`}</p>${r.industry_labels?.length?`<p><small>${esc(r.industry_labels.join(', '))}${r.area?' · '+esc(r.area):''}</small></p>`:''}<p>${esc((r.errors||[]).join(' '))}</p>${r.attribution?`<p><small>${esc(r.attribution)}</small></p>`:''}</div>`;}
// The run as a funnel: each stage's count, a bar scaled to the first stage,
// and the reasons the rest stopped there.
function funnelView(f){if(!f?.stages?.length)return '';const top=Math.max(1,...f.stages.map(s=>Number(s.count)||0));return `<section class="funnel" aria-label="Where this run's candidates went"><h3>Where candidates went</h3><ol>${f.stages.map(s=>`<li><div class="funnel-row"><span class="funnel-label">${esc(s.label)}</span><strong>${num(s.count)}</strong></div><progress class="funnel-bar" max="${top}" value="${Number(s.count)||0}" aria-hidden="true"></progress>${s.detail?`<small>${esc(s.detail)}</small>`:''}${(s.lost||[]).length?`<ul class="funnel-lost">${s.lost.map(l=>`<li>${num(l.count)} · ${esc(l.reason)}</li>`).join('')}</ul>`:''}</li>`).join('')}</ol></section>`;}
function companyList(companies){if(!companies?.length)return '';return `<details class="company-list"><summary>${num(companies.length)} companies found</summary><div class="table-wrap"><table><thead><tr><th>Company</th><th>Where</th><th>Miles</th><th>Researched</th></tr></thead><tbody>${companies.map(c=>`<tr><td>${c.website?link(c.website,c.name):esc(c.name)}</td><td>${esc(c.location)}</td><td>${c.distance_miles==null?'—':esc(Number(c.distance_miles).toFixed(1))}</td><td>${c.queued?'Yes':esc(c.skip_reason||'No')}</td></tr>`).join('')}</tbody></table></div></details>`;}
async function openRun(id){const version=++runDetailVersion;$('runDetails').textContent='Loading source results…';if(!$('runDialog').open)$('runDialog').showModal();try{const d=await request('/api/lab/runs/'+encodeURIComponent(id));if(version!==runDetailVersion)return;$('runDetails').innerHTML=`<p>${badge(d.run.status)} · ${esc(new Date(d.run.created_at).toLocaleString())}</p>`+funnelView(d.funnel)+companyList(d.companies)+d.tasks.map(t=>t.source==='market'?marketCard(t):`<div class="source-card"><h3>${esc(title(t.source))} · ${esc(t.payload.company||'Saved lead assessment')}</h3>${badge(t.status)}<p>${t.source==='inventory'?(Number.isInteger(t.result?.assessed)?`${num(t.result.assessed)} assessed · ${num(t.result.failed)} failed · ${num(t.result.skipped)} skipped · ${num(t.result.remaining)} not attempted`:'Assessment counts were not recorded for this run.'):`${num(t.result?.added)} new · ${num(t.result?.duplicates)} existing · ${num(t.result?.rejected)} rejected · ${num(t.result?.ambiguous)} ambiguous${t.result?.off_target?` · ${num(t.result.off_target)} other titles not kept`:''}`}</p><p>${esc((t.result?.errors||[]).join(' '))}</p>${(t.result?.documents||[]).slice(0,8).map(doc=>`<p>${link(doc.url||doc.source_url,'Original source')} <small>${esc(doc.scope||'')} · ${esc(doc.source_date||'date unknown')}</small></p>`).join('')}</div>`).join('')+`<h3>Recorded costs</h3>`+(d.costs.length?d.costs.map(c=>`<p>${esc(title(c.category))}: ${dollars(Number(c.amount_micros)/1000000)} · ${esc(c.basis)}<small>${esc(c.note)}</small></p>`).join(''):'<p>No costs recorded. This does not mean total operating cost is zero.</p>');}catch(e){if(version!==runDetailVersion)return;$('runDetails').innerHTML='<p role="alert">'+esc(e.message)+'</p>'+sourceIssues(runs.find(r=>r.id===id)||{})+'<button id="retryRun" class="secondary">Retry source results</button>';$('retryRun').onclick=()=>{if(version===runDetailVersion)return openRun(id);};}}
// Deleting is permanent, so it takes a second click.
$('forgetLead').onclick=async()=>{const button=$('forgetLead');if(!current||button.disabled)return;const version=leadDetailVersion,id=current.lead.id;
  if(!button.dataset.armed){button.dataset.armed='1';button.textContent='Click again to delete permanently';return;}
  button.disabled=true;$('forgetError').textContent='';try{await request('/api/lab/leads/'+encodeURIComponent(id),{method:'DELETE'});selected.delete(id);if(version===leadDetailVersion)$('detail').close();notice('Deleted. Nothing about this person remains except a do-not-call block, if one existed.');await refresh(false);}
  catch(err){if(version===leadDetailVersion)$('forgetError').textContent=err.message;else notice(err.message,true);}finally{button.disabled=false;}};
$('detail').addEventListener('close',()=>{leadDetailVersion++;current=null;clearConversation();$('saveReview').disabled=true;});
$('runDialog').addEventListener('close',()=>{runDetailVersion++;});
document.querySelectorAll('[data-close]').forEach(e=>e.onclick=()=>$(e.dataset.close).close());
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(pollTimer);}else if(workspaceReady)refresh(false);else init();});
// The daily dial limit rolls over in the advisor's own day, and the browser is
// the only thing here that knows which day that is. Reconciled on every load so
// an advisor who moves is corrected without being asked, and without having to
// find a setting: the field is detected, not typed. Failure is silent because
// nothing the advisor did caused it and the stored zone still works.
async function syncTimeZone(){
  const detected=Intl.DateTimeFormat().resolvedOptions().timeZone;
  if(!detected)return;
  const stored=(await request('/api/lab/advisor-profile')).time_zone;
  if(stored!==detected)await request('/api/lab/advisor-profile',{method:'POST',body:JSON.stringify({time_zone:detected})});
}
let workspaceReady=false,initializing=false;
async function init(){
 if(initializing)return;
 initializing=true;$('refresh').disabled=true;$('refresh').textContent='Loading workspace…';
 $('runButton').disabled=true;$('saveSettings').disabled=true;
 notice('Loading your workspace…');
 try{const [me,settings,sources]=await Promise.all([request('/api/lab/me'),request('/api/lab/settings'),request('/api/lab/sources')]);$('account').textContent=me.name||me.email;document.querySelectorAll('[data-legacy-tool]').forEach(link=>link.hidden=me.capabilities?.legacy_tools!==true);readSettings(settings);sourceReadiness=sources.readiness;const searchOption=document.querySelector('input[name="source"][value="web_search"]');searchOption.disabled=!sourceReadiness.web_search;if(searchOption.disabled)searchOption.checked=false;$('searchReadiness').textContent=sources.readiness.web_search?'Licensed search: '+(Number(sources.readiness.web_search_query_cost_micros)/1000000).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:6})+' per query, at most one query per employer. The daily budget is enforced before each request.':'Licensed web search is unavailable and has been deselected. Free company research and authorized CSV imports remain available.';$('sourceCatalog').innerHTML=sources.sources.map(s=>`<div class="source-card"><h3>${esc(s.name)} ${badge(s.mode)}</h3><p>${esc(s.supports)}</p><p>${esc(s.limit)}</p>${s.url?link(s.url,'Source information'):''}</div>`).join('');workspaceReady=true;$('runButton').disabled=false;$('saveSettings').disabled=false;await syncTimeZone().catch(()=>{});await refresh();const requestedLead=new URL(location.href).searchParams.get('lead');if(requestedLead&&requestedLead.length<=100)await openLead(requestedLead);
 }catch(e){
  notice('Workspace setup could not load. Use Retry workspace to reconnect. '+e.message,true);
  $('dailyTitle').textContent='Your workspace could not load.';
  $('dailyDescription').textContent='Retry workspace to load your saved settings and next actions.';
  $('workList').innerHTML='<div class="work-empty">Workspace unavailable. Use Retry workspace above.</div>';
 }finally{
  initializing=false;$('refresh').disabled=false;$('refresh').textContent=workspaceReady?'Refresh workspace':'Retry workspace';
 }
}
let activityLoadVersion=0;
function clearConversation(){
  currentWorkflow=null;$('activityForm').hidden=true;
  $('draftPanel').hidden=true;$('draftSubject').value='';$('draftBody').value='';$('draftCopied').textContent='';
  $('contactActions').replaceChildren();
}
async function loadActivity(id,version,reset=true){
  if(version!==leadDetailVersion)return;
  const serial=++activityLoadVersion;clearConversation();
  $('conversationBrief').textContent='Loading the conversation brief…';
  try{
    const data=await request('/api/lab/leads/'+encodeURIComponent(id)+'/activity');
    if(version!==leadDetailVersion||serial!==activityLoadVersion)return;
    currentWorkflow=data;$('activityForm').hidden=false;
    if(reset){if(labels[data.action.field]){$('reviewField').value=data.action.field;reviewFields();}prepareActivity();}
    else renderConversation();
  }catch(e){
    if(version!==leadDetailVersion||serial!==activityLoadVersion)return;
    clearConversation();
    $('conversationBrief').innerHTML=`<p role="alert">The conversation brief could not load. ${esc(e.message)}</p><button id="retryActivity" class="secondary">Retry conversation brief</button>`;
    $('retryActivity').onclick=()=>{if(version===leadDetailVersion)return loadActivity(id,version,reset);};
  }
}
let workLoading=false,workOffset=0,workTotal=0,workRequest=0,currentWorkflow=null,activityKey='',activitySaving=false;
const workSelected=new Set();
const when=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'';
const emptyMessages={resting:['Nobody is resting right now.','A prospect rests after six touches in 45 days, or after a sequence ends without a reply. They return automatically when the rest period is over.'],today:['Your next actions will appear here.','Import an existing provider CSV or discover people at named employers. Each prospect will have a specific evidence task.'],due:['You’re caught up on due follow-ups.','Scheduled follow-ups return here when their saved time arrives.'],ready:['No prospects are ready for an initial conversation yet.','Review age, US residence, and contact ownership first. Missing retirement and financial evidence remains a conversation topic, not a verified claim.'],review:['No evidence reviews in this view.','Try another worklist or import research candidates.'],enrich:['No missing-contact records in this view.','Contact details that are present but unverified appear under Evidence to review.'],scheduled:['No follow-ups scheduled.','Open a prospect, record the outcome, and choose a next follow-up time.'],meetings:['No meetings saved yet.','Choose Meeting booked on a prospect and record the agreed time.'],clients:['No clients recorded yet.','Choose Became a client on a prospect you have spoken with. They leave the worklist and are counted on the scoreboard.'],closed:['No closed or excluded records.','Contact restrictions and reviewed disqualifications remove records from active work. Clients are listed separately.'],all:['No prospects found.','Import a CSV or change your search.']};
function selectionLabel(){$('workSelection').textContent=`${workSelected.size} selected`;$('enrichExport').disabled=workLoading||!workSelected.size;}
function loadingWorklist(){
  workLoading=true;
  $('startNext').disabled=true;$('startNext').onclick=null;
  $('workPrevious').disabled=true;$('workNext').disabled=true;
  $('workList').setAttribute('aria-busy','true');
  $('workList').innerHTML='<div class="work-empty" role="status">Loading prospects…</div>';
  $('workPageInfo').textContent='Loading…';selectionLabel();
}
// Records that may be the same person, held for the advisor to decide.
function personCard(p,label){
  const lines=[[p.title,p.company].filter(Boolean).join(' · '),p.location,p.email,p.phone].filter(Boolean);
  return `<div class="identity-person"><p class="eyebrow">${esc(label)}</p><b>${esc(p.name||'Unnamed')}</b>${lines.map(l=>`<span>${esc(l)}</span>`).join('')}${p.sources?.length?`<small class="muted">From ${esc(p.sources.join(', '))}</small>`:''}</div>`;
}
function identityItem(r){
  const probable=r.kind==='probable';
  const matches=r.matches.map(m=>`<div class="identity-match">${personCard(m,'Existing record')}<button data-review="${esc(r.id)}" data-decision="${probable?'same':'merge'}" data-target="${esc(m.id)}">${probable?'Same person — combine':'Add to this record'}</button></div>`).join('');
  const others=r.held_elsewhere?`<p class="muted">${num(r.held_elsewhere)} matching record${r.held_elsewhere===1?' is':'s are'} held by another advisor.</p>`:'';
  const rest=probable?`<button class="secondary" data-review="${esc(r.id)}" data-decision="separate">Different people — keep both</button>`
    :`<button class="secondary" data-review="${esc(r.id)}" data-decision="save_new">Save as a new person</button><button class="secondary" data-review="${esc(r.id)}" data-decision="discard">Discard this arrival</button>`;
  return `<li class="identity-item"><p><b>${esc(r.reason)}</b></p><div class="identity-compare">${personCard(r.arrival,probable?'Newer record':'Arriving')}<div class="identity-matches">${matches}${others}</div></div><div class="actions">${rest}</div></li>`;
}
async function loadIdentityReviews(){
  const {total,reviews}=await request('/api/lab/identity-reviews');
  $('identityPanel').hidden=!total;
  $('identityCount').textContent=total>reviews.length?`Showing the newest ${num(reviews.length)} of ${num(total)}.`:'';
  $('identityList').innerHTML=reviews.map(identityItem).join('');
}
$('identityList').onclick=async event=>{
  const button=event.target.closest('button[data-review]');if(!button)return;
  const buttons=button.closest('li').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
  try{
    await request('/api/lab/identity-reviews/'+encodeURIComponent(button.dataset.review),{method:'POST',body:JSON.stringify({decision:button.dataset.decision,target_id:button.dataset.target||''})});
    notice({merge:'Added to the existing record.',same:'Combined into one record.',save_new:'Saved as a new person.',separate:'Kept as two people.',discard:'Discarded.'}[button.dataset.decision]);
    await Promise.all([loadIdentityReviews(),loadWorklist(),loadLeads()]);
  }catch(e){notice(e.message,true);buttons.forEach(b=>b.disabled=false);}
};
async function loadWorklist(){
  const serial=++workRequest;loadingWorklist();
  try{
  const data=await request('/api/lab/worklist?'+new URLSearchParams({view:$('workView').value,search:$('workSearch').value,offset:workOffset,limit:24}));if(serial!==workRequest)return;
  if(workOffset>0&&workOffset>=data.total){workOffset=0;return loadWorklist();}
  loadScoreboard().catch(()=>{});
  workTotal=data.total;$('workDue').textContent=num(data.counts.due);$('workReady').textContent=num(data.counts.ready);$('workConversations').textContent=num(data.activity.conversations);$('workMeetings').textContent=num(data.activity.meetings);
  if(data.dials){$('workDials').textContent=num(data.dials.remaining);$('workDialsNote').textContent=data.dials.reason;}
  const first=data.items.find(item=>!terminal(item.action));
  const emptyWorkspace=data.counts.all===0&&!$('workSearch').value;
  $('dailyTitle').textContent=emptyWorkspace?'Start with the contacts you have.':first?'Your next step is ready.':'You’re caught up in this view.';
  $('dailyDescription').textContent=first?`${first.action.label}: ${first.lead.first_name||''} ${first.lead.last_name||''}. ${first.action.reason}`:emptyWorkspace?'Import an authorized CSV, or choose contacts from your directory. We’ll organize the next steps here.':'Choose another queue, search for a prospect, or bring in a new list.';
  $('startNext').textContent=first?($('workView').value==='today'&&!$('workSearch').value?'Start next prospect →':'Open first result →'):'Import a contact list →';
  $('startNext').disabled=false;
  $('startNext').onclick=first?()=>openLead(first.lead.id):()=>$('quickImport').click();
  const [emptyTitle,emptyBody]=emptyMessages[$('workView').value];
  for(const item of data.items)if(terminal(item.action))workSelected.delete(item.lead.id);
  $('workList').innerHTML=data.items.length?data.items.map(({lead:l,quality:q,scores:s,action:a})=>`<article class="work-card"><label class="select-lead"><input type="checkbox" data-work-select="${esc(l.id)}" aria-label="Select ${esc(l.first_name)} ${esc(l.last_name)} for enrichment" ${workSelected.has(l.id)?'checked':''} ${terminal(a)?'disabled':''}></label><div><button class="person-button" data-work-open="${esc(l.id)}">${esc(l.first_name)} ${esc(l.last_name)}</button><p class="muted">${esc(l.current_title||'Title unknown')} · ${esc(l.company||'Employer unknown')}</p>${l.location?`<p class="muted">${esc(l.location)}</p>`:''}${badge(q.status)} <span class="muted">${Object.values(q.gates).filter(g=>g.state==='confirmed').length}/5 criteria reviewed</span>${s?`<p class="score-line"><b>Priority ${esc(s.priority.score)}</b> <span class="muted">Qualification ${esc(s.qualification)} · Opportunity ${esc(s.opportunity)} · Confidence ${esc(s.confidence)} · Contact ${esc(s.contactability)}</span></p>`:''}</div><div class="work-reason"><p class="next-step">${esc(a.label)}</p><p class="muted">${esc(a.reason)}</p>${a.due_at?`<p class="due-label">${esc(when(a.due_at))}</p>`:''}${a.cadence?`<p class="muted">${esc(a.cadence.touches.count)}/${esc(a.cadence.touches.cap)} touches · ${esc(a.cadence.step?a.cadence.step.label:a.cadence.status)}</p>`:''}${l.notes?`<p class="muted">Last note: ${esc(l.notes.split('\n').filter(Boolean).at(-1)?.slice(0,240))}</p>`:''}</div><button class="secondary work-open" data-work-open="${esc(l.id)}">Open brief</button></article>`).join(''):`<div class="work-empty"><h3>${esc($('workSearch').value?'No matching prospects.':emptyTitle)}</h3><p class="muted">${esc($('workSearch').value?'Try a different full name or employer.':emptyBody)}</p></div>`;
  document.querySelectorAll('[data-work-open]').forEach(e=>e.onclick=()=>openLead(e.dataset.workOpen));
  document.querySelectorAll('[data-work-select]').forEach(e=>e.onchange=()=>{e.checked?workSelected.add(e.dataset.workSelect):workSelected.delete(e.dataset.workSelect);selectionLabel();});
  $('workPageInfo').textContent=(data.total?`${num(workOffset+1)}–${num(Math.min(workOffset+24,data.total))} of ${num(data.total)}`:'0 prospects')+(data.truncated?` · Showing a working set of ${num(data.scanned)} / ${num(data.scope_total)}; search to narrow.`:'');
  $('workPrevious').disabled=!workOffset;$('workNext').disabled=workOffset+24>=workTotal;selectionLabel();return true;
  }catch(error){
    if(serial!==workRequest)return;
    workSelected.clear();
    $('dailyTitle').textContent='Your worklist could not load.';
    $('dailyDescription').textContent='Retry to load the current queue before opening your next prospect.';
    $('workList').innerHTML=`<div class="work-empty" role="alert"><h3>Could not load prospects.</h3><p>${esc(error.message)}</p><button id="retryWorklist" class="secondary">Retry</button></div>`;
    $('workPageInfo').textContent='Results unavailable';
    $('retryWorklist').onclick=async()=>{try{const loaded=await loadWorklist();if(loaded)notice('Worklist updated.');}catch(e){notice(e.message,true);}};
    throw error;
  }finally{
    if(serial===workRequest){workLoading=false;$('workList').setAttribute('aria-busy','false');selectionLabel();}
  }
}
// What the prospect actually did. The record stores the channel, so the history
// should not say they called when they sent an email.
const inboundLabel=channel=>({phone:'they called',email:'they emailed',linkedin:'they replied on LinkedIn'})[channel]||'they contacted me';
function renderConversation(){
  const a=currentWorkflow.action,q=current.quality;
  const discovery=['Walk me through where your retirement savings live today — current plan, any former employer plans, IRAs, anything else.',
    'When you left a previous employer, what did you decide to do with that plan — or is it still sitting there?',
    'What does retirement look like for you — age, lifestyle, anything you are already planning around?',
    'Have you worked with an advisor before? What worked, and what did not?',
    'If we found something worth fixing, what would you want to happen next?'];
  const questions={age:'What is your current age?',residence:'Which state do you currently live in?',retirement:'Do you still have a retirement account from a previous employer, or another retirement account you would like reviewed?',contact:'What is the best way to contact you for an agreed follow-up?',net_worth:'If you want a planning review, would you be comfortable sharing an authorized financial summary?'};
  $('conversationBrief').innerHTML=`<p><strong>${esc(a.label)}</strong></p><p>${esc(a.reason)}</p>${a.due_at?`<p>Saved time: <strong>${esc(when(a.due_at))}</strong></p>`:''}${cadenceLine(currentWorkflow.cadence)}<p>${q.status==='verified'?'All five criteria have reviewed evidence. Ask about goals and whether the person wants help; qualification is not a recommendation to transfer assets.':'Still to establish: '+esc(q.gaps.map(k=>labels[k]).join(' · '))+'.'}</p>`+(terminal(a)?'':`<details${a.bucket==='meetings'?' open':''}><summary>${a.bucket==='meetings'?'Questions for the review':'Questions for an appropriate conversation'}</summary><ul>${(a.bucket==='meetings'?discovery:q.gaps.length?q.gaps.map(g=>questions[g]):['What would you like to improve about your current retirement plan?','Would a 15-minute introduction be useful?']).map(v=>`<li>${esc(v)}</li>`).join('')}</ul><p>${a.bucket==='meetings'?'All open-ended. Ask, then write down what you hear — answers do not verify a criterion until its evidence review is saved below.':'Answers do not verify a criterion until its evidence review is saved below.'}</p></details>`);
  if(labels[a.field]&&!terminal(a)){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Review '+labels[a.field];button.onclick=()=>{$('reviewField').value=a.field;reviewFields();$('reviewForm').scrollIntoView({behavior:'smooth',block:'start'});$('reviewField').focus({preventScroll:true});};$('conversationBrief').append(button);}
  renderDraft();
  $('contactActions').replaceChildren();const c=a.contact;
  if(c){const anchor=document.createElement('a');anchor.className='contact-link';anchor.textContent=c.channel==='phone'?`Call ${c.address}`:c.channel==='email'?`Email ${c.address}`:'Open reviewed LinkedIn profile';anchor.href=c.channel==='phone'?'tel:'+c.address:c.channel==='email'?'mailto:'+encodeURIComponent(c.address):safeURL(c.address);if(c.channel==='linkedin'){anchor.target='_blank';anchor.rel='noopener noreferrer';}$('contactActions').append(anchor);}else $('contactActions').textContent='No reviewed contact shortcut available. Review the contact evidence below.';
  $('activityHistory').innerHTML=(current.lead.notes?`<p class="existing-notes">${esc(current.lead.notes)}</p>`:'')+(currentWorkflow.activities.length?currentWorkflow.activities.map(a=>`<div class="activity-entry"><strong>${esc(outcomeLabel(a.outcome))}</strong>${a.direction==='inbound'?` <span class="inbound-tag">${esc(inboundLabel(a.channel))}</span>`:''}${a.logged_by?` <span class="by-tag">${esc(a.logged_by)}</span>`:''} · ${esc(when(a.created_at))}<p>${esc(a.note)}</p>${a.next_at?`<small>Next: ${esc(when(a.next_at))}</small>`:''}</div>`).join(''):'<p>No outcomes recorded yet.</p>');
}
let scoreboardRequest=0;
async function loadScoreboard(){
  const serial=++scoreboardRequest;
  $('scoreboard').setAttribute('aria-busy','true');
  $('scoreboard').innerHTML='<p role="status">Loading funnel summary…</p>';
  $('scoreboardBasis').textContent='';
  try{
  const b=await request('/api/lab/scoreboard?days=30');
  if(serial!==scoreboardRequest)return;
  // A rate with nothing in its denominator is not zero, it is unmeasured. Say
  // so rather than printing a 0% nobody earned.
  $('scoreboard').innerHTML=b.measured.map(m=>{
    // Some figures have no defensible target, and printing "target null" beside
    // one -- or marking it met -- would invent the benchmark it is missing.
    const rated=m.target!==null&&m.target!==undefined;
    const unmet=rated&&m.value!==null&&m.value<m.target;
    const suffix=m.unit==='%'?'%':'';
    return `<article${rated&&!unmet?' class="highlight"':''}><span>${esc(m.label)}</span>`+
      `<strong>${m.value===null?'—':esc(m.value)+suffix}</strong>`+
      `<small>${m.value===null?'Nothing recorded yet':esc(m.basis)}${rated?' · target '+esc(m.target)+suffix:''}`+
      `${b.scopes&&m.scope?' · '+esc(b.scopes[m.scope]):''}</small></article>`;
  }).join('');
  const gaps=[b.untouched?`${num(b.untouched)} prospect${b.untouched===1?'':'s'} added and never touched`:'',b.meetings.note].filter(Boolean);
  $('scoreboardBasis').textContent=[b.basis,...gaps].join(' ');
  }catch(error){
    if(serial!==scoreboardRequest)return;
    $('scoreboard').innerHTML='<div role="alert"><p>Funnel summary could not load. '+esc(error.message)+'</p><button id="retryScoreboard" class="secondary" type="button">Retry funnel summary</button></div>';
    $('scoreboardBasis').textContent='Figures are unavailable until the summary reloads.';
    $('retryScoreboard').onclick=()=>loadScoreboard();
  }finally{
    if(serial===scoreboardRequest)$('scoreboard').setAttribute('aria-busy','false');
  }
}
function cadenceLine(c){
  if(!c)return '';
  const t=c.touches,used=`${num(t.count)} of ${num(t.cap)} touches used in the last ${num(t.window_days)} days`;
  const hold=c.status==='resting'||c.status==='capped'?`<p class="cadence-hold">${esc(c.reason)}</p>`
    :c.step&&!c.step.ready?`<p class="cadence-hold">${esc(c.step.hold||c.reason)}</p>`:'';
  // Says whose touches spent the budget. Without it a prospect rests for reasons
  // the advisor looking at them cannot see.
  const shared=c.shared?`<p class="cadence-shared">${esc(c.shared.reason)}</p>`:'';
  return `<p class="muted">${esc(used)}.</p>${shared}${hold}`;
}
function renderDraft(){
  const d=currentWorkflow.draft,panel=$('draftPanel');
  panel.hidden=!d;
  if(!d)return;
  const step=currentWorkflow.cadence?.step;
  $('draftHeading').textContent=step?`Your next touch — ${step.label.toLowerCase()}`:'Your next touch';
  $('draftMeta').textContent=[d.channel==='phone'?'Voicemail script':d.channel==='linkedin'?'Connection note':'Email',
    step?.due_at?'due '+when(step.due_at):''].filter(Boolean).join(' · ');
  $('draftSubjectLabel').hidden=!d.subject;
  $('draftSubject').value=d.subject||'';
  $('draftBody').value=d.body;
  $('draftNeeds').textContent=d.needs.length?`Add ${d.needs.join(', ')} to personalize this further.`:'';
  $('draftCopied').textContent='';
  const mail=d.channel==='email'&&!!reviewedEmail();
  $('draftOutlook').hidden=!mail;$('draftMailApp').hidden=!mail;
  $('draftLinkedIn').hidden=d.channel!=='linkedin';
  $('draftLinkedIn').disabled=!reviewedLinkedIn();
  $('draftHelp').textContent=d.channel==='linkedin'
    ? 'Review the note, copy it, then open the verified profile and send on LinkedIn. Return here to record what happened. Opening a profile never records a touch.'
    : 'Review the draft before sending with your own tools. Nothing is sent from here. Record the outcome below afterwards.';
  if(d.channel==='linkedin'&&!reviewedLinkedIn())$('draftNeeds').textContent+=' Review the LinkedIn contact evidence below before opening a messaging shortcut, and check any outreach hold in the brief.';
}
function reviewedLinkedIn(){
  const c=currentWorkflow?.action?.contact,step=currentWorkflow?.cadence?.step;
  if(currentWorkflow?.draft?.channel!=='linkedin'||!step?.ready||c?.channel!=='linkedin')return '';
  try{const u=new URL(c.address);return u.protocol==='https:'&&['linkedin.com','www.linkedin.com'].includes(u.hostname)&&!u.username&&!u.password&&/^\/in\/[^/]+\/?$/.test(u.pathname)?u.origin+u.pathname:'';}catch{return '';}
}
$('draftLinkedIn').onclick=()=>{
  const url=reviewedLinkedIn();if(!url)return;
  window.open(url,'_blank','noopener,noreferrer');
  $('activityChannel').value='linkedin';
  $('draftCopied').textContent='LinkedIn profile opened. Send there if appropriate, then return and record the outcome. Nothing has been logged yet.';
};
$('draftLogOutcome').onclick=()=>{$('activityForm').scrollIntoView({behavior:'smooth',block:'start'});$('activityOutcome').focus({preventScroll:true});};
// Outreach leaves from the advisor's own mailbox, never from here. The firm's
// Microsoft tenant allows no third-party sign-in, and what an advisor sends
// must be archived by the firm, so Outlook on the web opens with the message
// filled in and the advisor's own press of Send is the only send. The address
// is the reviewed contact route only, never an unreviewed imported one.
const OUTLOOK='https://outlook.office.com';
const query=fields=>Object.entries(fields).filter(([,v])=>v).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
function reviewedEmail(){const c=currentWorkflow?.action?.contact;return c?.channel==='email'&&/^[^\s@"<>]+@[^\s@"<>]+$/.test(c.address||'')?c.address:'';}
function outlookMail({to,subject,body}){return OUTLOOK+'/mail/deeplink/compose?'+query({to,subject,body});}
function mailApp({to,subject,body}){return 'mailto:'+encodeURIComponent(to)+'?'+query({subject,body});}
function outlookInvite({to,subject,body,start,end}){return OUTLOOK+'/calendar/deeplink/compose?'+query({path:'/calendar/action/compose',rru:'addevent',subject,body,startdt:start.toISOString(),enddt:end.toISOString(),to});}
// A plain appointment, not an iTIP request: a request needs an ORGANIZER, and
// ProspectPilot does not know which mailbox the advisor sends from. Outlook
// opens it on the advisor's calendar, they add the guest and send it from
// there. Invite in Outlook is the path that fills the guest in.
function inviteICS({subject,body,start,end,uid}){
  const text=v=>String(v).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
  const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ProspectPilot//EN','BEGIN:VEVENT','UID:'+uid+'@prospectpilot.io',
    'DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(start),'DTEND:'+stamp(end),'SUMMARY:'+text(subject),'DESCRIPTION:'+text(body),
    'STATUS:CONFIRMED','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n';
}
function draftMessage(){const d=currentWorkflow?.draft,to=reviewedEmail();return d?.channel==='email'&&to?{to,subject:d.subject||'',body:d.body}:null;}
$('draftOutlook').onclick=()=>{const m=draftMessage();if(!m)return;window.open(outlookMail(m),'_blank','noopener');$('draftCopied').textContent='Opened in Outlook. Press Send there, then record the outcome below.';};
$('draftMailApp').onclick=()=>{const m=draftMessage();if(m)location.href=mailApp(m);};
function meetingInvite(){
  if(!current||!$('activityNext').value){$('inviteNote').textContent='Set the meeting time above first.';return null;}
  const start=new Date($('activityNext').value);if(!Number.isFinite(start.getTime())){$('inviteNote').textContent='Set the meeting time above first.';return null;}
  const end=new Date(start.getTime()+Number($('inviteLength').value||30)*60000),name=[current.lead.first_name,current.lead.last_name].filter(Boolean).join(' ');
  return {to:reviewedEmail(),name,subject:'Our conversation',body:'Looking forward to speaking with you.',start,end,uid:crypto.randomUUID()};
}
$('inviteOutlook').onclick=()=>{const m=meetingInvite();if(!m)return;window.open(outlookInvite(m),'_blank','noopener');$('inviteNote').textContent=(m.to?'':'No reviewed email address, so add the guest in Outlook. ')+'Press Send in Outlook, then save the outcome here.';};
$('inviteICS').onclick=()=>{const m=meetingInvite();if(!m)return;const url=URL.createObjectURL(new Blob([inviteICS(m)],{type:'text/calendar'})),a=document.createElement('a');a.href=url;a.download='meeting-invite.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('inviteNote').textContent='Invite downloaded. Open it in Outlook, add the guest'+(m.to?' ('+m.to+')':'')+' and send it from there.';};
$('draftCopy').onclick=async()=>{
  const d=currentWorkflow?.draft;if(!d)return;
  const text=[d.subject?'Subject: '+d.subject:'',d.body].filter(Boolean).join('\n\n');
  try{await navigator.clipboard.writeText(text);$('draftCopied').textContent='Copied.';}
  catch{$('draftBody').select();$('draftCopied').textContent='Select the message and copy it.';}
};
function activityFields(){const outcome=$('activityOutcome').value,closed=['not_interested','do_not_contact','reopen','became_client'].includes(outcome);$('nextAtLabel').hidden=closed;
  const message=$('activityChannel').value==='linkedin';
  const noAnswer=$('noAnswerOutcome');
  const connected=$('connectedOutcome');
  if(noAnswer)noAnswer.textContent=message?'Message / request sent — no reply yet':'No answer';
  if(connected)connected.textContent=message?'Reply received':'Connected';
  // A no-show needs a new time; a meeting that happened may or may not produce one.
  $('activityNext').required=['follow_up','meeting_booked','no_show'].includes(outcome);$('activityNext').disabled=closed;
  // The channel stays available for "not interested" and "do not contact": a
  // call that ended in either still put volume on the number and still spends
  // the day's dials. Reopening a record reaches nobody, and a client is a
  // status the already-logged conversation produced rather than a contact of
  // its own -- giving either a channel would describe an approach that is not
  // in the log.
  const reached=!['reopen','became_client'].includes(outcome);
  $('channelLabel').hidden=!reached;$('activityChannel').disabled=!reached;
  // Only a conversation can be inbound. A missed call from them is not an event,
  // and a meeting is mutual by the time it is held.
  const inbound=['connected','follow_up','meeting_booked'].includes(outcome);
  $('inboundField').hidden=!inbound;if(!inbound)$('activityInbound').checked=false;
  $('inviteField').hidden=outcome!=='meeting_booked';$('inviteNote').textContent='Uses the time above. Outlook opens with the invite filled in, and it is sent only when you press Send there.';}
function prepareActivity(){renderConversation();$('activityForm').reset();$('activityError').textContent='';activityKey=crypto.randomUUID();
  // The sequence already knows which channel this touch uses and when the next
  // one falls due, so neither is the advisor's to work out.
  const step=currentWorkflow.cadence?.step,planned=currentWorkflow.schedules?.at;
  if(step?.channel)$('activityChannel').value=step.channel;
  // Left blank when the plan has no next step. Inventing tomorrow would save a
  // follow-up date on someone who has just been capped, and a saved date makes
  // them look due rather than resting.
  if(planned){const next=new Date(planned);$('activityNext').value=new Date(next.getTime()-next.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  else $('activityNext').value='';
  activityFields();}
$('activityOutcome').onchange=activityFields;
$('activityChannel').onchange=activityFields;
function activityConflict(id,version,message='This prospect changed. Your note and selected outcome are kept. Refresh the prospect, review the latest activity, then save again.'){
 $('activityError').innerHTML=`${esc(message)} <button type="button" class="secondary" id="reloadActivity">Refresh prospect and keep note</button>`;
 $('reloadActivity').onclick=async()=>{
  if(version!==leadDetailVersion||activitySaving)return;
  activitySaving=true;$('saveActivity').disabled=true;$('reloadActivity').disabled=true;
  try{
   const data=await request('/api/lab/leads/'+encodeURIComponent(id));
   if(version!==leadDetailVersion)return;
   current=data;renderPerson();
   $('activityError').textContent='Your note and selected outcome were kept. Review the latest activity before saving.';
   await loadActivity(id,version,false);
  }catch(error){if(version===leadDetailVersion)activityConflict(id,version,'Could not refresh this prospect. Your note is still here. '+error.message);}
  finally{activitySaving=false;if(version===leadDetailVersion)$('saveActivity').disabled=false;}
 };
}
$('activityForm').onsubmit=async e=>{e.preventDefault();if(!current||!currentWorkflow||activitySaving)return;const version=leadDetailVersion,id=current.lead.id,outcome=$('activityOutcome').value;activitySaving=true;$('saveActivity').disabled=true;$('activityError').textContent='';try{
  const result=await request('/api/lab/leads/'+encodeURIComponent(current.lead.id)+'/activity',{method:'POST',body:JSON.stringify({outcome:$('activityOutcome').value,channel:$('activityChannel').disabled?null:$('activityChannel').value,note:$('activityNote').value,next_at:$('activityNext').disabled||!$('activityNext').value?null:new Date($('activityNext').value).toISOString(),direction:$('activityInbound').checked&&!$('inboundField').hidden?'inbound':'outbound',signature:currentWorkflow.action.signature,idempotency_key:activityKey})});
  if(result.saved){if(['not_interested','do_not_contact','became_client'].includes(outcome)){workSelected.delete(id);selectionLabel();}if(version===leadDetailVersion)$('detail').close();notice('Outcome saved. Your follow-up and worklist are updated.');await refresh(false);}
}catch(err){if(version===leadDetailVersion){if(err.status===409)activityConflict(current.lead.id,version);else $('activityError').textContent=err.message;}else notice(err.message,true);}finally{activitySaving=false;$('saveActivity').disabled=false;}};
$('quickImport').onclick=()=>location.assign('/prospect?import=1');
// Find new prospects starts from a rollover playbook: pick who, say where, go.
// The full discovery form stays one click away for a custom search.
let playbooks=null;
function openCustomSearch(){$('researchTools').open=true;$('runForm').scrollIntoView({behavior:'smooth',block:'start'});$('employers').focus({preventScroll:true});}
function selectedPlaybook(){const id=document.querySelector('input[name="playbook"]:checked')?.value;return (playbooks||[]).find(p=>p.id===id)||null;}
function playbookNeeds(){const p=selectedPlaybook(),place=p?.needs==='place';$('playbookPlaceLabel').hidden=!place;$('playbookStatesLabel').hidden=place;$('playbookPlace').required=place;}
async function openPlaybooks(){
  $('playbookError').textContent='';$('playbookStates').value=$('states').value;$('playbookPlace').value=$('campaignLocation').value||$('profileMetro').value||'';
  if(!$('playbookDialog').open)$('playbookDialog').showModal();
  if(!playbooks){try{playbooks=(await request('/api/lab/playbooks')).playbooks;}catch(e){$('playbookChoices').innerHTML=`<p role="alert">${esc(e.message)}</p>`;return;}}
  $('playbookChoices').innerHTML=playbooks.map((p,i)=>`<label class="playbook-choice"><input type="radio" name="playbook" value="${esc(p.id)}"${i?'':' checked'}><span><strong>${esc(p.label)}</strong><small>${esc(p.accounts.join(', '))} · ${esc(p.triggers.join(', '))}</small><span class="muted">${esc(p.description)}</span></span></label>`).join('');
  document.querySelectorAll('input[name="playbook"]').forEach(e=>e.onchange=playbookNeeds);playbookNeeds();
}
$('findProspects').onclick=openPlaybooks;
$('playbookCustom').onclick=()=>{$('playbookDialog').close();openCustomSearch();};
$('playbookForm').onsubmit=async e=>{e.preventDefault();const p=selectedPlaybook();if(!p||$('playbookStart').disabled)return;$('playbookStart').disabled=true;$('playbookError').textContent='';
  try{const result=await request('/api/lab/runs',{method:'POST',body:JSON.stringify({kind:'discovery',playbook:p.id,states:p.needs==='place'?[]:$('playbookStates').value.split(/[,;\s]+/).filter(Boolean),location:p.needs==='place'?$('playbookPlace').value.trim():'',max_companies:Number($('maxCompanies').value)||10,idempotency_key:crypto.randomUUID()})});
    $('playbookDialog').close();notice(result.message||`${p.label}: search queued. New prospects appear in your worklist as they are found.`);await refresh(false);}
  catch(err){$('playbookError').textContent=err.message;}finally{$('playbookStart').disabled=false;}};
$('workView').onchange=()=>{workOffset=0;loadWorklist().catch(e=>notice(e.message,true));};let workSearchTimer;
$('workSearch').oninput=()=>{workRequest++;loadingWorklist();clearTimeout(workSearchTimer);workSearchTimer=setTimeout(()=>{workOffset=0;loadWorklist().catch(e=>notice(e.message,true));},250);};
$('workPrevious').onclick=()=>{workOffset=Math.max(0,workOffset-24);loadWorklist().catch(e=>notice(e.message,true));};$('workNext').onclick=()=>{workOffset+=24;loadWorklist().catch(e=>notice(e.message,true));};
$('enrichExport').onclick=async()=>{if(workLoading||!workSelected.size)return;try{const blob=await request('/api/lab/enrichment-export',{method:'POST',body:JSON.stringify({ids:[...workSelected]})});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='prospectpilot-enrichment.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Provider matching CSV prepared. Import the enriched results to merge them into your existing prospects.');}catch(e){notice(e.message,true);}};
$('profileOpen').onclick=async()=>{
  $('profileError').textContent='';
  try{const p=await request('/api/lab/advisor-profile');
    $('profileName').value=p.name||'';$('profileFirm').value=p.firm||'';$('profilePhone').value=p.phone||'';$('profileMetro').value=p.metro||'';
    // Read from the browser rather than asked for: it is a fact this page knows,
    // and the browser is the current answer. Preferring a previously saved zone
    // here would strand an advisor who moved, because the field is readonly and
    // there would be no way left to correct it.
    $('profileZone').value=Intl.DateTimeFormat().resolvedOptions().timeZone||p.time_zone||'UTC';
  }catch(e){$('profileError').textContent=e.message;}
  $('profileDialog').showModal();
};
$('profileForm').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;$('profileError').textContent='';
  try{await request('/api/lab/advisor-profile',{method:'POST',body:JSON.stringify({display_name:$('profileName').value,firm:$('profileFirm').value,phone:$('profilePhone').value,metro:$('profileMetro').value,time_zone:$('profileZone').value})});
    $('profileDialog').close();notice('Saved. Drafted messages will sign themselves with these details.');
  }catch(err){$('profileError').textContent=err.message;}finally{button.disabled=false;}
};


$('exploreRelated').onclick=async()=>{
  if(!current)return;
  const id=current.lead.id,version=leadDetailVersion;
  $('exploreRelated').disabled=true;$('relatedPeople').textContent='Looking for shared professional context…';
  try{
    const result=await request('/api/lab/leads/'+encodeURIComponent(id)+'/related');
    if(version!==leadDetailVersion)return;
    if(result.status==='missing_context'){
      $('relatedPeople').innerHTML='<p><strong>More profile context is needed.</strong> This record has no saved employer or job title, so a related-person search could not run. A LinkedIn URL alone does not give ProspectPilot access to this person’s network.</p><p>Import an authorized profile update with an employer or role and a matching LinkedIn URL or other stable identifier, then try again. LinkedIn connections, activity and messages have not been searched.</p>';
      return;
    }
    $('relatedPeople').innerHTML=result.people.length?result.people.map(p=>`<div class="source-card"><h4>${esc([p.first_name,p.last_name].filter(Boolean).join(' '))}</h4><p>${esc([p.current_title,p.company].filter(Boolean).join(' · '))}</p><p>${esc(p.reasons.join(' · '))}</p><small>${esc(p.basis)}${p.sources.length?' · '+esc(p.sources.join(', ')):''}</small><p>${esc(p.next_step)}</p><button type="button" class="secondary" data-related="${esc(p.id)}">Review & prepare next step</button></div>`).join(''):'<p>No shared employer or role was found among your eligible saved people. Use “Expand beyond saved people” below to grow your workspace.</p>';
    if(result.truncated)$('relatedPeople').innerHTML+='<p>Showing a limited set of matches. Use the directory to explore more saved people.</p>';
    document.querySelectorAll('[data-related]').forEach(button=>button.onclick=()=>openLead(button.dataset.related));
  }catch(error){if(version===leadDetailVersion)$('relatedPeople').textContent=error.message+' Select Find related people to retry.';}
  finally{if(version===leadDetailVersion)$('exploreRelated').disabled=false;}
};

init();
