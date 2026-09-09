import test from 'node:test';
import assert from 'node:assert/strict';
import {providerSearchSelection} from '../prospect-jobs-client.js';
test('paid search selection retains absence filters and discloses local-only constraints',()=>{
 const selected=providerSearchSelection({company:'Example',has_email:'false',has_phone:'true',source:'ZoomInfo',suppressed:'false',quality_issue:'shared_mailbox',list_id:'destination',q:'Jamie',city:''});
 assert.deepEqual(selected.filters,{company:'Example',has_email:'false',has_phone:'true'});
 assert.deepEqual(selected.ignored,['source','suppressed','quality_issue','q']);
 assert.deepEqual(providerSearchSelection({company:'Example',size:10,scroll_token:'next'}),{filters:{company:'Example'},ignored:[]});
});
