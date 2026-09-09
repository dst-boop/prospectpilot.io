import {Resolver} from 'node:dns/promises';
import {emailAddress} from './lead-quality.mjs';

export const DOMAIN_CHECK_STATUSES=['mx_present','address_fallback','null_mx','no_domain','no_mail_route','special_use','unknown'];
export const DOMAIN_CHECK_LABELS={mx_present:'Mail-routing records found',address_fallback:'Address fallback found',null_mx:'Domain declares it accepts no mail',no_domain:'Domain not found',no_mail_route:'No mail route found',special_use:'Special-use domain; not queried',unknown:'Lookup inconclusive'};
const absent=error=>['ENODATA','ENOTFOUND'].includes(error?.code);
export const isNonPublicMailDomain=domain=>typeof domain==='string'&&/(?:^|\.)(?:localhost|local|internal|invalid|test)$/i.test(domain);
export function createDomainChecker({resolver=new Resolver({timeout:3500,tries:1}),now=()=>Date.now(),maxEntries=1000}={}){
 const cache=new Map();
 async function lookup(domain){
  if(isNonPublicMailDomain(domain))return {status:'special_use'};
  let records;
  try{records=await resolver.resolveMx(domain);}catch(error){
   if(error?.code==='ENOTFOUND')return {status:'no_domain'};
   if(!absent(error))return {status:'unknown'};
   records=[];
  }
  if(!Array.isArray(records)||records.length>100)return {status:'unknown'};
  if(records.length){
   const nulls=records.filter(row=>row.priority===0&&['','.'].includes(row.exchange));
   if(nulls.length)return {status:records.length===1?'null_mx':'unknown'};
   if(records.some(row=>typeof row.exchange!=='string'||!row.exchange||!Number.isInteger(row.priority)))return {status:'unknown'};
   return {status:'mx_present',mx_hosts:records.slice(0,20).map(row=>row.exchange.toLowerCase())};
  }
  // SMTP permits A/AAAA fallback when MX is absent. Lack of MX alone is not failure.
  const addresses=await Promise.allSettled([resolver.resolve4(domain),resolver.resolve6(domain)]);
  if(addresses.some(result=>result.status==='fulfilled'&&Array.isArray(result.value)&&result.value.length))return {status:'address_fallback'};
  if(addresses.every(result=>result.status==='fulfilled'||absent(result.reason)))return {status:'no_mail_route'};
  return {status:'unknown'};
 }
 return async contact=>{
  if(contact.suppressed)throw Object.assign(Error('Suppressed contacts cannot be checked.'),{status:422});
  const email=emailAddress(contact.email),domain=email.split('@')[1];
  if(!domain||domain.length>253||!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))throw Object.assign(Error('A valid email domain is required.'),{status:422});
  const cached=cache.get(domain);
  if(cached&&cached.until>now())return {email,...cached.result,cached:true};
  cache.delete(domain);
  const result={domain,...await lookup(domain),checked_at:new Date(now()).toISOString(),provider:'dns'};
  const lifetime=result.status==='unknown'?30000:['mx_present','address_fallback'].includes(result.status)?6*3600000:15*60000;
  if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
  cache.set(domain,{result,until:now()+lifetime});
  return {email,...result,cached:false};
 };
}

export function recentDomainFailure(contact,now=Date.now()){
 const check=contact.email_domain_check,age=now-Date.parse(check?.checked_at);
 return !!check&&check.domain===String(contact.email||'').split('@')[1]&&['null_mx','no_domain','no_mail_route'].includes(check.status)&&age>=0&&age<15*60000;
}
