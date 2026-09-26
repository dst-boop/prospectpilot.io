// Claude web research for one directory contact, ported from Lead Qualifier's
// /api/web-research. Claude searches the open web through the Messages API's
// server-side web search tool — a licensed API, not scraping — and reports
// what it found about the person's professional life, each finding with the
// exact words it rests on and the page they came from.
//
// Nothing here is taken on trust:
//  - a finding whose source URL was not among the pages the search actually
//    returned is dropped, so a source cannot be invented;
//  - donation records (52 U.S.C. §30111(a)(4)) and LinkedIn are blocked at the
//    tool, and the prompt asks for no wealth, income, age or family inference;
//  - findings are stored unreviewed and change no field, gate or priority —
//    the operator reads the source and corrects the contact if it holds.
import Anthropic from '@anthropic-ai/sdk';

export const WEB_RESEARCH_MODEL='claude-opus-5';
export const FINDING_FIELDS=['title','employer','tenure','location','education','certification','public_bio','other'];
const BLOCKED_DOMAINS=['fec.gov','opensecrets.org','followthemoney.org','linkedin.com'];
const fail=(status,message)=>Object.assign(Error(message),{status});
const text=(v,max)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
const SCHEMA={type:'object',additionalProperties:false,required:['found','summary','findings'],properties:{
  found:{type:'boolean'},
  summary:{type:'string'},
  findings:{type:'array',items:{type:'object',additionalProperties:false,required:['field','value','quote','url'],properties:{
    field:{type:'string',enum:FINDING_FIELDS},value:{type:'string'},quote:{type:'string'},url:{type:'string'}}}}}};
const SYSTEM=`You research one named professional for a financial advisor's prospecting notes.
Search the public web for this exact person — the name together with the employer, and the location when given — and report only what the sources say about their professional life: current title and employer, how long they have been there, where they are based, education, professional certifications, and public biographies, speaker pages or announcements.
Rules:
- A finding needs a quote copied exactly from the page and that page's URL. If you cannot quote it, leave it out.
- If the pages could be about a different person with the same name, leave them out. Returning found=false with no findings is a good answer when nothing clearly matches.
- Never infer or state wealth, income, assets, age, health, family, religion, politics or donations, even if a page mentions them.
- The summary is one or two plain sentences about what was and was not found.`;

export function createWebResearch({apiKey='',client=null,now=()=>new Date(),maxSearches=5}={}){
  const anthropic=client||(apiKey?new Anthropic({apiKey,maxRetries:1,timeout:120000}):null);
  async function research(contact){
    if(!anthropic)throw fail(503,'Web research is not configured.');
    if(contact.suppressed)throw fail(422,'Suppressed contacts cannot be researched.');
    const name=[contact.first_name,contact.last_name].map(v=>text(v,100)).filter(Boolean).join(' ');
    if(!name||!text(contact.company,200))throw fail(422,'A name and employer are needed to research someone on the web.');
    const who=[`Name: ${name}`,`Employer: ${text(contact.company,200)}`,contact.title&&`Title: ${text(contact.title,200)}`,
      [contact.city,contact.state].filter(Boolean).length&&`Location: ${[contact.city,contact.state].map(v=>text(v,100)).filter(Boolean).join(', ')}`].filter(Boolean).join('\n');
    const messages=[{role:'user',content:who}];
    const params={model:WEB_RESEARCH_MODEL,max_tokens:16000,system:SYSTEM,
      betas:['server-side-fallback-2026-07-01'],fallbacks:'default',
      tools:[{type:'web_search_20260209',name:'web_search',max_uses:maxSearches,blocked_domains:BLOCKED_DOMAINS}],
      output_config:{format:{type:'json_schema',schema:SCHEMA}}};
    let response;
    // A long search can pause the server-side loop; resume it a bounded number of times.
    for(let turn=0;turn<3;turn++){
      response=await anthropic.beta.messages.create({...params,messages});
      if(response.stop_reason!=='pause_turn')break;
      messages.splice(1,messages.length-1,{role:'assistant',content:response.content});
    }
    if(response.stop_reason==='refusal')throw fail(502,'The research request was declined.');
    if(response.stop_reason==='pause_turn')throw fail(502,'The search did not finish.');
    // The pages the search really returned: the only URLs a finding may cite.
    const seen=new Set();
    for(const block of response.content)if(block.type==='web_search_tool_result'&&Array.isArray(block.content))
      for(const result of block.content)if(result?.type==='web_search_result'&&typeof result.url==='string')seen.add(result.url);
    const answer=response.content.filter(block=>block.type==='text').map(block=>block.text).join('').trim();
    let parsed;try{parsed=JSON.parse(answer);}catch{throw fail(502,'Web research returned an unreadable answer.');}
    const findings=(Array.isArray(parsed?.findings)?parsed.findings:[])
      .map(f=>({field:FINDING_FIELDS.includes(f?.field)?f.field:'other',value:text(f?.value,300),quote:text(f?.quote,500),url:text(f?.url,1000)}))
      .filter(f=>f.value&&f.quote&&seen.has(f.url)&&/^https:\/\//.test(f.url)&&!BLOCKED_DOMAINS.some(d=>new URL(f.url).hostname.endsWith(d)))
      .slice(0,8);
    return {found:findings.length>0,summary:text(parsed?.summary,600),findings,dropped:(Array.isArray(parsed?.findings)?parsed.findings.length:0)-findings.length,
      searches:response.usage?.server_tool_use?.web_search_requests??null,model:response.model||WEB_RESEARCH_MODEL,provider:'anthropic',checked_at:now().toISOString()};
  }
  return {ready:!!anthropic,research};
}
