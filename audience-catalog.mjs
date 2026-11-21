// Manual-search guidance only. Never map connector/API keys into invented UI labels.
export const catalogVersion='2026-11-20.1';
export const searchSource='https://gtm.ai/docs/gtm-one/advanced-search/run-an-advanced-search';
export const broadStart='Broad starting plan: no additional constraints proposed. GTM One shows a starting screen until at least one filter is set. Choose one useful supported filter in your account, then review a small baseline sample. No location, employer size or seniority is required. Your edition may differ.';
export const filterSource='https://gtm.ai/docs/gtm-one/advanced-search/overview-of-the-filters-available-in-advanced-search';
export const exportSource='https://gtm.ai/docs/gtm-one/advanced-search/export-advanced-search-results';
export const locationGuidance='For a place, use Country, State, or City. For a ZIP and distance, use Radius Around Postal Code. Long Island is not a verified selectable value; if unavailable, choose a city or ZIP and radius that match your intended area. A radius is not a county boundary. Location of is a separate scope control: choose Contact’s Office rather than Company Headquarters if you mean where the contact works. Neither establishes residence.';
export const catalog=Object.freeze({
 location:{label:'Locations → Country, State, or City / Radius Around Postal Code',source:filterSource,edition:'GTM One',verifiedOn:'2026-11-17',meaning:locationGuidance},
 jobFunction:{label:'Job Title & Role → Departments & Job Functions',source:filterSource,edition:'GTM One',verifiedOn:'2026-11-17',meaning:'Choose this proposed job function only if your account offers it. It narrows to this group, not all office or hands-on workers; no plan ownership is established.'},
 title:{label:'Job Title & Role → Job Title',source:filterSource,edition:'GTM One',verifiedOn:'2026-11-17',meaning:'Choose the professional roles you understand and can serve.'},
 company:{label:'Company Name',source:filterSource,edition:'GTM One',verifiedOn:'2026-11-17',meaning:'Use an employer you have a genuine reason to understand.'},
 employeeCount:{label:'Employee Count',source:filterSource,edition:'GTM One',verifiedOn:'2026-11-17',meaning:'Optional employer-size focus. Match your proposed range to the options your account actually shows; small employer does not prove old retirement assets.'},
 industry:{label:'Industry → Company Industry',source:filterSource,edition:'GTM One',verifiedOn:'2026-11-17',meaning:'Use an industry as context, not evidence of personal assets.'}
});
// Product suggestions, not an exhaustive occupational classification or retirement score.
export const roleFamilies=Object.freeze([
 {id:'accounting',name:'Accounting',occupation:'office'},
 {id:'human-resources',name:'Human Resources',occupation:'office'},
 {id:'information-technology',name:'Information Technology',occupation:'office'},
 {id:'construction',name:'Construction',occupation:'hands-on'},
 {id:'facilities',name:'Facilities Management',occupation:'hands-on'}
].map(Object.freeze));
export function roleFamilyOptions(occupation='both'){return roleFamilies.filter(f=>occupation==='both'||f.occupation===occupation);}
export const audiences=Object.freeze([
 {id:'workplace',name:'Potential old workplace plans',why:'Research people who may have prior workplace plans. Around age 40+ is a planning hypothesis, not a verified ZoomInfo age filter or evidence that someone has an old 401(k). Keep occupations broad; confirm relevance with the person.',field:'role',prompt:'Optional occupational focus',placeholder:'Leave blank to keep occupations broad',filters:['location','title','employeeCount','industry']},
 {id:'local',name:'Professionals in your area',why:'Start with a place and a professional community you know.',field:'role',prompt:'Which role or profession do you understand?',placeholder:'For example, Partner',filters:['location','title','industry','employeeCount']},
 {id:'employer',name:'People at employers you know',why:'Build familiarity with an employer before approaching individuals.',field:'company',prompt:'Which employer do you want to understand?',placeholder:'Enter a company name',filters:['location','company','employeeCount']},
 {id:'industry',name:'A professional industry',why:'Focus your learning on a specific business community.',field:'industry',prompt:'Which industry can you speak about credibly?',placeholder:'For example, manufacturing',filters:['location','industry','employeeCount']}
]);
const clean=value=>String(value??'').trim().slice(0,160);
export function buildPlan(input={}){
 const audience=audiences.find(a=>a.id===input.audience);if(!audience)return {errors:['Choose an audience.']};
 const location=clean(input.location),value=clean(input[audience.field]),size=clean(input.employeeCount);
 const values={location,title:value,company:value,industry:audience.field==='industry'?value:clean(input.industry),employeeCount:size};
 const occupation=audience.id==='workplace'&&['both','hands-on','office'].includes(input.occupation)?input.occupation:'both';
 const roleFamily=audience.id==='workplace'?roleFamilyOptions(occupation).find(f=>f.id===input.roleFamily):null;
 const filters=audience.filters.filter(id=>values[id]).map(id=>({id,...catalog[id],value:values[id]}));
 if(roleFamily)filters.push({id:'jobFunction',...catalog.jobFunction,value:roleFamily.name});
 if(!filters.length&&audience.id!=='workplace')return {errors:['Choose at least one proposed value: a focus, employer size or optional service area.']};
 return {errors:[],occupation,roleFamily:roleFamily?.id||'',audience:audience.name,location,focus:value,filters,exclusion:clean(input.exclusion),version:catalogVersion};
}
export function eventDraft(input={},now=new Date()){
 const event=clean(input.event),date=clean(input.date);let url;try{url=new URL(input.source);}catch{return null;}
 if(!input.reviewed||!event||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>now.toISOString().slice(0,10)||url.protocol!=='https:'||url.username||url.password)return null;
 return {text:'Optional draft: I saw the professional update about '+event+'. Is that something you would like to discuss?',date,source:url.href,caution:'Your evidence review, not app verification. Confirm person match and context; no inference of job loss, assets or interest. Use only after outreach clearance.'};
}

