import {readFileSync,writeFileSync} from 'node:fs';
export function patchQuality(worker){
 if(worker.includes('// QUALITY_GUARD_V1'))return patchAuditUI(worker);
 const helper=String.raw`
// QUALITY_GUARD_V1
function webOnlyLead(lead){
 const sources=array(lead.source_names).map(lower);
 return sources.includes('public website')&&!sources.some(s=>/zoominfo|linkedin|csv|manual|user import/.test(s));
}
function historicalTitle(title){return /\b(?:former|formerly|retired|previous|past|emeritus)\b/i.test(title||'');}
function knownCompany(company){return Boolean(String(company||'').trim())&&!/^(?:unknown|company unknown|n\/?a|none)$/i.test(String(company).trim());}
function evidenceCoverage(lead){
 let score=0;
 if(isLikelyPersonName([lead.first_name,lead.last_name].filter(Boolean).join(' ')))score+=15;
 if(knownCompany(lead.company))score+=20;
 if(lead.current_title&&!historicalTitle(lead.current_title))score+=15;
 if(array(lead.evidence).some(e=>e.kind==='reported'&&safeTargetUrl(e.source_url)&&e.snippet))score+=20;
 if(lead.email||lead.linkedin_url)score+=20;
 if(lead.city||lead.state||lead.company_location)score+=10;
 if(lead.identity_status==='review'||!knownCompany(lead.company)||historicalTitle(lead.current_title))score=Math.min(score,40);
 return score;
}
`;
 worker=helper+'\n'+worker;
 worker=worker.replace('function isLikelyPersonName(value) {','function isLikelyPersonName(value) {\n  if (/\\b(?:other|boards|committees|members|directors|officers|overview|biography|biographies|governance|investor|investors|relations|news|events)\\b/i.test(value)) return false;');
 worker=worker.replace('return isLikelyPersonName([lead.first_name, lead.last_name].filter(Boolean).join(" "));','return isLikelyPersonName([lead.first_name, lead.last_name].filter(Boolean).join(" ")) && knownCompany(lead.company) && Boolean(lead.current_title) && !historicalTitle(lead.current_title);');
 // Eliminate broad container matching: it cannot establish person/title boundaries.
 const start=worker.indexOf('  if (!candidates.length) {',worker.indexOf('export function parsePublicWebPage('));
 const end=worker.indexOf('  const labels =',start);
 if(start<0||end<start)throw Error('Extraction layout changed; quality patch requires review');
 worker=worker.slice(0,start)+worker.slice(end);
 worker=worker.replace('[labels[index + 1], labels[index + 2], labels[index - 1]]','[labels[index + 1]]');
 worker=worker.replace('if (!isLikelyPersonName(candidate.name) || !rolePattern.test(candidate.current_title)) continue;','if (!isLikelyPersonName(candidate.name) || !knownCompany(candidate.company) || historicalTitle(candidate.current_title) || !rolePattern.test(candidate.current_title)) continue;');
 // A named role in a biography can describe the past. Require explicit current wording.
 worker=worker.replace('for (const match of narrative.matchAll(pattern)) {','for (const match of narrative.matchAll(pattern)) {\n      if (patternIndex !== 0 || !/\\b(?:is|serves as)\\b/i.test(match[0])) continue;');
 worker=worker.replace('const confidence = clamp(Math.round(30 + evidenceRows.length * 8 + (lead.email ? 8 : 0) + (lead.linkedin_url ? 8 : 0)), 0, 95);','const confidence = evidenceCoverage(lead);');
 worker=worker.replace('export function qualifyLead(lead) {',`export function qualifyLead(lead) {
  if(webOnlyLead(lead)){
    if(/model/i.test(lead.estimated_income?.basis||''))lead.estimated_income={low:null,high:null,basis:'Not verified'};
    if(/model/i.test(lead.estimated_assets?.basis||''))lead.estimated_assets={low:null,high:null,basis:'Not verified'};
  }`);
 worker=worker.replace('incomeHigh >= 150_000 ? 12 : 5','incomeHigh >= 150_000 ? 12 : incomeHigh > 0 ? 5 : 0');
 worker=worker.replace('incomeHigh >= 150_000 ? 55 : 35','incomeHigh >= 150_000 ? 55 : incomeHigh > 0 ? 35 : 0');
 worker=worker.replace('assetsHigh >= 500_000 ? 50 : 30','assetsHigh >= 500_000 ? 50 : assetsHigh > 0 ? 30 : 0');
 worker=worker.replace('timing > 10 ? timing : 50','timing > 10 ? timing : 0');
 worker=worker.replace('relationship > 0 ? relationship : 35','relationship > 0 ? relationship : 0');
 worker=worker.replace('ageLow >= 45 ? 65 : 50','ageLow >= 45 ? 65 : ageLow > 0 ? 35 : 0');
 // Frozen snapshots cannot establish that a role is still current.
 worker=worker.replace('const fallbackCandidates = verifiedSnapshotCandidates(target, campaign.id);','const fallbackCandidates = [];');

 worker=worker.replace('const SOURCE_DISCOVERY_VERSION = 5;', 'const SOURCE_DISCOVERY_VERSION = 6;');
 worker=worker.replace('const marketDiscovery = await discoverMarketCompanies(campaign);', 'const marketDiscovery = await discoverMarketCompanies(campaign);\n  const marketScoped = array(campaign.industries).length > 0 && array(campaign.locations).length > 0;');
 worker=worker.replace('for (const url of explicit) {','for (const url of marketScoped ? [] : explicit) {');
 worker=worker.replace('const suggested = suggestCampaignTargets(hintedCampaign);','const suggested = marketScoped ? [] : suggestCampaignTargets(hintedCampaign);');
 worker=worker.replace('const allEmployers = unique([...(hintedCampaign.employers || []), ...marketDiscovery.companies.map(company => company.name)]);','const allEmployers = unique([...(marketScoped ? [] : hintedCampaign.employers || []), ...marketDiscovery.companies.map(company => company.name)]);');
 worker=worker.replace('const sources = await discoverCompanySources(company,', 'if (marketScoped && !marketCompany?.website) return [];\n        const sources = await discoverCompanySources(company,');
 worker=worker.replace('for (const source of sourcePlan) {','for (const source of sourcePlan) {\n    if (marketScoped && !marketDiscovery.companies.some(company => lower(company.name) === lower(source.company) && safeTargetUrl(company.website) && safeTargetUrl(source.url) && sameOrganizationHost(new URL(company.website).hostname,new URL(source.url).hostname))) continue;');
 worker=worker.replace('const parsedSeeds = unique(array(campaign.seed_urls)', 'const marketScoped = array(campaign.industries).length > 0 && array(campaign.locations).length > 0;\n  if (marketScoped && campaign.market_discovery?.source_discovery_version !== SOURCE_DISCOVERY_VERSION) throw new Error("Refresh business discovery before running this saved search.");\n  const parsedSeeds = unique(array(campaign.seed_urls)');

 // Update HTML constants by decoding their JSON, avoiding fragile escaped replacements.
 worker=worker.replace(/const DISCOVERY_HTML=("(?:\\.|[^"\\])*");/,(_match,encoded)=>{
 let html=JSON.parse(encoded);
 html=html.replace(/Confidence/g,'Evidence coverage').replace(/% confidence/g,'/100 evidence coverage');
 html=html.replace("num(l.confidence)+'%'","num(l.confidence)+'/100'");
 html=html.replace("num(l.confidence)+'%</span>","num(l.confidence)+'/100</span>");
 return 'const DISCOVERY_HTML='+JSON.stringify(html)+';';
 });
 return patchAuditUI(worker);
}

