// Independent deny-by-default external pilot policy. Never grants owner/team rights.
const reads=new Set(['me','contacts','lists','data-quality','daily-review'].map(p=>'/api/prospect/'+p).concat(['me','settings','sources','summary','worklist','leads','runs','scoreboard','advisor-profile'].map(p=>'/api/lab/'+p)));
const assets=new Set(['/','/health','/healthz','/version','/login','/auth/login.js','/logout','/brand.svg','/favicon.ico','/site.css','/lab','/lab-client.js','/lab.css','/prospect','/prospect-client.js','/prospect-jobs-client.js','/prospect.css','/audience','/audience-client.js','/audience-catalog.mjs','/audience.css','/staging-logout.js','/staging-ui.js','/staging-ui.css','/staging-fixture.csv','/staging-fixture-large.csv']);
export function stagingTesterRouteAllowed(path,method){
 if(method==='GET')return reads.has(path)||/^\/api\/prospect\/(contacts|imports)\/[A-Za-z0-9_-]+$/.test(path)||/^\/api\/lab\/leads\/[A-Za-z0-9_-]+(?:\/(activity|related))?$/.test(path)||assets.has(path);
 if(method==='POST')return ['/auth/session','/logout','/api/prospect/import','/api/prospect/import/preview','/api/prospect/lists','/api/lab/contact-import'].includes(path)||/^\/api\/prospect\/contacts\/[A-Za-z0-9_-]+\/(prepare|review)$/.test(path)||/^\/api\/lab\/leads\/[A-Za-z0-9_-]+\/(activity|review)$/.test(path);
 if(method==='PATCH')return /^\/api\/prospect\/contacts\/[A-Za-z0-9_-]+$/.test(path);
 return false;
}
