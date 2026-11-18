// Only the staging assembly serves this page/script. No identity/provider logout.
export const stagingLogoutPage='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign out of fictional staging</title><link rel="stylesheet" href="/site.css"><script src="/staging-logout.js" defer></script></head><body><main><h1>Sign out of fictional staging</h1><p>This clears your ProspectPilot staging session on this browser. Your Google and access-gateway sessions remain signed in.</p><button id="stagingSignOut" type="button">Sign out of ProspectPilot staging</button><p id="stagingLogoutStatus" role="status" aria-live="polite"></p><noscript>JavaScript is required for this secure sign-out flow. Enable it and reload this page.</noscript><a href="/prospect">Return to Contacts</a></main></body></html>';
export function installStagingLogout(){
 const button=document.getElementById('stagingSignOut'),status=document.getElementById('stagingLogoutStatus');let pending=false;
 button.addEventListener('click',async()=>{
  if(pending)return;pending=true;button.disabled=true;status.textContent='Signing out…';
  try{
   // Override this request's no-referrer inheritance only for same-origin logout.
   // Do not forge Origin, relax the server guard, or use a native form fallback.
   const result=await fetch('/logout',{method:'POST',mode:'same-origin',credentials:'same-origin',redirect:'follow',referrerPolicy:'same-origin',cache:'no-store'});
   const target=new URL(result.url,location.href);
   if(!result.ok||!result.redirected||target.origin!==location.origin||target.pathname!=='/login')throw Error('Sign-out was not confirmed.');
   const check=await fetch('/api/prospect/me',{credentials:'same-origin',redirect:'error',cache:'no-store'});
   if(check.status!==401)throw Error('The staging session still appears active.');
   status.textContent='Signed out of ProspectPilot staging.';location.replace('/login?staging_signed_out=1');
  }catch{
   status.textContent='Sign-out could not be confirmed. Your staging session may still be active. Try again; do not assume you are signed out.';
  }finally{pending=false;button.disabled=false;}
 });
}
export const stagingLogoutScript='('+installStagingLogout.toString()+')();';