function patchAuditUI(worker){
 worker=worker.replace('return {provider,recognized:!!detected,results,counts:', 'return {provider,recognized:!!detected,ignored_columns:parsed.headers.filter(h=>!keys.has(header(h))),results,counts:');
 worker=worker.replace(/const ENRICHMENT_HTML=("(?:\\.|[^"\\])*");/,(_match,encoded)=>{
 let html=JSON.parse(encoded);
 html=html.replace("$('preview').innerHTML='<p>Source: '", "$('preview').innerHTML=(d.ignored_columns?.length?'<p role=\\\"status\\\">Columns not imported: '+escape(d.ignored_columns.join(', '))+'. For phone numbers, use Business Phone or Mobile Phone after confirming the number type.</p>':'')+'<p>Source: '");
 return 'const ENRICHMENT_HTML='+JSON.stringify(html)+';';
 });

 worker=worker.replace('(SELECT payload FROM discovery_leads WHERE id=?) IS ?', '(SELECT payload FROM discovery_leads WHERE id=?) IS NOT DISTINCT FROM ?');
 worker=worker.replace('const statements=[db.prepare('+String.fromCharCode(96)+'INSERT INTO enrichment_commit_guards', 'const statements=[db.prepare("SELECT id FROM discovery_leads WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id FOR UPDATE").bind(JSON.stringify(snapshot.map(s=>s.id))),db.prepare('+String.fromCharCode(96)+'INSERT INTO enrichment_commit_guards');

 return worker.replace(/const DISCOVERY_HTML=("(?:\\.|[^"\\])*");/,(_match,encoded)=>{
 let html=JSON.parse(encoded);
 html=html.replace(/@font-face\s*\{[^}]*\}/g,'');
 html=html.replaceAll('Lead Qualifier','ProspectPilot');
 html=html.replace(/<a href="\/enrichment" style="position:fixed;[^"]*">Add provider details<\/a>/,'<a href="/enrichment" style="display:inline-block;margin:16px;padding:12px 18px;background:#155ac8;color:white;border-radius:8px">Add provider details</a>');
 html=html.replace("$('selectAll').onchange=e=>state.leads.forEach(l=>toggleSelection(l.id,e.target.checked))", "$('selectAll').onchange=e=>{const checked=e.target.checked;state.leads.forEach(l=>{if(checked)state.selected.add(l.id);else state.selected.delete(l.id)});renderLeads()}");
 html=html.replace("hasFilters()?'No leads match the current filters. Clear one or more filters and try again.'", "hasFilters()?($('priorityFilter').classList.contains('on')?'No leads in this view meet High Priority: an opportunity score of at least 55, ranked in the top 20%. Clear filters to review all candidates and their missing evidence.':'No leads match the current filters. Clear one or more filters and try again.')");
 return 'const DISCOVERY_HTML='+JSON.stringify(html)+';';
 });
}
