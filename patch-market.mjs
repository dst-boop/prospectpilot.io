import {readFileSync,writeFileSync} from 'node:fs';
import {readCategories} from './market-categories.mjs';
export function patchMarket(worker) {
 worker=worker.replaceAll("$('campaignRadius').value=100;", "$('campaignRadius').value=25;").replaceAll('New website searches start within 100 miles', 'New website searches start within 25 miles');
 const extra=JSON.parse(readFileSync(new URL('./market-category-additions.json',import.meta.url),'utf8'));
 for(const c of readCategories(extra)){
  if(!c.label||!Array.isArray(c.aliases)||!c.aliases.every(a=>typeof a==='string'&&a.trim())||!Array.isArray(c.selectors)||!c.selectors.length||!c.selectors.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>/^[a-z0-9_:]+$/.test(v))))throw new Error('Invalid market category: '+c.label);
 }
 let catalog=readFileSync(new URL('./market-categories.mjs',import.meta.url),'utf8');
 catalog=catalog.replace('const DEFAULT_CATALOG=readCategories();',`const DEFAULT_CATALOG=readCategories(${JSON.stringify(extra)});`);
 const markerStart='// PROSPECTPILOT CATEGORY CATALOG START',markerEnd='// PROSPECTPILOT CATEGORY CATALOG END';
 if(worker.includes(markerStart))worker=worker.slice(0,worker.indexOf(markerStart))+worker.slice(worker.indexOf(markerEnd)+markerEnd.length);
 if(worker.includes('const MARKET_INDUSTRY_RULES = ['))worker=worker.replace(/const MARKET_INDUSTRY_RULES = \[[\s\S]*?\n\];/, '');
 else if(!worker.includes('resolveCategories(industries)'))throw new Error('Unrecognized worker category layout');
 worker=markerStart+'\n'+catalog+'\n'+markerEnd+'\n'+worker;
 worker=worker.replace(/function marketIndustrySpec\(industries\) \{[\s\S]*?\n\}/,`function marketIndustrySpec(industries) {
 const result=resolveCategories(industries);
 if(result.unmatched.length) console.warn(JSON.stringify({event:'unmapped_business_terms',terms:result.unmatched.map(t=>t.slice(0,120))}));
 return result;
}`);
 worker=worker.replace(/^  if \(industries\.selectors\.length > 64\)[^\n]*\n/gm, '');
 worker=worker.replace(/^  if \(!industries.selectors.length\) return .*$/m,`  if (!industries.selectors.length) return { companies: [], errors: [\`Business type “\${industries.requested.join(', ')}” is not recognized yet. Try a broader category or another name. Your search terms are saved with the campaign for future category updates.\`], provider: "OpenStreetMap", location: null, industry_labels: [], unmatched_terms: industries.unmatched };
  if (industries.selectors.length > 64) return { companies: [], errors: ['Please split this search into smaller groups of business types.'], provider: 'OpenStreetMap', location: null, industry_labels: industries.labels };`);
 worker=worker.replace('if (!name || /department|authority|association|school|university|municipal|government/i.test(name)) continue;', 'if (!name) continue;');
 // Expose unrecognized terms even when other categories were matched.
 worker=worker.replace('provider: "OpenStreetMap", location: area, radius_miles: radiusMiles, industry_labels: industries.labels,','provider: "OpenStreetMap", location: area, radius_miles: radiusMiles, industry_labels: industries.labels, unmatched_terms: industries.unmatched,');
 return worker.replace(/(?: unmatched_terms: industries.unmatched,){2,}/g, " unmatched_terms: industries.unmatched,");
}
if(process.argv.includes('--apply')){
 const file=new URL('./generated/worker.mjs',import.meta.url);
 writeFileSync(file,patchMarket(readFileSync(file,'utf8')));
 console.log('Business category catalog applied.');
}
