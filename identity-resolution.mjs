const clean=v=>String(v??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const tokens=v=>new Set(clean(v).split(' ').filter(Boolean));
const jaccard=(a,b)=>{const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let same=0;for(const x of A)if(B.has(x))same++;return same/(A.size+B.size-same);};
const phone=v=>String(v??'').replace(/\D/g,'').slice(-10);

export function identityFingerprint(lead={}){
  return {
    name:clean([lead.first_name,lead.middle_name,lead.last_name,lead.suffix].filter(Boolean).join(' ')),
    company:clean(lead.company),title:clean(lead.current_title),city:clean(lead.city),state:clean(lead.state),
    linkedin:clean(lead.linkedin_url),business_email:clean(lead.business_email),personal_email:clean(lead.personal_email),
    mobile:phone(lead.mobile),business_phone:phone(lead.business_phone),education:(lead.education||[]).map(e=>clean(e.school)).filter(Boolean)
  };
}

export function compareIdentity(a,b){
  const A=identityFingerprint(a),B=identityFingerprint(b);
  const reasons=[];let score=0,weight=0,hardConflict=false;
  const add=(label,value,w)=>{score+=value*w;weight+=w;if(value>=0.8)reasons.push(`match:${label}`);else if(value===0)reasons.push(`different:${label}`);};
  const lastA=clean(a.last_name),lastB=clean(b.last_name),firstA=clean(a.first_name),firstB=clean(b.first_name);
  if(lastA&&lastB&&lastA!==lastB)hardConflict=true;
  add('name',jaccard(A.name,B.name),30);
  if(A.linkedin&&B.linkedin)add('linkedin',A.linkedin===B.linkedin?1:0,35);
  if(A.business_email&&B.business_email)add('business_email',A.business_email===B.business_email?1:0,30);
  if(A.personal_email&&B.personal_email)add('personal_email',A.personal_email===B.personal_email?1:0,30);
  if(A.mobile&&B.mobile)add('mobile',A.mobile===B.mobile?1:0,30);
  if(A.business_phone&&B.business_phone)add('business_phone',A.business_phone===B.business_phone?1:0,18);
  if(A.company&&B.company)add('company',jaccard(A.company,B.company),18);
  if(A.title&&B.title)add('title',jaccard(A.title,B.title),7);
  if(A.city&&B.city)add('city',A.city===B.city?1:0,8);
  if(A.state&&B.state){const same=A.state===B.state?1:0;add('state',same,8);if(!same&&A.company&&B.company&&jaccard(A.company,B.company)<0.25)hardConflict=true;}
  if(A.education.length&&B.education.length)add('education',Math.max(...A.education.flatMap(x=>B.education.map(y=>jaccard(x,y)))),8);
  if(firstA&&firstB&&firstA[0]!==firstB[0])hardConflict=true;
  const confidence=weight?Math.round(score/weight*100):0;
  const outcome=hardConflict?'unresolved':confidence>=85?'confirmed':confidence>=65?'probable':'unresolved';
  return {outcome,confidence,hard_conflict:hardConflict,reasons};
}

export function chooseIdentityMatch(candidate,existing=[]){
  const ranked=existing.map(record=>({record,...compareIdentity(candidate,record)})).sort((a,b)=>b.confidence-a.confidence);
  if(!ranked.length)return {outcome:'new',confidence:100,match:null,alternatives:[]};
  const top=ranked[0],second=ranked[1];
  if(top.outcome==='confirmed'&&(!second||top.confidence-second.confidence>=12))return {outcome:'confirmed',confidence:top.confidence,match:top.record,alternatives:ranked.slice(1,4)};
  if(top.outcome!=='unresolved'&&(!second||top.confidence-second.confidence>=18))return {outcome:'probable',confidence:top.confidence,match:top.record,alternatives:ranked.slice(1,4)};
  return {outcome:'review',confidence:top.confidence,match:null,alternatives:ranked.slice(0,4)};
}
