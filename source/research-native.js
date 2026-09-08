(() => {
const button=document.getElementById('autoResearch'),progress=document.getElementById('autoProgress'),results=document.getElementById('autoResults'),select=document.getElementById('lead');
let running=false;

async function renderProfile(id){
 const response=await fetch('/api/research/records?lead_id='+encodeURIComponent(id));
 if(!response.ok)return;
 const data=await response.json();if(select.value!==id)return;
 const root=document.getElementById('researchPicture');root.replaceChildren();const p=data.profile;if(!p)return;
 const add=(tag,value,parent=root)=>{const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;};
 add('h2','Research overview');
 add('p',[p.identity.name,p.identity.role,p.identity.company,p.identity.location].join(' · '));
 add('small','Saved lead details · '+p.source_pages+' distinct source pages');
 for(const f of p.facts||[])add('p',f.field.replaceAll('_',' ')+': '+f.value+' ('+f.scope+' evidence)');
 for(const field of p.conflicts||[])add('p','Conflicting evidence: '+field.replaceAll('_',' ')+'. Compare the original sources below.');
 for(const g of p.groups){add('h3',g.label);for(const r of g.records){const item=add('p',r.excerpt+' ');let url;try{url=new URL(r.url);}catch{continue;}if(!['http:','https:'].includes(url.protocol))continue;const link=add('a','View evidence',item);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';add('small',(r.source_date?'Source date: '+r.source_date:'Source date unknown')+' · '+r.status.replaceAll('_',' '),item);}}
 for(const gap of [...p.gaps,...p.warnings])add('p',gap);
}

function render(reports){
 results.replaceChildren();
 for(const report of reports){const row=document.createElement('p');row.textContent=report.label+': '+({matched:'Matching evidence saved',partial:'Limited coverage / source unavailable',no_match:'No matching evidence found',failed:'Could not complete'}[report.status]||report.status)+(report.cached?' (saved check)':'');results.append(row);const detail=document.createElement('small');detail.textContent=[report.coverage,...(report.limitations||[])].filter(Boolean).join(' ');results.append(detail);}
}
let watch=0;
async function monitor(id,version){
 let lastRevision=null;
 for(;;){
  if(version!==watch||select.value!==id)return;
  const r=await fetch('/api/research/job?lead_id='+encodeURIComponent(id));if(!r.ok)throw Error('Could not check research progress.');
  const {job}=await r.json();if(version!==watch||select.value!==id)return;
  if(!job){button.disabled=false;progress.textContent='Ready to research this lead.';return;}
  render((job.reports||[]).map(x=>({...x,label:x.source})));
  const active=['queued','running'].includes(job.status);button.disabled=active;
  progress.textContent=active?'Research '+job.status+': '+job.next_source+' of 12 checks completed. You can close this page.':'Research '+job.status.replaceAll('_',' ')+'. Review the evidence and gaps below.';
  const revision=JSON.stringify([job.id,job.updated_at,job.next_source,job.status]);
  if(revision!==lastRevision){await renderProfile(id);if(version!==watch||select.value!==id)return;if(typeof loadRecords==='function')await loadRecords();lastRevision=revision;}
  if(!active)return;
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
}
button.onclick=async()=>{
 const id=select.value;if(!id){progress.textContent='Choose a lead first.';return;}
 if(running)return;running=true;button.disabled=true;const version=++watch;
 try{
  const r=await fetch('/api/research/job',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lead_id:id})});
  const d=await r.json();if(!r.ok)throw Error(d.detail||'Could not queue research.');
  if(!d.job.dispatched)progress.textContent='Research saved in the queue. Waiting for the background worker.';
  await monitor(id,version);
 }catch(e){progress.textContent=e.message;button.disabled=false;}
 finally{if(version===watch)running=false;}
};
select.addEventListener('change',async()=>{
 const version=++watch;running=false;results.replaceChildren();button.disabled=false;
 if(!select.value)return;const id=select.value;
 try{await renderProfile(id);await monitor(id,version);}catch(e){if(version===watch)progress.textContent=e.message;}
});
})();