export const safety='Search matches are research candidates, not qualified prospects. A phone number is not permission to call. DNC unknown is not cleared; preserve direct/mobile restrictions and follow firm-approved outreach review. Job title, employer, location and company revenue do not prove age, wealth, retirement timing or interest.';
export function planSummary(plan){
 const n=plan.filters.length;return (n===0?'No provider filters proposed.':n===1?'Only one provider filter proposed: '+plan.filters[0].label+'.':n+' provider filters proposed.')+' No search has run.'+(plan.occupation!=='both'?' Your '+plan.occupation+' occupational preference does not filter results by itself; choose a starting group or add actual titles to narrow roles.':'');
}
export function planText(plan,{fictional=false}={}){if(plan.errors.length)return '';return ['ProspectPilot manual search plan','Checklist only — not a query to paste into one search box.',plan.audience,planSummary(plan),'Occupational planning focus: '+plan.occupation+' (not a ZoomInfo filter or exclusion)',...(!plan.filters.length?[broadStart]:[]),...plan.filters.map(f=>f.label+': '+f.value),...(plan.location?[locationGuidance]:[]),...(plan.roleFamily?['The selected starting group is a proposed job-function filter, not all occupations. If you also entered a title, check the combined criteria do not remove relevant people.']:[]),'Labels documented for GTM One; your ZoomInfo edition may differ.',...(fictional?['Fictional staging exercise only. Do not run a real search or purchase an export for this test.','Practice upload with a supplied unchanged fictional CSV from Contacts. Those records are not results of these filters. Real provider exports are not accepted here.']:['Next: in your own ZoomInfo account, enter each proposed value in its matching supported filter, one at a time. Do not paste this whole checklist into a search box.','Review actual results in ZoomInfo before exporting. No live connection or lead preview is established here.','Exports may spend credits. Check your allowance and firm permission first. Use Export’s arrow to choose Excel/CSV, not the remembered destination.','Upload through ProspectPilot’s existing CSV preview. Nothing is saved by this guide.']),...(plan.exclusion?['Proposed exclusion to test, not an applied filter: '+plan.exclusion,'Compare a small sample before and after. Record relevant kept, irrelevant removed and relevant missed. Retain the exclusion only if its benefit outweighs lost relevant people. No Boolean NOT syntax is assumed.']:[]),safety,'Search documentation: '+searchSource,'Filter documentation: '+filterSource,'Export documentation: '+exportSource].join('\n\n');}
