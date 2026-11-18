// Presentation only, selected by the server after verified tester authentication.
// No browser flag grants authority; route and data checks remain server-side.
export const testerControls=['export','saveSearchOpen','searchForm','manageListOpen','manageListForm','shareListForm','listSharing','addListOpen','removeList','profileOpen','profileForm','identityPanel','identityList','historicalReviews','historicalOpen','historicalReload','historicalSave','historicalDiscard','historicalDistinct'];
export function installTesterUI(ids){
 const selector=ids.map(id=>'#'+id).join(',')+',a[href*="#historicalReviews"],[data-run]';
 const blocked=el=>el?.closest?.(selector);
 const apply=()=>{for(const el of document.querySelectorAll(selector)){if(!el.hidden)el.hidden=true;if('disabled' in el&&!el.disabled)el.disabled=true;if(el.getAttribute('data-staging-unavailable')!=='true')el.setAttribute('data-staging-unavailable','true');if(el.getAttribute('aria-disabled')!=='true')el.setAttribute('aria-disabled','true');if(el.tabIndex!==-1)el.tabIndex=-1;}};
 for(const event of ['click','auxclick','submit','keydown'])document.addEventListener(event,e=>{if(event==='keydown'&&!['Enter',' ','Spacebar'].includes(e.key))return;if(!blocked(e.target))return;e.preventDefault();e.stopImmediatePropagation();const status=document.getElementById('stagingUiStatus');if(status)status.textContent='Unavailable in this tester exercise. Continue with fictional Contacts, import preview and Worklist; ask the owner about a held identity review.';},true);
 new MutationObserver(apply).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','disabled','href']});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
}
const boot='\n('+installTesterUI.toString()+')('+JSON.stringify(testerControls)+');\n';
function once(source,marker,replacement){if(source.split(marker).length!==2)throw Error('Tester UI adapter needs review: '+marker);return source.replace(marker,replacement);}
export function testerPage(html){
 html=html.replace('FICTIONAL STAGING · Owner-only · No production data.','FICTIONAL STAGING · Approved tester · No production data.');
 html=html.replace(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi,(tag,name,attrs,id)=>testerControls.includes(id)?`<${name}${attrs} data-staging-unavailable="true" aria-disabled="true" hidden>`:tag);
 return html.replace(/<body([^>]*)>/,'<body$1><section aria-label="Tester exercise scope"><p><strong>Approved fictional tester.</strong> Your workspace is separate. Saved searches, contact exports, sharing, profile changes and identity-review decisions are unavailable. A held identity result needs owner assistance; it is not an error to resolve by retrying the import.</p></section>');
}
export function testerProspectScript(source){
 source=once(source,'async function loadSearches(){',"async function loadSearches(){\n $('searches').textContent='Saved searches are unavailable in this tester exercise.'; return; // No denied background request.\n");
 source=once(source,'function historicalImportNotice(r){',"function historicalImportNotice(r){\n return (r.rows||[]).some(row=>row.status==='identity_review')?'<p>Identity review is unavailable in this tester exercise. Keep this import report and ask the owner for assistance; do not retry to bypass the hold.</p>':'';\n");
 return boot+source;
}
export function testerLabScript(source){
 source=once(source,'async function openRun(id){',"async function openRun(id){\n $('runDetails').textContent='Source run details are unavailable in this tester exercise.'; return;\n");
 source=once(source,'async function syncTimeZone(){',"async function syncTimeZone(){\n return; // Tester profile is read-only; do not silently POST a detected timezone.\n");
 source=once(source,'async function loadIdentityReviews(){',"async function loadIdentityReviews(){\n $('identityPanel').hidden=true; $('identityCount').textContent='Identity review is unavailable in this tester exercise.'; return;\n");
 source=once(source,'async function loadHistoricalReviews(){',"async function loadHistoricalReviews(){\n $('historicalReviews').hidden=true; $('historicalStatus').textContent='Identity review is unavailable in this tester exercise. Ask the owner for assistance.'; return;\n");
 return boot+source;
}
