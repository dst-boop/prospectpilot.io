const $=id=>document.getElementById(id),form=$('captureForm');
const kinds={in_person:'In-person conversation',warm_introduction:'Warm introduction',referral:'Referral',manual:'Manual entry'};
const permissions={unknown:'Introduction permission unknown',requested:'Introduction permission requested',granted:'Explicit introduction permission recorded',declined:'Introduction permission declined'};
let requestKey=crypto.randomUUID(),pending=false,historyEpoch=0,dirty=false;
const value=name=>form.elements.namedItem(name).value.trim();
const setText=(id,text,error=false)=>{const target=$(id);target.textContent=text;target.dataset.error=String(error);};
async function api(path,options={}){
 const response=await fetch(path,{...options,headers:{'Content-Type':'application/json'},credentials:'same-origin'});
 if(response.status===401){location.assign('/login?next=%2Fnetworking');throw Error('Sign in again to continue. Unsaved details are not stored.');}
 let data;try{data=await response.json();}catch{throw Error('The response could not be read. Retry with the same details.');}
 if(!response.ok)throw Error(data.detail||'The request could not be completed.');
 return data;
}
function updateFields(){
 const referred=['warm_introduction','referral'].includes(value('kind'));
 $('referralFields').hidden=!referred;$('referralFields').disabled=!referred;
 const status=value('introduction_status'),known=referred&&status!=='unknown';
 $('permissionDetails').hidden=!known;
 for(const name of ['introduction_scope','introduction_evidence','introduction_confirmed_on']){
  const field=form.elements.namedItem(name);field.disabled=!known;field.required=known&&['granted','declined'].includes(status);
 }
}
function closeClearConfirmation(restoreFocus=false){$('clearConfirmation').hidden=true;$('clearCapture').setAttribute('aria-expanded','false');if(restoreFocus)$('clearCapture').focus();}
function resetForm(){form.reset();requestKey=crypto.randomUUID();dirty=false;closeClearConfirmation();updateFields();$('contactDetails').open=false;}
function clearForm(){resetForm();setText('captureResult','Form cleared. Nothing was saved.');form.elements.namedItem('first_name').focus();}
function paragraph(parent,text,className=''){const node=document.createElement('p');node.textContent=text;if(className)node.className=className;parent.append(node);}
async function history(){
 const epoch=++historyEpoch;$('refreshCaptures').disabled=true;
 try{
  const data=await api('/api/prospect/networking');if(epoch!==historyEpoch)return;
  $('recentCaptures').replaceChildren();
  for(const row of data.captures){
   const entry=row.payload,card=document.createElement('article');card.className='capture-card';
   const title=document.createElement('h3');title.textContent=[row.first_name,row.last_name].filter(Boolean).join(' ');card.append(title);
   paragraph(card,row.company||'Company not recorded','muted');paragraph(card,kinds[entry.kind]||'Manual capture','tag');
   paragraph(card,entry.context+(entry.occurred_on?' · '+entry.occurred_on:' · interaction date unknown'));
   if(entry.referrer)paragraph(card,'Referrer: '+entry.referrer.name+' · '+entry.referrer.context);
   if(entry.referrer)paragraph(card,permissions[entry.introduction.status]||permissions.unknown);
   if(entry.introduction.scope)paragraph(card,'Scope: '+entry.introduction.scope);
   if(entry.introduction.evidence)paragraph(card,'Evidence: '+entry.introduction.evidence);
   if(entry.introduction.confirmed_on)paragraph(card,'Permission recorded for: '+entry.introduction.confirmed_on);
   if(entry.note)paragraph(card,entry.note);
   if(entry.person){
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Submitted contact details (unverified)';details.append(summary);
    for(const [key,label] of [['company','Company'],['title','Title'],['email','Work email'],['linkedin_url','LinkedIn profile'],['phone','Direct phone'],['mobile_phone','Mobile phone'],['city','City'],['state','State'],['country','Country']])if(entry.person[key])paragraph(details,label+': '+entry.person[key]);
    paragraph(details,'These are the details entered with this interaction. Existing contact records are not updated by a matching capture.','hint');card.append(details);
   }
   paragraph(card,'Saved '+new Date(row.created_at).toLocaleString(),'muted');
   $('recentCaptures').append(card);
  }
  setText('historyStatus',data.captures.length?(data.has_more?'Showing the latest 20 captures. Earlier entries remain saved.':'No outreach or verification is implied by these notes.'):'No captures yet. Save your first connection.');
 }catch(error){if(epoch===historyEpoch)setText('historyStatus',error.message,true);}
 finally{if(epoch===historyEpoch)$('refreshCaptures').disabled=false;}
}
function markEdited(){dirty=true;setText('captureResult','');closeClearConfirmation();}
form.addEventListener('input',markEdited);
form.addEventListener('change',()=>{markEdited();updateFields();});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(pending||!form.reportValidity())return;
 const person=Object.fromEntries(['first_name','last_name','company','title','email','linkedin_url','phone','mobile_phone','city','state','country'].map(key=>[key,value(key)]));
 if(!person.company&&!person.email&&!person.linkedin_url){setText('captureResult','Add a company, individual work email or LinkedIn profile so a name alone is never used to match someone.',true);form.elements.namedItem('company').focus();return;}
 const referred=['warm_introduction','referral'].includes(value('kind')),status=referred?value('introduction_status'):'unknown';
 const input={request_key:requestKey,person,kind:value('kind'),context:value('context'),occurred_on:value('occurred_on'),note:value('note'),introduction:{status,...status!=='unknown'?{scope:value('introduction_scope'),evidence:value('introduction_evidence'),confirmed_on:value('introduction_confirmed_on')}:{}}};
 if(referred)input.referrer={name:value('referrer_name'),context:value('referrer_context')};
 closeClearConfirmation();pending=true;$('captureFields').disabled=true;setText('captureResult','Saving connection.');
 try{
  const result=await api('/api/prospect/networking',{method:'POST',body:JSON.stringify(input)});
  if(!result.capture){setText('captureResult',(result.errors||[]).map(item=>item.message).join('\n')||'Identity needs review. No connection or interaction was saved.',true);return;}
  const summary=result.replayed?'This connection was already saved. No duplicate was created.':result.added?'Connection and private context saved. Contact details remain unverified.':'Private context saved against the matching contact. Existing contact details were not changed; submitted details remain private in this capture.';
  resetForm();setText('captureResult',summary+(result.field_reviews?' Some supplied fields differ from the saved contact. Review its source history in Contacts.':''));await history();
 }catch(error){setText('captureResult',error.message,true);}
 finally{pending=false;$('captureFields').disabled=false;updateFields();}
});
$('clearCapture').addEventListener('click',()=>{if(pending)return;if(!dirty){clearForm();return;}$('clearConfirmation').hidden=false;$('clearCapture').setAttribute('aria-expanded','true');$('keepCapture').focus();});
$('keepCapture').addEventListener('click',()=>closeClearConfirmation(true));
$('confirmClearCapture').addEventListener('click',()=>{if(!pending&&!$('clearConfirmation').hidden)clearForm();});
$('clearConfirmation').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeClearConfirmation(true);}});
$('refreshCaptures').addEventListener('click',history);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('pageshow',event=>{if(event.persisted)history();});
updateFields();history();
