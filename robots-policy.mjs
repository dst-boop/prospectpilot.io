// Publisher rules for our declared crawler. Network failures are handled by callers.
const canonical=value=>String(value).replace(/[^\x00-\x7F]/gu,c=>encodeURIComponent(c)).replace(/%[0-9a-f]{2}/gi,hex=>{
  const c=String.fromCharCode(parseInt(hex.slice(1),16));return /[A-Za-z0-9._~-]/.test(c)?c:hex.toUpperCase();
});
function matches(pattern,path){
  const end=pattern.endsWith('$');if(end)pattern=pattern.slice(0,-1);
  const pieces=pattern.split('*');let offset=0;
  for(let i=0;i<pieces.length;i++){
    const at=i===0?(path.startsWith(pieces[i])?0:-1):path.indexOf(pieces[i],offset);
    if(at<0)return false;offset=at+pieces[i].length;
  }
  return !end||(pieces.length===1?offset===path.length:pieces.at(-1)===''||path.endsWith(pieces.at(-1)));
}
export function robotsAllowed(text,path,agent='ProspectPilotResearch'){
  if(!text)return true;
  const groups=[];let current=null;
  for(const raw of String(text).replace(/^\uFEFF/,'').split(/\r?\n|\r/)){
    const line=raw.split('#',1)[0].trim(),at=line.indexOf(':');if(at<0)continue;
    const key=line.slice(0,at).trim().toLowerCase(),value=line.slice(at+1).trim();
    if(key==='user-agent'){
      if(!current||current.hasRules){current={agents:[],rules:[],hasRules:false};groups.push(current);}
      current.agents.push(value.toLowerCase());
    }else if(current&&(key==='allow'||key==='disallow')){
      current.hasRules=true;
      if(value.startsWith('/'))current.rules.push({allow:key==='allow',pattern:canonical(value)});
    }
  }
  const exact=groups.filter(g=>g.agents.includes(agent.toLowerCase()));
  const relevant=exact.length?exact:groups.filter(g=>g.agents.includes('*'));
  let best=null;path=canonical(String(path).split('#',1)[0]);
  for(const rule of relevant.flatMap(g=>g.rules)){
    if(!matches(rule.pattern,path))continue;
    const size=Buffer.byteLength(rule.pattern.replace(/\*/g,'').replace(/\$$/,'').replace(/%[0-9A-F]{2}/g,'x'));
    if(!best||size>best.size||size===best.size&&rule.allow)best={size,allow:rule.allow};
  }
  return best?.allow??true;
}
