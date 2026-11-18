import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function historicalImportNotice('),source.indexOf('function renderImportReport(')),context);
const notice=r=>context.historicalImportNotice(r);

test('ordinary preview and saved results do not suggest unrelated historical review',()=>{
 for(const preview of [true,false])assert.equal(notice({preview,rows:[{status:'duplicate'},{status:'added'}],conflicts:0}), '');
 assert.equal(notice({rows:[{status:'conflict'}],conflicts:1}), '');
 assert.equal(notice({}), '');
});
test('preview holds explain import-first without navigating away or claiming queued work',()=>{
 const html=notice({preview:true,rows:[{status:'identity_review',historical_review_id:'existing-hold'}]});
 assert.match(html,/preview has not queued or saved them/);assert.doesNotMatch(html,/<a|href=|existing-hold/);
});
test('only saved owner-visible holds link to isolated review tab, with explicit return guidance',()=>{
 const html=notice({rows:[{status:'identity_review',historical_review_id:'private-id'}]});
 assert.match(html,/href="\/lab#historicalReviews" target="_blank" rel="noopener noreferrer"/);
 assert.match(html,/Keep this import tab open; return to it/);assert.match(html,/import-time result/);
 assert.doesNotMatch(html,/private-id/);
 assert.equal(notice({rows:[{status:'identity_review'}]}),'');
 assert.equal(notice({rows:[{status:'rejected',historical_review_id:'private-id'}]}),'');
});
test('full row report is checked, not just first 50 displayed rows',()=>{
 assert.match(notice({rows:[...Array.from({length:50},()=>({status:'duplicate'})),{status:'identity_review',historical_review_id:'hold'}]}),/new tab/);
});
test('both current and archived report rendering use the scoped notice',()=>{
 assert.match(source,/innerHTML=ignored\+historicalImportNotice\(r\)\+/);
 assert.doesNotMatch(source,/Review incoming records held for historical identity checks/);
});

// Playwright string evaluation must receive one complete expression, not a
// leading function declaration followed by an unrelated statement.
test('browser hold injection is a valid expression and invokes shipped notice renderer',()=>{
 const script=readFileSync(new URL('../scripts/staging-logout-visual-ci.mjs',import.meta.url),'utf8');
 const noticeSource=source.slice(source.indexOf('function historicalImportNotice('),source.indexOf('function renderImportReport('));
 const assignment=script.match(/const noticeExpression=([\s\S]*?);\n await page\.evaluate\(noticeExpression\);/);
 assert.ok(assignment,'browser must evaluate the explicit notice expression');
 const expression=vm.runInNewContext(assignment[1],{noticeSource});
 let inserted;
 vm.runInNewContext('('+expression+')',{document:{querySelector(selector){
  assert.equal(selector,'#importPreview');
  return {insertAdjacentHTML(position,html){assert.equal(position,'afterbegin');inserted=html;}};
 }}});
 assert.match(inserted,/target="_blank" rel="noopener noreferrer"/);
 assert.doesNotMatch(inserted,/synthetic-navigation-only/);
});
