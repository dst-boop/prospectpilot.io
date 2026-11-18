import {createHash} from 'node:crypto';
export const identitySecret=()=>process.env.FORGET_TOMBSTONE_KEY||'';
export function previousIdentitySecrets(){
 if(!process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS)return [];
 let keys;try{keys=JSON.parse(process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS);}catch{}
 if(!Array.isArray(keys)||keys.length>5||keys.some(k=>typeof k!=='string'||!k))throw Object.assign(Error('Identity key configuration requires operator review.'),{status:503});
 return [...new Set(keys)];
}
export const identityKeyVersion=key=>key?'hmac:'+createHash('sha256').update(key).digest('hex').slice(0,24):'legacy';
export const identitySecrets=()=>[...new Set([identitySecret(),...previousIdentitySecrets()])];
