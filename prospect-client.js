import {initProviderUI} from './prospect-jobs-client.js';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(matchMedia('(max-width:700px)').matches)$('filterPanel').open=false;
let importIntentHandled=false,offset=0,contacts=[],lists=[],searches=[],loadVersion=0,loadingContacts=false,directoryError='';const selected=new Set();
const notice=(message,error=false)=>{if(directoryError&&!error){message+=' Contacts could not refresh: '+directoryError+' Use Retry contacts below.';error=true;}$('notice').textContent=message;$('notice').classList.toggle('error',error);};
async function api(path,body,method=body?'POST':'GET'){
 const active=lists.find(l=>l.id===$('listFilter').value);
 const importTarget=body?.list_id&&lists.find(l=>l.id===body.list_id);
 if(/^import(?:\/preview)?$/.test(path)&&importTarget?.role&&importTarget.role!=='owner')path='lists/'+encodeURIComponent(importTarget.id)+'/'+path;
 else if(active?.role&&active.role!=='owner'&&(/^(contacts(?:[/?]|$)|export$)/.test(path)))path='lists/'+encodeURIComponent(active.id)+'/'+path;
 const r=await fetch('/api/prospect/'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(r.status===401){location.href='/login?next='+encodeURIComponent(location.pathname+location.search);throw Error('Sign in to continue.');}if(!r.ok){let data;try{data=await r.json();}catch{}throw Error(data?.detail||'Request failed.');}return r.headers.get('Content-Type')?.includes('text/csv')?r.blob():r.json();}
const filters=()=>({...Object.fromEntries(new FormData($('filters'))),list_id:$('listFilter').value});
function selection(){ $('selectedCount').textContent=selected.size+' selected';for(const id of ['export','addListOpen','removeList','sendToWorklist'])$(id).disabled=loadingContacts||!selected.size;
 const active=lists.find(l=>l.id===$('listFilter').value),shared=active?.role&&active.role!=='owner';
 if($('checkMenu'))$('checkMenu').hidden=!!shared;
 if(shared){$('addListOpen').disabled=true;$('sendToWorklist').disabled=true;if(active.role==='viewer')$('removeList').disabled=true;}
}
function failedDirectory(message,retry=load){
 directoryError=message;contacts=[];selected.clear();loadingContacts=false;selection();
 $('table').innerHTML='<div class="empty" role="alert"><h2>Contacts could not load</h2><p>'+esc(message)+'</p><button id="retryContacts" type="button">Retry contacts</button></div>';
 $('retryContacts').onclick=()=>retry();$('total').textContent='Results unavailable';$('pageLabel').textContent='Results unavailable';$('previous').disabled=true;$('next').disabled=true;notice(message,true);
}
async function load(){const version=++loadVersion,recovering=!!directoryError;directoryError='';loadingContacts=true;selection();$('table').setAttribute('aria-busy','true');$('table').innerHTML='<div class="empty" role="status">Loading contacts…</div>';$('total').textContent='Loading contacts…';$('pageLabel').textContent='Loading…';$('previous').disabled=true;$('next').disabled=true;try{const data=await api('contacts?'+new URLSearchParams({...filters(),offset,limit:50,compact:'true'}));if(version!==loadVersion)return;if(offset>0&&!data.contacts.length&&data.total>0){const lastOffset=Math.floor((data.total-1)/50)*50;if(lastOffset!==offset){offset=lastOffset;return load();}}if(!data.total)offset=0;contacts=data.contacts;$('total').textContent=data.total.toLocaleString()+' contacts in your directory';$('resultTitle').textContent=lists.find(l=>l.id===$('listFilter').value)?.name||'All contacts';$('removeList').hidden=!$('listFilter').value;
 $('table').innerHTML=contacts.length?'<table><thead><tr><th><input id="selectPage" type="checkbox" aria-label="Select this page"></th><th>Contact</th><th>Company</th><th>Email</th><th>Phone</th><th>Location</th><th>Preparation</th></tr></thead><tbody>'+contacts.map(c=>`<tr><td><input type="checkbox" data-id="${esc(c.id)}" aria-label="Select ${esc(c.first_name+' '+c.last_name)}" ${selected.has(c.id)?'checked':''}></td><td><button class="text-button contact-name" data-contact="${esc(c.id)}">${esc(c.first_name+' '+c.last_name)}</button><small>${esc(c.title||'Title not provided')}</small>${c.linkedin_url?`<a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>`:''}${c.suppressed?'<span class="badge suppressed">Suppressed</span>':''}</td><td data-label="Company">${esc(c.company||'—')}<small>${esc(c.industry)}</small></td><td data-label="Email">${esc(c.email||'No email')}<br><span class="badge ${esc(c.email_status)}">${esc(c.email_status)}</span></td><td data-label="Phone">${esc(c.phone||'No phone')}<br><span class="badge">${esc(c.quality?.phones?.primary_blocked?'Do not call':c.phone_status)}</span>${c.quality?.phones?.mobile_do_not_call===true?'<small>Mobile: do not call</small>':''}</td><td data-label="Location">${esc([c.city,c.state,c.country].filter(Boolean).join(', ')||'—')}<small>${esc(c.source)}</small></td><td><button class="secondary" data-prepare="${esc(c.id)}" ${lists.find(l=>l.id===$('listFilter').value)?.role==='viewer'?'disabled':''}>Prepare contact</button>${c.preparation?'<small>Brief saved</small>':''}</td></tr>`).join('')+'</tbody></table>':'<div class="empty"><h2>No contacts match this view</h2><p>Import an authorized contact list or clear your filters to try again.</p><div class="actions"><button type="button" id="emptyContactImport">Import contacts</button><button type="button" id="clearContactFilters" class="secondary">Clear filters</button></div></div>';
 if(!contacts.length){$('emptyContactImport').onclick=()=>$('importDialog').showModal();$('clearContactFilters').onclick=()=>{$('listFilter').value='';$('filters').reset();};}
 document.querySelectorAll('[data-prepare]').forEach(el=>el.onclick=()=>showContact(el.dataset.prepare,true));
 document.querySelectorAll('[data-contact]').forEach(el=>el.onclick=()=>showContact(el.dataset.contact));document.querySelectorAll('[data-id]').forEach(e=>e.onchange=()=>{e.checked?selected.add(e.dataset.id):selected.delete(e.dataset.id);selection();});if($('selectPage')){$('selectPage').checked=contacts.every(c=>selected.has(c.id));$('selectPage').onchange=e=>{contacts.forEach(c=>e.target.checked?selected.add(c.id):selected.delete(c.id));document.querySelectorAll('[data-id]').forEach(el=>el.checked=e.target.checked);selection();};}
 $('pageLabel').textContent=data.total?`${offset+1}–${Math.min(offset+50,data.total)} of ${data.total}`:'0 contacts';$('previous').disabled=offset===0;$('next').disabled=offset+50>=data.total;loadingContacts=false;selection();if(recovering)notice('Contacts updated.');return true;
 }catch(e){if(version===loadVersion)failedDirectory(e.message);return false;}finally{if(version===loadVersion){loadingContacts=false;$('table').setAttribute('aria-busy','false');selection();}}}
async function loadLists(){lists=(await api('lists')).lists;for(const id of ['listFilter','importList','addList']){const value=$(id).value;$(id).innerHTML=(id==='addList'?'':`<option value="">${id==='listFilter'?'All contacts':'No list'}</option>`)+lists.filter(l=>id==='listFilter'||(id==='importList'?l.role!=='viewer':!l.role||l.role==='owner')).map(l=>`<option value="${esc(l.id)}">${esc(l.name)} (${l.contacts})${l.shared_by?' — shared by '+esc(l.shared_by)+' · '+esc(l.role):''}</option>`).join('');if([...$(id).options].some(o=>o.value===value))$(id).value=value;}}
async function loadSearches(){
 searches=(await api('saved-searches')).searches;
 $('searches').innerHTML=searches.length?searches.map(s=>`<div class="saved-search"><button class="text-button" data-search="${esc(s.id)}">${esc(s.name)}</button><button class="text-button" data-delete-search="${esc(s.id)}" aria-label="Delete saved search ${esc(s.name)}">Delete</button></div>`).join(''):'<p class="muted">Save filters you use often.</p>';
 document.querySelectorAll('[data-search]').forEach(el=>el.onclick=()=>{const f=searches.find(s=>s.id===el.dataset.search).filters;$('filters').reset();for(const [key,value] of Object.entries(f)){const input=$('filters').elements.namedItem(key);if(input)input.value=value;}const more=document.querySelector('.more-filters');if(more&&[...more.querySelectorAll('input,select')].some(field=>field.value))more.open=true;$('listFilter').value=f.list_id||'';offset=0;selected.clear();load();});
 document.querySelectorAll('[data-delete-search]').forEach(el=>el.onclick=async()=>{el.disabled=true;try{await api('saved-searches/'+encodeURIComponent(el.dataset.deleteSearch),undefined,'DELETE');await loadSearches();notice('Saved search deleted.');}catch(e){el.disabled=false;notice(e.message,true);}});
}
$('filters').onsubmit=e=>{e.preventDefault();offset=0;selected.clear();load();};$('filters').onreset=()=>setTimeout(()=>{offset=0;selected.clear();load();},0);$('listFilter').onchange=()=>{offset=0;selected.clear();load();};$('previous').onclick=()=>{offset=Math.max(0,offset-50);load();};$('next').onclick=()=>{offset+=50;load();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
for(const [button,dialog] of [['importOpen','importDialog'],['newListOpen','listDialog'],['saveSearchOpen','searchDialog']])$(button).onclick=()=>$(dialog).showModal();
$('addListOpen').onclick=()=>{if(!lists.length)return notice('Create a list first.');$('addDialog').showModal();};
async function submit(event,errorId,operation){event.preventDefault();const b=event.submitter;b.disabled=true;$(errorId).textContent='';try{await operation();}catch(e){$(errorId).textContent=e.message;}finally{b.disabled=false;}}
$('listForm').onsubmit=e=>submit(e,'listError',async()=>{await api('lists',{name:$('listName').value});await loadLists();$('listDialog').close();$('listForm').reset();notice('List created.');});
$('searchForm').onsubmit=e=>submit(e,'searchError',async()=>{await api('saved-searches',{name:$('searchName').value,filters:filters()});await loadSearches();$('searchDialog').close();$('searchForm').reset();notice('Search saved.');});
$('addForm').onsubmit=e=>submit(e,'addError',async()=>{await api('lists/'+encodeURIComponent($('addList').value)+'/members',{ids:[...selected]});await loadLists();$('addDialog').close();notice('Selected contacts added to the list.');});
$('removeList').onclick=async()=>{try{await api('lists/'+encodeURIComponent($('listFilter').value)+'/members',{ids:[...selected]},'DELETE');selected.clear();await loadLists();await load();notice('Contacts removed from this list; they remain in your directory.');}catch(e){notice(e.message,true);}};
let lastImportReport=null,importRevision=0;
const importMessage=r=>(r.preview?'Preview — nothing saved. ':'')+(r.replayed?'This exact import was already processed. ':'')+`${r.added} new · ${r.duplicates} matched · ${r.conflicts} identity conflicts · ${r.rejected} rejected. `+(Number.isInteger(r.field_reviews)?`${r.field_reviews} matched row${r.field_reviews===1?'':'s'} with field differences${r.preview?' to review after import':''}.`:'Field-difference counts were not recorded for this older import.');
function renderImportReport(r,{archived=false}={}){
 if(!archived){$('continueImport').hidden=!!r.preview||!(r.added+r.duplicates);lastImportReport=r;$('downloadImportReport').hidden=!r.rows?.length;}
 $(archived?'archivedImportResult':'importResult').textContent=importMessage(r);
 const ignored=r.ignored_columns?.length?`<p><strong>Ignored columns:</strong> ${r.ignored_columns.map(esc).join(', ')}. Imported status claims are never accepted as verification.</p>`:'';
 const rows=r.rows||[];
 $(archived?'archivedImportBody':'importPreview').innerHTML=ignored+(rows.length?'<p class="muted">First 50 rows shown. Download the row report for all results.</p><div class="table-wrap"><table><thead><tr><th>Source line</th><th>Contact</th><th>Result</th><th>Review notes</th></tr></thead><tbody>'+rows.slice(0,50).map(row=>`<tr><td>${row.row}</td><td>${esc(row.name||'—')}</td><td>${esc(row.status)}</td><td>${esc(row.message)}${!r.preview&&row.contact_id&&row.review_fields?.length?`<button type="button" class="text-button" data-review-import="${esc(row.contact_id)}">Review contact differences</button>`:''}${(row.issues||[]).map(issue=>`<small>${esc(issue.message)}</small>`).join('')}</td></tr>`).join('')+'</tbody></table></div>':(r.errors||[]).map(row=>`<p>Line ${row.row}: ${esc(row.message)}</p>`).join(''));
 $(archived?'archivedImportBody':'importPreview').querySelectorAll('[data-review-import]').forEach(button=>button.onclick=async()=>{
  for(const id of ['importDialog','archivedImportDialog','qualityDialog'])if($(id)?.open)$(id).close();
  await showContact(button.dataset.reviewImport);
  $('reviewContactConflicts')?.click();
 });
}
// A ZoomInfo export becomes one step: drop the file anywhere on this page (or
// choose it), the format is recognised from its headers, a list named after the
// file is offered, and the preview runs. Nothing is saved until Import. No
// ZoomInfo API or login is involved; the export is ZoomInfo's own.
const NEW_LIST='__new__';let newListName='',autoList='';
const ZOOMINFO_HEADERS=/(^|,)"?(ZoomInfo Contact ID|ZoomInfo Company ID|Contact Accuracy Score)"?(,|$)/i;
let dailyImport=false;
function fileListName(file){const day=file.name.match(/^daily-leads-(\d{4}-\d{2}-\d{2})(?:\s*\(\d+\))?\.csv$/i);if(day)return 'Daily leads — '+day[1];return file.name.replace(/\.csv$/i,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'Imported contacts';}
async function prepareImportFile(file){
 if(!file)return;
 if(!/\.csv$/i.test(file.name)&&file.type!=='text/csv'){$('importResult').textContent='Choose a CSV file. In ZoomInfo, export your list or search results as CSV.';return;}
 $('importInputMode').value='file';$('csvFileLabel').hidden=false;$('csvTextLabel').hidden=true;
 const header=(await file.slice(0,8000).text()).replace(/^\uFEFF/,'').split(/\r?\n/)[0]||'',zoominfo=ZOOMINFO_HEADERS.test(header);
 dailyImport=/(^|,)"?Why Now"?(,|$)/i.test(header);
 $('importFormat').value=zoominfo?'zoominfo':'generic';$('source').value=dailyImport?'ProspectPilot daily leads (ZoomInfo)':zoominfo?'ZoomInfo CSV export':['ZoomInfo CSV export','ProspectPilot daily leads (ZoomInfo)'].includes($('source').value)?'':$('source').value;
 // A list the advisor picked for this file is kept; one generated for an
 // earlier file (or the list that import created) is replaced.
 if(!$('importList').value||$('importList').value===NEW_LIST||$('importList').value===autoList){
  newListName=fileListName(file);$('importList').querySelector(`option[value="${NEW_LIST}"]`)?.remove();
  $('importList').add(new Option('New list: '+newListName,NEW_LIST));$('importList').value=NEW_LIST;
 }
 clearPreview();if(!$('source').value){$('importResult').textContent='Name the source, then preview the import.';$('source').focus();return;}
 $('importResult').textContent=zoominfo?'Recognised a ZoomInfo export. Checking the rows…':'Checking the rows…';$('previewImport').click();
}
let createdList='';
async function importList(create){
 if(create)createdList='';
 const value=$('importList').value;if(value!==NEW_LIST)return value||undefined;if(!create)return undefined;
 try{return createdList=(await api('lists',{name:newListName})).id;}
 catch(e){await loadLists();const same=lists.find(l=>l.name===newListName);if(same)return createdList=same.id;throw e;}
}
$('csvFile').addEventListener('change',()=>prepareImportFile($('csvFile').files[0]));
$('importList').addEventListener('change',()=>{autoList='';});
let dragDepth=0;
const dragsFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
document.addEventListener('dragenter',event=>{if(!dragsFiles(event))return;event.preventDefault();dragDepth++;document.body.classList.add('dropping');});
document.addEventListener('dragover',event=>{if(dragsFiles(event))event.preventDefault();});
document.addEventListener('dragleave',event=>{if(!dragsFiles(event))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)document.body.classList.remove('dropping');});
document.addEventListener('drop',event=>{if(!dragsFiles(event))return;event.preventDefault();dragDepth=0;document.body.classList.remove('dropping');
 const file=event.dataTransfer.files[0];if(!file)return;
 if(!$('importDialog').open)$('importDialog').showModal();
 try{$('csvFile').files=event.dataTransfer.files;}catch{}
 prepareImportFile(file);
});
async function importInput(create=false){
 let csv;
 if($('importInputMode').value==='paste')csv=$('csvText').value;
 else{const file=$('csvFile').files[0];if(!file||file.size>4000000)throw Error('Choose a CSV up to 4 MB, or switch to Paste CSV text.');csv=await file.text();}
 if(!csv.trim()||new TextEncoder().encode(csv).length>4000000)throw Error('Provide CSV headers and rows, up to 4 MB.');
 return {csv,format:$('importFormat').value,source:$('source').value,list_id:await importList(create),source_url:$('sourceURL').value||undefined,source_observed_at:$('sourceObservedAt').value||undefined};
}
function clearPreview(){$('continueImport').hidden=true;importRevision++;lastImportReport=null;$('importPreview').replaceChildren();$('importResult').textContent='';$('downloadImportReport').hidden=true;}
$('importInputMode').onchange=()=>{$('csvFileLabel').hidden=$('importInputMode').value==='paste';$('csvTextLabel').hidden=$('importInputMode').value!=='paste';clearPreview();};
for(const id of ['csvFile','csvText','source','sourceURL','sourceObservedAt','importList','importFormat'])$(id).addEventListener('input',clearPreview);
$('previewImport').onclick=async()=>{const button=$('previewImport'),version=importRevision;button.disabled=true;try{const r=await api('import/preview',await importInput());if(version===importRevision)renderImportReport(r);}catch(e){if(version===importRevision)$('importResult').textContent=e.message;}finally{button.disabled=false;}};
$('importForm').onsubmit=e=>submit(e,'importResult',async()=>{const version=importRevision,input=await importInput(true),r=await api('import',input);await loadLists();if(input.list_id){$('importList').value=input.list_id;if(input.list_id===createdList)autoList=input.list_id;}offset=0;selected.clear();await load();if(version===importRevision)renderImportReport(r);notice(importMessage(r));
 if(dailyImport&&input.list_id&&(r.added||r.duplicates)){dailyImport=false;$('importDialog').close();$('dailyDialog').showModal();loadDaily(input.list_id);}});
function downloadCSV(name,rows){const cell=value=>'"'+String(value??'').replace(/^[\s]*[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadReport(report){downloadCSV('prospectpilot-import-report.csv',[['Source line','Contact','Result','Message','Review notes'],...(report.rows||[]).map(row=>[row.row,row.name,row.status,row.message,(row.issues||[]).map(issue=>issue.message).join(' ')])]);}
$('continueImport').onclick=()=>{$('importDialog').close();$('filters').reset();$('listFilter').value=$('importList').value;offset=0;selected.clear();load();$('resultTitle').scrollIntoView({behavior:'smooth',block:'start'});notice('Select the contacts you want to work, then choose Add & open worklist.');};
$('downloadImportReport').onclick=()=>{if(lastImportReport)downloadReport(lastImportReport);};
$('export').onclick=async()=>{try{const blob=await api('export',{ids:[...selected]});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='prospectpilot-contacts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Export ready. Suppressed contacts were omitted.');}catch(e){notice(e.message,true);}};
async function initializeDirectory(){try{
 await Promise.all([loadLists(),loadSearches()]);
 if(await load()){
  notice('Your contact workspace is ready.');
  if(!importIntentHandled&&new URL(location.href).searchParams.get('import')==='1'){
   importIntentHandled=true;$('importDialog').showModal();
  }
 }else $('retryContacts').onclick=initializeDirectory;
}catch(e){failedDirectory(e.message,initializeDirectory);}}
await initializeDirectory();

initProviderUI({api,selected,filters,getLists:()=>lists.filter(l=>!l.role||l.role==='owner'),refresh:async()=>{await loadLists();await load();},notice}).catch(e=>notice(e.message,true));

// Owners manage sharing; recipients can leave. List deletion preserves contacts.
const manageButton=document.createElement('button');manageButton.className='secondary';manageButton.textContent='Manage list';$('newListOpen').after(manageButton);
document.body.insertAdjacentHTML('beforeend','<dialog id="manageListDialog"><form id="manageListForm"><div class="dialog-title"><h2>Manage list</h2><button type="button" class="secondary" id="closeManageList">Close</button></div><label>List<select id="managedList" required></select></label><p id="managedRole"></p><label>List name<input id="manageListName" required maxlength="100"></label><p id="manageListError" role="alert"></p><button id="renameList" type="submit">Save name</button><button type="button" class="secondary" id="deleteList">Delete list</button></form><section id="listSharing"><h3>Share this list</h3><p>Only this list is shared. Contact edits also appear wherever the owner uses that contact. The recipient needs a verified ProspectPilot account.</p><form id="shareListForm"><label>Colleague email<input id="shareEmail" type="email" required maxlength="254"></label><label>Access<select id="shareRole"><option value="viewer">Viewer — read only</option><option value="editor">Editor — add and edit contacts</option></select></label><button type="submit">Save access</button></form><div id="listShares"></div></section><button id="leaveList" class="secondary" type="button">Leave this shared list</button></dialog>');
let manageVersion=0;
async function managedName(){
 const version=++manageVersion,id=$('managedList').value,list=lists.find(l=>l.id===id),owner=!list?.role||list.role==='owner';
 $('manageListName').value=list?.name||'';$('manageListName').disabled=!owner;
 $('renameList').hidden=!owner;$('deleteList').hidden=!owner;$('listSharing').hidden=!owner;$('leaveList').hidden=owner;
 $('managedRole').textContent=owner?'Owner. Deleting the list revokes all shares; contacts remain in your directory.':list.role+' — shared by '+list.shared_by;
 $('listShares').textContent='';$('manageListError').textContent='';
 if(owner)try{const result=await api('lists/'+encodeURIComponent(id)+'/shares');if(version!==manageVersion)return;
  $('listShares').innerHTML=result.shares.map(s=>'<p>'+esc(s.recipient_email)+' · '+esc(s.role)+' <button type="button" class="secondary" data-revoke-share="'+esc(s.recipient_uid)+'">Revoke</button></p>').join('')||'<p>No shared access.</p>';
  document.querySelectorAll('[data-revoke-share]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('lists/'+encodeURIComponent(id)+'/shares/'+encodeURIComponent(button.dataset.revokeShare),undefined,'DELETE');await managedName();}catch(e){$('manageListError').textContent=e.message;button.disabled=false;}});
 }catch(e){if(version===manageVersion)$('manageListError').textContent=e.message;}
}
manageButton.onclick=()=>{if(!lists.length)return notice('Create a list first.');$('managedList').innerHTML=lists.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');if($('listFilter').value)$('managedList').value=$('listFilter').value;managedName();$('manageListDialog').showModal();};
$('managedList').onchange=managedName;$('closeManageList').onclick=()=>{manageVersion++;$('manageListDialog').close();};
$('manageListForm').onsubmit=e=>submit(e,'manageListError',async()=>{await api('lists/'+encodeURIComponent($('managedList').value),{name:$('manageListName').value},'PATCH');await loadLists();await load();$('manageListDialog').close();notice('List renamed.');});
$('shareListForm').onsubmit=e=>submit(e,'manageListError',async()=>{await api('lists/'+encodeURIComponent($('managedList').value)+'/shares',{email:$('shareEmail').value,role:$('shareRole').value});$('shareEmail').value='';await managedName();notice('List access saved.');});
async function removeManagedList(leave){
 const button=$(leave?'leaveList':'deleteList');button.disabled=true;
 try{const id=$('managedList').value;await api('lists/'+encodeURIComponent(id)+(leave?'/shares/me':''),undefined,'DELETE');if($('listFilter').value===id){$('listFilter').value='';offset=0;selected.clear();}await Promise.all([loadLists(),loadSearches()]);await load();$('manageListDialog').close();notice(leave?'You left the shared list.':'List deleted and all shared access revoked. Contacts remain in your directory.');}catch(e){$('manageListError').textContent=e.message;}finally{button.disabled=false;}
}
$('deleteList').onclick=()=>removeManagedList(false);$('leaveList').onclick=()=>removeManagedList(true);

let contactViewVersion=0;
// A recorded phone check, in words: who the number is listed under, the line
// type (mobile carries stricter calling rules) and when it was checked.
function phoneCheckLabel(c){const p=c.phone_check;if(!p)return 'Not checked';const when=p.checked_at?' · checked '+new Date(p.checked_at).toLocaleDateString():'';
 if(p.phone!==c.phone)return 'Checked for a previous number'+when;if(p.found===false)return 'No record for this number'+when;
 const owner=p.valid===false?'Not a working line':p.name_match===true?(p.first_name_match?'Listed under this contact':'Listed under this surname'):p.name_match===false?'Listed under someone else — do not dial for this contact':'Owner not returned';
 return [owner,p.line_type,p.carrier,p.prepaid?'prepaid':''].filter(Boolean).join(' · ')+when;}
async function showContact(id,prepare=false){
 const version=++contactViewVersion;
  if(!$('contactDialog')){document.body.insertAdjacentHTML('beforeend','<dialog id="contactDialog"><div class="dialog-title"><h2 id="contactTitle">Contact details</h2><button class="secondary" id="closeContact">Close</button></div><p id="contactError" role="alert"></p><div id="contactBody"></div><button id="toggleSuppression"></button> <button id="deletePerson" class="secondary">Delete this person</button></dialog>');$('closeContact').onclick=()=>$('contactDialog').close();$('contactDialog').addEventListener('close',()=>{contactViewVersion++;});}
 $('contactTitle').textContent='Loading contact…';$('contactBody').textContent='';$('contactError').textContent='';$('toggleSuppression').disabled=true;$('deletePerson').disabled=true;$('deletePerson').dataset.armed='';$('deletePerson').textContent='Delete this person';
 if(!$('contactDialog').open)$('contactDialog').showModal();
 try{
  const data=await api('contacts/'+encodeURIComponent(id));if(version!==contactViewVersion)return;
  const c=data.contact,date=value=>{const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toLocaleString():'Not recorded';};
  $('contactTitle').textContent=c.first_name+' '+c.last_name;
  const dncLabel=value=>value===true?'Do not call':value===false?'Not flagged by source; permission not established':'Unknown';
  const fields=[['Title',c.title],['Company',c.company],['Location',[c.city,c.state,c.country].filter(Boolean).join(', ')],['Email',c.email],['Email status',c.email_status],['Email domain check',c.email_domain_check?.label||c.email_domain_check?.status?.replaceAll('_',' ')||'Not checked'],['Domain checked',date(c.email_domain_check?.checked_at)],['Phone',c.phone],['Phone status',c.phone_status],['Phone check',phoneCheckLabel(c)],['Mobile phone (unverified)',c.mobile_phone],['Primary phone origin',c.phone_origin||'Not recorded'],['Direct calling restriction',dncLabel(c.phone_restrictions?.direct)],['Mobile calling restriction',dncLabel(c.phone_restrictions?.mobile)],['ZoomInfo contact ID',c.zoominfo?.contact_id],['ZoomInfo company ID',c.zoominfo?.company_id],['Provider accuracy score',c.zoominfo?.accuracy_score==null?'Not supplied':String(c.zoominfo.accuracy_score)],['Provider accuracy grade',c.zoominfo?.accuracy_grade],['Provider validation date',c.zoominfo?.validated_at],['Provider update date',c.zoominfo?.updated_at],['Job start date',c.zoominfo?.job_start_date],['Reported job change',c.zoominfo?.last_job_change_date],['Previous company',c.zoominfo?.previous_company],['Department',c.zoominfo?.department],['Source',c.source],['Source observation date',c.source_observed_at||'Unknown'],['Added',date(c.created_at)],['Last updated',date(c.updated_at)],['Lists',data.lists.map(l=>l.name).join(', ')||'No lists'],['Email verifier',c.email_verification?.provider||'Not checked'],['Email checked',date(c.email_verification?.checked_at)],['Checked address',c.email_verification?.email],['Enrichment provider',c.enrichment?.provider],['Enriched',date(c.enrichment?.checked_at)]];
  const pendingCount=(c.source_history||[]).filter(event=>event.proposed_values&&!event.resolution).length;
  $('contactBody').innerHTML=`<p class="contact-summary">${esc([c.title,c.company].filter(Boolean).join(' · ')||'Title and company not provided')}<br>${esc([c.city,c.state,c.country].filter(Boolean).join(', '))}</p><div class="actions contact-actions"><button id="editContact" class="secondary">Correct details</button>${pendingCount?`<button id="reviewContactConflicts" class="secondary">Review ${pendingCount} source conflict${pendingCount===1?'':'s'}</button>`:''}</div><p>Email: ${esc(c.email||'Not provided')} <span class="badge">${esc(c.email_status||'unverified')}</span><br>Phone: ${esc(c.phone||'Not provided')} <span class="badge">${esc(c.phone_status||'unverified')}</span></p><p class="muted">Source: ${esc(c.source||'Not recorded')} · Observed: ${esc(c.source_observed_at||'Unknown')}</p><p>${c.suppressed?'Suppressed: excluded from exports and provider processing.':'Contact information needs review before use.'}</p><p class="muted">Direct phone: ${esc(dncLabel(c.phone_restrictions?.direct))}. Mobile phone: ${esc(dncLabel(c.phone_restrictions?.mobile))}.</p><details id="contactHistory"><summary>Source details & verification history</summary><div id="contactHistoryBody"></div></details>`;
  $('contactHistoryBody').innerHTML='<dl class="contact-details">'+fields.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value||'Not provided')}</dd></div>`).join('')+'</dl>'+`<p>${c.suppressed?'Suppressed: excluded from exports and provider processing.':'Available for exports and provider processing.'}</p><p class="muted">Email verification expires after 30 days. Source and check history remain available after expiry.</p>`;
  $('contactHistoryBody').insertAdjacentHTML('beforeend','<p class="muted">Job history does not establish age, income, retirement assets, or an old plan balance.</p>'+Object.entries(c.phone_import||{}).map(([route,phone])=>'<p>Original '+esc(route)+' phone: '+esc(phone.raw)+' <span class="badge">'+esc(phone.status.replaceAll('_',' '))+'</span></p>').join(''));
  $('contactHistoryBody').insertAdjacentHTML('beforeend','<h3>Data review</h3>'+((c.quality?.issues||[]).length?'<ul>'+c.quality.issues.map(issue=>`<li>${esc(issue.message)}</li>`).join('')+'</ul>':'<p>No completeness issues detected. This is not a factual-accuracy guarantee.</p>')+'<p class="muted">A valid email check measures deliverability at the time checked, not the person’s ownership or permission to contact them.</p><h3>Source history</h3>'+((c.source_history||[]).length?'<ol>'+c.source_history.map(item=>`<li><strong>${esc(item.source)}</strong> · ${esc(item.kind)}<br>Observed: ${esc(item.observed_at||'unknown')} · Imported: ${esc(date(item.imported_at))}${item.row?` · Line ${item.row}`:''}${item.url?`<br><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open source</a>`:''}${item.zoominfo&&Object.keys(item.zoominfo).length?`<details><summary>Provider claims at import</summary><dl>${Object.entries(item.zoominfo).map(([k,v])=>`<dt>${esc(k.replaceAll('_',' '))}</dt><dd>${esc(v==null?'Unknown':String(v))}</dd>`).join('')}</dl></details>`:''}${item.phone_import&&Object.keys(item.phone_import).length?`<details><summary>Original phone fields at import</summary>${Object.entries(item.phone_import).map(([k,v])=>`<p>${esc(k)}: ${esc(v.raw)} · ${esc(v.status)}</p>`).join('')}</details>`:''}${item.differing_fields?.length?`<br>Source differs; existing values retained: ${item.differing_fields.map(esc).join(', ')}`:''}</li>`).join('')+'</ol><p class="muted">Recent source events and all unresolved conflicts are retained. Import reports retain row outcomes.</p>':'<p>No source history was recorded for this older record.</p>'));
  const reviews=(c.source_history||[]).filter(event=>event.kind==='manual_review'||event.resolution);
  if(reviews.length)$('contactHistoryBody').insertAdjacentHTML('beforeend','<details><summary>Correction and conflict decisions</summary>'+reviews.map(event=>{
    const source=event.source_resolution||event,resolution=source.resolution;
    return `<article><p>${esc(event.reason||resolution?.reason||'')} - ${esc(date(resolution?.reviewed_at||event.imported_at))}</p>${resolution?`<p>Decision: ${esc(resolution.decision==='accept'?'Accepted source values':'Kept current values')}</p><p>Reviewed source: ${esc(source.source||'Not recorded')} · Observed: ${esc(source.observed_at||'Unknown')}</p>${Object.entries(source.proposed_values||{}).map(([key,value])=>`<p>Source ${esc(key.replaceAll('_',' '))}: ${esc(value)}</p>`).join('')}`:''}${Object.entries(event.changes||{}).map(([key,value])=>`<p>${esc(key.replaceAll('_',' '))}: ${esc(value.before||'(empty)')} to ${esc(value.after||'(empty)')}</p>`).join('')}</article>`;
  }).join('')+'</details>');
  const fieldSources=Object.entries(c.field_sources||{});
  if(fieldSources.length)$('contactHistoryBody').insertAdjacentHTML('beforeend','<details><summary>Field origins</summary><dl class="contact-details">'+fieldSources.map(([field,source])=>`<div><dt>${esc(field.replaceAll('_',' '))}</dt><dd>${esc(source.source)}<br>Observed: ${esc(source.observed_at||'unknown')}${source.row?` · Line ${source.row}`:''}</dd></div>`).join('')+'</dl></details>');
  // Web research findings stay unreviewed: each is shown with its quote and source, and changes nothing.
  if(c.web_research){const w=c.web_research;$('contactBody').insertAdjacentHTML('beforeend','<section><h3>Web research <span class="badge">unreviewed</span></h3><p class="muted">'+esc(w.summary||'')+' Checked '+esc(date(w.checked_at))+'. Read each source before correcting the contact; nothing here was applied.</p>'+(w.findings?.length?'<ul>'+w.findings.map(f=>'<li><strong>'+esc(f.field.replaceAll('_',' '))+':</strong> '+esc(f.value)+'<br><q>'+esc(f.quote)+'</q><br><a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">'+esc(f.url)+'</a></li>').join('')+'</ul>':'<p>No finding clearly matched this person.</p>')+'</section>');}
  // A profile screenshot the operator is looking at: read once by Claude, never stored.
  $('contactBody').insertAdjacentHTML('beforeend','<section><h3>Read a profile screenshot</h3><p class="muted">Upload a screenshot of a public profile, such as a company bio or conference page. Claude pulls out the professional facts if it shows this person. The image isn’t kept, and nothing changes until you review it.</p><input id="profileImageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"> <button id="profileImageRead" type="button" class="secondary">Read screenshot</button><p id="profileImageNote" role="status"></p>'+(c.profile_image?'<h4>Last screenshot <span class="badge">unreviewed</span></h4><p class="muted">'+esc(c.profile_image.summary||'')+' Read '+esc(date(c.profile_image.checked_at))+'.</p>'+(c.profile_image.findings?.length?'<ul>'+c.profile_image.findings.map(f=>'<li><strong>'+esc(f.field.replaceAll('_',' '))+':</strong> '+esc(f.value)+'<br><q>'+esc(f.quote)+'</q></li>').join('')+'</ul>':'<p>'+(c.profile_image.matches_contact?'No professional facts were readable.':'The page did not appear to show this contact, so nothing was taken from it.')+'</p>'):'')+'</section>');
  const imageButton=$('profileImageRead');if(imageButton)imageButton.onclick=async()=>{const file=$('profileImageFile').files?.[0];if(!file){$('profileImageNote').textContent='Choose a screenshot first.';return;}
   if(file.size>3500000){$('profileImageNote').textContent='Screenshots must be under 3.5 MB.';return;}
   // First click states the cost; the second spends it.
   if(!imageButton.dataset.armed){try{const setup=await api('providers');const price=setup.prices?.profile_image;if(!setup.providers?.profile_image||price==null){$('profileImageNote').textContent='Profile screenshots are not set up on this server yet (a Claude key and a price are needed). Nothing was sent.';return;}imageButton.dataset.armed='1';imageButton.textContent='Read it — reserves '+(price==null?'the configured price':(Number(price)/1000000).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}));$('profileImageNote').textContent='Click again to send the screenshot to Claude.';}catch(e){$('profileImageNote').textContent=e.message;}return;}
   imageButton.disabled=true;$('profileImageNote').textContent='Reading…';
   try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('The file could not be read.'));reader.readAsDataURL(file);});
    const result=await api('contacts/'+encodeURIComponent(id)+'/profile-image',{media_type:file.type,data});
    if(version===contactViewVersion){notice(result.matches_contact?'Screenshot read: '+result.findings.length+' finding(s) to review. The image was not stored.':'The screenshot does not appear to show this contact; nothing was taken from it.');await showContact(id);}}
   catch(e){if(version===contactViewVersion){$('profileImageNote').textContent=e.message;imageButton.disabled=false;}}};
  $('contactBody').insertAdjacentHTML('beforeend','<section><h3>Contact preparation</h3><button id="prepareContact" class="secondary">Prepare contact</button><p class="muted">Checks the email domain, applies restrictions, and prepares a brief and draft. No messages are sent.</p><div id="preparationResult"></div></section>');
  if(c.preparation){const p=c.preparation;$('preparationResult').innerHTML=(!c.preparation_current?'<p>Contact data changed since this brief. Prepare again for current results.</p>':'')+'<h4>Completed</h4><ul>'+p.completed.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+(p.unresolved.length?'<h4>What remains unconfirmed</h4><ul>'+p.unresolved.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+(p.draft&&c.preparation_current?'<h4>Draft introduction</h4><p>Subject: '+esc(p.draft.subject)+'</p><pre class="preparation-draft">'+esc(p.draft.body)+'</pre><p class="muted">Add your signature and confirm permission before sending. Nothing has been sent.</p>':'')+'<h4>Conversation questions</h4><ul>'+p.questions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';}
  const prepareButton=$('prepareContact');if(prepareButton)prepareButton.onclick=async()=>{if(prepareButton.disabled)return;prepareButton.disabled=true;prepareButton.textContent='Preparing…';try{await api('contacts/'+encodeURIComponent(id)+'/prepare',{revision:c.edit_revision});await load();if(version===contactViewVersion)await showContact(id);notice('Preparation completed. Brief saved; no outreach sent.');}catch(error){if(version===contactViewVersion)$('contactError').textContent=error.message;}finally{prepareButton.disabled=false;prepareButton.textContent='Prepare contact';}};
  const editable=['first_name','last_name','title','company','company_domain','industry','seniority','city','state','country','email','phone','mobile_phone','linkedin_url'];
  $('contactBody').insertAdjacentHTML('beforeend','<details id="correctionPanel"><summary>Correct contact details</summary><form id="correctionForm"><p>Review identity before changing identifiers. Edited contact routes require verification again. Source history is retained.</p>'+editable.map(key=>`<label>${esc(key.replaceAll('_',' '))}<input name="${key}" value="${esc(c[key]||'')}" maxlength="1000" ${['first_name','last_name'].includes(key)?'required':''}></label>`).join('')+'<label>Reason or evidence reference<textarea name="reason" required maxlength="1000"></textarea></label><button type="submit">Save corrections</button></form></details>');
  $('editContact').onclick=()=>{$('correctionPanel').open=true;$('correctionPanel').scrollIntoView({block:'start'});$('correctionForm').querySelector('input').focus({preventScroll:true});};
  $('correctionForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;if(button.disabled)return;button.disabled=true;try{const values=Object.fromEntries(new FormData(e.target));await api('contacts/'+encodeURIComponent(id),{fields:Object.fromEntries(editable.map(key=>[key,values[key]])),reason:values.reason,revision:c.edit_revision},'PATCH');await load();if(version===contactViewVersion)await showContact(id);notice('Corrections saved with review history.');}catch(error){if(version===contactViewVersion)$('contactError').textContent=error.message;}finally{button.disabled=false;}};
  const conflicts=(c.source_history||[]).map((event,index)=>({event,index})).filter(({event})=>event.proposed_values&&!event.resolution);
  if(conflicts.length){
   $('contactBody').insertAdjacentHTML('beforeend','<h3 id="contactConflicts" tabindex="-1">Review conflicting source values</h3>'+conflicts.map(({event,index})=>`<article><p>${esc(event.source)} - ${esc(date(event.imported_at))}</p><div class="conflict-table"><table><thead><tr><th>Field</th><th>Current</th><th>Source proposes</th></tr></thead><tbody>${Object.entries(event.proposed_values).map(([key,value])=>`<tr><th>${esc(key.replaceAll('_',' '))}</th><td>${esc(c[key]||'Not provided')}</td><td>${esc(value)}</td></tr>`).join('')}</tbody></table></div><label>Review reason<input id="conflictReason${index}" maxlength="1000"></label><button type="button" data-conflict="${index}" data-decision="accept">Accept source values</button><button type="button" class="secondary" data-conflict="${index}" data-decision="keep">Keep current values</button></article>`).join(''));
   $('reviewContactConflicts').onclick=()=>{$('contactConflicts').scrollIntoView({block:'start'});$('contactConflicts').focus({preventScroll:true});};
   document.querySelectorAll('[data-conflict]').forEach(button=>button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{const index=Number(button.dataset.conflict);await api('contacts/'+encodeURIComponent(id),{resolve_history_index:index,decision:button.dataset.decision,reason:$('conflictReason'+index).value,revision:c.edit_revision},'PATCH');await load();if(version===contactViewVersion)await showContact(id);notice('Source conflict reviewed.');}catch(error){if(version===contactViewVersion)$('contactError').textContent=error.message;}finally{button.disabled=false;}});
  }
  $('contactBody').append($('contactHistory'));
  $('contactError').textContent='';const toggle=$('toggleSuppression');toggle.disabled=false;toggle.textContent=c.suppressed?'Remove suppression':'Suppress contact';
  toggle.onclick=async()=>{if(toggle.disabled)return;toggle.disabled=true;try{await api('contacts/'+encodeURIComponent(id),{suppressed:!c.suppressed},'PATCH');await load();if(version===contactViewVersion)await showContact(id);notice(c.suppressed?'Suppression removed.':'Contact suppressed.');}catch(e){if(version===contactViewVersion){$('contactError').textContent=e.message;toggle.disabled=false;}}};
  // Deleting is permanent, so it takes a second click that says what goes.
  const remove=$('deletePerson');remove.disabled=false;
  remove.onclick=async()=>{if(remove.disabled)return;if(!remove.dataset.armed){remove.dataset.armed='1';remove.textContent='Click again to delete permanently';$('contactError').textContent='This removes the contact, the Research Lab lead linked to them, their evidence, activity and call records, from every list. A do-not-call block keeps the number. They will not be imported again.';return;}
   remove.disabled=true;try{await api('contacts/'+encodeURIComponent(id),undefined,'DELETE');selected.delete(id);if(version===contactViewVersion)$('contactDialog').close();await load();notice('Deleted. Nothing about this person remains except a do-not-call block, if one existed.');}catch(e){if(version===contactViewVersion){$('contactError').textContent=e.message;remove.disabled=false;}}};
  if(!$('contactDialog').open)$('contactDialog').showModal();
  if(data.role&&data.role!=='owner'){
   remove.hidden=true;remove.disabled=true;
   const imageInput=$('profileImageFile');if(imageInput)imageInput.disabled=true;if(imageButton)imageButton.disabled=true;
   if(data.role==='viewer'){
    toggle.disabled=true;$('editContact').disabled=true;
    if(prepareButton)prepareButton.disabled=true;
    $('correctionForm').querySelectorAll('input,button').forEach(el=>el.disabled=true);
    document.querySelectorAll('[data-conflict]').forEach(el=>el.disabled=true);
   }
  }else remove.hidden=false;
  if(prepare&&version===contactViewVersion&&prepareButton&&!prepareButton.disabled)await prepareButton.onclick();
 }catch(e){if(version===contactViewVersion){$('contactTitle').textContent='Contact unavailable';$('contactError').textContent=e.message;$('toggleSuppression').disabled=true;$('contactBody').innerHTML='<p>Reload this contact to review its latest details.</p><button id="retryContact" type="button" class="secondary">Retry contact details</button>';$('retryContact').onclick=()=>{if(version===contactViewVersion)return showContact(id);};}}
}

$('importFormat').onchange=()=>{$('source').value=$('importFormat').value==='zoominfo'?'ZoomInfo CSV export':'';};

api('me').then(user=>{$('account').textContent=user.email;}).catch(()=>{});

$('qualityOpen').onclick=async()=>{
 $('qualityDialog').showModal();$('qualityContent').textContent='Loading quality report…';
 try{
  const {summary:s,sources,coverage,imports}=await api('data-quality');
  const cards=[['Contacts',s.contacts],['Current valid email checks',s.verified_emails],['Unverified emails',s.unverified_emails],['Invalid emails',s.invalid_emails],['Domain checks recorded',s.domain_checks],['Mail-route issues at last check',s.domain_issues],['Suppressed contacts',s.suppressed],['No contact route',s.no_contact_route],['Shared mailboxes',s.shared_mailboxes],['Source date unknown',s.source_date_unknown],['Source older than 180 days',s.source_older_than_180_days]];
  $('qualityContent').innerHTML='<dl class="quality-cards">'+cards.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${Number(value).toLocaleString()}</dd></div>`).join('')+'</dl><h3>Source import results</h3><p class="muted">Up to 50 source labels, ordered by latest import. Matched rows are repeat records, not new leads. These counts do not measure source accuracy.</p>'+(sources.length?'<div class="table-wrap"><table><thead><tr><th>Source</th><th>Imports</th><th>New</th><th>Matched</th><th>Identity conflicts</th><th>Rejected</th></tr></thead><tbody>'+sources.map(source=>`<tr><td>${esc(source.source)}</td><td>${source.imports}</td><td>${source.added}</td><td>${source.duplicates}</td><td>${source.conflicts}</td><td>${source.rejected}</td></tr>`).join('')+'</tbody></table></div>':'<p>No imports yet.</p>')+'<h3>Recent imports</h3><p class="muted">The latest 20 imports. Exact repeated uploads do not increase these counts.</p>'+imports.map(item=>`<div class="import-history"><button class="text-button" data-report="${esc(item.id)}">${esc(item.source)} · ${esc(new Date(item.created_at).toLocaleString())}</button><span>${item.summary.added} new · ${item.summary.conflicts} identity conflicts · ${item.summary.rejected} rejected${Number.isInteger(item.summary.field_reviews)?` · ${item.summary.field_reviews} row${item.summary.field_reviews===1?'':'s'} with field differences`:" · Field differences not recorded"}</span></div>`).join('')+'<h3>Choose evidence appropriate to the field</h3><ul><li>Licensed exports provide contact candidates. Track the export and observation dates, and independently check deliverability.</li><li>Company staff pages can support a named professional’s role and published business channels. Retain the exact page and observation date.</li><li>SEC filings and DOL Form 5500 support their stated filing and employer-plan facts. They do not establish an individual’s retirement balance or transfer eligibility.</li><li>Search snippets, inferred fields and imported status labels remain unverified. A source URL alone does not validate a claim.</li></ul>';
  const coverageHTML='<h3>Current records by original source</h3><p class="muted">Up to 50 sources by contact count. Each contact belongs to its original source here; later contributions are recorded in its source history. Valid checks measure deliverability, not ownership or source accuracy.</p>'+(coverage.length?'<div class="table-wrap"><table><thead><tr><th>Source</th><th>Contacts</th><th>Emails</th><th>Valid checks</th><th>Invalid</th><th>Last domain issues</th><th>Unknown source date</th></tr></thead><tbody>'+coverage.map(row=>`<tr><td>${esc(row.source)}</td><td>${row.contacts}</td><td>${row.emails}</td><td>${row.valid_emails}</td><td>${row.invalid_emails}</td><td>${row.domain_issues}</td><td>${row.unknown_dates}</td></tr>`).join('')+'</tbody></table></div>':'<p>No contacts yet.</p>');
  $('qualityContent').insertAdjacentHTML('beforeend',coverageHTML);
  document.querySelectorAll('[data-report]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const report=await api('imports/'+encodeURIComponent(button.dataset.report));
   if(!$('archivedImportDialog')){
    document.body.insertAdjacentHTML('beforeend','<dialog id="archivedImportDialog"><div class="dialog-title"><h2>Saved import report</h2><button class="secondary" id="closeArchivedImport">Close</button></div><p id="archivedImportLabel"></p><p class="muted">This is the saved result at import time. Current contact data may have changed.</p><p id="archivedImportResult"></p><div id="archivedImportBody"></div><button id="downloadArchivedImport" class="secondary">Download row report</button></dialog>');
    $('closeArchivedImport').onclick=()=>$('archivedImportDialog').close();
   }
   $('archivedImportLabel').textContent=report.source+' · '+new Date(report.created_at).toLocaleString();
   renderImportReport(report.result,{archived:true});$('downloadArchivedImport').hidden=!report.result.rows?.length;$('downloadArchivedImport').onclick=()=>downloadReport(report.result);$('archivedImportDialog').showModal();
  }catch(error){notice(error.message,true);}finally{button.disabled=false;}});
 }catch(error){$('qualityContent').textContent=error.message;}
};

$('sendToWorklist').onclick=async()=>{
 if(!selected.size)return;if(selected.size>100)return notice('Select up to 100 contacts at a time for advisor review.',true);
 const button=$('sendToWorklist');button.disabled=true;
 try{const response=await fetch('/api/lab/contact-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...selected]})});const result=await response.json();if(!response.ok)throw Error(result.detail||'Could not add contacts to the worklist.');notice((result.replayed?'This contact selection was already processed.':`${result.linked} contacts linked to the advisor worklist; ${result.suppressed} suppressed contacts omitted; ${result.result?.rejected||0} rejected; ${result.result?.ambiguous||0} ambiguous matches. Imported details still need evidence review.`)+(result.restriction_links?` Restrictions also applied to ${result.restriction_links} existing worklist record${result.restriction_links===1?'':'s'}.`:''));if(result.lead_ids?.length)location.assign('/lab?lead='+encodeURIComponent(result.lead_ids[0]));}
 catch(e){notice(e.message,true);}finally{selection();}
};

// Daily review: the day's delivered leads, one card at a time. Review the
// LinkedIn profile, make sure a mobile and an email are on file, then keep or
// pass. The goal counts kept leads with both; nothing caps what arrives.
let daily={list:null,items:[],counts:null,goal:50},dailyIndex=0,dailyBusy=false;
async function dailyApi(path,body,method=body?'POST':'GET'){
 const r=await fetch('/api/prospect/'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(r.status===401){location.href='/login?next='+encodeURIComponent(location.pathname+location.search);throw Error('Sign in to continue.');}
 let data;try{data=await r.json();}catch{}if(!r.ok)throw Error(data?.detail||'Request failed.');return data;
}
const dailyVisible=()=>daily.items.filter(i=>{const v=$('dailyView').value,s=i.review?.status;return v==='all'||(v==='pending'?!s:v==='kept'?s==='kept':s==='passed');});
async function loadDaily(listId){
 $('dailyStatus').textContent='Loading today’s leads…';
 try{
  daily=await dailyApi('daily-review'+(listId?'?list_id='+encodeURIComponent(listId):''));
  $('dailyList').innerHTML=daily.lists.map(l=>`<option value="${esc(l.id)}">${esc(l.name)} · ${esc(l.contacts)}</option>`).join('');
  if(daily.list)$('dailyList').value=daily.list.id;
  $('dailyStatus').textContent='';dailyIndex=0;renderDaily();
 }catch(e){$('dailyStatus').textContent='Daily review could not load. '+e.message;}
}
function renderDailyProgress(){
 const c=daily.counts||{total:0,pending:0,kept:0,passed:0,quality:0,kept_missing_contact:0};
 $('dailyGoal').textContent=daily.goal;$('dailyBar').max=daily.goal;$('dailyBar').value=Math.min(c.quality,daily.goal);$('dailyQuality').textContent=c.quality;
 $('dailyCounts').textContent=`${c.total} delivered · ${c.pending} to review · ${c.kept} kept · ${c.passed} not a fit`;
 $('dailyEnrich').hidden=!c.kept_missing_contact;$('dailyMissing').textContent=c.kept_missing_contact;
 $('dailyBadge').hidden=!c.pending;$('dailyBadge').textContent=c.pending;
}
function renderDaily(){
 renderDailyProgress();
 const visible=dailyVisible();
 if(!daily.list||!visible.length){
  $('dailyCard').hidden=true;$('dailyEmpty').hidden=false;
  $('dailyEmpty').innerHTML=!daily.list?'<h2>No delivery yet</h2><p>Your daily leads arrive by 8:00 a.m. ET as a CSV in the Lead Qualifier drive. Drop it anywhere on this page to import it; the review opens by itself.</p>'
   :$('dailyView').value==='pending'?`<h2>All reviewed</h2><p>${daily.counts.quality>=daily.goal?'Goal reached. ':''}${esc(daily.counts.quality)} quality leads kept from this delivery.</p>`:'<h2>Nothing here</h2><p>Choose another view.</p>';
  return;
 }
 dailyIndex=Math.max(0,Math.min(dailyIndex,visible.length-1));
 const i=visible[dailyIndex];$('dailyCard').hidden=false;$('dailyEmpty').hidden=true;
 $('dailyRank').textContent=i.signal?.rank?'#'+i.signal.rank:'Delivered';
 $('dailyType').textContent=i.signal?.type||'Daily lead';
 $('dailyState').textContent=i.quality?'Quality lead':i.review?.status==='kept'?'Kept · needs mobile or email':i.review?.status==='passed'?'Not a fit':'To review';
 $('dailyState').className='chip '+(i.quality?'good':i.review?.status==='passed'?'muted-chip':'');
 $('dailyName').textContent=`${i.first_name} ${i.last_name}`;
 $('dailyRole').textContent=[i.title,i.company,i.location].filter(Boolean).join(' · ');
 $('dailyWhy').textContent=i.signal?.why||'Delivered in today’s leads.';$('dailyBasis').textContent=i.signal?.basis?'Ranked by '+i.signal.basis:'';
 const profile=i.linkedin_url||i.signal?.linkedin_search||'https://www.linkedin.com/search/results/people/?keywords='+encodeURIComponent(`${i.first_name} ${i.last_name} ${i.company}`);
 $('dailyLinkedIn').href=profile;$('dailyLinkedIn').textContent=i.linkedin_url?'Review LinkedIn profile ↗':'Find on LinkedIn ↗';
 $('dailySource').hidden=!i.signal?.url;if(i.signal?.url)$('dailySource').href=i.signal.url;
 $('dailyMobile').value=i.mobile_phone;$('dailyEmail').value=i.email;$('dailySave').hidden=true;
 $('dailyDnc').hidden=!i.mobile_do_not_call;
 $('dailyKeep').disabled=dailyBusy||i.suppressed;$('dailyPass').disabled=dailyBusy;$('dailyUndo').hidden=!i.review;$('dailyReason').value=i.review?.reason||'';
 $('dailyPosition').textContent=`${dailyIndex+1} of ${visible.length}`;$('dailyPrev').disabled=dailyIndex===0;$('dailyNext').disabled=dailyIndex>=visible.length-1;
 $('dailyNext').textContent=i.review?'Next →':'Skip →';
}
function replaceDaily(item){
 daily.items=daily.items.map(x=>x.id===item.id?item:x);
 const c={total:daily.items.length,pending:0,kept:0,passed:0,quality:0,kept_missing_contact:0};
 for(const x of daily.items){if(!x.review)c.pending++;else if(x.review.status==='kept'){c.kept++;if(x.quality)c.quality++;else c.kept_missing_contact++;}else c.passed++;}
 daily.counts=c;
}
const dailyTyped=()=>({mobile:$('dailyMobile').value.trim(),email:$('dailyEmail').value.trim()});
async function decideDaily(decision){
 const i=dailyVisible()[dailyIndex];if(!i||dailyBusy)return;
 const reason=$('dailyReason').value;if(decision==='pass'&&!reason){$('dailyStatus').textContent='Choose why this lead is not a fit.';$('dailyReason').focus();return;}
 // Read what was typed before the card redraws, so a kept lead keeps it.
 const typed=dailyTyped();
 dailyBusy=true;renderDaily();$('dailyMobile').value=typed.mobile;$('dailyEmail').value=typed.email;
 try{
  if(decision==='keep')await saveDailyContact(i,typed);
  const item=await dailyApi(`contacts/${encodeURIComponent(i.id)}/review`,{list_id:daily.list.id,decision,...(decision==='pass'?{reason}:{})});
  replaceDaily(item);
  $('dailyStatus').textContent=decision==='keep'?(item.quality?`Kept ${i.first_name} ${i.last_name} as a quality lead.`:`Kept ${i.first_name} ${i.last_name}. Add a mobile and email to count toward the goal.`):decision==='pass'?'Marked not a fit.':'Decision cleared.';
  // The reviewed card leaves the To review view; the next one takes its place.
  if($('dailyView').value!=='pending'&&decision!=='reset')dailyIndex++;
 }catch(e){$('dailyStatus').textContent=e.message;dailyBusy=false;renderDaily();$('dailyMobile').value=typed.mobile;$('dailyEmail').value=typed.email;$('dailyMobile').dispatchEvent(new Event('input'));return;}
 dailyBusy=false;renderDaily();
}
async function saveDailyContact(i,{mobile,email}=dailyTyped()){
 const fields={};
 if(mobile!==i.mobile_phone)fields.mobile_phone=mobile;if(email!==i.email)fields.email=email;
 if(!Object.keys(fields).length)return;
 await dailyApi(`contacts/${encodeURIComponent(i.id)}`,{fields,revision:i.revision,reason:'Added from ZoomInfo during daily review'},'PATCH');
 await loadDailyItem(i.id);
}
async function loadDailyItem(id){
 const fresh=await dailyApi('daily-review?list_id='+encodeURIComponent(daily.list.id));
 const item=fresh.items.find(x=>x.id===id);if(item)replaceDaily(item);
}
$('dailyOpen').onclick=()=>{$('dailyDialog').showModal();loadDaily($('dailyList').value||'');};
$('dailyList').onchange=()=>loadDaily($('dailyList').value);
$('dailyView').onchange=()=>{dailyIndex=0;$('dailyStatus').textContent='';renderDaily();};
$('dailyKeep').onclick=()=>decideDaily('keep');
$('dailyPass').onclick=()=>decideDaily('pass');
$('dailyUndo').onclick=()=>decideDaily('reset');
$('dailyPrev').onclick=()=>{dailyIndex--;$('dailyStatus').textContent='';renderDaily();};
$('dailyNext').onclick=()=>{dailyIndex++;$('dailyStatus').textContent='';renderDaily();};
for(const id of ['dailyMobile','dailyEmail'])$(id).addEventListener('input',()=>{const i=dailyVisible()[dailyIndex];$('dailySave').hidden=!i||($('dailyMobile').value.trim()===i.mobile_phone&&$('dailyEmail').value.trim()===i.email);});
$('dailyContact').onsubmit=async e=>{e.preventDefault();const i=dailyVisible()[dailyIndex];if(!i||dailyBusy)return;const typed=dailyTyped();dailyBusy=true;
 try{await saveDailyContact(i,typed);$('dailyStatus').textContent='Contact details saved with their source: added during daily review.';}catch(err){$('dailyStatus').textContent=err.message;}finally{dailyBusy=false;renderDaily();}};
$('dailyDialog').addEventListener('keydown',e=>{
 if(e.target.closest('input,select,textarea')||e.metaKey||e.ctrlKey||e.altKey)return;
 const key=e.key.toLowerCase();
 if(key==='k'){e.preventDefault();decideDaily('keep');}
 else if(key==='n'){e.preventDefault();if($('dailyReason').value)decideDaily('pass');else $('dailyReason').focus();}
 else if(key==='arrowright'&&!$('dailyNext').disabled){dailyIndex++;renderDaily();}
 else if(key==='arrowleft'&&!$('dailyPrev').disabled){dailyIndex--;renderDaily();}
});
// Kept leads without both routes, as ZoomInfo contact IDs for its enrichment.
$('dailyDownload').onclick=()=>{const rows=daily.items.filter(i=>i.review?.status==='kept'&&!i.quality);
 downloadCSV(`${(daily.list?.name||'daily-leads').replace(/[^\w -]+/g,'').trim()} - for ZoomInfo.csv`,[['ZoomInfo Contact ID','First Name','Last Name','Company Name','Job Title'],...rows.map(i=>[i.zoominfo_id,i.first_name,i.last_name,i.company,i.title])]);
 $('dailyStatus').textContent=`Downloaded ${rows.length}. Upload it to ZoomInfo, export with mobile and email, then choose Import ZoomInfo export.`;};
$('dailyImportExport').onclick=()=>{$('dailyDialog').close();if(daily.list){$('importList').value=daily.list.id;autoList='';}$('importDialog').showModal();};
// The badge shows today’s unreviewed leads without opening the review.
dailyApi('daily-review').then(d=>{daily=d;renderDailyProgress();}).catch(()=>{});
