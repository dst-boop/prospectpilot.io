import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence,signOut} from 'firebase/auth';
// Replaced by the dedicated build. No production config import or fallback.
const auth=getAuth(initializeApp(STAGING_FIREBASE_CONFIG));
const button=document.getElementById('google'),status=document.getElementById('status');
button.onclick=async()=>{button.disabled=true;try{await setPersistence(auth,inMemoryPersistence);const {user}=await signInWithPopup(auth,new GoogleAuthProvider());const r=await fetch('/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:await user.getIdToken(true)})});if(!r.ok)throw Error('Access denied. Only the approved owner can enter this fictional staging workspace.');await signOut(auth);location.assign('/prospect?import=1');}catch{status.textContent='Sign-in failed or this account is not approved. No app access was granted.';}finally{await signOut(auth).catch(()=>{});button.disabled=false;}};
