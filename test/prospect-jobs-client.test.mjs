import test from 'node:test';
import assert from 'node:assert/strict';
import {providerSearchSelection,providerSetupContent} from '../prospect-jobs-client.js';
test('paid search selection retains absence filters and discloses local-only constraints',()=>{
 const selected=providerSearchSelection({company:'Example',has_email:'false',has_phone:'true',source:'ZoomInfo',suppressed:'false',quality_issue:'shared_mailbox',list_id:'destination',q:'Jamie',city:''});
 assert.deepEqual(selected.filters,{company:'Example',has_email:'false',has_phone:'true'});
 assert.deepEqual(selected.ignored,['source','suppressed','quality_issue','q']);
 assert.deepEqual(providerSearchSelection({company:'Example',size:10,scroll_token:'next'}),{filters:{company:'Example'},ignored:[]});
});

test('unavailable contact tools give a working import route without exposing setup jargon',()=>{
 const html=providerSetupContent({actions:{check_domain:true},providers:{search:true},prices:{},daily_budget_micros:0,reserved_today_micros:0},'search');
 const normal=html.split('<details>')[0];
 assert.match(normal,/Find new contacts is not available/);
 assert.match(normal,/href="\/prospect\?import=1"/);
 assert.match(normal,/No charge has been made/);
 assert.doesNotMatch(normal,/API|credentials|server|repository|Ready to use/);
 assert.match(normal,/Check email domains/);
 assert.match(html,/<details><summary>Advanced setup for administrators/);
});
test('connection display follows actionable readiness and escapes administrative descriptions',()=>{
 const html=providerSetupContent({actions:{verify:true},prices:{verify:10000},daily_budget_micros:1000000,reserved_today_micros:0,cost_basis:'<img src=x onerror=alert(1)>'});
 assert.match(html,/Verify email addresses<\/strong> — Ready to use/);
 assert.match(html,/\$0.01 per contact/);
 assert.doesNotMatch(html,/Check email domains is also available|<img/);
 assert.match(html,/&lt;img/);
});
