# Isolated HTTPS staging identity bootstrap
Prepared only. No deployment or actual Google sign-in performed.

Deployment must explicitly select project AND Hosting site `prospectpilot-stg-261118`; never production. Firebase Hosting default staging `.web.app` or `.firebaseapp.com` only. This is a static pre-UID identity setup page, not the staging application. Anyone who can load it can authenticate their own Google account and see their own verified UID/email; this does not approve them for application access. The operator must separately confirm the intended owner's UID.

The app never calls getIdToken, writes auth credentials to app storage, submits a token to an application endpoint, logs credentials or displays them. Firebase/Google's SDK necessarily exchanges credentials internally to perform real authentication and `user.reload()`. In-memory persistence; sign-out awaited before showing UID/email; generic errors only. No custom backend/database/analytics/provider calls. UID/email stay as page text until Clear, navigation or close. Hosting and Google infrastructure may retain normal service/access logs; this page adds no logging.

CSP permits pinned Firebase SDK CDN, Google popup bootstrap and only Firebase authentication services. Configure real Google authentication only in the staging project. No production Firebase configuration, app session creation or fake authentication. Source public API key is a Firebase client identifier, not an admin secret.

Before deployment: independent source review, validate Hosting target and authentication setup, then supported browserAuth real Google sign-in. Static/stub tests are not browser/live auth proof. Remove this bootstrap when owner setup is finished, subject to approved Hosting changes.
