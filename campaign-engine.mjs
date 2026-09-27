const text=v=>String(v??'').trim();
const list=(v,max=50)=>[...new Set((Array.isArray(v)?v:[]).map(text).filter(Boolean))].slice(0,max);
const integer=(v,min,max,fallback)=>{const n=Number(v??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`Expected integer between ${min} and ${max}.`);return n;};

export const DEFAULT_SOURCE_ORDER=Object.freeze([
  'search_index','company_site','press_release','sec','public_pdf','association','university','dol_5500','warn','licensed_enrichment'
]);

export function normalizeCampaign(input={}){
  const zip=text(input.zip);
  const location=text(input.location);
  if(!zip&&!location)throw new Error('Campaign requires zip or location.');
  if(zip&&!/^\d{5}(?:-\d{4})?$/.test(zip))throw new Error('Campaign zip must be a US ZIP code.');
  const minimum_age=integer(input.minimum_age,18,100,55);
  const maximum_age=integer(input.maximum_age,minimum_age,110,75);
  return {
    id:text(input.id),name:text(input.name)||'Untitled campaign',zip,location,
    radius_miles:integer(input.radius_miles,1,250,25),industry:list(input.industry||input.industries,20),company_types:list(input.company_types,20),
    titles:list(input.titles,50),seniority:list(input.seniority,20),graduation_year_min:input.graduation_year_min?integer(input.graduation_year_min,1930,2200):null,
    graduation_year_max:input.graduation_year_max?integer(input.graduation_year_max,1930,2200):null,
    minimum_age,maximum_age,minimum_experience_years:integer(input.minimum_experience_years,0,70,10),
    maximum_leads:integer(input.maximum_leads,1,10000,250),source_order:list(input.source_order?.length?input.source_order:DEFAULT_SOURCE_ORDER,20),
    daily_budget_micros:integer(input.daily_budget_micros,0,1000000000,0)
  };
}

const quote=v=>`"${String(v).replaceAll('"','')}"`;
const area=c=>c.zip?`${c.zip} ${c.radius_miles} miles`:c.location;

export function companyDiscoveryQueries(campaign){
  const c=normalizeCampaign(campaign),industries=c.industry.length?c.industry:['business'];
  const types=c.company_types.length?c.company_types:['company'];
  const queries=[];
  for(const industry of industries)for(const type of types){
    queries.push(`${quote(industry)} ${quote(type)} ${area(c)}`);
    queries.push(`${industry} ${type} owners executives ${area(c)}`);
    queries.push(`${industry} ${type} leadership ${area(c)}`);
  }
  return [...new Set(queries)].slice(0,100);
}

export function personDiscoveryQueries(company,campaign){
  const c=normalizeCampaign(campaign),name=text(company?.name||company?.company);
  if(!name)throw new Error('Company name is required.');
  const titles=c.titles.length?c.titles:['owner','president','founder','partner','CEO','vice president','director'];
  const base=titles.slice(0,12).join(' OR ');
  const queries=[
    `${quote(name)} (${base})`,
    `${quote(name)} leadership team`,
    `${quote(name)} executive bio`,
    `${quote(name)} filetype:pdf leadership`,
    `${quote(name)} retirement OR appointed OR joined OR departure`,
    `site:${text(company?.domain)} (${base})`.trim()
  ];
  if(c.graduation_year_min&&c.graduation_year_max)queries.push(`${quote(name)} (${base}) (class of ${c.graduation_year_min}..${c.graduation_year_max})`);
  return [...new Set(queries.filter(q=>!q.startsWith('site: (')))].slice(0,50);
}

export function personResearchQueries(person={}){
  const name=text([person.first_name,person.last_name].filter(Boolean).join(' ')),company=text(person.company);
  if(!name)throw new Error('Person name is required.');
  return [...new Set([
    `${quote(name)} ${quote(company)}`,
    `${quote(name)} ${quote(company)} bio`,
    `${quote(name)} ${quote(company)} university`,
    `${quote(name)} ${quote(company)} director OR executive`,
    `${quote(name)} ${quote(company)} retirement OR departure OR joined`,
    `${quote(name)} ${quote(company)} filetype:pdf`
  ])];
}

export function nextSources({attempted=[],blocked=[],configured=DEFAULT_SOURCE_ORDER}={}){
  const skip=new Set([...attempted,...blocked]);
  return configured.filter(source=>!skip.has(source));
}

export function campaignFunnel(events=[]){
  const stages=['companies_discovered','companies_researched','people_discovered','identity_resolved','estimated_55_plus','retirement_evidence','qualified','contact_enriched','contact_ready'];
  const counts=Object.fromEntries(stages.map(s=>[s,0]));
  let cost_micros=0;
  for(const event of events){
    if(stages.includes(event.stage))counts[event.stage]+=Number(event.count)||0;
    cost_micros+=Number(event.cost_micros)||0;
  }
  const q=counts.qualified,c=counts.contact_ready;
  return {...counts,cost_micros,cost_per_qualified_micros:q?Math.round(cost_micros/q):null,cost_per_contact_ready_micros:c?Math.round(cost_micros/c):null};
}
