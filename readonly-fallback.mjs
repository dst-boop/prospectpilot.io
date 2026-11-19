// Explicit degradation mode, not an independently proven old-version rollback.
export function readOnlyFallback(value=process.env.PROSPECTPILOT_READ_ONLY){
 if(value===undefined||value==='')return false;
 if(value==='true')return true;
 if(value==='false')return false;
 throw Error('Invalid PROSPECTPILOT_READ_ONLY; expected true or false');
}
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const page=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProspectPilot read-only worklist</title><link rel="stylesheet" href="/fallback.css"><body><h1>ProspectPilot: read-only mode</h1><p role="status">Viewing saved work only. Changes, outreach, exports, research and billing are unavailable. No queued jobs will run on this revision. Qualification rules are unchanged.</p><form method="post" action="/logout"><button>Sign out</button></form><h2>Worklist</h2><form id="searchForm"><label for="search">Search saved prospects</label> <input id="search" type="search" maxlength="100"> <button>Search</button></form><p id="status" aria-live="polite">Loading saved prospects…</p><ul id="items"></ul><nav aria-label="Worklist pages"><button id="previous" disabled>Previous</button> <button id="next" disabled>Next</button></nav><h2>Saved brief</h2><pre id="brief"></pre><script src="/fallback.js"></script></body></html>`;
const script=`const status=document.querySelector('#status'),items=document.querySelector('#items'),brief=document.querySelector('#brief'),previous=document.querySelector('#previous'),next=document.querySelector('#next'),search=document.querySelector('#search');
let offset=0,term='',generation=0,briefGeneration=0;
async function read(path){const r=await fetch(path,{credentials:'same-origin'});if(!r.ok)throw Error(r.status===401?'Please sign in again.':'Saved data is temporarily unavailable.');return r.json();}
async function load(){
 const ticket=++generation;++briefGeneration;previous.disabled=true;next.disabled=true;items.replaceChildren();brief.textContent='';status.textContent='Loading saved prospects…';
 try{
  const data=await read('/api/fallback/worklist?'+new URLSearchParams({search:term,offset:String(offset)}));
  if(ticket!==generation)return;
  status.textContent=(data.total?'Showing '+(offset+1)+'–'+(offset+data.items.length)+' of '+data.total:'No matching saved prospects.')+(data.truncated?' Results are bounded; narrow your search to find other saved records.':'');
  previous.disabled=offset===0;next.disabled=offset+data.limit>=data.total;
  for(const item of data.items){const li=document.createElement('li'),b=document.createElement('button');b.textContent=[item.lead.first_name,item.lead.last_name,item.lead.company,item.action.label].filter(Boolean).join(' · ');b.onclick=async()=>{const selection=++briefGeneration;brief.textContent='Loading…';try{const x=await read('/api/fallback/brief/'+encodeURIComponent(item.lead.id));if(selection===briefGeneration)brief.textContent=JSON.stringify(x,null,2);}catch(e){if(selection===briefGeneration)brief.textContent=e.message;}};li.append(b);items.append(li);}
 }catch(e){if(ticket===generation)status.textContent=e.message;}
}
document.querySelector('#searchForm').onsubmit=e=>{e.preventDefault();term=search.value.trim();offset=0;void load();};
previous.onclick=()=>{offset=Math.max(0,offset-24);void load();};next.onclick=()=>{offset+=24;void load();};void load();`;
export function createReadOnlyFallback({lab}){
 return async(request,user)=>{
  const url=new URL(request.url),path=url.pathname;
  if(request.method!=='GET')return json({detail:'Read-only mode: changes are unavailable.'},503);
  if(path==='/'||path==='/lab')return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
  if(path==='/fallback.css')return new Response('body{max-width:70rem;margin:2rem auto;padding:0 1rem;font-family:system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}input{max-width:100%;box-sizing:border-box}button{max-width:100%;overflow-wrap:anywhere}',{headers:{...headers,'Content-Type':'text/css; charset=utf-8'}});
  if(path==='/fallback.js')return new Response(script,{headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
  try{
   if(path==='/api/fallback/worklist'){
    const data=await lab.advisor.worklist(user,{view:'all',search:url.searchParams.get('search')||'',offset:url.searchParams.get('offset')||0,limit:24});
    return json({...data,read_only:true,items:data.items.map(item=>({...item,action:{...item.action,contact:null}}))});
   }
   const match=path.match(/^\/api\/fallback\/brief\/([^/]+)$/);
   if(match){const detail=await lab.advisor.detail(user,decodeURIComponent(match[1]));return json({...detail,read_only:true,action:{...detail.action,contact:null},draft:null,schedules:null});}
  }catch(error){return json({detail:error.status===404?'Prospect not found.':'Saved data is temporarily unavailable.'},error.status===404?404:503);}
  return json({detail:'Read-only mode: this operation is unavailable.'},503);
 };
}
