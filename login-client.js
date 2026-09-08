import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence,signOut} from 'firebase/auth';
import config from './firebase-config.json';
const auth=getAuth(initializeApp(config));
const button=document.querySelector('button'),message=document.querySelector('[role=status]');
button.onclick=async()=>{button.disabled=true;message.textContent='Opening Google sign-in…';try{
  await setPersistence(auth,inMemoryPersistence);
  const result=await signInWithPopup(auth,new GoogleAuthProvider());
  const response=await fetch('/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:await result.user.getIdToken()})});
  await signOut(auth);
  if(!response.ok){const body=await response.json();throw Error(body.detail||'Sign-in failed.');}
  location.assign('/');
}catch(error){message.textContent=error.code==='auth/popup-blocked'?'Allow the Google sign-in popup and try again.':error.message||'Sign-in failed. Please try again.';}finally{button.disabled=false;}};
