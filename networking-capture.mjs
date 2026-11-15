// Manual observations, not relationship inference or permission to contact.
const fail=message=>Object.assign(Error(message),{status:422});
export const CAPTURE_KINDS={in_person:'In-person conversation',warm_introduction:'Warm introduction',referral:'Referral',manual:'Manual entry'};
const personFields=['first_name','last_name','company','title','email','linkedin_url','phone','mobile_phone','city','state','country'];
function object(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw fail('Provide valid '+label+' fields only.');
 return value;
}
function text(value,max,label,required=false){
 if(value===undefined||value===null)value='';
 if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw fail(label+' is invalid or too long.');
 const result=value.normalize('NFKC').trim();
 if(result.length>max||required&&!result)throw fail('Provide '+label+'.');
 return result;
}
function date(value,label,now,required=false){
 const day=text(value,10,label,required);
 if(day&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||day>now.toISOString().slice(0,10)))throw fail('Use a valid '+label+', no later than today.');
 return day||null;
}
export function normalizeNetworkingCapture(input,now=new Date()){
 object(input,['request_key','person','kind','context','occurred_on','note','referrer','introduction'],'capture');
 const request_key=text(input.request_key,100,'request key',true);
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(request_key))throw fail('Use a valid request key.');
 const raw=object(input.person,personFields,'person');
 const person=Object.fromEntries(personFields.map(key=>[key,text(raw[key],key==='linkedin_url'?500:200,key.replaceAll('_',' '),['first_name','last_name'].includes(key))]));
 if(!person.company&&!person.email&&!person.linkedin_url)throw fail('Add a company, individual work email or LinkedIn profile so a name alone is never used to match someone.');
 if(!Object.hasOwn(CAPTURE_KINDS,input.kind))throw fail('Choose how you met this person.');
 const entry={kind:input.kind,context:text(input.context,200,'source or meeting context',true),occurred_on:date(input.occurred_on,'interaction date',now),note:text(input.note,2000,'interaction note')};
 const referred=['warm_introduction','referral'].includes(entry.kind);
 if(referred){
  const referrer=object(input.referrer,['name','context'],'referrer');
  entry.referrer={name:text(referrer.name,120,'referrer name',true),context:text(referrer.context,200,'referrer company or identifying context',true)};
 }else if(input.referrer!==undefined&&input.referrer!==null)throw fail('Referrer details belong only to an introduction or referral.');
 const introduction=object(input.introduction||{},['status','scope','evidence','confirmed_on'],'introduction');
 const status=introduction.status||'unknown';
 if(!['unknown','requested','granted','declined'].includes(status))throw fail('Choose a supported introduction permission status.');
 if(!referred&&status!=='unknown')throw fail('Introduction permission applies only to a referral or introduction.');
 const scope=text(introduction.scope,500,'introduction scope'),evidence=text(introduction.evidence,1000,'permission evidence');
 const confirmed_on=date(introduction.confirmed_on,'permission date',now,status==='granted'||status==='declined');
 if(status==='unknown'&&(scope||evidence||confirmed_on))throw fail('Leave permission details blank while permission is unknown.');
 if(['granted','declined'].includes(status)&&(!scope||!evidence))throw fail('Record who gave or declined permission, what introduction it covers, and the supporting evidence.');
 entry.introduction={status,scope,evidence,confirmed_on};
 // Deliberately no contact consent, verification, qualification or relationship
 // status is accepted. These observations never satisfy an outreach gate.
 const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
 const csv=[personFields,personFields.map(key=>person[key])].map(row=>row.map(quote).join(',')).join('\n');
 return {request_key,person,entry,csv,source:'Networking: '+CAPTURE_KINDS[entry.kind]};
}
