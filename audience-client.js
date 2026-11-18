import {audiences,broadStart,buildPlan,eventDraft,planText,safety,filterSource,exportSource,catalogVersion} from './audience-catalog.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null,copyAttempt=0;
function syncAudience(){const a=audiences.find(a=>a.id===$('audience').value);$('focusLabel').textContent=a.prompt;$('focus').placeholder=a.placeholder;$('reason').textContent=a.why;$('workplaceFields').hidden=a.id!=='workplace';}
function show(section){if(section==='setup'){copyAttempt++;$('copyStatus').textContent='';}$('setup').hidden=section!=='setup';$('plan').hidden=section!=='plan';$('stepLabel').textContent=section==='setup'?'Step 1 of 3 · Choose your audience':'Steps 2–3 · Search, review and upload';(section==='setup'?$('audience'):$('planTitle')).focus();}
$('audience').innerHTML=audiences.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');syncAudience();
$('audience').onchange=()=>{$('focus').value='';$('eventReviewed').checked=false;$('eventOutput').textContent='';syncAudience();};
$('setupForm').onsubmit=e=>{e.preventDefault();const a=audiences.find(a=>a.id===$('audience').value);const result=buildPlan({audience:a.id,location:$('location').value,[a.field]:$('focus').value,employeeCount:$('employeeCount').value,exclusion:$('exclusion').value,industry:a.id==='workplace'?$('industry').value:a.field==='industry'?$('focus').value:'',occupation:$('occupation').value});$('error').textContent=result.errors.join(' ');if(result.errors.length)return;
 current=result;$('eventTools').open=false;$('exclusionTools').open=!!result.exclusion;$('eventOutput').textContent='';for(const id of ['eventDescription','eventDate','eventSource'])$(id).value='';$('eventReviewed').checked=false;$('planName').textContent=result.audience;$('filterList').innerHTML=result.filters.length?result.filters.map(f=>`<li><h3>${esc(f.label)}</h3><p class="value">${esc(f.value)}</p><button class="secondary" type="button" data-copy-filter="${f.id}" aria-label="Copy proposed value for ${esc(f.label)}">Copy value</button><p>${esc(f.meaning)}</p><a href="${f.source}" target="_blank" rel="noopener noreferrer">Official filter reference ↗</a></li>`).join(''):'<li>'+esc(broadStart)+'</li>';$('planText').value=planText(result);$('exclusionValue').textContent=result.exclusion||'No exclusion proposed. Keep the baseline broad.';$('copyStatus').textContent='';$('valueFallback').hidden=true;$('valueText').value='';show('plan');};
$('back').onclick=()=>show('setup');$('refine').onclick=()=>{show('setup');$('refinement').hidden=false;};
$('copy').onclick=async()=>{if(!current)return;const snapshot=current,attempt=++copyAttempt;try{await navigator.clipboard.writeText(planText(snapshot));if(current!==snapshot||copyAttempt!==attempt)return;$('copyStatus').textContent='Search plan copied. No contacts or searches were sent.';}catch{if(current!==snapshot||copyAttempt!==attempt)return;$('planDetails').open=true;$('copyStatus').textContent='Copy unavailable. Select and copy the plan below.';$('planText').focus();$('planText').select();}};
$('safety').textContent=safety;$('filterSource').href=filterSource;$('exportSource').href=exportSource;$('catalogVersion').textContent=catalogVersion;

$('eventForm').onsubmit=e=>{e.preventDefault();const draft=eventDraft({event:$('eventDescription').value,date:$('eventDate').value,source:$('eventSource').value,reviewed:$('eventReviewed').checked});$('eventOutput').textContent=draft?[draft.text,draft.caution,'Evidence date: '+draft.date,'Supporting source: '+draft.source].join('\n\n'):'No opener generated. Provide a non-future valid event date, HTTPS source and your confirmation of person-level evidence. Missing evidence is not a reason to guess.';};

for(const id of ['eventDescription','eventDate','eventSource','eventReviewed'])$(id).oninput=()=>{$('eventOutput').textContent='';if(id!=='eventReviewed')$('eventReviewed').checked=false;};

$('filterList').onclick=async e=>{const id=e.target.closest?.('button[data-copy-filter]')?.dataset.copyFilter;const snapshot=current;const filter=snapshot?.filters.find(f=>f.id===id);if(!filter)return;const attempt=++copyAttempt;try{await navigator.clipboard.writeText(filter.value);if(current!==snapshot||copyAttempt!==attempt)return;$('copyStatus').textContent='Proposed value copied for '+filter.label+'. Paste only if the matching field accepts text; otherwise select its matching option.';}catch{if(current!==snapshot||copyAttempt!==attempt)return;$('valueFallback').hidden=false;$('valueText').value=filter.value;$('valueText').focus();$('valueText').select();$('copyStatus').textContent='Copy unavailable. Select the proposed value below. No search was run.';}};

// Explicit local download only: no persistence, provider access or contact export.
$('download').onclick=()=>{
 if(!current||$('plan').hidden)return;
 copyAttempt++;
 let url,link;
 try{
  url=URL.createObjectURL(new Blob([planText(current)],{type:'text/plain;charset=utf-8'}));
  link=document.createElement('a');link.href=url;link.download='prospectpilot-search-plan.txt';
  document.body.appendChild(link);link.click();
  $('copyStatus').textContent='Download requested. Check your browser downloads; no contacts were exported or searches run.';
 }catch{
  $('planDetails').open=true;$('planText').focus();$('planText').select();
  $('copyStatus').textContent='Download unavailable. Select and copy the plain-text plan below.';
 }finally{
  link?.remove();
  // Let the browser consume the object URL before releasing it.
  if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
};
