import https from 'node:https';
import http from 'node:http';
import {resolve4} from 'node:dns/promises';
import {isIP} from 'node:net';

export const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const contains=(a,b)=>normalize(b).length>=3&&(' '+normalize(a)+' ').includes(' '+normalize(b)+' ');
export function identityMatch(lead,content,scope){
 const name=[lead.first_name,lead.last_name].filter(Boolean).join(' ');
 const company=normalize(lead.company);const validCompany=company&&!/^(unknown|company unknown|n a|none)$/.test(company);
 const location=lead.city||lead.company_location||lead.location;
 const normalized=normalize(content),at=normalized.indexOf(normalize(name));
 // Require employer context near the person, never city alone or another distant biography.
 const local=at>=0?normalized.slice(Math.max(0,at-80),at+normalize(name).length+220):'';
 return scope==='person'?Boolean(lead.first_name&&lead.last_name&&contains(local,name)&&validCompany&&contains(local,lead.company)):Boolean(validCompany&&contains(content,lead.company)&&location&&contains(content,location));
}
export function publicIPv4(ip){
 if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export async function publicGet(value,{signal,maxBytes=2*1024*1024}={}){
 signal=signal||AbortSignal.timeout(15000);
 let url=new URL(value);
 for(let hop=0;hop<4;hop++){
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw Error('Unsupported address');
  signal.throwIfAborted();
  const addresses=await new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});resolve4(url.hostname).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
  signal.throwIfAborted();
  if(!addresses.length||!addresses.every(publicIPv4))throw Error('Non-public address');
  const response=await new Promise((resolve,reject)=>{
   const request=(url.protocol==='https:'?https:http).get(url,{signal,headers:{'user-agent':'ProspectPilotResearch/1.0 (+https://prospectpilot.io)','accept':'application/json,text/html,text/plain','accept-encoding':'identity'},lookup:(_host,options,cb)=>options.all?cb(null,[{address:addresses[0],family:4}]):cb(null,addresses[0],4)},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.destroy();resolve({redirect:res.headers.location});return;}
    if(res.statusCode!==200){res.destroy();reject(Error('Source HTTP '+res.statusCode));return;}
    const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>maxBytes){res.destroy(Error('Source too large'));return;}chunks.push(c);});res.on('error',reject);res.on('end',()=>resolve({text:Buffer.concat(chunks).toString(),type:res.headers['content-type']||'',url:url.href}));
   });request.on('error',reject);
  });
  if(response.redirect){url=new URL(response.redirect,url);continue;}return response;
 }throw Error('Too many redirects');
}
const plain=s=>String(s).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const scopeOf=id=>['website','professional','license','expertise','news'].includes(id)?'person':'company';
const filters={registry:/registr|incorporat|business entity/i,license:/license|licence|credential|npi/i,professional:/biograph|profile|team|leadership/i,announcement:/announc|acqui|expand|appoint|promot/i,news:/news|interview/i,association:/chamber|association|member/i,maps:/address|location|street|road/i,sec:/filing|10-k|10-q|8-k|edgar/i,expertise:/author|speaker|conference|patent/i,warn:/WARN|worker adjustment|layoff notice/i,mwbe:/MWBE|M\/WBE|certified business|minority.*business|women.*business/i,website:/./};
const coverage={registry:'GLEIF legal entity records with exact name and city matching, plus public government pages. Businesses without LEIs may be absent.',license:'Public credential pages; healthcare NPI records are registrations, not license verification.',professional:'Public biographies only; login-only profiles are unavailable.',maps:'Existing public business address pages; not a complete map directory.',sec:'Public SEC pages found through source links/indexed coverage; not every filing.',warn:'Public government WARN pages; interactive dashboards and PDFs may be unavailable. No inference about individual layoffs.',mwbe:'NYC certified business API plus public certification pages; no demographic inference.',expertise:'Crossref publication metadata plus public speaker/author pages.'};
export function createNativeResearch({get=publicGet,warn}={}){
 get=createCachedGet(get);
 const inFlight=new Map();
 async function run(lead,source){
  if(source==='warn')return warn?warn.research(lead):{source,status:'partial',records:[],checked_at:new Date().toISOString(),coverage:'Published WARN feeds',limitations:['WARN adapter is not configured on this deployment.']};
  const signal=AbortSignal.timeout(28000),scope=scopeOf(source),records=[],candidates=[],failures=[];
  const read=async (url,format)=>{signal.throwIfAborted();return get(url,{format,signal:AbortSignal.any([signal,AbortSignal.timeout(7000)])});};
  const json=async url=>JSON.parse((await read(url,'json')).text);
  const name=[lead.first_name,lead.last_name].filter(Boolean).join(' ');
  const company=String(lead.company||'').slice(0,180);
  if(normalize(company).length<3||/^(unknown|company unknown|none|n a)$/.test(normalize(company)))return {source,status:'partial',records:[],checked_pages:0,discovered_urls:[],checked_at:new Date().toISOString(),coverage:'Lead identity is incomplete.',limitations:['A company name is needed to distinguish this lead from unrelated people.']};
  const add=(url,content,kind='public_page',date=null)=>{
   if(!identityMatch(lead,content,scope))return;
   if(source==='warn'&&!date)return;
   let target;try{target=new URL(url);if(!['http:','https:'].includes(target.protocol))return;}catch{return;}
   if(records.some(r=>r.url===target.href)||records.length>=3)return;
   // Keep one short excerpt per original page, not a copied article or synthesized claim.
   const needle=scope==='person'?name:company;const pos=content.toLowerCase().indexOf(needle.toLowerCase());
   const excerpt=content.slice(Math.max(0,pos)).split(/\s+/).slice(0,20).join(' ');
   records.push({source,scope,url:target.href,excerpt,source_date:date,checked_at:new Date().toISOString(),status:'machine_matched',method:kind,note:'Name and company/location matched in source text. Review the original before relying on it.'});
  };
  async function probe(label,fn){try{await fn();}catch{failures.push(label+' unavailable');}}
  if(source==='registry')await probe('GLEIF legal entity registry',async()=>{
 const url=new URL('https://api.gleif.org/api/v1/lei-records');url.search=new URLSearchParams({'filter[entity.legalName]':company,'page[size]':'5'}).toString();
 const data=await json(url);if(!Array.isArray(data.data))throw Error('Invalid registry response');
 for(const item of data.data){const a=item.attributes||{},e=a.entity||{},address=e.legalAddress||{};
 if(normalize(e.legalName?.name)!==normalize(company)||!identityMatch(lead,[e.legalName?.name,address.city].join(' '),'company'))continue;
 const target='https://api.gleif.org/api/v1/lei-records/'+encodeURIComponent(a.lei);
 add(target,[e.legalName.name,address.city,address.country,'LEI',a.lei].join(' '),'GLEIF legal entity record',a.registration?.lastUpdateDate||null);
 const saved=records.find(r=>r.url===target);if(saved)saved.facts=[{field:'legal_name',value:e.legalName.name},{field:'legal_entity_identifier',value:a.lei},{field:'registered_city',value:address.city},{field:'entity_status',value:e.status}].filter(f=>typeof f.value==='string'&&f.value.length);
 }
 });
 if(source==='mwbe')await probe('NYC MWBE',async()=>{
   const url=new URL('https://data.cityofnewyork.us/resource/ci93-uc8s.json');url.search=new URLSearchParams({'$q':company,'$limit':'10','$select':'vendor_formal_name,vendor_dba,city,state,zip,website,certification'}).toString();
   const rows=await json(url);if(!Array.isArray(rows))throw Error('Invalid directory');
   for(const r of rows){
    if(![r.vendor_formal_name,r.vendor_dba].some(n=>normalize(n)===normalize(company)))continue;
    add(url.href,[r.vendor_formal_name,r.vendor_dba,r.city,r.state,r.zip,r.certification].filter(Boolean).join(' '),'NYC MWBE directory');
   }
  });
  if(source==='license'&&lead.first_name&&lead.last_name)await probe('NPI healthcare registry',async()=>{
   const url='https://npiregistry.cms.hhs.gov/api/?'+new URLSearchParams({version:'2.1',first_name:lead.first_name,last_name:lead.last_name,limit:'5'});
   const data=await json(url);if(!Array.isArray(data.results))throw Error('Registry unavailable');
   for(const item of data.results){const b=item.basic||{};const addresses=(item.addresses||[]).filter(a=>a.address_purpose==='LOCATION').map(a=>[a.city,a.state,a.postal_code].join(' ')).join('; ');
    add('https://npiregistry.cms.hhs.gov/provider-view/'+item.number,[b.first_name,b.last_name,addresses,'NPI registration (not license verification)'].join(' '),'NPI registration');
   }
  });
  if(source==='expertise')await probe('Crossref',async()=>{
   const url=new URL('https://api.crossref.org/works');url.search=new URLSearchParams({'query.bibliographic':name+' '+company,rows:'5'}).toString();
   const data=await json(url);if(!Array.isArray(data.message?.items))throw Error('Invalid publications');
   for(const item of data.message.items)for(const author of item.author||[]){
    if(normalize([author.given,author.family].join(' '))!==normalize(name))continue;
    const own=[author.given,author.family,...(author.affiliation||[]).map(x=>x.name)].join(' ');
    if(identityMatch(lead,own,'person'))add(item.URL,own+' '+(item.title||[]).join(' '),'Crossref metadata');
   }
  });
  // Discover official website candidates without asking the user for URLs.
  if(source==='website')await probe('Wikidata website discovery',async()=>{
   const url='https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbsearchentities',search:company,language:'en',format:'json',limit:'3'});
   const data=await json(url);const ids=(data.search||[]).filter(x=>normalize(x.label)===normalize(company)).map(x=>x.id);
   if(ids.length){const entities=await json('https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'claims',format:'json'}));for(const entity of Object.values(entities.entities||{}))for(const claim of entity.claims?.P856||[])candidates.push(claim.mainsnak?.datavalue?.value);}
  });
  for(const value of [lead.company_website,...(lead.native_research?.website?.discovered_urls||[])])if(value)candidates.push(value);
  for(const e of lead.evidence||[])if(e.source_url)candidates.push(e.source_url);
  for(const e of lead.research_records||[])if(e.url)candidates.push(e.url);
  // GDELT discovers public pages; search titles alone never become lead evidence.
  await probe('Public news index',async()=>{
   const phrase=company.replace(/[^\p{L}\p{N} ]/gu,' ').trim();if(phrase.length<3)return;
   const query='"'+phrase+'"'+(source==='website'?'':' '+({registry:'registration',license:'license',professional:'profile',announcement:'announcement',news:'',association:'association',maps:'address',sec:'SEC',expertise:'speaker',warn:'WARN',mwbe:'MWBE'}[source]||''));
   const data=await json('https://api.gdeltproject.org/api/v2/doc/doc?'+new URLSearchParams({query,mode:'artlist',format:'json',maxrecords:'5',timespan:'3months'}));if(!Array.isArray(data.articles))throw Error('Index unavailable');
   for(const a of data.articles)candidates.push(a.url);
  });
  const discovered=new Set(),robots=new Map();let checked=0,blocked=0;
  for(const value of [...new Set(candidates)].slice(0,4)){
   if(signal.aborted)break;
   await probe('Public page',async()=>{
    const url=new URL(value);if(/(^|\.)(linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com)$/.test(url.hostname)){blocked++;return;}
    if(['warn','registry'].includes(source)&&!url.hostname.endsWith('.gov'))return;
    if(source==='sec'&&!/(^|\.)sec\.gov$/.test(url.hostname))return;
    if(!robots.has(url.origin)){
     try{const r=await read(new URL('/robots.txt',url));robots.set(url.origin,r.text);}catch(e){if(/HTTP 404/.test(e.message))robots.set(url.origin,'');else throw e;}
    }
    // Conservative: honor any matching disallow directive. Never bypass access challenges.
    const disallowed=robots.get(url.origin).split(/\r?\n/).some(line=>{const m=line.match(/^\s*Disallow:\s*(\S+)/i);return m&&url.pathname.startsWith(m[1].split('*')[0]);});
    if(disallowed){blocked++;return;}
    const page=await read(url);if(!/text\/html|text\/plain/.test(page.type))throw Error('Unsupported page type');
    const content=plain(page.text);checked++;
    if(!filters[source].test(content))return;
    if(source==='website'&&(identityMatch(lead,content,'person')||identityMatch(lead,content,'company'))){
     discovered.add(page.url);
     for(const match of page.text.matchAll(/href=["']([^"'<>]+)["']/gi)){try{const link=new URL(match[1],page.url);if(link.origin===new URL(page.url).origin&&/about|team|leadership|news|contact|member|license|certif/i.test(link.pathname)&&discovered.size<12)discovered.add(link.href);}catch{}}
    }
    const date=source==='warn'?content.match(/notice date\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i)?.[1]:null;
    // A generic page date cannot be asserted as a WARN notice date.
    if(source==='warn'){if(!/notice date\s*[:\-]?\s*\d{4}-\d{2}-\d{2}/i.test(content))return;}
    add(page.url,content,'public_page',date||null);
   });
  }
  return {source,status:records.length?'matched':failures.length||blocked?'partial':'no_match',records,checked_pages:checked,discovered_urls:[...discovered],checked_at:new Date().toISOString(),coverage:coverage[source]||'Public pages discovered from saved business information and the public news index.',limitations:[...new Set(failures),...(blocked?['Some sources disallow automated access.']:[])]};
 }
 return async(lead,source)=>{
  const key=JSON.stringify([lead.id,source,lead.first_name,lead.last_name,lead.company,lead.location,lead.city,lead.company_location,lead.company_website]);if(inFlight.has(key))return inFlight.get(key);
  if(inFlight.size>=3)throw Error('Research is busy. Please retry shortly.');
  const job=run(lead,source).finally(()=>inFlight.delete(key));inFlight.set(key,job);return job;
 };
}

export function createCachedGet(get,{ttl=300000,maxEntries=64,maxBytes=8000000,now=Date.now}={}){
 if(!Number.isFinite(ttl)||ttl<=0||!Number.isSafeInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid source cache limits');
 const entries=new Map();let bytes=0;
 return async(value,options={})=>{
  options.signal?.throwIfAborted();
  if(String(value).split('?')[0].endsWith('/robots.txt'))return get(value,options);
  const key=String(value)+'|'+(options.maxBytes||2097152)+'|'+(options.format||'text');
  const found=entries.get(key);
  if(found&&found.until>now()){entries.delete(key);entries.set(key,found);return {...found.result};}
  if(found){bytes-=found.size;entries.delete(key);}
  // Do not share another request's cancellation signal.
  const result=await get(value,options);
  // HTTP 200 error pages are not usable JSON and must not poison retries.
  if(options.format==='json')JSON.parse(result.text);
  const size=Buffer.byteLength(result.text||'');
  if(size<=maxBytes&&!entries.has(key)){
   while(entries.size&&(entries.size>=maxEntries||bytes+size>maxBytes)){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}
   entries.set(key,{result:{...result},size,until:now()+ttl});bytes+=size;
  }
  return result;
 };
}
