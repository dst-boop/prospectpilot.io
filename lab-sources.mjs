import {publicGet, createCachedGet} from './native-research.mjs';
import {parsePublicWebPage} from './generated/worker.mjs';
import {nameKey, publicURL, linkedinURL} from './lead-quality.mjs';
import {robotsAllowed} from './robots-policy.mjs';

const plain = html => String(html).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const blockedHost = host => /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|fastpeoplesearch\.com|familytreenow\.com|whitepages\.com|fec\.gov)$/.test(host);
const companyKey = value => nameKey(value).replace(/\b(incorporated|corporation|company|inc|corp|llc|ltd|limited|co)\b/g,'').replace(/\s+/g,' ').trim();

export function proxyCandidates(html, url, company, filedAt) {
  const results=[];
  for (const row of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>plain(m[1])).filter(Boolean);
    const ageAt=cells.findIndex(c=>/^\d{2}$/.test(c) && Number(c)>=56 && Number(c)<=99);
    if (ageAt<1) continue;
    const name=cells[ageAt-1].replace(/\s*\(\d+\).*$/,'').trim();
    if (!/^[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]*){1,4}$/u.test(name)) continue;
    if(/\b(total|board|committee|composition|employees|directors|officers|average|number|compensation|executive summary)\b/i.test(name))continue;
    const title=cells.slice(ageAt+1).find(c=>/director|president|chief|officer|chair|retired/i.test(c));
    if (!title) continue;
    results.push({name,company,current_title:title.slice(0,160),estimated_age_range:cells[ageAt],source_url:url,source_names:['SEC proxy filing'],
      evidence:[{id:`sec-age:${nameKey(name)}:${filedAt}`,field:'estimated_age_range',value:cells[ageAt],source:'SEC proxy filing',kind:'reported',source_url:url,source_date:filedAt,snippet:`${name}, age ${cells[ageAt]}.`}]});
  }
  return [...new Map(results.map(c=>[nameKey(c.name),c])).values()].slice(0,60);
}

