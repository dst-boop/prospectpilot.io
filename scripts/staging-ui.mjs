// Staging presentation only. Server allowlist/auth remain the security boundary.
export const blockedStagingControls = ['dailyDownload','dailyImportExport','dailyEnrich','profileImageRead','profileImageFile','draftOutlook','draftMailApp','draftLinkedIn','inviteOutlook','inviteICS','providerSetup','saveSearchOpen','addListOpen','removeList','manageListOpen','manageListForm','shareListForm','renameList','deleteList','leaveList','deletePerson','toggleSuppression','runButton','saveSettings','assess','importOpen','export','costOpen','enrichExport','forgetLead','runForm','costForm','playbookStart','playbookCustom'];
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
function stagingImportDisclosure(html){
 if(!html.includes('id="importInputMode"'))return html;
 const replacements=[
  ['<h2>Import professional contacts</h2>','<h2>Import the fictional test CSV</h2>'],
  ['<label>CSV format<select id="importFormat">','<p id="stagingFixtureOnly"><strong>Only the supplied, unchanged fictional CSV fixtures are accepted.</strong> <a href="/staging-fixture.csv">Download the 2-row fixture</a> or <a href="/staging-fixture-large.csv">download the 1,000-row synthetic fixture (about 320 KB)</a>, then upload that file without editing or re-saving it. For paste mode, paste its complete original text, including the header and all rows. Real contacts, provider exports, contact exports and row reports are not accepted. The staging request limit is 500 KB (500,000 bytes including request encoding), not the production import limit.</p><label>Test file format<select id="importFormat" aria-describedby="stagingFixtureOnly">'],
  ['<option value="file">Upload CSV file</option>','<option value="file">Upload the supplied fictional CSV</option>'],
  ['<option value="paste">Paste CSV text</option>','<option value="paste">Paste the complete original fixture text</option>'],
  ['CSV file<input id="csvFile" type="file"','Unchanged supplied fictional CSV<input id="csvFile" aria-describedby="stagingFixtureOnly" type="file"'],
  ['CSV text<textarea id="csvText"','Complete original fictional CSV text<textarea id="csvText" aria-describedby="stagingFixtureOnly"'],
  ['placeholder="First Name,Last Name,Company,Email"','placeholder="Paste the complete original text from either downloaded fixture, including the header and all fictional rows."'],
  ['Up to 5,000 rows / 4 MB. Preview does not save contacts. Unsupported phone fields are retained for review without discarding the contact.','This exercise accepts only the supplied 2-row or 1,000-row synthetic fixture. Preview does not save contacts.']
 ];
 for(const [before,after] of replacements){
  if(html.split(before).length!==2)throw Error('Staging import disclosure adapter needs review');
  html=html.replace(before,after);
 }
 return html;
}
export function stagingPage(html){
 html=stagingImportDisclosure(html);
 const style='<link rel="stylesheet" href="/staging-ui.css">';
 const boot='<script src="/staging-ui.js"></script>';
 const guidance='<section aria-label="Fictional exercise"><p><strong>Practice only:</strong> use fictional names, notes and profile details. Research, provider jobs, sharing, team assignment, deletion and external compose/invite controls are unavailable here. Local draft copying, audience-plan downloads and recording fictional outcomes remain available. This is a UI safeguard, not general network isolation.</p><p><a href="/audience">Manual audience exercise</a> · <a href="/staging-fixture.csv">Download fictional CSV</a> · <a href="/prospect?import=1">Preview in Contacts</a> · <a href="/lab">Worklist</a></p><p id="stagingUiStatus" role="status" aria-live="polite"></p></section>';
 return html.replace('<head>','<head>'+style+boot).replace('<body>','<body>'+guidance)
 .replace('Choose a community you can serve, learn the filters to try in ZoomInfo, then bring your results back for review.','Practice a proposed audience using fictional details. Do not search for real people or purchase exports in this exercise; use the supplied fictional CSV for upload.')
 .replace('In ZoomInfo, export your list or search results as CSV, then drop the file anywhere on this page or choose it below. ProspectPilot recognises the format, offers a new list named after the file and previews the rows; nothing is saved until you choose Import contacts.','Use only the supplied fictional-staging.csv in this exercise. Preview it before saving. Real provider exports and real personal data are outside this test.')
 .replace('Other contact CSV','Supplied fictional CSV').replace('placeholder="e.g. Authorized provider export"','placeholder="Fictional staging fixture"').replace('placeholder="e.g. ZoomInfo"','placeholder="Fictional staging fixture"')
 .replace('Other CSVs need First Name and Last Name, plus Company, Work Email or LinkedIn URL. Imported contact channels remain unverified until independently checked.','Only the supplied fictional CSV is accepted here. These are test records, not verified people or permission to contact anyone.')
 .replace('ZoomInfo IDs, scores, dates, and direct/mobile calling restrictions are preserved when supplied.','Use fictional information only; provider exports are not part of this exercise.')
 .replace('value="ZoomInfo CSV export"','value="Fictional staging fixture"')
 .replace('<h2>Review in ZoomInfo before paying for an export</h2>','<h2>Outside this exercise: review before any export</h2>');
}
export function stagingProspectScript(source){
 const original="initProviderUI({api,selected,filters,getLists:()=>lists.filter(l=>!l.role||l.role==='owner'),refresh:async()=>{await loadLists();await load();},notice}).catch(e=>notice(e.message,true));";
 if(source.split(original).length!==2)throw Error('Staging provider initialization adapter needs review');
 const sizeMarker="if(!r.ok){let data;";
 if(source.split(sizeMarker).length!==2)throw Error('Staging import error adapter needs review');
 const marker="manageButton.className='secondary';";
 if(source.split(marker).length!==2)throw Error('Staging list control adapter needs review');
 return source.replace(sizeMarker,"if(r.status===413&&/^import(?:\\/preview)?$/.test(path))throw Error('This staging request is too large. Only a supplied unchanged fictional CSV is accepted; the request limit is 500 KB including encoding. Download a fixture using the links above and try again. No contacts were saved by this rejected request.');"+sizeMarker).replace(original,"/* Fictional staging: provider and job initialization deliberately omitted. */").replace(marker,marker+"manageButton.id='manageListOpen';").replace('Choose a CSV up to 4 MB, or switch to Paste CSV text.','Choose the supplied fictional-staging.csv or fictional-staging-large.csv file, or paste its complete original text.').replace('Choose a CSV file. In ZoomInfo, export your list or search results as CSV.','Choose the supplied fictional-staging.csv file or fictional-staging-large.csv file. Real provider exports are not accepted here.').replace('Import an authorized contact list or clear your filters to try again.','Import the supplied fictional CSV or clear your filters to try again.').replace('Checks the email domain, applies restrictions, and prepares a brief and draft. No messages are sent.','Prepares a local brief from fictional saved data. Domain/provider checks and outreach are disabled in staging.');
}
