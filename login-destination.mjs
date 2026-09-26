// Only workspace destinations can survive sign-in. Never forward arbitrary URLs.
export function loginDestination(value){
 if(typeof value!=='string'||value.length>512||!value.startsWith('/')||/[\\\x00-\x20]/.test(value))return '/lab';
 try{
  const url=new URL(value,'https://workspace.invalid');
  if(url.origin!=='https://workspace.invalid'||!['/lab','/prospect','/warn'].includes(url.pathname))return '/lab';
  const lead=url.searchParams.get('lead');
  return url.pathname+(url.pathname==='/lab'&&/^[A-Za-z0-9_-]{1,100}$/.test(lead||'')?'?lead='+encodeURIComponent(lead):'');
 }catch{return '/lab';}
}
