const $=id=>document.getElementById(id);
const outcomes={connected:'LinkedIn connected successfully.',cancelled:'Connection cancelled. Your saved connection was not changed.',failed:'LinkedIn could not be connected. Please try connecting again.'};
$('message').textContent=outcomes[new URLSearchParams(location.search).get('result')]||'';
history.replaceState(null,'',location.pathname);
let busy=false;
async function api(path,method='GET'){
  const response=await fetch('/api/linkedin/'+path,{method,credentials:'same-origin'});
  const data=await response.json();if(!response.ok)throw Error(data.detail||'The request could not be completed.');return data;
}
async function load(){
  const {configured,connection}=await api('status');
  $('status').textContent=connection?(connection.expired?'Access expired — reconnect to renew.':'Connected'): 'Not connected';
  $('setup').hidden=configured;$('connect').disabled=!configured;
  $('connect').textContent=connection?'Reconnect LinkedIn':'Connect LinkedIn';
  $('account').hidden=!connection;$('disconnect').hidden=!connection;
  if(connection){$('name').textContent=connection.name;$('expiry').textContent=new Date(connection.expiresAt).toLocaleString();$('connected').textContent=new Date(connection.connectedAt).toLocaleString();}
}
async function action(fn){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await fn();}catch(error){$('message').textContent=error.message;}
  finally{try{await load();}catch{$('status').textContent='Connection status is unavailable. Please sign in again or retry.';$('connect').disabled=true;}busy=false;for(const id of ['disconnect','reload','remove','cancel'])$(id).disabled=false;}
}
$('connect').onclick=()=>action(async()=>{const data=await api('connect','POST');const url=new URL(data.url);if(url.origin!=='https://www.linkedin.com')throw Error('Invalid authorization address');location.assign(url.href);});
$('disconnect').onclick=()=>{$('confirm').hidden=false;$('remove').focus();};
$('cancel').onclick=()=>{$('confirm').hidden=true;$('disconnect').focus();};
$('remove').onclick=()=>action(async()=>{await api('disconnect','POST');$('confirm').hidden=true;$('message').textContent='Saved connection deleted. You can also remove the app in LinkedIn permissions.';});
$('reload').onclick=()=>action(async()=>{});
void action(async()=>{});
