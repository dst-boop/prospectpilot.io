import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';

const digest=value=>createHash('sha256').update(value).digest('hex');
export function encryptToken(token,key,userId){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(userId));
  return Buffer.concat([iv,cipher.update(token),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
export function decryptToken(value,key,userId){
  const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  cipher.setAAD(Buffer.from(userId));cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString();
}
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const redirect=result=>new Response(null,{status:303,headers:{Location:'/settings/linkedin?result='+result,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});

export function createLinkedIn({pool,page,script,origins,config={},fetcher=fetch}){
  const {clientId,clientSecret,redirectUri,encryptionKey}=config;
  const key=encryptionKey?Buffer.from(encryptionKey,'base64'):null;
  const configured=Boolean(clientId&&clientSecret&&redirectUri&&key?.length===32);
  if(redirectUri){const uri=new URL(redirectUri);if(uri.protocol!=='https:'||!origins.includes(uri.origin)||uri.pathname!=='/auth/linkedin/callback'||uri.search||uri.hash||uri.username||uri.password)throw Error('Invalid LinkedIn redirect URI');}
  if(encryptionKey&&key.length!==32)throw Error('LinkedIn encryption key must decode to 32 bytes');
  async function remote(url,init){
    const response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(12_000)});
    if(!response.ok){await response.body?.cancel();throw Error('LinkedIn request failed');}
    // Bound provider responses and never surface their body or tokens in error logs.
    const reader=response.body.getReader();let size=0;const chunks=[];
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('Oversized provider response');}chunks.push(Buffer.from(value));}}
    finally{reader.releaseLock();}
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  return async(request,claims,session)=>{
    const url=new URL(request.url),path=url.pathname,uid=claims.uid;
    if(path==='/settings/linkedin'&&request.method==='GET')return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
    if(path==='/auth/linkedin/ui.js'&&request.method==='GET')return new Response(script,{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
    if(path==='/api/linkedin/status'&&request.method==='GET'){
      const row=(await pool.query('SELECT member_name, expires_at, connected_at FROM linkedin_connections WHERE user_id=$1',[uid])).rows[0];
      return json({configured,connection:row?{name:row.member_name,expiresAt:row.expires_at,connectedAt:row.connected_at,expired:new Date(row.expires_at)<=new Date()}:null});
    }
    if(path==='/api/linkedin/disconnect'&&request.method==='POST'){
      // Also invalidate pending callbacks, so disconnect cannot leave a valid pending grant.
      await pool.query('DELETE FROM linkedin_oauth_states WHERE user_id=$1',[uid]);
      await pool.query('DELETE FROM linkedin_connections WHERE user_id=$1',[uid]);
      return json({ok:true});
    }
    if(!configured)return json({detail:'LinkedIn connection setup is required.'},503);
    if(path==='/api/linkedin/connect'&&request.method==='POST'){
      if(url.origin!==new URL(redirectUri).origin)return json({detail:'Open connection settings at '+new URL(redirectUri).origin+'/settings/linkedin'},409);
      const state=randomBytes(32).toString('base64url');
      await pool.query("INSERT INTO linkedin_oauth_states(state_hash,user_id,session_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET state_hash=EXCLUDED.state_hash,session_hash=EXCLUDED.session_hash,expires_at=EXCLUDED.expires_at",[digest(state),uid,digest(session)]);
      const target=new URL('https://www.linkedin.com/oauth/v2/authorization');
      target.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'openid profile',state}).toString();
      return json({url:target.href});
    }
    if(path==='/auth/linkedin/callback'&&request.method==='GET'){
      if(url.origin!==new URL(redirectUri).origin)return redirect('failed');
      const state=url.searchParams.get('state')||'';
      if(!/^[A-Za-z0-9_-]{43}$/.test(state))return redirect('failed');
      // A transaction serializes the callback with disconnect and consumes state exactly once.
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '40s'");
        const pending=await client.query('DELETE FROM linkedin_oauth_states WHERE state_hash=$1 AND user_id=$2 AND session_hash=$3 AND expires_at>now() RETURNING user_id',[digest(state),uid,digest(session)]);
        if(!pending.rows.length){await client.query('ROLLBACK');return redirect('failed');}
        if(url.searchParams.has('error')){await client.query('COMMIT');return redirect('cancelled');}
        const code=url.searchParams.get('code');
        if(!code||code.length>8192)throw Error('Invalid code');
        const token=await remote('https://www.linkedin.com/oauth/v2/accessToken',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri})});
        if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>16384||!Number.isSafeInteger(token.expires_in)||token.expires_in<=0||token.expires_in>31536000)throw Error('Invalid token response');
        const profile=await remote('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:'Bearer '+token.access_token}});
        if(typeof profile.sub!=='string'||!profile.sub)throw Error('Invalid member response');
        const name=String(profile.name||'LinkedIn member').slice(0,200);
        await client.query('INSERT INTO linkedin_connections(user_id,token_ciphertext,member_name,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET token_ciphertext=EXCLUDED.token_ciphertext,member_name=EXCLUDED.member_name,expires_at=EXCLUDED.expires_at,connected_at=now()',[uid,encryptToken(token.access_token,key,uid),name,new Date(Date.now()+token.expires_in*1000)]);
        await client.query('COMMIT');return redirect('connected');
      }catch{
        await client.query('ROLLBACK');
        await client.query('DELETE FROM linkedin_oauth_states WHERE state_hash=$1 AND user_id=$2',[digest(state),uid]);
        return redirect('failed');
      }finally{client.release();}
    }
    return json({detail:'Not found'},404);
  };
}
