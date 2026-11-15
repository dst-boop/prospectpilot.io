// Defense in depth for the synthetic process. This is not an OS firewall.
// Only the explicitly named loopback HTTP listener and disposable DB may connect.
import net from 'node:net';
import dns from 'node:dns';
import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';
export function installSyntheticNetworkGuard() {
  const allowed=new Set(), attempts=[], patched=[];
  const original={fetch:globalThis.fetch,connect:net.Socket.prototype.connect,lookup:dns.lookup,promisesLookup:dns.promises.lookup};
  const loopback=host=>['127.0.0.1','localhost','::1','[::1]'].includes(host);
  const check=(host,port)=>{
    if(!loopback(host)||!allowed.has(Number(port))){attempts.push({host,port});throw Error('Synthetic staging blocked outbound network access');}
  };
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(!['http:','https:'].includes(url.protocol)){attempts.push({kind:'protocol'});throw Error('Synthetic staging blocked non-HTTP access');}
    check(url.hostname,url.port||(url.protocol==='https:'?443:80));
    return original.fetch(input,init);
  };
  net.Socket.prototype.connect=function(...args){
    const first=Array.isArray(args[0])?args[0][0]:args[0];
    if(first&&typeof first==='object'){
      if(first.path){attempts.push({kind:'socket-path'});throw Error('Synthetic staging blocked socket path');}
      check(first.host||'localhost',first.port);
    }else check(typeof args[1]==='string'?args[1]:'localhost',first);
    return original.connect.apply(this,args);
  };
  dns.lookup=function(host,...args){if(!loopback(host)){attempts.push({kind:'dns-lookup',host});throw Error('Synthetic staging blocked DNS lookup');}return original.lookup.call(this,host,...args);};
  dns.promises.lookup=async function(host,...args){if(!loopback(host)){attempts.push({kind:'dns-lookup',host});throw Error('Synthetic staging blocked DNS lookup');}return original.promisesLookup.call(this,host,...args);};
  // Resolver methods use c-ares/UDP and do not pass through dns.lookup or TCP.
  const deny=()=>{attempts.push({kind:'dns-or-udp'});throw Error('Synthetic staging blocked DNS/UDP access');};
  for(const [target,promises] of [[dns,false],[dns.promises,true],[dns.Resolver.prototype,false],[dns.promises.Resolver.prototype,true]]){
    for(const key of Object.getOwnPropertyNames(target)){
      if((key.startsWith('resolve')||['reverse','lookupService'].includes(key))&&typeof target[key]==='function'){
        patched.push([target,key,target[key]]);target[key]=promises?async()=>deny():deny;
      }
    }
  }
  patched.push([dgram.Socket.prototype,'send',dgram.Socket.prototype.send]);dgram.Socket.prototype.send=deny;
  syncBuiltinESMExports();
  return {allowPort:port=>allowed.add(Number(port)),attempts,restore(){globalThis.fetch=original.fetch;net.Socket.prototype.connect=original.connect;dns.lookup=original.lookup;dns.promises.lookup=original.promisesLookup;for(const [target,key,originalMethod] of patched)target[key]=originalMethod;syncBuiltinESMExports();}};
}
