import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,inMemoryPersistence,setPersistence,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const allowed=new Set(['prospectpilot-stg-261118.web.app','prospectpilot-stg-261118.firebaseapp.com']);
if(location.protocol!=='https:'||!allowed.has(location.hostname))throw Error('Staging HTTPS origin required');
const auth=getAuth(initializeApp({projectId:'prospectpilot-stg-261118',authDomain:'prospectpilot-stg-261118.firebaseapp.com',apiKey:'AIzaSyAht3Zz3qGQWsq76hCa_WP3RFOC9ipFZWs',appId:'1:889507481125:web:214df4cb1165f73c6f21cc'}));
const button=document.getElementById('signin'),status=document.getElementById('status'),result=document.getElementById('result');
function clear(){result.hidden=true;document.getElementById('uid').textContent='';document.getElementById('email').textContent='';}
document.getElementById('clear').onclick=()=>{clear();status.textContent='Identity cleared.';};
button.onclick=async()=>{
 button.disabled=true;clear();status.textContent='Waiting for Google sign-in…';
 try{
  await setPersistence(auth,inMemoryPersistence);
  const {user}=await signInWithPopup(auth,new GoogleAuthProvider());
  await user.reload();
  if(!user.emailVerified||!user.email||!user.uid||!user.providerData.some(p=>p.providerId==='google.com'))throw Error('Verified Google identity required');
  const uid=user.uid,email=user.email;
  await signOut(auth);
  document.getElementById('uid').textContent=uid;document.getElementById('email').textContent=email;result.hidden=false;
  status.textContent='Google identity verified; signed out. Application access has not been granted.';
 }catch{
  clear();status.textContent='Sign-in was cancelled or could not be verified. No identity is displayed.';
 }finally{
  await signOut(auth).catch(()=>{});button.disabled=false;
 }
};
addEventListener('pagehide',()=>{clear();void signOut(auth).catch(()=>{});});
