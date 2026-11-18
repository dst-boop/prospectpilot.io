// Staging presentation only. Server allowlist/auth remain the security boundary.
export const blockedStagingControls = ['profileImageRead','profileImageFile','draftOutlook','draftMailApp','draftLinkedIn','inviteOutlook','inviteICS','providerSetup','saveSearchOpen','addListOpen','removeList','manageListOpen','manageListForm','shareListForm','renameList','deleteList','leaveList','deletePerson','toggleSuppression','runButton','saveSettings','assess','importOpen','export','costOpen','enrichExport','forgetLead','runForm','costForm','playbookStart','playbookCustom'];
export function installStagingUI(ids) {
 const isLab=location.pathname==='/lab';
 const names=ids.filter(id=>isLab||!['importOpen','export'].includes(id));
 const selector=names.map(id=>'#'+id).join(',');
 const blocked=el=>el?.closest?.(selector);
 const external=el=>{const a=el?.closest?.('a[href]');if(!a)return null;const href=a.getAttribute('href');if(!href||href.startsWith('#')||href.startsWith('blob:'))return null;try{const u=new URL(href,location.href);return u.origin!==location.origin||!['http:','https:'].includes(u.protocol)?a:null;}catch{return a;}};
 const unavailable=el=>blocked(el)||external(el)||el?.closest?.('a[href="/settings/linkedin"],a[href="/warn"],a[href="/discovery"],a[href="/research"],a[href="/enrichment"]');
 const message=()=>{const status=document.getElementById('stagingUiStatus');if(status)status.textContent='Unavailable in this fictional exercise. Use the supplied CSV, Contacts and Worklist; do not contact anyone.';};
 // Capture before application handlers, including keyboard and dynamic controls.
 for(const event of ['click','auxclick','submit','keydown'])document.addEventListener(event,e=>{
  if(event==='keydown'&&!['Enter',' ','Spacebar'].includes(e.key))return;
  if(e.target?.closest?.('#findProspects')){e.preventDefault();e.stopImmediatePropagation();if(event==='click'||event==='keydown')location.assign('/audience');return;}
  if(unavailable(e.target)){e.preventDefault();e.stopImmediatePropagation();message();}
 },true);
 const apply=()=>{
  for(const el of document.querySelectorAll(selector+',a[href]')){
   if(!unavailable(el))continue;
   if('disabled' in el&&!el.disabled)el.disabled=true;
   if(el.getAttribute('aria-disabled')!=='true')el.setAttribute('aria-disabled','true');
   if(el.getAttribute('data-staging-unavailable')!=='true')el.setAttribute('data-staging-unavailable','true');
   if(el.tabIndex!==-1)el.tabIndex=-1;
  }
  const find=document.getElementById('findProspects');if(find&&find.textContent!=='Try the manual audience exercise')find.textContent='Try the manual audience exercise';
  const research=document.getElementById('searchReadiness');if(research&&research.textContent!=='Research and provider execution are disabled in this fictional exercise.')research.textContent='Research and provider execution are disabled in this fictional exercise.';
 };
 new MutationObserver(apply).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','disabled','href']});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
}
export const stagingUIStyle='[data-staging-unavailable="true"]{display:none!important} #stagingUiStatus:empty{display:none}';
export const stagingUIScript='('+installStagingUI.toString()+')('+JSON.stringify(blockedStagingControls)+');';
export function stagingPage(html){
 const style='<link rel="stylesheet" href="/staging-ui.css">';
 const boot='<script src="/staging-ui.js"></script>';
 const guidance='<section aria-label="Fictional exercise"><p><strong>Practice only:</strong> use fictional names, notes and profile details. Research, provider jobs, sharing, team assignment, deletion and external compose/invite controls are unavailable here. Local draft copying, audience-plan downloads and recording fictional outcomes remain available. This is a UI safeguard, not general network isolation.</p><p><a href="/audience">Manual audience exercise</a> · <a href="/staging-fixture.csv">Download fictional CSV</a> · <a href="/prospect?import=1">Preview in Contacts</a> · <a href="/lab">Worklist</a></p><p id="stagingUiStatus" role="status" aria-live="polite"></p></section>';
 return html.replace('<head>','<head>'+style+boot).replace('<body>','<body>'+guidance)
 .replace('Choose a community you can serve, learn the filters to try in ZoomInfo, then bring your results back for review.','Practice a proposed audience using fictional details. Do not search for real people or purchase exports in this exercise; use the supplied fictional CSV for upload.')
 .replace('In ZoomInfo, export your list or search results as CSV, then drop the file anywhere on this page or choose it below. ProspectPilot recognises the format, offers a new list named after the file and previews the rows; nothing is saved until you choose Import contacts.','Use only the supplied fictional-staging.csv in this exercise. Preview it before saving. Real provider exports and real personal data are outside this test.')
 .replace('value="ZoomInfo CSV export"','value="Fictional staging fixture"')
 .replace('<h2>Review in ZoomInfo before paying for an export</h2>','<h2>Outside this exercise: review before any export</h2>');
}
export function stagingProspectScript(source){
 const original="initProviderUI({api,selected,filters,getLists:()=>lists.filter(l=>!l.role||l.role==='owner'),refresh:async()=>{await loadLists();await load();},notice}).catch(e=>notice(e.message,true));";
 if(source.split(original).length!==2)throw Error('Staging provider initialization adapter needs review');
 const marker="manageButton.className='secondary';";
 if(source.split(marker).length!==2)throw Error('Staging list control adapter needs review');
 return source.replace(original,"/* Fictional staging: provider and job initialization deliberately omitted. */").replace(marker,marker+"manageButton.id='manageListOpen';").replace('Checks the email domain, applies restrictions, and prepares a brief and draft. No messages are sent.','Prepares a local brief from fictional saved data. Domain/provider checks and outreach are disabled in staging.');
}
