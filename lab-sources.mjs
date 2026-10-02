import {publicGet, createCachedGet} from './native-research.mjs';
import {parsePublicWebPage,discoverMarketCompanies} from './generated/worker.mjs';
import {nameKey, publicURL, linkedinURL} from './lead-quality.mjs';
import {robotsAllowed} from './robots-policy.mjs';

const plain = html => String(html).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const blockedHost = host => /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|fastpeoplesearch\.com|familytreenow\.com|whitepages\.com|fec\.gov)$/.test(host);
const companyKey = value => nameKey(value).replace(/\b(incorporated|corporation|company|inc|corp|llc|ltd|limited|co)\b/g,'').replace(/\s+/g,' ').trim();
const biographyPriority = value => {
  const path=new URL(value).pathname;
  if(/leadership|executive|biograph|\bbios?\b/i.test(path))return 0;
  if(/team|management|board-of-directors/i.test(path))return 1;
  if(/people/i.test(path))return 2;
  return 3;
};

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

// A news sentence names a person in a role at this company only as
// "<Name>[,] (is|was|serves as)? [the] <title> (of|at|with|for) [the] <Company>"
// or "<Company>['s] <title> <Name>". Nearness alone is not enough: in
// "Harbor Electrical acquired Other Firm. Kim Doe is the owner of Other Firm."
// Kim Doe is not Harbor Electrical's owner.
const escapeRe=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const looseWords=value=>String(value||'').trim().split(/\s+/).filter(Boolean).map(escapeRe).join('[\\s,.-]+');
export function newsRoleLinks(text,name,title,company){
  const role=(String(title||'').match(/[A-Za-z][A-Za-z-]{2,}/g)||[]).find(w=>!/^(the|and|of|at|for|with|senior|chief)$/i.test(w))||'';
  const person=looseWords(name),employer=looseWords(String(company||'').replace(/[^\p{L}\p{N}&' -]/gu,' '));
  if(!person||!employer||!role)return false;
  const sentences=String(text).split(/(?<=[.!?])\s+/);
  const after=new RegExp(`${person},?\\s+(?:(?:is|was|serves as|has been|who is)\\s+)?(?:(?:the|a|an|its|our)\\s+)?[\\p{L}&,' -]{0,40}?\\b${escapeRe(role)}\\w*[\\p{L}&,' -]{0,30}?\\s(?:of|at|with|for)\\s+(?:the\\s+)?${employer}\\b`,'iu');
  const before=new RegExp(`${employer}(?:'s|’s)?\\s+(?:[\\p{L}&-]+\\s+){0,3}?${escapeRe(role)}\\w*\\s+${person}\\b`,'iu');
  // Words of the title itself ("Vice President of Operations") may hold a
  // connector; any other "of/at" before the company means a different employer.
  const ownTitle=new RegExp(looseWords(String(title||'').replace(/[^\p{L}\p{N}&' -]/gu,' ')),'iu');
  return sentences.some(s=>{const segment=s.match(after);
    if(segment){const head=segment[0].slice(0,segment[0].search(new RegExp(`\\s(?:of|at|with|for)\\s+(?:the\\s+)?${employer}\\b`,'iu'))).replace(ownTitle,' ');if(!/\s(?:of|at|with|for)\s/i.test(head))return true;}
    return before.test(s);});
}
// Where a small company's site usually keeps its people, tried when menus are
// built by script and their links cannot be read. Each is still robots-checked.
const COMMON_PATHS=['/leadership','/our-team','/team','/management','/about-us','/about','/company','/who-we-are','/staff'];
export function createLabSources({get=publicGet,warn,searchKey='',searchCostMicros=null,apiFetch=fetch,discoverCompanies=discoverMarketCompanies,fallbacks=true}={}) {
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
    const targetCompany=companyKey(employer.company),used=[];
    // A page counts only when it names the employer; people found there are
    // kept only for that employer. A news article's own site is never taken
    // as the company's website.
    const readPeople=(result,{scope,sourceName,website})=>{
      if (targetCompany.length<3 || !(` ${companyKey(plain(result.text))} `).includes(` ${targetCompany} `)) return null;
      let found=parsePublicWebPage(result.text,result.url,employer.company).filter(c=>companyKey(c.company)===targetCompany);
      // The page reader credits everyone on a page to the company being
      // researched. On the company's own site that holds; in a news article
      // the sentence itself must tie the person, their role and the company.
      if(scope==='news'||scope==='external'){const article=plain(result.text);found=found.filter(c=>newsRoleLinks(article,c.name,c.current_title,employer.company));}
      for (const c of found) {
        // Company address never becomes residence. Do not manufacture a LinkedIn slug or email pattern.
        c.company_website=website;c.company_location=[employer.city,employer.state].filter(Boolean).join(', ');
        c.linkedin_url=linkedinURL(c.linkedin_url);c.evidence=(c.evidence||[]).map(e=>({...e,...(sourceName?{source:sourceName}:{}),snippet:String(e.snippet||'').split(/\s+/).slice(0,20).join(' ')}));
        if(sourceName)c.source_names=[sourceName];
        candidates.push(c);
      }
      documents.push({url:result.url,scope,people_found:found.length});
      return found.length;
    };
    const probed=new Set(),queued=new Set(urls),seen=new Set();
    const siteOrigin=urls.length?new URL(urls[0]).origin:'';
    const knownWebsite=publicURL(employer.website);
    const hostKey=url=>new URL(url).hostname.replace(/^www\./,'');
    // Only supplied or official-index sites can establish an employer website.
    // Search results and redirects do not gain that status merely by mentioning it.
    const officialHosts=new Set((source==='web_search'?(knownWebsite?[knownWebsite]:[]):urls).map(hostKey));
    const employerWebsite=knownWebsite?new URL(knownWebsite).origin:source==='public_web'?siteOrigin:'';
    // Pass 0 follows the site's own links. Pass 1 runs only when that found
    // nobody: the usual addresses, tried once each.
    for(let pass=0;pass<2;pass++){
    if(pass===1){
      if(!fallbacks||source==='web_search'||!siteOrigin||candidates.length||signal.aborted)break;
      used.push('common_paths');
      urls=COMMON_PATHS.map(path=>siteOrigin+path).filter(href=>!queued.has(href)&&!seen.has(href));
      urls.forEach(href=>{probed.add(href);queued.add(href);});
    }
    for(let i=0;i<urls.length&&seen.size<(pass?10:5)&&!signal.aborted;i++) {
      try {
        const result=await page(urls[i],signal);if(seen.has(result.url))continue;seen.add(result.url);
        const external=!officialHosts.has(hostKey(result.url));
        if(readPeople(result,external
          ? {scope:'external',sourceName:source==='web_search'?'Web search page':'External public page',website:employerWebsite}
          : {scope:'professional',website:new URL(result.url).origin})===null){if(!probed.has(urls[i]))errors.push('A page did not establish the employer identity.');continue;}
        // A publisher's About/Team navigation describes the publisher, not the
        // employer. Preserve the remaining source budget for relevant results.
        if(external)continue;
        const base=new URL(result.url);
        const discovered=new Set();
        for(const match of result.text.matchAll(/href=["']([^"'<>]+)["']/gi)) {
          let link;try{link=new URL(match[1],base);}catch{continue;}
          link.hash='';
          if (link.origin===base.origin&&/team|leadership|executive|people|about|management|biograph|board-of-directors/i.test(link.pathname)&&!queued.has(link.href)&&!seen.has(link.href))discovered.add(link.href);
        }
        // Navigation order must not spend the page budget on general news and
        // responsibility pages before leadership links later in the same menu.
        const pending=[...new Set([...urls.slice(i+1),...discovered])].sort((a,b)=>biographyPriority(a)-biographyPriority(b)).slice(0,Math.max(0,(pass?COMMON_PATHS.length:9)-i-1));
        pending.forEach(url=>queued.add(url));urls.splice(i+1,urls.length,...pending);
      } catch(error) {
        // A guessed address that does not exist is not a failure; a publisher's refusal still is.
        if(probed.has(urls[i])&&!/Publisher/.test(error.message))continue;
        errors.push(/Publisher|source|format|redirect/i.test(error.message)?error.message:'Public page unavailable.');
      }
    }
    }
    if(!siteOrigin) errors.push('No official website was found in the free index. Add an employer website or enable licensed web search.');
    // When the company's own pages give no people (blocked, missing or silent),
    // the free public news index is the next route: up to three articles that
    // name the company, each robots-checked like any other page.
    let articlesRead=0;
    if(fallbacks&&source!=='web_search'&&!candidates.length&&!signal.aborted) {
      used.push('news');
      try {
        const phrase=employer.company.replace(/[^\p{L}\p{N}& ]/gu,' ').replace(/\s+/g,' ').trim();
        const data=phrase.length>=3?await json('https://api.gdeltproject.org/api/v2/doc/doc?'+new URLSearchParams({query:`"${phrase}" (owner OR president OR founder OR CEO OR "vice president") sourcelang:english`,mode:'artlist',format:'json',maxrecords:'10',timespan:'3months'}),signal,2000000):{articles:[]};
        const articles=[...new Set((Array.isArray(data.articles)?data.articles:[]).map(a=>publicURL(a?.url)).filter(Boolean))];
        let fromNews=0;
        for(const url of articles){
          if(articlesRead>=3||signal.aborted)break;
          try{const result=await page(url,signal);articlesRead++;fromNews+=readPeople(result,{scope:'news',sourceName:'News article',website:publicURL(employer.website)?new URL(employer.website).origin:''})||0;}
          catch(error){if(/Publisher/.test(error.message))errors.push('A news site blocks automated reading.');}
        }
        if(!fromNews)errors.push(articles.length?'News articles named no people with a matching role at this company.':'No recent news articles named this company.');
      } catch {errors.push('Public news index unavailable.');}
    }
    return {status:errors.length?'partial':candidates.length?'completed':'no_match',candidates,documents,errors:[...new Set(errors)],pages_checked:seen.size+articlesRead,fallbacks:used};
  }
  // Companies near a place, from OpenStreetMap's public business directory
  // (free, ODbL). Business listings only; people are found afterwards on each
  // company's own pages.
  async function market({location,radius_miles,industries,max_companies}) {
    const found=await discoverCompanies({locations:[location],radius_miles,industries,max_companies});
    const companies=(found.companies||[]).map(c=>({name:c.name,website:c.website||'',location:c.location||'',distance_miles:c.distance_miles??null,industries:c.industries||[],source:c.source||'OpenStreetMap',source_url:c.source_url||''}));
    // A type the directory does not recognise was not searched: say so, and
    // do not report the search as complete.
    const unmatched=(found.unmatched_terms||[]).map(t=>String(t).slice(0,80)).slice(0,20);
    const errors=[...(found.errors||[]),...(unmatched.length&&companies.length?[`Not recognised, so not searched: ${unmatched.join(', ')}. Try another name for ${unmatched.length===1?'this business type':'these business types'}.`]:[])];
    return {status:companies.length&&!unmatched.length?'completed':errors.length?'partial':'no_match',companies,errors,unmatched_terms:unmatched,location:found.location||null,radius_miles:found.radius_miles,industry_labels:found.industry_labels||[],provider:found.provider||'',attribution:found.attribution||''};
  }
  return {run, market, quote:source=>source==='web_search' ? searchKey && Number.isSafeInteger(searchCostMicros) && searchCostMicros>=0 ? searchCostMicros : null : 0,
    readiness:{web_search:Boolean(searchKey)&&Number.isSafeInteger(searchCostMicros)&&searchCostMicros>=0,web_search_query_cost_micros:Number.isSafeInteger(searchCostMicros)?searchCostMicros:null}};
}
