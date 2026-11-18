// Test-only preload. No production entrypoint imports this file.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';
export function validateSyntheticBootstrapNetworkEnvironment(env){
 if(env.ROLLBACK_SYNTHETIC_BOOTSTRAP!=='1'||env.PGHOST!=='127.0.0.1'||!/^\d+$/.test(env.PGPORT||''))throw Error('Synthetic network guard configuration required');
 const port=Number(env.PGPORT);if(port<1||port>65535)throw Error('Invalid synthetic database port');
 return {port};
}
export function allowsSyntheticDatabaseSocket(args,port){
 // Node internals can pass their normalized argument array to Socket.connect.
 if(!Array.isArray(args)||!args.length)return false;
 const a=Array.isArray(args[0])?args[0]:args;
 const options=typeof a[0]==='object'&&a[0]!==null?a[0]:{port:a[0],host:typeof a[1]==='string'?a[1]:undefined};
 return !options.path&&options.host==='127.0.0.1'&&Number(options.port)===port;
}
export function installSyntheticBootstrapNetworkGuard({port}){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid synthetic database port');
 let denied=0;
 const deny=()=>{denied++;throw Error('Synthetic bootstrap forbids outbound network operation');};
 const connect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){if(!allowsSyntheticDatabaseSocket(args,port))return deny();return connect.apply(this,args);};
 globalThis.fetch=deny;
 http.request=deny;http.get=deny;https.request=deny;https.get=deny;tls.connect=deny;
 const lookup=dns.lookup;
 dns.lookup=function(host,...args){if(!['127.0.0.1','0.0.0.0'].includes(host))return deny();return lookup.call(this,host,...args);};
 for(const key of Object.keys(dns))if(key==='lookupService'||key.startsWith('resolve')||key==='reverse')if(typeof dns[key]==='function')dns[key]=deny;
 for(const key of Object.keys(dns.promises))if(key==='lookup'||key==='lookupService'||key.startsWith('resolve')||key==='reverse')if(typeof dns.promises[key]==='function')dns.promises[key]=async()=>deny();
 for(const Resolver of [dns.Resolver,dns.promises.Resolver])for(const key of Object.getOwnPropertyNames(Resolver.prototype))if(key==='lookupService'||key.startsWith('resolve')||key==='reverse')Resolver.prototype[key]=deny;
 dgram.createSocket=deny;
 syncBuiltinESMExports();
 process.stdout.write('SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED\n');
 process.on('exit',()=>process.stdout.write(JSON.stringify({synthetic_bootstrap_network_guard:true,denied_operations:denied})+'\n'));
 return {deniedOperations:()=>denied};
}
if(process.env.ROLLBACK_SYNTHETIC_BOOTSTRAP==='1')installSyntheticBootstrapNetworkGuard(validateSyntheticBootstrapNetworkEnvironment(process.env));