export function createLabSources({get=publicGet,warn,searchKey='',searchCostMicros=null,apiFetch=fetch}={}) {
  const cached=createCachedGet(get,{ttl:3600000,maxEntries:150,maxBytes:20000000});
  const robots=new Map();
  async function read(url, signal, maxBytes=2*1024*1024,options={}) {return cached(url,{signal,maxBytes,...options});}
  async function json(url,signal,maxBytes) {const r=await read(url,signal,maxBytes);return JSON.parse(r.text);}
  async function page(value,signal) {
    let url=new URL(value);
    for(let hop=0;hop<4;hop++){
    if(!publicURL(url.href))throw Error('Unsupported public source address.');
    if (blockedHost(url.hostname)) throw Error('This source requires a permitted export or licensed integration.');
    if (!robots.has(url.origin)) {
      try { robots.set(url.origin,(await read(new URL('/robots.txt',url).href,signal,100000)).text); }
      catch(error) {if (/HTTP 404/.test(error.message)) robots.set(url.origin,'');else throw Error('Source access rules could not be checked.');}
      if (robots.size>150) robots.delete(robots.keys().next().value);
    }
    if (!robotsAllowed(robots.get(url.origin),url.pathname+url.search)) throw Error('Publisher disallows automated access to this page.');
    // Follow each redirect here so the destination's host and robots rules are
    // checked before its page is fetched, including same-origin restricted paths.
    const result=await read(url.href,signal,2*1024*1024,{followRedirects:false});
    if(result.redirect){url=new URL(result.redirect,url);continue;}
    if(new URL(result.url).href!==url.href){url=new URL(result.url);continue;}
    if (!/text\/html|text\/plain/.test(result.type)) throw Error('This page format requires a manual excerpt or import.');
    return result;
    }
    throw Error('Public source exceeded the redirect limit.');
  }
  async function officialSites(company, signal) {
    const search=await json('https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbsearchentities',search:company,language:'en',format:'json',limit:'5'}),signal);
    const ids=(search.search||[]).filter(x=>companyKey(x.label)===companyKey(company)).map(x=>x.id);
    if (!ids.length) return [];
    const data=await json('https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'claims',format:'json'}),signal);
    return Object.values(data.entities||{}).flatMap(e=>(e.claims?.P856||[]).map(c=>publicURL(c.mainsnak?.datavalue?.value))).filter(Boolean).slice(0,2);
  }
  async function webSearch(company, signal) {
    if (!searchKey || !Number.isSafeInteger(searchCostMicros) || searchCostMicros<0) throw Error('Licensed search is not configured.');
    const response=await apiFetch('https://api.search.brave.com/res/v1/web/search?'+new URLSearchParams({q:`"${company}" leadership team biography retirement`,count:'5',country:'US'}),{headers:{'Accept':'application/json','X-Subscription-Token':searchKey},signal,redirect:'error'});
    if (!response.ok) {await response.body?.cancel();throw Error(`Search provider returned HTTP ${response.status}.`);}
    const reader=response.body.getReader();let bytes=0,parts=[];
    try {for (;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1000000)throw Error('Search response exceeded the size limit.');parts.push(value);}} finally {await reader.cancel();}
    const data=JSON.parse(Buffer.concat(parts).toString());
    return (data.web?.results||[]).map(r=>publicURL(r.url)).filter(Boolean);
  }
  async function run(source, employer) {
    const signal=AbortSignal.timeout(70000), errors=[], candidates=[], documents=[];
    if (source==='warn') {
      if (!warn) return {status:'unavailable',candidates:[],errors:['WARN is not configured.']};
      const result=await warn.research({company:employer.company,city:employer.city,state:employer.state,location:[employer.city,employer.state].filter(Boolean).join(', ')});
      return {status:result.status==='matched'?'completed':result.status==='no_match'?'no_match':'partial',candidates:[],documents:result.records||[],errors:result.limitations||[],scope:'employer',coverage:result.coverage};
    }
    if (source==='sec') {
      const tickers=await json('https://www.sec.gov/files/company_tickers.json',signal,5000000);
      const match=Object.values(tickers).filter(c=>companyKey(c.title)===companyKey(employer.company));
      if(match.length!==1){
        const key=companyKey(employer.company);
        const suggestions=key.length>=3?Object.values(tickers).filter(c=>companyKey(c.title).startsWith(key+' ')).slice(0,5).map(c=>c.title):[];
        return {status:'no_match',candidates:[],errors:['No unique SEC registrant matched the employer name.'+(suggestions.length?' Try the full legal employer name: '+suggestions.join('; ')+'.':' Use the full legal employer name shown in SEC filings.')]};
      }
      const cik=String(match[0].cik_str).padStart(10,'0');
      const sub=await json(`https://data.sec.gov/submissions/CIK${cik}.json`,signal,4000000);
      const recent=sub.filings?.recent, index=recent?.form?.findIndex(f=>f==='DEF 14A');
      if (!(index>=0)) return {status:'no_match',candidates:[],errors:['No recent definitive proxy filing found.']};
      const date=recent.filingDate[index];
      if (Date.now()-Date.parse(date)>550*86400000) return {status:'no_match',candidates:[],errors:['The latest proxy is older than the research freshness window.']};
      const acc=recent.accessionNumber[index].replaceAll('-',''), document=recent.primaryDocument[index];
      if (!/^\d+$/.test(acc)||! /^[a-zA-Z0-9_.-]+$/.test(document)) throw Error('Unsupported filing identifier.');
      const url=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${document}`;
      const result=await page(url,signal);
      return {status:'completed',candidates:proxyCandidates(result.text,result.url,employer.company,date),documents:[{url:result.url,source_date:date,scope:'company'}],errors:[]};
    }
    let urls=[];
    if(source==='web_search') urls=await webSearch(employer.company,signal);
    else {
      if(publicURL(employer.website)) urls.push(employer.website);
      if(!urls.length) {try{urls=await officialSites(employer.company,signal);}catch{errors.push('Official website index unavailable.');}}
    }
    const queued=new Set(urls),seen=new Set();
    for(let i=0;i<urls.length&&seen.size<5&&!signal.aborted;i++) {
      try {
        const result=await page(urls[i],signal);if(seen.has(result.url))continue;seen.add(result.url);
        const text=plain(result.text);
        // Search results need explicit employer context before any person can be associated with that employer.
        const targetCompany=companyKey(employer.company);
        if (targetCompany.length<3 || !(` ${companyKey(text)} `).includes(` ${targetCompany} `)) {errors.push('A page did not establish the employer identity.');continue;}
        const found=parsePublicWebPage(result.text,result.url,employer.company);
        for (const c of found) {
          if(companyKey(c.company)!==targetCompany)continue;
          // Company address never becomes residence. Do not manufacture a LinkedIn slug or email pattern.
          c.company_website=new URL(result.url).origin;c.company_location=[employer.city,employer.state].filter(Boolean).join(', ');
          c.linkedin_url=linkedinURL(c.linkedin_url);c.evidence=(c.evidence||[]).map(e=>({...e,snippet:String(e.snippet||'').split(/\s+/).slice(0,20).join(' ')}));
          candidates.push(c);
        }
        documents.push({url:result.url,scope:'professional',people_found:found.length});
        const base=new URL(result.url);
        for(const match of result.text.matchAll(/href=["']([^"'<>]+)["']/gi)) {
          let link;try{link=new URL(match[1],base);}catch{continue;}
          if (link.origin===base.origin&&/team|leadership|executive|people|about|management/i.test(link.pathname)&&!queued.has(link.href)&&urls.length<9) {queued.add(link.href);urls.push(link.href);}
        }
      } catch(error) {errors.push(/Publisher|source|format|redirect/i.test(error.message)?error.message:'Public page unavailable.');}
    }
    if(!urls.length) errors.push('No official website was found in the free index. Add an employer website or enable licensed web search.');
    return {status:errors.length?'partial':candidates.length?'completed':'no_match',candidates,documents,errors:[...new Set(errors)],pages_checked:seen.size};
  }
  return {run, quote:source=>source==='web_search' ? searchKey && Number.isSafeInteger(searchCostMicros) && searchCostMicros>=0 ? searchCostMicros : null : 0,
    readiness:{web_search:Boolean(searchKey)&&Number.isSafeInteger(searchCostMicros)&&searchCostMicros>=0,web_search_query_cost_micros:Number.isSafeInteger(searchCostMicros)?searchCostMicros:null}};
}
