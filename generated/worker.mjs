
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

// PROSPECTPILOT CATEGORY CATALOG START
// Each row: display name | OSM key=value[,key=value] | common search aliases.
export const categoryRows = `
Autobody shops|service:vehicle:body_repair=yes,service:vehicle:body_repair=only,service:vehicle:collision_repair=yes|autobody,auto body,autobody shop,auto body shop,body shop,bodyshop,collision repair,collision center,collision centre
Auto repair|shop=car_repair|mechanic,auto mechanic,car repair,auto repair,automotive repair,vehicle repair,transmission shop,brake shop,oil change,auto service,auto garage,repair garage,automotive service
Automotive dealers|shop=car|car dealer,auto dealer,automotive dealer,car dealership,used cars
Auto parts|shop=car_parts|auto parts,car parts,automotive parts
Tire shops|shop=tyres|tire shop,tyre shop,tires,tyres
Car washes|amenity=car_wash|car wash,auto detailing,car detailing
Motorcycle shops|shop=motorcycle|motorcycle dealer,motorcycle shop,motorbike
Bicycle shops|shop=bicycle|bike shop,bicycle shop,bicycle repair
Construction|office=construction_company,craft=builder,company=construction|construction,general contractor,commercial builder,home builder,building contractor
Electrical contractors|craft=electrician|electrician,electrical contractor,electrical service,electrical
Plumbers|craft=plumber|plumber,plumbing,plumbing contractor
HVAC contractors|craft=hvac|hvac,heating and cooling,heating contractor,air conditioning contractor
Roofers|craft=roofer|roofer,roofing,roofing contractor
Carpenters|craft=carpenter|carpenter,carpentry,woodworking
Painters|craft=painter|painter,painting contractor,house painting
Masons|craft=stonemason|mason,masonry,stonemason,stonework
Landscapers|craft=gardener|landscaper,landscaping,gardener,gardening,lawn care,lawn service
Locksmiths|craft=locksmith|locksmith,lock repair
Glaziers|craft=glaziery|glazier,glass repair,window glass
Flooring|craft=parquet_layer,shop=flooring|flooring,floor installer,hardwood floor
Tile contractors|craft=tiler|tiler,tile contractor,tile installer
Cabinet makers|craft=cabinet_maker|cabinet maker,cabinetry,custom cabinets
Welders|craft=welder|welder,welding
Metalworkers|craft=metal_construction|metal fabrication,metalworker,metal construction
Cleaning services|craft=cleaning|cleaning service,commercial cleaning,janitorial,house cleaning
Chimney sweeps|craft=chimney_sweeper|chimney sweep,chimney cleaning
Architecture|office=architect|architect,architecture,architecture firm
Engineering|office=engineer|engineer,engineering firm,civil engineering
Surveyors|office=surveyor|surveyor,land surveyor,surveying
Manufacturing|man_made=works,industrial=factory|manufacturer,manufacturing,factory,industrial company
Legal services|office=lawyer|lawyer,attorney,law firm,legal,legal services
Accounting|office=accountant,office=tax_advisor|accountant,accounting,cpa,bookkeeper,bookkeeping,tax firm,tax preparation,tax advisor
Insurance|office=insurance|insurance,insurance agent,insurance broker,insurance agency
Real estate|office=estate_agent|real estate,realtor,estate agent,property broker,real estate broker
Property management|office=property_management|property management,property manager
Financial advice|office=financial_advisor|financial advisor,financial adviser,financial planner,wealth management
Banks|amenity=bank|bank,credit union
Travel agencies|shop=travel_agency|travel agent,travel agency,travel planner
Employment agencies|office=employment_agency|recruiter,recruiting,staffing agency,employment agency
IT services|office=it|it services,information technology,software company,software development,managed it,technology,tech,technology company,tech company,technology firm,tech firm,technology services,technology business,information technology company,it company,it consulting,it consultant,it support,technical support,computer consulting,computer services,managed services,managed service provider,msp,software,software firm,software developer,software engineering,saas,software as a service,cloud computing,cloud services,cybersecurity,cyber security,network services,network consulting,web development,web developer,app development,application development,mobile app development,data analytics,artificial intelligence,ai company
Advertising|office=advertising_agency|advertising agency,ad agency,marketing agency
Consulting|office=consulting|consultant,consulting,business consulting
Notaries|office=notary|notary,notary public
Medical practices|amenity=doctors,healthcare=doctor,amenity=clinic|doctor,physician,medical practice,medical,healthcare,clinic,primary care,urgent care
Dental practices|amenity=dentist|dentist,dental,dental practice,orthodontist
Veterinary practices|amenity=veterinary|veterinarian,veterinary,vet,animal hospital
Pharmacies|amenity=pharmacy|pharmacy,pharmacist,drugstore
Opticians|shop=optician|optician,optical shop,eyeglasses
Optometrists|healthcare=optometrist|optometrist,optometry
Physiotherapy|healthcare=physiotherapist|physical therapy,physical therapist,physiotherapy,physiotherapist
Chiropractors|healthcare=chiropractor|chiropractor,chiropractic
Podiatrists|healthcare=podiatrist|podiatrist,podiatry,foot doctor
Psychologists|healthcare=psychotherapist|psychotherapist,psychotherapy,psychologist,mental health therapist
Audiologists|healthcare=audiologist|audiologist,audiology
Medical laboratories|healthcare=laboratory|medical lab,medical laboratory,diagnostic lab
Hospitals|amenity=hospital|hospital
Restaurants|amenity=restaurant|restaurant,dining,bistro,steakhouse,pizzeria,pizza restaurant,sushi restaurant,seafood restaurant,hospitality group
Fast food|amenity=fast_food|fast food,takeout,takeaway,sandwich shop
Cafes|amenity=cafe|cafe,coffee shop,coffeehouse,espresso bar
Bars|amenity=bar,amenity=pub|bar,pub,tavern,cocktail bar
Bakeries|shop=bakery|bakery,baker,bread shop,pastry shop
Catering|craft=caterer|caterer,catering
Ice cream|amenity=ice_cream|ice cream,gelato,frozen yogurt
Hotels|tourism=hotel|hotel,lodging
Motels|tourism=motel|motel
Guest houses|tourism=guest_house|guest house,bed and breakfast,bnb
Hostels|tourism=hostel|hostel
Hair salons|shop=hairdresser|hairdresser,hair salon,barber,barbershop,hair stylist
Beauty salons|shop=beauty|beauty salon,beautician,nail salon,nail technician,esthetician,lash studio
Massage|shop=massage|massage,massage therapist
Tattoo shops|shop=tattoo|tattoo,tattoo studio,tattoo artist
Fitness centers|leisure=fitness_centre|gym,fitness center,fitness centre,health club,fitness studio
Dance schools|amenity=dancing_school|dance school,dance studio
Driving schools|amenity=driving_school|driving school,driving instructor
Music schools|amenity=music_school|music school,music lesson
Language schools|amenity=language_school|language school,language lesson
Childcare|amenity=childcare,amenity=kindergarten|childcare,child care,daycare,day care,preschool,kindergarten
Funeral homes|shop=funeral_directors|funeral home,funeral director,mortuary
Florists|shop=florist|florist,flower shop
Pet stores|shop=pet|pet store,pet shop,pet supplies
Pet grooming|shop=pet_grooming|pet grooming,dog grooming,pet groomer,dog groomer
Laundry|shop=laundry|laundry,laundromat,launderette
Dry cleaners|shop=dry_cleaning|dry cleaner,dry cleaning
Tailors|craft=tailor|tailor,tailoring,alterations
Shoemakers|craft=shoemaker|shoemaker,shoe repair,cobbler
Jewelry|shop=jewelry|jeweler,jeweller,jewelry,jewellery
Watch shops|shop=watches|watch shop,watches
Clothing|shop=clothes|clothing,clothes,apparel,boutique
Shoe stores|shop=shoes|shoe store,shoe shop,footwear
Furniture|shop=furniture|furniture,furniture store
Hardware|shop=hardware|hardware,hardware store
Building supplies|shop=doityourself,shop=trade|building supplies,building materials,home improvement
Garden centers|shop=garden_centre|garden center,garden centre,plant nursery
Electronics|shop=electronics|electronics,electronics store
Computer shops|shop=computer|computer shop,computer store,computer repair
Phone shops|shop=mobile_phone|phone shop,cell phone,mobile phone
Appliance stores|shop=appliance|appliance,appliance store
Bookstores|shop=books|bookstore,book shop,bookseller
Stationery|shop=stationery|stationery,office supplies
Printing|shop=copyshop,craft=printer|print shop,printing,printer,copy shop
Photography|craft=photographer,shop=photo|photographer,photography,photo studio
Grocery stores|shop=supermarket,shop=convenience|grocery,grocery store,supermarket,convenience store,food market
Butchers|shop=butcher|butcher,meat market
Seafood shops|shop=seafood|fishmonger,seafood shop,fish market
Delicatessens|shop=deli|deli,delicatessen
Liquor stores|shop=alcohol|liquor store,wine shop,beer store
Toy stores|shop=toys|toy store,toy shop
Sporting goods|shop=sports|sporting goods,sports shop,sports store
Outdoor stores|shop=outdoor|outdoor store,camping supplies
Music shops|shop=musical_instrument|music shop,musical instrument,guitar shop
Art supplies|shop=art|art supplies,art shop
Antiques|shop=antiques|antique,antiques shop
Gift shops|shop=gift|gift shop,gift store
Thrift shops|shop=second_hand,shop=charity|thrift shop,thrift store,second hand,resale shop
Storage|shop=storage_rental|self storage,storage rental,storage unit
Movers|office=moving_company|mover,moving company,relocation company
Courier services|office=courier|courier,delivery service
Logistics|office=logistics|logistics,freight forwarding
Car rentals|amenity=car_rental|car rental,auto rental,rental car
Fuel stations|amenity=fuel|gas station,fuel station,petrol station
Breweries|craft=brewery|brewery,brewer,craft brewery
Wineries|craft=winery|winery,wine maker
Distilleries|craft=distillery|distillery,distiller
`;
export function readCategories(extra = []) {
 return [...categoryRows.trim().split('\n').map(line=>{const [label,tags,aliases]=line.split('|');return {label,selectors:tags.split(',').map(tag=>tag.split('=')),aliases:aliases.split(',')};}),...extra];
}
export function normalizeTerm(value) {
 return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(w=>w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>3&&w.endsWith('s')&&!/(ss|is|us)$/.test(w)?w.slice(0,-1):w).join(' ');
}

const DEFAULT_CATALOG=readCategories([]);
const compiledCatalogs=new WeakMap();
function compileCatalog(catalog){
 if(compiledCatalogs.has(catalog))return compiledCatalogs.get(catalog);
 const phrases=new Map();let maxWords=1;
 for(const [index,category] of catalog.entries())for(const alias of [category.label,...category.aliases]){
  const phrase=normalizeTerm(alias);if(!phrase)continue;
  maxWords=Math.max(maxWords,phrase.split(' ').length);
  if(!phrases.has(phrase))phrases.set(phrase,index);
 }
 const compiled={phrases,maxWords};compiledCatalogs.set(catalog,compiled);return compiled;
}
export function resolveCategories(industries,catalog=DEFAULT_CATALOG){
 const requested=[...new Set((Array.isArray(industries)?industries:[industries]).filter(Boolean).flatMap(v=>String(v).split(/[,;\n\/]+/)).map(v=>v.trim()).filter(Boolean))];
 const {phrases,maxWords}=compileCatalog(catalog),matched=new Set(),unmatched=[];
 for(const term of requested){
  const words=normalizeTerm(term).split(' '),hits=[];
  for(let start=0;start<words.length;start++)for(let count=1;count<=maxWords&&start+count<=words.length;count++){
   const index=phrases.get(words.slice(start,start+count).join(' '));
   if(index!==undefined)hits.push({index,start,end:start+count});
  }
  const used=[];for(const hit of hits.sort((a,b)=>(b.end-b.start)-(a.end-a.start))){if(used.some(x=>hit.start<x.end&&hit.end>x.start))continue;used.push(hit);matched.add(hit.index);}
  if(!used.length)unmatched.push(term);
 }
 const categories=[...matched].map(i=>catalog[i]);
 const selectors=[...new Map(categories.flatMap(c=>c.selectors).map(pair=>[pair.join('='),pair])).values()];
 return {requested,labels:categories.map(c=>c.label),selectors,search_terms:categories.length===1&&categories[0].label==='Electrical contractors'?['electrician']:[],unmatched};
}

// PROSPECTPILOT CATEGORY CATALOG END
const NATIVE_RESEARCH_JS="(() => {\nconst button=document.getElementById('autoResearch'),progress=document.getElementById('autoProgress'),results=document.getElementById('autoResults'),select=document.getElementById('lead');\nlet running=false;\n\nasync function renderProfile(id){\n const response=await fetch('/api/research/records?lead_id='+encodeURIComponent(id));\n if(!response.ok)return;\n const data=await response.json();if(select.value!==id)return;\n const root=document.getElementById('researchPicture');root.replaceChildren();const p=data.profile;if(!p)return;\n const add=(tag,value,parent=root)=>{const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;};\n add('h2','Research overview');\n add('p',[p.identity.name,p.identity.role,p.identity.company,p.identity.location].join(' · '));\n add('small','Saved lead details · '+p.source_pages+' distinct source pages');\n for(const f of p.facts||[])add('p',f.field.replaceAll('_',' ')+': '+f.value+' ('+f.scope+' evidence)');\n for(const field of p.conflicts||[])add('p','Conflicting evidence: '+field.replaceAll('_',' ')+'. Compare the original sources below.');\n for(const g of p.groups){add('h3',g.label);for(const r of g.records){const item=add('p',r.excerpt+' ');let url;try{url=new URL(r.url);}catch{continue;}if(!['http:','https:'].includes(url.protocol))continue;const link=add('a','View evidence',item);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';add('small',(r.source_date?'Source date: '+r.source_date:'Source date unknown')+' · '+r.status.replaceAll('_',' '),item);}}\n for(const gap of [...p.gaps,...p.warnings])add('p',gap);\n}\n\nfunction render(reports){\n results.replaceChildren();\n for(const report of reports){const row=document.createElement('p');row.textContent=report.label+': '+({matched:'Matching evidence saved',partial:'Limited coverage / source unavailable',no_match:'No matching evidence found',failed:'Could not complete'}[report.status]||report.status)+(report.cached?' (saved check)':'');results.append(row);const detail=document.createElement('small');detail.textContent=[report.coverage,...(report.limitations||[])].filter(Boolean).join(' ');results.append(detail);}\n}\nlet watch=0;\nasync function monitor(id,version){\n let lastRevision=null;\n for(;;){\n  if(version!==watch||select.value!==id)return;\n  const r=await fetch('/api/research/job?lead_id='+encodeURIComponent(id));if(!r.ok)throw Error('Could not check research progress.');\n  const {job}=await r.json();if(version!==watch||select.value!==id)return;\n  if(!job){button.disabled=false;progress.textContent='Ready to research this lead.';return;}\n  render((job.reports||[]).map(x=>({...x,label:x.source})));\n  const active=['queued','running'].includes(job.status);button.disabled=active;\n  progress.textContent=active?'Research '+job.status+': '+job.next_source+' of 12 checks completed. You can close this page.':'Research '+job.status.replaceAll('_',' ')+'. Review the evidence and gaps below.';\n  const revision=JSON.stringify([job.id,job.updated_at,job.next_source,job.status]);\n  if(revision!==lastRevision){await renderProfile(id);if(version!==watch||select.value!==id)return;if(typeof loadRecords==='function')await loadRecords();lastRevision=revision;}\n  if(!active)return;\n  await new Promise(resolve=>setTimeout(resolve,2500));\n }\n}\nbutton.onclick=async()=>{\n const id=select.value;if(!id){progress.textContent='Choose a lead first.';return;}\n if(running)return;running=true;button.disabled=true;const version=++watch;\n try{\n  const r=await fetch('/api/research/job',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lead_id:id})});\n  const d=await r.json();if(!r.ok)throw Error(d.detail||'Could not queue research.');\n  if(!d.job.dispatched)progress.textContent='Research saved in the queue. Waiting for the background worker.';\n  await monitor(id,version);\n }catch(e){progress.textContent=e.message;button.disabled=false;}\n finally{if(version===watch)running=false;}\n};\nselect.addEventListener('change',async()=>{\n const version=++watch;running=false;results.replaceChildren();button.disabled=false;\n if(!select.value)return;const id=select.value;\n try{await renderProfile(id);await monitor(id,version);}catch(e){if(version===watch)progress.textContent=e.message;}\n});\n})();\n";
const DISCOVERY_HTML="<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"description\" content=\"Evidence-backed prospect discovery, qualification, and advisor workflow.\">\n<title>Find leads · ProspectPilot</title>\n<style>\n\n\n\n:root{\n  --navy:#061d45;--navy2:#0b2d64;--blue:#1959db;--blue2:#eaf0ff;--sky:#d9edf4;\n  --paper:#f6f5f1;--white:#fff;--ink:#0b1f3a;--muted:#647187;--line:#dce1e8;\n  --green:#147452;--green-bg:#e6f5ee;--amber:#916416;--amber-bg:#fbf2d8;\n  --red:#a23d36;--red-bg:#fae9e7;--purple:#6d42a6;--purple-bg:#f0e8fa;\n  --shadow:0 16px 42px rgba(7,29,68,.13);--radius:12px;\n  --font:PublicSans,system-ui,-apple-system,\"Segoe UI\",sans-serif;\n}\n*{box-sizing:border-box}html{font-size:15px}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--font);min-height:100vh}\nbutton,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.5}\n:focus-visible{outline:3px solid rgba(25,89,219,.25);outline-offset:2px}\n.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}\n[hidden]{display:none!important}\n.topbar{height:68px;background:var(--navy);color:white;display:flex;align-items:center;padding:0 26px;gap:18px;position:sticky;top:0;z-index:30;box-shadow:0 3px 12px rgba(2,17,44,.2)}\n.brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:white;min-width:max-content}.brandmark{width:34px;height:34px;border-radius:9px;background:linear-gradient(145deg,#64c0de,#83dfbb);color:var(--navy);display:grid;place-items:center;font-weight:800;font-size:1.05rem}.brandcopy b{display:block;font-size:.98rem;letter-spacing:.01em}.brandcopy small{display:block;color:#a9bdd9;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;margin-top:1px}\n.crumb{height:28px;width:1px;background:#31507a}.page-title{font-weight:500;color:#eaf1fa;white-space:nowrap}.top-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.auth-pill{display:flex;align-items:center;gap:8px;border:1px solid #36547b;border-radius:22px;padding:6px 10px 6px 7px;color:#dbe7f6;font-size:.78rem;white-space:nowrap}.avatar{width:23px;height:23px;border-radius:50%;display:grid;place-items:center;background:#dff4ea;color:#0b6847;font-size:.68rem;font-weight:700}.icon-btn,.top-btn{border:1px solid #36547b;background:transparent;color:#eef4fb;border-radius:8px;padding:8px 11px}.top-btn:hover,.icon-btn:hover{background:#173765;border-color:#6582aa}.top-btn.primary{background:white;color:var(--navy);border-color:white;font-weight:600}.top-btn.primary:hover{background:#e8f0fb}\n.auth-warning{background:#fff4d7;color:#6d4b08;border-bottom:1px solid #ead18d;padding:10px 26px;display:flex;align-items:center;gap:10px;font-size:.84rem}.auth-warning a{color:#164db7;font-weight:600}\n.shell{max-width:1720px;margin:0 auto;padding:24px 26px 100px}\n.hero{display:flex;align-items:flex-start;gap:18px;margin-bottom:18px}.hero h1{font-size:1.65rem;line-height:1.15;margin:0 0 6px;letter-spacing:-.025em}.hero p{margin:0;color:var(--muted);max-width:780px;line-height:1.5}.hero-actions{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}\n.btn{border:1px solid var(--line);background:var(--white);border-radius:8px;padding:9px 13px;font-size:.82rem;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}.btn:hover:not(:disabled){border-color:#9baac0;background:#f9fbfd}.btn.primary{background:var(--blue);border-color:var(--blue);color:white}.btn.primary:hover:not(:disabled){background:#124cc2}.btn.dark{background:var(--navy);border-color:var(--navy);color:#fff}.btn.subtle{background:transparent}.btn.danger{color:var(--red);border-color:#e8c4c0}.btn.danger:hover{background:var(--red-bg)}.btn.small{padding:6px 9px;font-size:.75rem}.btn.icon{padding:8px;width:36px}.ico{font-style:normal;font-size:1rem;line-height:1}\n.metrics{display:grid;grid-template-columns:repeat(6,minmax(145px,1fr));gap:10px;margin-bottom:18px}.metric{background:var(--white);border:1px solid var(--line);border-radius:10px;padding:13px 15px;min-height:90px;position:relative;overflow:hidden}.metric:before{content:\"\";position:absolute;inset:0 auto 0 0;width:3px;background:var(--navy)}.metric.priority:before{background:var(--purple)}.metric.signal:before{background:var(--green)}.metric.follow:before{background:var(--amber)}.metric.review:before{background:var(--red)}.metric.selected:before{background:var(--blue)}.metric-label{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}.metric-value{font-size:1.55rem;font-weight:600;letter-spacing:-.03em}.metric-note{font-size:.72rem;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.workgrid{display:grid;grid-template-columns:minmax(270px,320px) minmax(0,1fr);gap:16px;align-items:start}.rail{display:flex;flex-direction:column;gap:12px;position:sticky;top:86px}.panel{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}.panel-head{display:flex;align-items:center;gap:8px;padding:14px 15px;border-bottom:1px solid var(--line)}.panel-head h2{font-size:.88rem;margin:0;font-weight:600}.panel-head small{margin-left:auto;color:var(--muted);font-size:.7rem}.panel-body{padding:14px 15px}.label{display:block;font-size:.68rem;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;font-weight:600}.field{width:100%;border:1px solid var(--line);background:white;border-radius:7px;padding:9px 10px;font-size:.82rem}.field:hover{border-color:#aab6c7}.field:focus{border-color:var(--blue);outline:3px solid rgba(25,89,219,.11)}textarea.field{resize:vertical;min-height:62px}.field-row{margin-bottom:11px}.split{display:grid;grid-template-columns:1fr 1fr;gap:8px}.checkrow{display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--muted)}.checkrow input{accent-color:var(--blue)}\n.provider-list{display:flex;flex-direction:column;gap:8px}.provider{display:grid;grid-template-columns:9px 1fr auto;gap:9px;align-items:start;font-size:.76rem}.dot{width:8px;height:8px;border-radius:50%;margin-top:4px;background:#aeb7c4}.provider.on .dot{background:var(--green);box-shadow:0 0 0 3px var(--green-bg)}.provider b{display:block;font-size:.77rem}.provider small{display:block;color:var(--muted);line-height:1.35;margin-top:2px}.provider-tag{font-size:.61rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:#f0f2f5;padding:3px 5px;border-radius:4px}\n.campaign-card{border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:9px;transition:.15s}.campaign-card:hover{border-color:#aab7ca}.campaign-card.active{border-color:var(--blue);box-shadow:inset 3px 0 var(--blue);background:#f8faff}.campaign-select{display:block;width:100%;border:0;background:transparent;padding:0;text-align:left;color:inherit}.campaign-select:focus-visible{border-radius:5px}.campaign-top{display:flex;gap:8px;align-items:center}.campaign-top b{font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.state{font-size:.61rem;text-transform:uppercase;letter-spacing:.05em;padding:3px 6px;border-radius:5px;margin-left:auto;background:#edf0f4;color:#56657a}.state.complete{background:var(--green-bg);color:var(--green)}.state.running,.state.queued{background:var(--blue2);color:var(--blue)}.state.partial{background:var(--amber-bg);color:var(--amber)}.state.failed{background:var(--red-bg);color:var(--red)}.campaign-meta{font-size:.68rem;color:var(--muted);margin-top:5px}.campaign-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.campaign-actions .btn{flex:1 1 auto}.rail-empty{font-size:.78rem;color:var(--muted);line-height:1.45;padding:2px 0 8px}\n.progress-card{border-top:1px solid var(--line);padding:13px 15px;background:#f9fbfe}.progress-head{display:flex;align-items:center;gap:7px;font-size:.76rem}.progress-head b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.progress-head span{margin-left:auto;color:var(--blue);font-size:.68rem;text-transform:uppercase}.progress-track{height:6px;background:#dce4f0;border-radius:5px;overflow:hidden;margin:9px 0 7px}.progress-fill{height:100%;background:linear-gradient(90deg,var(--blue),#52b4d7);width:0;transition:width .3s}.progress-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.progress-stat b{display:block;font-size:.78rem}.progress-stat small{font-size:.62rem;color:var(--muted)}.job-message{font-size:.68rem;color:var(--muted);line-height:1.35;margin-top:8px}\n.main-panel{min-width:0}.main-top{background:var(--white);border:1px solid var(--line);border-radius:var(--radius) var(--radius) 0 0;padding:13px;display:flex;flex-direction:column;gap:10px}.filter-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.searchbox{position:relative;flex:1;min-width:220px}.searchbox input{padding-left:34px}.searchbox:before{content:\"⌕\";position:absolute;left:11px;top:7px;color:var(--muted);font-size:1.05rem}.filter-row select{width:auto;min-width:115px}.filter-toggle{border:1px solid var(--line);background:white;border-radius:7px;padding:8px 10px;font-size:.77rem}.filter-toggle.on{border-color:var(--blue);background:var(--blue2);color:var(--blue)}.result-row{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:.73rem;min-height:28px}.result-row strong{color:var(--ink)}.result-row .right{margin-left:auto;display:flex;gap:7px;align-items:center}.active-filter{background:var(--blue2);color:var(--blue);border-radius:13px;padding:4px 8px}.linkbtn{background:none;border:0;color:var(--blue);padding:3px;font-size:.73rem}\n.table-shell{border:1px solid var(--line);border-top:0;background:white;overflow:auto;max-height:calc(100vh - 250px);min-height:480px;position:relative}table{border-collapse:separate;border-spacing:0;width:100%;min-width:1120px;font-size:.78rem}th{position:sticky;top:0;z-index:5;background:#f8f9fb;color:#627086;text-align:left;font-size:.63rem;text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid #cfd6df;padding:10px 9px;white-space:nowrap}th.sort{user-select:none}th.sort:hover{color:var(--ink)}th.sort[data-dir=\"asc\"]:after{content:\" ↑\";color:var(--blue)}th.sort[data-dir=\"desc\"]:after{content:\" ↓\";color:var(--blue)}.sort-btn{border:0;background:transparent;padding:0;color:inherit;font:inherit;text-transform:inherit;letter-spacing:inherit}td{padding:10px 9px;border-bottom:1px solid #edf0f3;vertical-align:middle;background:white}tbody tr{cursor:pointer}tbody tr:hover td{background:#fafbfe}tbody tr.selected td{background:#f3f7ff}.checkcell{width:38px;text-align:center;position:sticky;left:0;z-index:2;background:white}.checkcell input{accent-color:var(--blue)}th.checkcell{z-index:7;background:#f8f9fb}.person{min-width:165px}.person-open{display:block;width:100%;border:0;background:transparent;padding:0;text-align:left;color:inherit}.person b{display:block;font-size:.82rem}.person small,.role small{display:block;color:var(--muted);margin-top:3px;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.role{max-width:215px}.role b{font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.score{display:flex;align-items:center;gap:7px}.score-ring{--p:0;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--c,var(--blue)) calc(var(--p)*1%),#e7ebf0 0);position:relative;font-weight:700;font-size:.69rem;flex:none}.score-ring:before{content:\"\";position:absolute;inset:4px;background:white;border-radius:50%}.score-ring span{z-index:1}.score-copy b{display:block;font-size:.72rem}.score-copy small{display:block;color:var(--muted);font-size:.62rem;margin-top:2px}.priority-score{font-size:.95rem;font-weight:700}.mini-scores{display:flex;gap:5px;color:var(--muted);font-size:.61rem;margin-top:3px}.mini-scores span{white-space:nowrap}.confidence{display:flex;align-items:center;gap:6px}.confbar{width:42px;height:5px;border-radius:4px;background:#e5e9ee;overflow:hidden}.confbar i{display:block;height:100%;background:var(--green)}.badge{display:inline-flex;align-items:center;border-radius:12px;padding:4px 7px;font-size:.65rem;font-weight:600;white-space:nowrap;background:#eef1f4;color:#536174}.badge.hot{background:var(--purple-bg);color:var(--purple)}.badge.qualified{background:var(--green-bg);color:var(--green)}.badge.watch{background:var(--amber-bg);color:var(--amber)}.badge.review{background:var(--red-bg);color:var(--red)}.signal-chip{max-width:145px;overflow:hidden;text-overflow:ellipsis}.due{color:var(--red);font-weight:600}.ownership small{display:block;color:var(--muted);margin-top:3px;max-width:140px;overflow:hidden;text-overflow:ellipsis}.empty-state{display:grid;place-items:center;text-align:center;padding:70px 24px;color:var(--muted)}.empty-icon{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;background:var(--blue2);color:var(--blue);font-size:1.4rem;margin:0 auto 14px}.empty-state h3{color:var(--ink);margin:0 0 6px;font-size:1rem}.empty-state p{max-width:430px;margin:0 auto 14px;line-height:1.5;font-size:.8rem}.skeleton td{height:57px}.sk{height:9px;background:linear-gradient(90deg,#edf0f3,#f8f9fa,#edf0f3);background-size:200% 100%;animation:shimmer 1.2s infinite;border-radius:6px}@keyframes shimmer{to{background-position:-200% 0}}\n.pager{border:1px solid var(--line);border-top:0;border-radius:0 0 var(--radius) var(--radius);background:white;padding:10px 13px;display:flex;align-items:center;gap:8px;font-size:.73rem;color:var(--muted)}.pager .right{margin-left:auto}.pagebtn{width:31px;height:29px;border:1px solid var(--line);border-radius:6px;background:white}.pagebtn:hover:not(:disabled){border-color:#99a8bb}\n.bulkbar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:40;background:var(--navy);color:white;border-radius:11px;padding:10px 12px;box-shadow:0 14px 35px rgba(3,19,49,.28);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 30px);overflow:auto}.bulk-count{padding:0 9px;font-size:.78rem;white-space:nowrap}.bulkbar .btn{background:#143664;border-color:#3f5f89;color:#fff}.bulkbar .btn:hover{background:#1d467f}.bulkbar .btn.export{background:white;color:var(--navy);border-color:white}.bulkbar .btn.danger{color:#ffd4d1}.bulkbar .field{background:#0f2c57;color:white;border-color:#3e5c85;width:auto;padding:7px}.bulkbar input[type=date]{color-scheme:dark}\n.drawer-backdrop{position:fixed;inset:0;background:rgba(4,18,42,.28);z-index:49;opacity:0;pointer-events:none;transition:.2s}.drawer-backdrop.open{opacity:1;pointer-events:auto}.drawer{position:fixed;right:0;top:0;height:100vh;width:min(590px,100vw);background:white;z-index:50;box-shadow:-15px 0 40px rgba(4,22,52,.2);transform:translateX(103%);transition:.24s ease;display:flex;flex-direction:column}.drawer.open{transform:none}.drawer-head{padding:18px 20px 15px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:10px}.drawer-title{min-width:0}.drawer-title h2{font-size:1.18rem;margin:0 0 4px}.drawer-title p{margin:0;color:var(--muted);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.drawer-head .close{margin-left:auto}.drawer-body{padding:16px 20px 34px;overflow:auto}.drawer-score-grid{display:grid;grid-template-columns:1.15fr repeat(3,1fr);gap:8px;margin-bottom:15px}.score-card{border:1px solid var(--line);border-radius:9px;padding:10px}.score-card b{font-size:1.05rem}.score-card small{display:block;color:var(--muted);font-size:.62rem;margin-top:3px}.score-card.main{background:var(--navy);color:white;border-color:var(--navy)}.score-card.main small{color:#b8c8dc}.section{border-top:1px solid var(--line);padding-top:15px;margin-top:15px}.section-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}.section-head h3{font-size:.8rem;text-transform:uppercase;letter-spacing:.07em;margin:0}.section-head span{margin-left:auto;color:var(--muted);font-size:.68rem}.facts{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fact{background:#f8f9fb;border-radius:7px;padding:9px}.fact label{display:block;color:var(--muted);font-size:.61rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}.fact div{font-size:.77rem;line-height:1.35;word-break:break-word}.score-component{margin-bottom:11px}.component-top{display:flex;gap:8px;font-size:.72rem;margin-bottom:5px}.component-top b{font-weight:600}.component-top span{margin-left:auto;color:var(--muted)}.bar{height:6px;background:#e7ebef;border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;background:var(--blue);border-radius:5px}.component-reason{font-size:.68rem;color:var(--muted);line-height:1.4;margin-top:4px}.signal-list,.evidence-list{display:flex;flex-direction:column;gap:8px}.activity,.evidence-item{border:1px solid var(--line);border-radius:8px;padding:10px}.activity-top,.evidence-top{display:flex;gap:7px;align-items:center}.activity-top b,.evidence-top b{font-size:.73rem}.activity-top time,.evidence-top span{margin-left:auto;font-size:.64rem;color:var(--muted)}.activity p,.evidence-item p{margin:6px 0 0;font-size:.7rem;color:#46556a;line-height:1.45}.evidence-meta{font-size:.64rem;color:var(--muted);margin-top:6px;display:flex;gap:8px}.evidence-meta a{color:var(--blue);margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}.drawer-form-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.source-chips{display:flex;gap:5px;flex-wrap:wrap}.source-chip{background:#edf2f8;color:#405b7f;font-size:.64rem;border-radius:12px;padding:4px 7px}\n.identity-review{border:1px solid #e7beb9;border-radius:9px;padding:11px;background:#fff9f8}.identity-conflicts{margin:7px 0 10px;padding-left:18px;font-size:.7rem;line-height:1.45}.identity-help{font-size:.68rem;color:#70423e;line-height:1.45;margin:6px 0 10px}\n.match-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin:11px 0}.match-summary span{border:1px solid var(--line);border-radius:7px;padding:8px;background:#fafbfc;color:var(--muted);font-size:.65rem}.match-summary b{display:block;color:var(--ink);font-size:.95rem;margin-bottom:1px}.match-summary .matched b{color:var(--green)}.match-summary .scope b{color:var(--amber)}.match-summary .unmatched b{color:var(--red)}\n.zoom-status{margin-top:5px}.badge.zi-matched{background:var(--green-bg);color:var(--green)}.badge.zi-scope{background:var(--amber-bg);color:var(--amber)}.badge.zi-unmatched{background:var(--red-bg);color:var(--red)}.badge.zi-pending{background:#eef1f4;color:#536174}\ndialog{border:0;border-radius:13px;padding:0;box-shadow:var(--shadow);width:min(570px,calc(100vw - 28px));max-height:calc(100vh - 40px);color:var(--ink)}dialog::backdrop{background:rgba(4,18,42,.48)}.modal-head{padding:17px 19px 13px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:10px}.modal-head h2{font-size:1.05rem;margin:0}.modal-head p{font-size:.72rem;color:var(--muted);margin:4px 0 0;line-height:1.4}.modal-head button{margin-left:auto}.modal-body{padding:16px 19px;overflow:auto;max-height:calc(100vh - 175px)}.modal-foot{padding:12px 19px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;background:#fafbfc}.tag-input{font-size:.7rem;color:var(--muted);line-height:1.4;margin-top:4px}.source-options{display:grid;grid-template-columns:1fr 1fr;gap:7px}.source-option{display:flex;gap:8px;align-items:start;border:1px solid var(--line);border-radius:8px;padding:9px;font-size:.75rem}.source-option input{margin-top:2px;accent-color:var(--blue)}.source-option small{display:block;color:var(--muted);font-size:.65rem;line-height:1.35;margin-top:2px}.dropzone{border:1.5px dashed #9eacbf;border-radius:10px;padding:25px;text-align:center;color:var(--muted);transition:.15s}.dropzone.drag{background:var(--blue2);border-color:var(--blue)}.dropzone b{display:block;color:var(--ink);font-size:.85rem;margin-bottom:5px}.dropzone small{font-size:.69rem;line-height:1.45}.file-name{margin-top:10px;color:var(--blue);font-size:.74rem}.format-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.tab{border:1px solid var(--line);background:white;border-radius:7px;padding:7px 10px;font-size:.74rem}.tab.on{background:var(--blue2);border-color:var(--blue);color:var(--blue)}.danger-callout{background:var(--red-bg);color:#72332e;border-radius:8px;padding:10px;font-size:.74rem;line-height:1.45}.toast-stack{position:fixed;right:18px;bottom:18px;z-index:80;display:flex;flex-direction:column;gap:8px}.toast{width:min(355px,calc(100vw - 36px));background:var(--navy);color:#fff;border-radius:9px;box-shadow:var(--shadow);padding:11px 13px;font-size:.76rem;display:flex;align-items:flex-start;gap:9px;animation:toastin .2s}.toast.error{background:#7e2924}.toast.success{background:#0e6144}.toast button{margin-left:auto;border:0;background:none;color:white}@keyframes toastin{from{transform:translateY(8px);opacity:0}}\n.drawer{visibility:hidden;transition:transform .24s ease,visibility 0s linear .24s}.drawer.open{visibility:visible;transition:transform .24s ease}.toast.warning{background:#7b5714}\n@media(max-width:1180px){.metrics{grid-template-columns:repeat(3,1fr)}.workgrid{grid-template-columns:270px minmax(0,1fr)}.page-title,.crumb{display:none}}\n@media(max-width:860px){.shell{padding:18px 14px 90px}.topbar{padding:0 14px}.workgrid{display:block}.rail{position:static;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr}.rail .panel:first-child{grid-column:1/-1}.metrics{grid-template-columns:repeat(2,1fr)}.hero{display:block}.hero-actions{margin-top:12px;justify-content:flex-start}.table-shell{max-height:none}.auth-pill{display:none}.drawer-score-grid{grid-template-columns:1fr 1fr}.facts{grid-template-columns:1fr}.bulkbar{left:10px;right:10px;transform:none}.top-btn.hide-mobile{display:none}}\n@media(max-width:560px){.brandcopy small,.page-title{display:none}.topbar{gap:8px}.top-actions{gap:5px}.top-btn{padding:8px}.metrics{grid-template-columns:1fr 1fr}.metric{min-height:78px;padding:11px}.metric-value{font-size:1.3rem}.rail{display:block}.rail .panel{margin-bottom:10px}.filter-row select{flex:1}.drawer-body{padding:14px}.drawer-head{padding:15px}.drawer-score-grid{grid-template-columns:1fr 1fr}.source-options{grid-template-columns:1fr}.split{grid-template-columns:1fr}.bulkbar{bottom:8px;flex-wrap:wrap;max-height:calc(100vh - 16px);overflow:auto}.bulkbar .bulk-count{flex:1 0 calc(100% - 52px)}.bulkbar select.bulk-optional,.bulkbar input.bulk-optional{display:block;flex:1 1 145px;min-width:0;width:auto}.bulkbar button.bulk-optional{display:inline-flex}}\n.source-discovery-box{border:1px solid #b9c9e0;background:#f6f9ff;border-radius:9px;padding:11px;margin-bottom:12px}.source-discovery-head{display:flex;align-items:center;gap:10px}.source-discovery-head div{min-width:0;flex:1}.source-discovery-head b{display:block;font-size:.78rem}.source-discovery-head small{display:block;color:var(--muted);font-size:.66rem;line-height:1.35;margin-top:2px}.source-plan{display:grid;gap:6px;margin-top:9px}.source-plan-item{display:grid;grid-template-columns:1fr auto;gap:3px 9px;border-top:1px solid #dfe7f2;padding-top:7px;font-size:.68rem}.source-plan-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-plan-item span{color:var(--blue)}.source-plan-item small{grid-column:1/-1;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n:root{font-size:18px}.label,.metric-label,th,.fact label,.section-head h3{font-size:14px;text-transform:none;letter-spacing:0}.provider small,.tag-input,.rail-empty,.source-option small,.modal-head p,.field,.btn,.campaign-meta,.evidence-item p,.activity p{font-size:14px}.hero p{font-size:16px}.metric-action{width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer}.metric-action:hover{border-color:#9baac0;box-shadow:0 4px 14px rgba(7,29,68,.08)}.quality-panel{display:flex;align-items:center;gap:14px;background:#fff9f8;border:1px solid #e7beb9;border-radius:var(--radius);padding:13px 15px;margin-bottom:10px}.quality-panel b{display:block;font-size:.88rem}.quality-panel p{margin:3px 0 0;color:#70423e;font-size:.73rem;line-height:1.4}.quality-panel .right{margin-left:auto;display:flex;gap:8px}@media(max-width:700px){.quality-panel{align-items:flex-start;flex-direction:column}.quality-panel .right{margin-left:0;flex-wrap:wrap}}</style>\n</head>\n<body>\n<header class=\"topbar\">\n  <a class=\"brand\" href=\"/\" aria-label=\"ProspectPilot command center\"><span class=\"brandmark\">LQ</span><span class=\"brandcopy\"><b>ProspectPilot</b><small>Find and manage leads</small></span></a>\n  <span class=\"crumb\" aria-hidden=\"true\"></span><span class=\"page-title\">Prospect Discovery</span>\n  <nav class=\"top-actions\" aria-label=\"Page actions\">\n    <a class=\"top-btn hide-mobile\" href=\"/\">Command center</a>\n    <button class=\"top-btn\" id=\"btnImport\">Import</button>\n    <button class=\"top-btn primary\" id=\"btnCampaign\">New campaign</button>\n    <span class=\"auth-pill\" id=\"authPill\"><span class=\"avatar\" id=\"avatar\">··</span><span id=\"authName\">Checking session…</span></span>\n  </nav>\n</header>\n<div class=\"auth-warning\" id=\"authWarning\" hidden><span>●</span><span>Sign in to access your team’s leads and discovery jobs. <span id=\"authLinks\"></span></span></div>\n\n<main class=\"shell\"><p><a href=\"/research\">Research sources · build a sourced profile</a></p>\n  <section class=\"hero\">\n    <div><h1>Find the people you want to call.</h1><p>This is where candidate sourcing starts. Search targeted company websites by area, industry, employer, and job title. After candidates are found, optional providers can fill missing contact details.</p></div>\n    <div class=\"hero-actions\"><button class=\"btn\" id=\"btnRefresh\"><i class=\"ico\">↻</i> Refresh</button><button class=\"btn primary\" id=\"btnHeroCampaign\"><i class=\"ico\">＋</i> Create a lead search</button></div>\n  </section>\n\n  <section class=\"metrics\" aria-label=\"Discovery metrics\">\n    <article class=\"metric\"><div class=\"metric-label\">Accessible leads</div><div class=\"metric-value\" id=\"mLeads\">—</div><div class=\"metric-note\" id=\"mLeadsNote\">Owned and shared with you</div></article>\n    <article class=\"metric priority\"><div class=\"metric-label\">High priority</div><div class=\"metric-value\" id=\"mPriority\">—</div><div class=\"metric-note\" id=\"mPriorityNote\">Top 20% of qualified opportunities</div></article>\n    <article class=\"metric signal\"><div class=\"metric-label\">Recent updates</div><div class=\"metric-value\" id=\"mSignals\">—</div><div class=\"metric-note\" id=\"mSignalsNote\">Activity in the last 90 days</div></article>\n    <article class=\"metric follow\"><div class=\"metric-label\">Follow-ups due</div><div class=\"metric-value\" id=\"mDue\">—</div><div class=\"metric-note\" id=\"mDueNote\">Today and overdue</div></article>\n    <button class=\"metric metric-action review\" id=\"openReview\" type=\"button\"><div class=\"metric-label\">Identity review</div><div class=\"metric-value\" id=\"mReview\">—</div><div class=\"metric-note\" id=\"mReviewNote\">Open the review workspace</div></button>\n    <article class=\"metric selected\"><div class=\"metric-label\">Selected</div><div class=\"metric-value\" id=\"mSelected\">0</div><div class=\"metric-note\">Choose what to do next</div></article>\n  </section>\n\n  <div class=\"workgrid\">\n    <aside class=\"rail\" aria-label=\"Campaigns and providers\">\n      <section class=\"panel\">\n        <div class=\"panel-head\"><h2>Campaigns</h2><small id=\"campaignCount\">0</small><button class=\"btn small icon\" id=\"btnRailCampaign\" aria-label=\"New campaign\">＋</button></div>\n        <div class=\"panel-body\" id=\"campaignList\"><div class=\"rail-empty\">Create a campaign to discover targeted candidates from structured data and the open web.</div></div>\n        <div class=\"progress-card\" id=\"jobCard\" hidden>\n          <div class=\"progress-head\"><b id=\"jobPhase\">Queued</b><span id=\"jobStatus\">queued</span></div>\n          <div class=\"progress-track\"><div class=\"progress-fill\" id=\"jobProgress\"></div></div>\n          <div class=\"progress-stats\"><div class=\"progress-stat\"><b id=\"jCompanies\">0</b><small>Businesses</small></div><div class=\"progress-stat\"><b id=\"jFound\">0</b><small>People</small></div><div class=\"progress-stat\"><b id=\"jSaved\">0</b><small>Saved</small></div><div class=\"progress-stat\"><b id=\"jDupes\">0</b><small>Merged</small></div></div>\n          <div class=\"job-message\" id=\"jobMessage\"></div>\n        </div>\n      </section>\n      <section class=\"panel\">\n        <div class=\"panel-head\"><h2>Lead sources</h2><small id=\"providerSummary\">Checking…</small></div>\n        <div class=\"panel-body\"><div class=\"provider-list\" id=\"providerList\"><div class=\"rail-empty\">Loading source status…</div></div></div>\n      </section>\n      <section class=\"panel\">\n        <div class=\"panel-head\"><h2>Bring your own data</h2></div>\n        <div class=\"panel-body\"><p class=\"rail-empty\">Add a lead file from ZoomInfo, WealthFeed, or LinkedIn. Existing details are kept when records are combined.</p><div class=\"match-summary\" aria-label=\"ZoomInfo match status\"><span class=\"matched\"><b id=\"ziMatched\">—</b>Person match</span><span class=\"scope\"><b id=\"ziScope\">—</b>Out of scope</span><span class=\"unmatched\"><b id=\"ziNoMatch\">—</b>No match</span><span><b id=\"ziPending\">—</b>Not submitted</span></div><button class=\"btn\" id=\"btnRailImport\" style=\"width:100%\">Import file</button></div>\n      </section>\n    </aside>\n\n    <section class=\"main-panel\" aria-label=\"Leads\">\n      <div class=\"quality-panel\" id=\"qualityPanel\" hidden><div><b>Identity review workspace</b><p>Check the lowest-confidence records first. Correct and approve real people, or exclude bad records. Excluded records remain recoverable.</p></div><div class=\"right\"><button class=\"btn\" id=\"showExcluded\" type=\"button\">View excluded (<span id=\"mExcluded\">0</span>)</button><button class=\"btn primary\" id=\"openFirstReview\" type=\"button\">Open first record</button></div></div>\n      <div class=\"main-top\">\n        <div class=\"filter-row\">\n          <label class=\"searchbox\"><span class=\"sr\">Search leads</span><input class=\"field\" id=\"search\" type=\"search\" placeholder=\"Search name, company, title, location…\" autocomplete=\"off\"></label>\n          <select class=\"field\" id=\"tierFilter\" aria-label=\"Qualification tier\"><option value=\"\">All tiers</option><option value=\"A\">Tier A</option><option value=\"B\">Tier B</option><option value=\"C\">Tier C</option><option value=\"Watch\">Watch</option></select>\n          <select class=\"field\" id=\"statusFilter\" aria-label=\"Follow-up status\"><option value=\"\">All follow-ups</option><option>New</option><option>Researching</option><option>Ready to Contact</option><option>Contacted</option><option>Follow-up</option><option>Meeting Set</option><option>Nurture</option><option>Not a Fit</option></select>\n          <select class=\"field\" id=\"ownershipFilter\" aria-label=\"Ownership\"><option value=\"\">Owned + shared</option><option value=\"mine\">Owned by me</option><option value=\"shared\">Shared with me</option></select>\n          <select class=\"field\" id=\"zoominfoFilter\" aria-label=\"ZoomInfo match status\"><option value=\"\">All ZoomInfo states</option><option value=\"person_match\">Person match</option><option value=\"out_of_scope\">Out of scope</option><option value=\"no_match\">No match</option><option value=\"not_submitted\">Not submitted</option></select>\n          <button class=\"filter-toggle\" id=\"priorityFilter\" aria-pressed=\"false\">High priority</button>\n          <button class=\"filter-toggle\" id=\"reviewFilter\" aria-pressed=\"false\">Needs review</button>\n          <button class=\"filter-toggle\" id=\"excludedFilter\" aria-pressed=\"false\">Excluded</button>\n        </div>\n        <div class=\"result-row\"><span><strong id=\"resultCount\">0</strong> leads</span><span id=\"filterChips\"></span><span class=\"right\"><button class=\"linkbtn\" id=\"clearFilters\" hidden>Clear filters</button><label>Rows <select class=\"field\" id=\"pageSize\" style=\"padding:5px 7px\"><option>25</option><option selected>50</option><option>100</option></select></label></span></div>\n      </div>\n      <div class=\"table-shell\" id=\"tableShell\">\n        <table id=\"leadTable\">\n          <thead><tr><th class=\"checkcell\"><input type=\"checkbox\" id=\"selectAll\" aria-label=\"Select all visible leads\"></th><th class=\"sort\" data-sort=\"last_name\"><button class=\"sort-btn\" type=\"button\">Prospect</button></th><th class=\"sort\" data-sort=\"company\"><button class=\"sort-btn\" type=\"button\">Current role</button></th><th class=\"sort\" data-sort=\"score\"><button class=\"sort-btn\" type=\"button\">Qualification</button></th><th class=\"sort\" data-sort=\"priority_score\"><button class=\"sort-btn\" type=\"button\">Opportunity</button></th><th class=\"sort\" data-sort=\"confidence\"><button class=\"sort-btn\" type=\"button\">Evidence coverage</button></th><th>Latest signal</th><th class=\"sort\" data-sort=\"follow_up_date\"><button class=\"sort-btn\" type=\"button\">Follow-up</button></th><th>Owner</th></tr></thead>\n          <tbody id=\"leadRows\"></tbody>\n        </table>\n        <div class=\"empty-state\" id=\"emptyState\" hidden><div><div class=\"empty-icon\">⌕</div><h3>No leads found</h3><p id=\"emptyCopy\">Create a discovery campaign or import a file to start building your evidence-backed list.</p><button class=\"btn primary\" id=\"btnEmptyCampaign\">Create a lead search</button></div></div>\n      </div>\n      <div class=\"pager\"><span id=\"pageLabel\">Page 1</span><span class=\"right\"><button class=\"pagebtn\" id=\"prevPage\" aria-label=\"Previous page\">‹</button><button class=\"pagebtn\" id=\"nextPage\" aria-label=\"Next page\">›</button></span></div>\n    </section>\n  </div>\n</main>\n\n<div class=\"bulkbar\" id=\"bulkbar\" hidden>\n  <span class=\"bulk-count\"><b id=\"bulkCount\">0</b> selected</span>\n  <select class=\"field bulk-optional\" id=\"bulkStatus\" aria-label=\"Set follow-up status\"><option value=\"\">Set status…</option><option>New</option><option>Researching</option><option>Ready to Contact</option><option>Contacted</option><option>Follow-up</option><option>Meeting Set</option><option>Nurture</option><option>Not a Fit</option></select>\n  <input class=\"field bulk-optional\" id=\"bulkDate\" type=\"date\" aria-label=\"Follow-up date\">\n  <button class=\"btn bulk-optional\" id=\"btnBulkUpdate\">Update</button>\n  <button class=\"btn\" id=\"btnShare\">Share</button>\n  <button class=\"btn admin-only\" id=\"btnAssign\" hidden>Assign</button>\n  <button class=\"btn admin-only\" id=\"btnReclaim\" hidden>Reclaim</button>\n  <button class=\"btn danger admin-only\" id=\"btnDelete\" hidden>Delete</button>\n  <button class=\"btn export\" id=\"btnZoomInfoExport\">Download for ZoomInfo</button>\n  <button class=\"btn export\" id=\"btnExport\">Download for Salesforce</button>\n  <button class=\"btn icon\" id=\"btnClearSelection\" aria-label=\"Clear selection\">×</button>\n</div>\n\n<div class=\"drawer-backdrop\" id=\"drawerBackdrop\"></div>\n<aside class=\"drawer\" id=\"drawer\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"dName\" aria-hidden=\"true\" inert>\n  <header class=\"drawer-head\"><div class=\"drawer-title\"><h2 id=\"dName\">Lead</h2><p id=\"dRole\">—</p></div><button class=\"btn icon close\" id=\"closeDrawer\" aria-label=\"Close lead details\">×</button></header>\n  <div class=\"drawer-body\" id=\"drawerBody\"></div>\n</aside>\n\n<datalist id=\"businessTypes\"><option value=\"Construction companies\"><option value=\"Electrical contractors\"><option value=\"Plumbing contractors\"><option value=\"Law firms\"><option value=\"Medical practices\"><option value=\"Accounting firms\"></datalist><dialog id=\"campaignModal\">\n  <form id=\"campaignForm\">\n    <div class=\"modal-head\"><div><h2 id=\"campaignModalTitle\">Create a lead search</h2><p id=\"campaignModalCopy\">Choose a market and the people you want. Website search will find businesses and rank their best public people pages.</p></div><button class=\"btn icon\" type=\"button\" data-close=\"campaignModal\" aria-label=\"Close\">×</button></div>\n    <div class=\"modal-body\">\n      <div class=\"field-row\"><label class=\"label\" for=\"campaignName\">Search name</label><input class=\"field\" id=\"campaignName\" name=\"name\" required maxlength=\"120\" placeholder=\"Melville electrical professionals · September\"></div>\n      <div class=\"field-row\"><label class=\"label\" for=\"campaignIndustries\">Business type or industry</label><input class=\"field\" id=\"campaignIndustries\" name=\"industries\" list=\"businessTypes\" placeholder=\"Construction companies, general contractors, commercial builders\"><div class=\"tag-input\">Use this when you do not know the company names. Website search first finds businesses in the selected market.</div></div>\n      <div class=\"field-row\"><label class=\"label\" for=\"campaignEmployers\">Company names <span style=\"text-transform:none;letter-spacing:0\">(optional)</span></label><textarea class=\"field\" id=\"campaignEmployers\" name=\"employers\" placeholder=\"Northrop Grumman, Canon, Altice\"></textarea><div class=\"tag-input\">Add company names when you have them. Market discovery works without this list.</div></div>\n      <div class=\"source-discovery-box\"><div class=\"source-discovery-head\"><div><b>Website search</b><small>Finds businesses within the selected radius, then resolves their websites and ranks team, staff, professional, leadership, biography, and newsroom pages.</small></div><button class=\"btn\" id=\"btnExportDiscovered\" type=\"button\" hidden>Export businesses</button><button class=\"btn\" id=\"btnDiscoverSources\" type=\"button\">Find businesses &amp; pages about people</button></div><div class=\"source-plan\" id=\"sourcePlan\" hidden></div><div class=\"tag-input\"><a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener noreferrer\">Market data © OpenStreetMap contributors</a></div></div>\n      <div class=\"field-row\"><label class=\"label\" for=\"campaignSeedUrls\">Public websites or company hints <span style=\"text-transform:none;letter-spacing:0\">(optional)</span></label><textarea class=\"field\" id=\"campaignSeedUrls\" name=\"seed_urls\" placeholder=\"Add an official company page, domain, or LinkedIn company URL. Website search resolves official pages about people.\"></textarea><div class=\"tag-input\" id=\"seedUrlHelp\">A LinkedIn company URL identifies the company but is not crawled. Website search finds official team, leadership, filing, and newsroom pages. Import a data file for LinkedIn-only profile or activity data.</div></div>\n      <div class=\"field-row\"><label class=\"label\" for=\"campaignTitles\">People to find: titles</label><textarea class=\"field\" id=\"campaignTitles\" name=\"titles\" placeholder=\"Project Manager, Estimator, Engineer, Attorney, Physician, Vice President\"></textarea><div class=\"tag-input\">These titles control both page selection and finding people. For market campaigns, blank uses a broad decision-maker search (owners, principals, managers, and industry-relevant professionals); for named employers, blank uses leadership.</div></div>\n      <div class=\"field-row\"><label class=\"label\" for=\"campaignLocations\">Radius center: ZIP code or location</label><input class=\"field\" id=\"campaignLocations\" name=\"locations\" placeholder=\"11747 or Melville, NY\"><div class=\"tag-input\">Enter one ZIP code, address, city, or named location. Businesses are filtered by actual distance from its map center.</div></div>\n      <div class=\"split\"><div class=\"field-row\"><label class=\"label\" for=\"campaignRadius\">Radius (miles)</label><input class=\"field\" id=\"campaignRadius\" name=\"radius_miles\" type=\"number\" min=\"1\" max=\"100\" value=\"25\"></div><div class=\"field-row\"><label class=\"label\" for=\"campaignMaxCompanies\">Maximum businesses</label><input class=\"field\" id=\"campaignMaxCompanies\" name=\"max_companies\" type=\"number\" min=\"1\" max=\"100\" value=\"20\"></div></div>\n      <div class=\"field-row\"><label class=\"label\" for=\"campaignKeywords\">Words to look for</label><input class=\"field\" id=\"campaignKeywords\" name=\"keywords\" placeholder=\"retirement, new role, business sale, acquisition\"><div class=\"tag-input\">Optional words to help describe the people you want. Availability depends on the source.</div></div>\n      <div class=\"split\"><div class=\"field-row\"><label class=\"label\" for=\"campaignSeniorities\">Job level</label><select class=\"field\" id=\"campaignSeniorities\" name=\"seniorities\"><option value=\"\">Any job level</option><option value=\"Owner / Partner\">Owner or partner</option><option value=\"C-suite\">Company leader</option><option value=\"Vice President\">Vice president</option><option value=\"Director\">Director</option><option value=\"Manager\">Manager</option></select><div class=\"tag-input\">Optional. Titles can target any role—even when it is not an executive.</div></div><div class=\"field-row\"><label class=\"label\" for=\"campaignMax\">Maximum leads</label><input class=\"field\" id=\"campaignMax\" name=\"max_leads\" type=\"number\" min=\"1\" max=\"500\" value=\"50\"></div></div>\n      <input type=\"hidden\" id=\"campaignSchedule\" name=\"schedule\" value=\"manual\">\n      <div class=\"field-row\"><label class=\"label\">Where to search</label><div class=\"source-options\" id=\"sourceOptions\"><label class=\"source-option\"><input type=\"checkbox\" name=\"sources\" value=\"public_web\" checked><span><b>Website search</b><small>Finds and ranks official people pages before extracting the requested roles.</small></span></label></div></div>\n      <input id=\"campaignEnrich\" name=\"enrich_web\" type=\"hidden\" value=\"true\">\n    </div>\n    <div class=\"modal-foot\"><button class=\"btn\" type=\"button\" data-close=\"campaignModal\">Cancel</button><button class=\"btn\" id=\"campaignSave\" type=\"submit\" name=\"intent\" value=\"save\">Save draft</button><button class=\"btn primary\" id=\"campaignRun\" type=\"submit\" name=\"intent\" value=\"run\">Create & run</button></div>\n  </form>\n</dialog>\n\n<dialog id=\"importModal\">\n  <form id=\"importForm\">\n    <div class=\"modal-head\"><div><h2>Add a lead file</h2><p>Bring ProspectPilot, LinkedIn and ZoomInfo data into one record per person.</p></div><button class=\"btn icon\" type=\"button\" data-close=\"importModal\" aria-label=\"Close\">×</button></div>\n    <div class=\"modal-body\">\n      <div class=\"format-tabs\" role=\"tablist\" aria-label=\"Import format\"><button class=\"tab on\" type=\"button\" role=\"tab\" aria-selected=\"true\" data-format=\"csv\">Lead file</button><button class=\"tab\" type=\"button\" role=\"tab\" aria-selected=\"false\" data-format=\"listmatch\">ZoomInfo ListMatch</button><button class=\"tab\" type=\"button\" role=\"tab\" aria-selected=\"false\" data-format=\"linkedin_csv\">LinkedIn Connections CSV</button><button class=\"tab\" type=\"button\" role=\"tab\" aria-selected=\"false\" data-format=\"linkedin\">LinkedIn scraper JSON</button></div>\n      <p><button class=\"btn\" type=\"button\" data-format=\"qualifier\" onclick=\"setImportFormat('qualifier')\">ProspectPilot CSV</button></p>\n      <input type=\"hidden\" id=\"importFormat\" value=\"csv\">\n      <label class=\"dropzone\" id=\"dropzone\" for=\"importFile\"><b id=\"dropTitle\">Drop a CSV here or choose a file</b><small id=\"dropCopy\">Add a lead file exported from your provider.</small><div class=\"file-name\" id=\"fileName\"></div></label>\n      <input class=\"sr\" id=\"importFile\" type=\"file\" accept=\".csv,text/csv\">\n      <p class=\"rail-empty\" id=\"importHelp\" style=\"margin-top:12px\">ZoomInfo fields take precedence when present; ownership, follow-up status, notes, and source history are preserved during the merge.</p>\n    </div>\n    <div class=\"modal-foot\"><button class=\"btn\" type=\"button\" data-close=\"importModal\">Cancel</button><button class=\"btn primary\" id=\"submitImport\" type=\"submit\" disabled>Import records</button></div>\n  </form>\n</dialog>\n\n<dialog id=\"emailModal\">\n  <form id=\"emailForm\"><div class=\"modal-head\"><div><h2 id=\"emailTitle\">Share selected leads</h2><p id=\"emailCopy\">The advisor will see these leads in their shared queue.</p></div><button class=\"btn icon\" type=\"button\" data-close=\"emailModal\" aria-label=\"Close\">×</button></div><div class=\"modal-body\"><label class=\"label\" for=\"advisorEmail\">Advisor email</label><input class=\"field\" id=\"advisorEmail\" type=\"email\" required placeholder=\"advisor@firm.com\"></div><div class=\"modal-foot\"><button class=\"btn\" type=\"button\" data-close=\"emailModal\">Cancel</button><button class=\"btn primary\" id=\"emailSubmit\" type=\"submit\">Share leads</button></div></form>\n</dialog>\n\n<dialog id=\"confirmModal\">\n  <form method=\"dialog\" id=\"confirmForm\"><div class=\"modal-head\"><div><h2 id=\"confirmTitle\">Confirm action</h2><p id=\"confirmCopy\"></p></div><button class=\"btn icon\" value=\"cancel\" aria-label=\"Close\">×</button></div><div class=\"modal-body\"><div class=\"danger-callout\" id=\"confirmWarning\"></div></div><div class=\"modal-foot\"><button class=\"btn\" value=\"cancel\">Cancel</button><button class=\"btn danger\" id=\"confirmAction\" value=\"confirm\">Confirm</button></div></form>\n</dialog>\n\n<div class=\"toast-stack\" id=\"toasts\" aria-live=\"polite\"></div>\n\n<script>\n'use strict';\nconst API='/api/v3/discovery';\nconst state={me:null,providers:[],campaigns:[],leads:[],total:0,metrics:{},metricsAvailable:false,selected:new Set(),page:1,pageSize:50,sort:'priority_score',order:'desc',activeCampaign:'',editingCampaign:'',sourcePlan:[],discoveredCompanies:[],marketDiscovery:{},sourceDiscoveryPending:false,runningCampaigns:new Set(),activeJob:null,jobTimer:null,drawerId:'',drawerTrigger:null,leadRequestSeq:0,listRequestSeq:0,jobListRequestSeq:0,emailAction:'share',loading:false};\nconst $=id=>document.getElementById(id);\nconst esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',\"'\":'&#39;','\"':'&quot;'}[c]));\nconst arr=v=>Array.isArray(v)?v:[];\nconst num=v=>Number.isFinite(Number(v))?Number(v):0;\nconst fmt=n=>num(n).toLocaleString();\nconst cap=v=>String(v||'').replace(/_/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());\nconst listValue=v=>String(v||'').split(/[\\n,;]+/).map(x=>x.trim()).filter(Boolean);\nconst locationListValue=v=>String(v||'').split(/[\\n;]+/).map(x=>x.trim()).filter(Boolean);\nconst broadMarketLocation=v=>/^(?:ny|new york|new york state|nj|new jersey|ct|connecticut|pa|pennsylvania|united states|usa|us)$/i.test(String(v||'').replace(/\\./g,'').trim());\nconst initials=name=>String(name||'?').split(/\\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();\nconst fullName=l=>[l.first_name,l.last_name].filter(Boolean).join(' ')||l.name||'Unnamed prospect';\nconst safeUrl=v=>{try{const u=new URL(String(v||''));return ['http:','https:'].includes(u.protocol)?u.href:''}catch(_){return ''}};\nconst dateLabel=v=>{if(!v)return 'No date';const d=new Date(v+'T12:00:00');return Number.isNaN(d.valueOf())?String(v):d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined})};\nconst dateTimeLabel=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.valueOf())?String(v):d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})};\nconst money=r=>{if(!r)return 'Unknown';if(typeof r==='string')return r;const lo=num(r.low),hi=num(r.high);const short=n=>n>=1e6?'$'+(n/1e6).toFixed(n%1e6?1:0)+'M':n>=1000?'$'+Math.round(n/1000)+'K':'$'+n.toLocaleString();if(!lo&&!hi)return 'Unknown';if(!lo)return 'Up to '+short(hi);if(!hi||lo===hi)return short(lo);return short(lo)+' – '+short(hi)};\nconst today=()=>new Date().toISOString().slice(0,10);\nfunction zoomInfoStatus(value){\n  const status=String(value||'not_submitted');\n  if(status==='person_match')return{label:'ZI matched',className:'zi-matched'};\n  if(status==='out_of_scope')return{label:'ZI out of scope',className:'zi-scope'};\n  if(status==='no_match')return{label:'ZI no match',className:'zi-unmatched'};\n  return{label:'Not sent to ZI',className:'zi-pending'};\n}\nfunction errorText(value){\n  if(Array.isArray(value))return value.map(errorText).filter(Boolean).join(' · ');\n  if(value&&typeof value==='object'){\n    const where=arr(value.loc).filter(x=>x!=='body').join('.');\n    const message=value.msg||value.message||value.detail||value.error;\n    if(message)return (where?where+': ':'')+errorText(message);\n    try{return JSON.stringify(value)}catch(_){return 'Unknown validation error'}\n  }\n  return String(value||'').trim();\n}\n\nasync function api(path,opts={}){\n  const options={credentials:'same-origin',...opts};\n  options.headers={Accept:'application/json',...(opts.headers||{})};\n  if(options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob) && typeof options.body!=='string'){\n    options.headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);\n  }\n  const r=await fetch((path.startsWith('/api/')?'':API)+path,options);\n  if(!r.ok){let detail='Request failed ('+r.status+')';try{const body=await r.json();detail=errorText(body.detail||body.error||body.message)||detail}catch(_){ }throw new Error(detail)}\n  if(r.status===204)return null;\n  const ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():r.blob();\n}\nfunction toast(message,type=''){\n  const el=document.createElement('div');el.className='toast '+type;el.innerHTML='<span>'+(type==='error'?'⚠':type==='warning'?'!':'✓')+'</span><span>'+esc(message)+'</span><button aria-label=\"Dismiss\">×</button>';\n  el.querySelector('button').onclick=()=>el.remove();$('toasts').appendChild(el);setTimeout(()=>el.remove(),5000);\n}\nfunction setBusy(btn,busy,label){if(!btn)return;if(busy){btn.dataset.label=btn.textContent;btn.textContent=label||'Working…';btn.disabled=true}else{btn.textContent=btn.dataset.label||btn.textContent;btn.disabled=false}}\nfunction openModal(id){const d=$(id);if(d&&!d.open)d.showModal()}\nfunction closeModal(id){const d=$(id);if(d?.open)d.close()}\n\nasync function loadMe(){\n  try{state.me=await api('/api/me');}catch(e){state.me={signed_in:false};}\n  const me=state.me||{};$('authWarning').hidden=!!me.signed_in;$('authName').textContent=me.signed_in?(me.name||me.email||'Signed in'):'Not signed in';$('avatar').textContent=initials(me.name||me.email);\n  const authLinks=[];const configured=me.providers||{};\n  if(configured.google)authLinks.push('<a href=\"/auth/google/login\">Google</a>');\n  if(configured.microsoft)authLinks.push('<a href=\"/auth/login\">Microsoft</a>');\n  $('authLinks').innerHTML=authLinks.length?'Continue with '+authLinks.join(' or '):'<a href=\"/\">Open the sign-in page</a>';\n  document.querySelectorAll('.admin-only').forEach(el=>el.hidden=!me.is_admin);\n}\nasync function loadProviders(){\n  try{const d=await api('/providers');state.providers=arr(d.providers||d);}catch(e){state.providers=[];toast('Provider status unavailable: '+e.message,'error')}\n  renderProviders();renderSourceOptions();\n}\nfunction renderProviders(){\n  const on=state.providers.filter(p=>p.configured).length;$('providerSummary').textContent=state.providers.length?on+' of '+state.providers.length+' ready':'Unavailable';\n  $('providerList').innerHTML=state.providers.length?state.providers.map(p=>'<div class=\"provider '+(p.configured?'on':'')+'\"><span class=\"dot\"></span><span><b>'+esc(p.label||p.name)+'</b><small>'+esc(p.description||'')+'</small></span><span class=\"provider-tag\">'+esc(p.configured?'ready':p.kind||'off')+'</span></div>').join(''):'<div class=\"rail-empty\">No provider status was returned. CSV and LinkedIn snapshot imports may still be available.</div>';\n}\nfunction renderSourceOptions(){\n  const ps=(state.providers.length?state.providers:[{name:'public_web',label:'Website search',configured:true,runnable:true,description:'Finds and ranks official team, staff, professional, leadership, biography, and newsroom pages.'}]).filter(p=>p.runnable);\n  $('sourceOptions').innerHTML=ps.map(p=>'<label class=\"source-option\"><input type=\"checkbox\" name=\"sources\" value=\"'+esc(p.name)+'\" '+(p.configured?'checked':'disabled')+'><span><b>'+esc(p.label||p.name)+'</b><small>'+esc(p.description||'')+'</small></span></label>').join('');\n}\nasync function loadCampaigns(){\n  try{const d=await api('/campaigns');state.campaigns=arr(d.campaigns||d);renderCampaigns()}catch(e){state.campaigns=[];renderCampaigns();toast('Campaigns unavailable: '+e.message,'error')}\n}\nfunction campaignIsStale(c){const stamp=Date.parse(c.updated_at||'');return c.status==='running'&&(!Number.isFinite(stamp)||Date.now()-stamp>=60*60*1000)}\nfunction campaignRunReady(c){return c?.run_ready!==false&&arr(c?.sources).includes('public_web')&&(arr(c?.seed_urls).length>0||c?.source_discovery_pending)}\nfunction renderCampaigns(){\n  $('campaignCount').textContent=state.campaigns.length;\n  $('campaignList').innerHTML=state.campaigns.length?state.campaigns.map(c=>{const running=c.status==='running',stale=campaignIsStale(c),ready=campaignRunReady(c),pending=!!c.source_discovery_pending,businesses=arr(c.discovered_companies).length,market=arr(c.industries).length>0,shownStatus=ready?(stale?'interrupted':c.status):'setup required',targetMode=pending?market?'Market discovery at run time':'Sources found at run time':c.auto_targeted?market?'Market + source discovery':'Website search':'Manual targets',peopleBusinesses=new Set(arr(c.source_plan).filter(source=>num(source.people_found)>0).map(source=>String(source.company||'').toLowerCase()).filter(Boolean)).size,sourceCopy=peopleBusinesses?fmt(peopleBusinesses)+' business'+(peopleBusinesses===1?'':'es')+' with named people':pending?market?'Ready to find businesses':'Ready to find sources':ready?'Public web intelligence':(c.run_blocker||'Target websites required'),marketScope=market&&arr(c.locations)[0]?arr(c.locations)[0]+' · '+(c.radius_miles||25)+' mi radius':'';return '<article class=\"campaign-card '+(state.activeCampaign===c.id?'active':'')+'\"><button type=\"button\" class=\"campaign-select\" data-campaign=\"'+esc(c.id)+'\" aria-pressed=\"'+(state.activeCampaign===c.id?'true':'false')+'\" aria-label=\"Filter leads by '+esc(c.name)+'\"><div class=\"campaign-top\"><b>'+esc(c.name)+'</b><span class=\"state '+esc(ready?c.status:'partial')+'\">'+esc(shownStatus)+'</span></div><div class=\"campaign-meta\">'+fmt(c.max_leads)+' max · '+esc(sourceCopy)+'</div>'+(marketScope?'<div class=\"campaign-meta\">'+esc(marketScope)+'</div>':'')+'<div class=\"campaign-meta\">'+(businesses?fmt(businesses)+' businesses · ':'')+(pending?'Discovery pending':fmt(arr(c.seed_urls).length)+' selected page'+(arr(c.seed_urls).length===1?'':'s'))+' · '+esc(targetMode)+'</div></button><div class=\"campaign-actions\"><button class=\"btn small '+(!running||stale?'primary':'')+'\" data-run=\"'+esc(c.id)+'\" '+(running&&!stale?'disabled':'')+'>'+(ready?(stale?'Resume':running?'Running…':pending?'Discover & run':'Run'):'Finish setup')+'</button>'+(businesses?'<button class=\"btn small\" data-export-companies=\"'+esc(c.id)+'\">Export businesses</button>':'')+'<button class=\"btn small\" data-edit=\"'+esc(c.id)+'\" '+(running?'disabled':'')+'>Edit</button><button class=\"btn small danger\" data-delete-campaign=\"'+esc(c.id)+'\" '+(running?'disabled':'')+'>Delete</button></div></article>'}).join(''):'<div class=\"rail-empty\">No campaigns yet. Define an industry and location, or add known employers.</div>';\n}\nasync function loadMetrics(){\n  try{const d=await api('/metrics');state.metrics=d.metrics||d;state.metricsAvailable=true;renderMetrics()}catch(_){state.metricsAvailable=false;renderMetrics(true)}\n}\nfunction renderMetrics(fallback=false){\n  const unavailable=fallback||!state.metricsAvailable,m=state.metrics||{};\n  $('mLeads').textContent=unavailable?fmt(state.total):fmt(m.total_leads??m.leads??state.total);$('mPriority').textContent=unavailable?'—':fmt(m.high_priority??m.priority??0);$('mSignals').textContent=unavailable?'—':fmt(m.timely_signals??m.signals??0);$('mDue').textContent=unavailable?'—':fmt(m.follow_ups_due??m.due??0);$('mReview').textContent=unavailable?'—':fmt(m.identity_review??m.review??0);$('mExcluded').textContent=unavailable?'—':fmt(m.identity_excluded??0);$('mSelected').textContent=fmt(state.selected.size);\n  $('mLeadsNote').textContent=unavailable?'Current filtered result from lead list':'Owned and shared with you';$('mPriorityNote').textContent=unavailable?'Team metric unavailable':'Top 20% with priority 55+';$('mSignalsNote').textContent=unavailable?'Team metric unavailable':'Strong recorded timing trigger';$('mDueNote').textContent=unavailable?'Team metric unavailable':'Today and overdue';$('mReviewNote').textContent=unavailable?'Team metric unavailable':'Missing or conflicting identity';\n  const zi=m.zoominfo||{};$('ziMatched').textContent=unavailable?'—':fmt(zi.person_match);$('ziScope').textContent=unavailable?'—':fmt(zi.out_of_scope);$('ziNoMatch').textContent=unavailable?'—':fmt(zi.no_match);$('ziPending').textContent=unavailable?'—':fmt(zi.not_submitted);\n}\nfunction queryParams(){\n  const p=new URLSearchParams({page:String(state.page),limit:String(state.pageSize),offset:String((state.page-1)*state.pageSize),sort:state.sort,order:state.order});\n  const fields={search:$('search').value.trim(),tier:$('tierFilter').value,status:$('statusFilter').value,ownership:$('ownershipFilter').value,zoominfo_status:$('zoominfoFilter').value,campaign_id:state.activeCampaign};Object.entries(fields).forEach(([k,v])=>{if(v)p.set(k,v)});if($('priorityFilter').classList.contains('on'))p.set('priority_band','high');if($('reviewFilter').classList.contains('on'))p.set('identity_status','review');if($('excludedFilter').classList.contains('on'))p.set('identity_status','excluded');return p.toString();\n}\nasync function loadLeads(){\n  const requestId=++state.listRequestSeq;state.loading=true;renderLoading();\n  try{\n    const d=await api('/leads?'+queryParams());if(requestId!==state.listRequestSeq)return;\n    const leads=arr(d.leads||d.items||d),total=num(d.total??leads.length),pages=Math.max(1,Math.ceil(total/state.pageSize));\n    if(state.page>pages){state.page=pages;return loadLeads()}\n    state.leads=leads;state.total=total;renderLeads();if(d.metrics){state.metrics=d.metrics;state.metricsAvailable=true;renderMetrics()}else if(!state.metricsAvailable)renderMetrics(true)\n  }\n  catch(e){if(requestId!==state.listRequestSeq)return;state.leads=[];state.total=0;renderLeads();toast('Leads unavailable: '+e.message,'error')}\n  finally{if(requestId===state.listRequestSeq)state.loading=false}\n}\nfunction renderLoading(){$('emptyState').hidden=true;$('leadTable').hidden=false;$('leadRows').innerHTML=Array.from({length:7},()=>'<tr class=\"skeleton\"><td class=\"checkcell\"><div class=\"sk\"></div></td>'+Array.from({length:8},()=>'<td><div class=\"sk\"></div></td>').join('')+'</tr>').join('')}\nfunction tierClass(t){const s=String(t||'').toLowerCase();return s.includes('qual')?'qualified':s.includes('prom')?'hot':'watch'}\nfunction leadSignal(l){const acts=arr(l.activity_signals).slice().sort((a,b)=>num(b.recency_score)-num(a.recency_score));if(acts[0])return{label:cap(acts[0].kind),title:acts[0].text};if(arr(l.signals)[0])return{label:cap(l.signals[0]),title:l.signals.join(', ')};return{label:'No signal',title:'No timing signal recorded'}}\nfunction renderLeads(){\n  const rows=$('leadRows'),empty=!state.leads.length;$('leadTable').hidden=empty;$('emptyState').hidden=!empty;$('emptyCopy').textContent=hasFilters()?($('priorityFilter').classList.contains('on')?'No leads in this view meet High Priority: an opportunity score of at least 55, ranked in the top 20%. Clear filters to review all candidates and their missing evidence.':'No leads match the current filters. Clear one or more filters and try again.'):'Create a discovery campaign or import a file to start building your evidence-backed list.';$('btnEmptyCampaign').textContent=hasFilters()?'Clear filters':'Create a lead search';\n  rows.innerHTML=state.leads.map(l=>{\n    const name=fullName(l),sig=leadSignal(l),checked=state.selected.has(l.id),due=l.follow_up_date&&l.follow_up_date<=today(),zi=zoomInfoStatus(l.zoominfo_match_status);\n    return '<tr data-id=\"'+esc(l.id)+'\" class=\"'+(checked?'selected':'')+'\"><td class=\"checkcell\"><input type=\"checkbox\" data-select=\"'+esc(l.id)+'\" aria-label=\"Select '+esc(name)+'\" '+(checked?'checked':'')+'></td><td class=\"person\"><button type=\"button\" class=\"person-open\" data-open=\"'+esc(l.id)+'\" aria-label=\"Open details for '+esc(name)+'\"><b>'+esc(name)+'</b><small>'+esc(l.location||[l.city,l.state].filter(Boolean).join(', ')||'Location unknown')+'</small></button></td><td class=\"role\"><b>'+esc(l.current_title||'Title unknown')+'</b><small>'+esc(l.company||'Company unknown')+'</small></td><td><div class=\"score\"><span class=\"score-ring\" style=\"--p:'+num(l.score)+';--c:'+(num(l.score)>=75?'var(--green)':num(l.score)>=55?'var(--amber)':'var(--blue)')+'\"><span>'+num(l.score)+'</span></span><span class=\"score-copy\"><b>'+esc(l.tier||'Watch')+'</b><small>of 100 fit</small></span></div></td><td><span class=\"priority-score\">'+num(l.priority_score)+'</span><div class=\"mini-scores\"><span>T '+num(l.timing_score)+'</span><span>R '+num(l.relationship_score)+'</span></div></td><td><div class=\"confidence\"><span>'+num(l.confidence)+'/100</span><span class=\"confbar\"><i style=\"width:'+num(l.confidence)+'%\"></i></span></div>'+(l.identity_status==='review'?'<span class=\"badge review\" style=\"margin-top:4px\">Review</span>':l.identity_status==='excluded'?'<span class=\"badge\" style=\"margin-top:4px\">Excluded</span>':'')+'<div class=\"zoom-status\"><span class=\"badge '+zi.className+'\">'+zi.label+'</span></div></td><td><span class=\"badge signal-chip '+(num(l.timing_score)>=65?'hot':'')+'\" title=\"'+esc(sig.title)+'\">'+esc(sig.label)+'</span></td><td><span class=\"'+(due?'due':'')+'\">'+esc(l.follow_up_status||'New')+'</span><small style=\"display:block;color:var(--muted);margin-top:3px\">'+esc(dateLabel(l.follow_up_date))+'</small></td><td class=\"ownership\"><b>'+esc(ownerLabel(l.owner_email))+'</b><small>'+esc(arr(l.shared_with).length?arr(l.shared_with).length+' shared':'Private')+'</small></td></tr>';\n  }).join('');\n  $('resultCount').textContent=fmt(state.total);const pages=Math.max(1,Math.ceil(state.total/state.pageSize));$('pageLabel').textContent='Page '+state.page+' of '+pages;$('prevPage').disabled=state.page<=1;$('nextPage').disabled=state.page>=pages;syncSelection();updateSortHeaders();\n}\nfunction ownerLabel(email){if(!email)return 'Unassigned';if(email===(state.me||{}).email)return 'You';return email}\nfunction hasFilters(){return !!($('search').value||$('tierFilter').value||$('statusFilter').value||$('ownershipFilter').value||$('zoominfoFilter').value||$('priorityFilter').classList.contains('on')||$('reviewFilter').classList.contains('on')||$('excludedFilter').classList.contains('on')||state.activeCampaign)}\nfunction renderFilterChips(){const names=[];if(state.activeCampaign){const c=state.campaigns.find(x=>x.id===state.activeCampaign);names.push('Campaign: '+(c?.name||state.activeCampaign))}if($('zoominfoFilter').value)names.push('ZoomInfo: '+zoomInfoStatus($('zoominfoFilter').value).label);if($('priorityFilter').classList.contains('on'))names.push('High priority');if($('reviewFilter').classList.contains('on'))names.push('Needs review');if($('excludedFilter').classList.contains('on'))names.push('Excluded');$('filterChips').innerHTML=names.map(n=>'<span class=\"active-filter\">'+esc(n)+'</span>').join('');$('clearFilters').hidden=!hasFilters();$('qualityPanel').hidden=!($('reviewFilter').classList.contains('on')||$('excludedFilter').classList.contains('on'))}\nfunction updateSortHeaders(){document.querySelectorAll('th.sort').forEach(th=>{const active=th.dataset.sort===state.sort;th.dataset.dir=active?state.order:'';th.setAttribute('aria-sort',active?(state.order==='asc'?'ascending':'descending'):'none')})}\nfunction syncSelection(){$('mSelected').textContent=fmt(state.selected.size);$('bulkCount').textContent=fmt(state.selected.size);$('bulkbar').hidden=!state.selected.size;const visible=state.leads.map(l=>l.id);$('selectAll').checked=!!visible.length&&visible.every(id=>state.selected.has(id));$('selectAll').indeterminate=visible.some(id=>state.selected.has(id))&&!$('selectAll').checked}\nfunction toggleSelection(id,on){on?state.selected.add(id):state.selected.delete(id);const tr=document.querySelector('tr[data-id=\"'+CSS.escape(id)+'\"]');tr?.classList.toggle('selected',on);syncSelection()}\n\nfunction campaignFormBody(){\n  const form=$('campaignForm');return{name:$('campaignName').value.trim(),employers:listValue($('campaignEmployers').value),industries:listValue($('campaignIndustries').value),seed_urls:listValue($('campaignSeedUrls').value),titles:listValue($('campaignTitles').value),locations:locationListValue($('campaignLocations').value),radius_miles:num($('campaignRadius').value)||25,seniorities:listValue($('campaignSeniorities').value),keywords:listValue($('campaignKeywords').value),sources:[...form.querySelectorAll('[name=sources]:checked')].map(x=>x.value),source_plan:state.sourcePlan,discovered_companies:state.discoveredCompanies,market_discovery:state.marketDiscovery,max_companies:num($('campaignMaxCompanies').value)||20,max_leads:num($('campaignMax').value)||50,enrich_web:true,auto_discover_sources:true,schedule:'manual'};\n}\nfunction renderSourcePlan(plan=state.sourcePlan,errors=[],companies=state.discoveredCompanies,market=state.marketDiscovery){\n  const box=$('sourcePlan');state.sourcePlan=arr(plan);state.discoveredCompanies=arr(companies);state.marketDiscovery=market||{};box.hidden=!state.sourcePlan.length&&!state.discoveredCompanies.length&&!arr(errors).length;\n  $('btnExportDiscovered').hidden=!state.discoveredCompanies.length;\n  const peopleCompanies=new Set(state.sourcePlan.filter(source=>num(source.people_found)>0).map(source=>String(source.company||'').toLowerCase()).filter(Boolean)),companyOnly=Math.max(0,state.discoveredCompanies.length-peopleCompanies.size);\n  const companySummary=state.discoveredCompanies.length?'<div class=\"source-plan-item\"><b>'+fmt(state.discoveredCompanies.length)+' businesses discovered</b><span>'+fmt(peopleCompanies.size)+' with named people</span><small>'+fmt(state.sourcePlan.length)+' selected public pages · '+fmt(companyOnly)+' company-only candidate'+(companyOnly===1?'':'s')+' ready for ZoomInfo export</small></div>':'';\n  const companyPreview=state.discoveredCompanies.slice(0,10).map(company=>'<div class=\"source-plan-item\"><b>'+esc(company.name)+'</b><span>'+(company.website?'Website ready':'Directory record')+'</span><small>'+esc([company.distance_miles!=null?company.distance_miles+' mi':null,company.location,company.website||company.phone].filter(Boolean).join(' · '))+'</small></div>').join('')+(state.discoveredCompanies.length>10?'<div class=\"source-plan-item\"><b>+'+(state.discoveredCompanies.length-10)+' additional businesses</b><span>Included in CSV</span><small>Export the full market list for ZoomInfo.</small></div>':'');\n  const warningRows=arr(errors).slice(0,6).map(error=>'<div class=\"source-plan-item\"><b>Source warning</b><span>Review</span><small>'+esc(error)+'</small></div>').join('')+(arr(errors).length>6?'<div class=\"source-plan-item\"><b>+'+(arr(errors).length-6)+' additional source warnings</b><span>Business list kept</span><small>Businesses without a verified people page remain in the ZoomInfo company export.</small></div>':'');\n  box.innerHTML=companySummary+companyPreview+state.sourcePlan.map(source=>'<div class=\"source-plan-item\"><b>'+esc(source.company||new URL(source.url).hostname)+'</b><span>'+esc(source.source_type||'Company website')+(num(source.people_found)?' · '+fmt(source.people_found)+' people':'')+'</span><small>'+esc(source.url)+'</small></div>').join('')+warningRows;\n}\nfunction csvValue(value){let output=String(value??'');if(/^[=+\\-@]/.test(output))output=\"'\"+output;return /[\",\\r\\n]/.test(output)?'\"'+output.replaceAll('\"','\"\"')+'\"':output}\nfunction downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}\nfunction previewCompanyCSV(){\n  const headers=['Company Name','Company Website','Company Domain','Phone','City','State','Country','Location','Distance (Miles)','Industry','Source URL','Discovery Method','Evidence coverage','Campaign Name','External ID'];\n  const campaignName=$('campaignName').value.trim(),rows=state.discoveredCompanies.map(company=>{const parts=String(company.location||'').split(',').map(x=>x.trim()).filter(Boolean),statePart=parts.find(x=>/^[A-Z]{2}$/.test(x))||'',city=parts.find(x=>x!==statePart)||'',domain=safeUrl(company.website)?new URL(company.website).hostname.replace(/^www\\./,''):'';return[company.name,company.website,domain,company.phone,city,statePart,statePart?'United States':'',company.location,company.distance_miles??'',arr(company.industries).join('; '),company.source_url,company.discovery_method,Math.round(num(company.confidence)*100),campaignName,'market:'+String(company.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')]});\n  const csv='\\uFEFF'+[headers,...rows].map(row=>row.map(csvValue).join(',')).join('\\r\\n');downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'zoominfo-companies-'+today()+'.csv');toast('ZoomInfo company CSV exported for '+rows.length+' discovered businesses.','success');\n}\nasync function discoverSources(){\n  const body=campaignFormBody(),button=$('btnDiscoverSources');\n  if(state.sourceDiscoveryPending){toast('Business discovery is already running. Wait for it to finish.','warning');return false}\n  if(!body.employers.length&&!body.seed_urls.length&&!body.industries.length){toast('Add a business type, known employer, or company website first.','error');$('campaignIndustries').focus();return false}\n  if(body.industries.length&&!body.locations.length){toast('Add a market location for industry-based discovery.','error');$('campaignLocations').focus();return false}\n  if(body.industries.length&&broadMarketLocation(body.locations[0])){toast('“'+body.locations[0]+'” is too broad for a starting location. Enter a ZIP code, address, city, county, or named location.','error');$('campaignLocations').focus();return false}\n  state.sourceDiscoveryPending=true;setBusy(button,true,'Discovering…');$('campaignSave').disabled=true;$('campaignRun').disabled=true;\n  try{const d=await api('/source-discovery',{method:'POST',body});$('campaignSeedUrls').value=arr(d.seed_urls).join('\\n');renderSourcePlan(d.source_plan,d.errors,d.discovered_companies,d.market_discovery);const businesses=arr(d.discovered_companies).length,pages=arr(d.seed_urls).length,peopleBusinesses=new Set(arr(d.source_plan).filter(source=>num(source.people_found)>0).map(source=>String(source.company||'').toLowerCase()).filter(Boolean)).size;toast(d.preserved_previous_results?'Refresh failed, so the last successful business list was preserved.':'Website search found '+businesses+' business'+(businesses===1?'':'es')+', verified '+pages+' page'+(pages===1?'':'s')+', and found named people at '+peopleBusinesses+' business'+(peopleBusinesses===1?'':'es')+'.',d.preserved_previous_results?'warning':arr(d.errors).length?'warning':'success');return true}\n  catch(e){toast('Website search could not finish: '+e.message+' Your existing results were preserved.','error');return false}\n  finally{state.sourceDiscoveryPending=false;setBusy(button,false);$('campaignSave').disabled=false;$('campaignRun').disabled=false}\n}\n\nfunction resetCampaignForm(campaign=null){\n  const form=$('campaignForm');form.reset();renderSourceOptions();state.editingCampaign=campaign?.id||'';renderSourcePlan(campaign?.source_plan||[],campaign?.source_discovery_errors||[],campaign?.discovered_companies||[],campaign?.market_discovery||{});$('campaignModalTitle').textContent=campaign?'Edit lead search':'Create a lead search';$('campaignModalCopy').textContent=campaign?'Refresh the radius, people criteria, and website list before the next run.':'Start with a business type, starting location, and the people you want to find.';$('campaignSave').textContent=campaign?'Save changes':'Save draft';$('campaignRun').hidden=false;$('campaignRun').textContent=campaign?'Save, discover & run':'Create, discover & run';\n  if(!campaign){$('campaignMax').value=500;$('campaignMaxCompanies').value=100;$('campaignRadius').value=25;$('campaignLocations').value='Suffolk County, NY';$('campaignTitles').value=state.callPreferences?.ideal_prospect||'';$('campaignSchedule').value='manual';return}\n  $('campaignName').value=campaign.name||'';$('campaignIndustries').value=arr(campaign.industries).join(', ');$('campaignEmployers').value=arr(campaign.employers).join('\\n');$('campaignSeedUrls').value=arr(campaign.seed_urls).join('\\n');$('campaignTitles').value=arr(campaign.titles).join('\\n');$('campaignLocations').value=arr(campaign.locations).join('; ');$('campaignRadius').value=campaign.radius_miles||25;$('campaignKeywords').value=arr(campaign.keywords).join(', ');const levels=arr(campaign.seniorities).join(', ');if(levels&&!Array.from($('campaignSeniorities').options).some(o=>o.value===levels))$('campaignSeniorities').add(new Option(levels,levels));$('campaignSeniorities').value=levels;$('campaignMaxCompanies').value=campaign.max_companies||20;$('campaignMax').value=campaign.max_leads||50;$('campaignSchedule').value='manual';const selected=new Set(arr(campaign.sources));form.querySelectorAll('[name=sources]').forEach(input=>input.checked=selected.has(input.value)||(!selected.has('public_web')&&input.value==='public_web'));\n}\nfunction openNewCampaign(){resetCampaignForm();openModal('campaignModal')}\nfunction openCampaignEditor(id){const campaign=state.campaigns.find(c=>c.id===id);if(!campaign)return;if(campaign.status==='running'){toast('A running campaign cannot be edited.','warning');return}resetCampaignForm(campaign);openModal('campaignModal')}\nasync function saveCampaign(run,submit){\n  const form=$('campaignForm'),editing=state.editingCampaign;run=!!run;submit=submit||form.querySelector(run?'button[value=\"run\"]':'#campaignSave');\n  let body=campaignFormBody();\n  if(state.sourceDiscoveryPending){toast('Wait for business discovery to finish before saving or running.','warning');return}\n  if(run&&body.industries.length&&!body.locations.length){toast('Add a market location for industry-based discovery.','error');$('campaignLocations').focus();return}\n  if(run&&body.industries.length&&broadMarketLocation(body.locations[0])){toast('“'+body.locations[0]+'” is too broad for a starting location. Enter a ZIP code, address, city, county, or named location.','error');$('campaignLocations').focus();return}\n  if(!body.sources.length){toast('Choose at least one configured discovery source.','error');return}\n  if(run&&body.industries.length&&body.locations.length&&!body.source_plan.length&&!body.discovered_companies.length){if(!await discoverSources())return;body=campaignFormBody()}\n  setBusy(submit,true,run?'Creating…':'Saving…');\n  try{const path=editing?'/campaigns/'+encodeURIComponent(editing):'/campaigns',d=await api(path,{method:editing?'PATCH':'POST',body}),c=d.campaign||d;if(!editing)state.activeCampaign=c.id;closeModal('campaignModal');resetCampaignForm();await loadCampaigns();renderFilterChips();if(run)await runCampaign(c.id);else{toast(editing?'Campaign updated.':'Campaign saved.','success');await loadLeads()}}\n  catch(e){toast(e.message,'error')}finally{setBusy(submit,false)}\n}\nfunction confirmDeleteCampaign(id){const campaign=state.campaigns.find(c=>c.id===id);if(!campaign)return;confirmAction({title:'Delete campaign?',copy:'Delete “'+campaign.name+'” and its saved discovery criteria.',warning:'The saved criteria and schedule are removed. Existing leads and past job records remain available for audit.',label:'Delete campaign',onConfirm:()=>deleteCampaign(id)})}\nasync function deleteCampaign(id){try{await api('/campaigns/'+encodeURIComponent(id),{method:'DELETE'});const wasActive=state.activeCampaign===id;if(wasActive){state.activeCampaign='';state.page=1}await Promise.all([loadCampaigns(),loadJobs(),wasActive?loadLeads():Promise.resolve()]);renderFilterChips();toast('Campaign deleted. Existing leads were kept.','success')}catch(e){toast('Could not delete campaign: '+e.message,'error')}}\nasync function runCampaign(id){\n  if(state.runningCampaigns.has(id)){toast('This campaign is already running.','warning');return}state.runningCampaigns.add(id);\n  const c=state.campaigns.find(x=>x.id===id);if(c)state.activeCampaign=id;renderCampaigns();renderFilterChips();const button=document.querySelector('[data-run=\"'+CSS.escape(id)+'\"]');setBusy(button,true,'Running…');\n  try{if(c&&arr(c.industries).length&&arr(c.locations).length&&num(c.market_discovery?.source_discovery_version)<5){toast('Refreshing this campaign’s business and website list before the crawl.','warning');const source=await api('/source-discovery',{method:'POST',body:c});await api('/campaigns/'+encodeURIComponent(id),{method:'PATCH',body:{seed_urls:source.seed_urls,source_plan:source.source_plan,discovered_companies:source.discovered_companies,market_discovery:source.market_discovery}})}const d=await api('/campaigns/'+encodeURIComponent(id)+'/run',{method:'POST'});state.activeJob=d.job||d;$('jobCard').hidden=false;renderJob(state.activeJob);if(['complete','partial','failed'].includes(state.activeJob.status)){await Promise.all([loadLeads(),loadMetrics(),loadCampaigns()]);toast(state.activeJob.message||'Discovery finished.',state.activeJob.status==='failed'?'error':state.activeJob.status==='partial'?'warning':'success')}else{toast('Discovery job started.','success');pollJob(state.activeJob.id||d.job_id)}}catch(e){toast('Could not run campaign: '+e.message,'error')}finally{state.runningCampaigns.delete(id);setBusy(button,false)}\n}\nasync function loadJobs(){\n  const requestId=++state.jobListRequestSeq,query=state.activeCampaign?'?campaign_id='+encodeURIComponent(state.activeCampaign):'';\n  try{const d=await api('/jobs'+query);if(requestId!==state.jobListRequestSeq)return;const jobs=arr(d.jobs||d).slice().sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''))),job=jobs[0];clearTimeout(state.jobTimer);state.activeJob=job||null;$('jobCard').hidden=!job;if(job){renderJob(job);if(['queued','running'].includes(job.status))pollJob(job.id)}}catch(e){if(requestId!==state.jobListRequestSeq)return;state.activeJob=null;$('jobCard').hidden=true;toast('Recent job status unavailable: '+e.message,'warning')}\n}\nfunction renderJob(j){if(!j)return;$('jobStatus').textContent=j.status||'running';$('jobStatus').className='state '+(j.status||'running');$('jobPhase').textContent=cap(j.phase||j.message||'Working');$('jCompanies').textContent=fmt(j.companies_discovered??j.source_results?.source_discovery?.companies_discovered);$('jFound').textContent=fmt(j.discovered);$('jSaved').textContent=fmt(j.saved);$('jDupes').textContent=fmt(j.duplicates);const errors=providerErrorText(j.provider_errors);$('jobMessage').textContent=[j.message,errors?'Provider errors: '+errors:''].filter(Boolean).join(' · ');const target=Math.max(1,num(j.discovered),num(j.saved)+num(j.duplicates));const pct=['complete','partial','failed'].includes(j.status)?100:Math.min(94,Math.max(5,Math.round((num(j.saved)+num(j.duplicates)+num(j.enriched)*.3)/target*70)));$('jobProgress').style.width=pct+'%'}\nfunction providerErrorText(errors){return Object.entries(errors||{}).map(([k,v])=>cap(k)+': '+errorText(v)).join(' · ')}\nfunction pollJob(id){clearTimeout(state.jobTimer);if(!id)return;const tick=async()=>{try{const d=await api('/jobs/'+encodeURIComponent(id));state.activeJob=d.job||d;renderJob(state.activeJob);if(['complete','partial','failed'].includes(state.activeJob.status)){await Promise.all([loadLeads(),loadMetrics(),loadCampaigns()]);toast(state.activeJob.status==='failed'?'Discovery failed. Review the provider errors.':'Discovery complete: '+fmt(state.activeJob.saved)+' leads saved.',state.activeJob.status==='failed'?'error':'success');return}}catch(e){toast('Job progress unavailable: '+e.message,'error');return}state.jobTimer=setTimeout(tick,1500)};tick()}\n\nasync function importFile(e){\n  e.preventDefault();const file=$('importFile').files[0];if(!file)return;const btn=$('submitImport'),format=$('importFormat').value;setBusy(btn,true,'Importing…');\n  const csvFormat=format==='qualifier'||format==='csv'||format==='listmatch'||format==='linkedin_csv',contentType=csvFormat?'text/csv':file.name.toLowerCase().endsWith('.ndjson')?'application/x-ndjson':'application/json';\n  const params=new URLSearchParams();if(format==='qualifier')params.set('provider','qualifier');if(state.activeCampaign)params.set('campaign_id',state.activeCampaign);if(format==='linkedin_csv')params.set('provider','linkedin');if(format==='listmatch')params.set('provider','zoominfo_listmatch');const query=params.toString()?'?'+params.toString():'';\n  try{const d=await api('/imports/'+(csvFormat?'csv':'linkedin')+query,{method:'POST',headers:{'Content-Type':contentType},body:file});closeModal('importModal');$('importForm').reset();setImportFormat('csv');await Promise.all([loadLeads(),loadMetrics(),loadCampaigns()]);const saved=d.saved??d.imported??d.count??0,summary=d.match_summary;const matchCopy=summary?' · '+fmt(summary.person_match)+' matched · '+fmt(summary.out_of_scope)+' out of scope · '+fmt(summary.no_match)+' no match':'';toast('Processed '+fmt(d.imported??saved)+' record'+((d.imported??saved)===1?'':'s')+(d.duplicates?' · '+d.duplicates+' merged':'')+matchCopy+'.','success')}\n  catch(err){toast('Import failed: '+err.message,'error')}finally{setBusy(btn,false);btn.disabled=!$('importFile').files[0]}\n}\nfunction setImportFormat(format){$('importFormat').value=format;document.querySelectorAll('.tab').forEach(x=>{const on=x.dataset.format===format;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on))});$('importFile').value='';$('fileName').textContent='';$('submitImport').disabled=true;if(format==='linkedin'){$('importFile').accept='.json,.ndjson,application/json,application/x-ndjson';$('dropTitle').textContent='Drop linkedin_scraper JSON or NDJSON here';$('dropCopy').textContent='Adds profile identity, current and previous roles, company tenure, total experience, education, contacts, and profile evidence.';$('importHelp').innerHTML='Run <a href=\"https://github.com/dst-boop/linkedin_scraper\" target=\"_blank\" rel=\"noopener noreferrer\">dst-boop/linkedin_scraper</a> locally with your authenticated LinkedIn session, then save each Person with <b>person.model_dump_json()</b>. Upload one JSON object, an array, or one object per NDJSON line. Your LinkedIn session stays on your computer.'}else{$('importFile').accept='.csv,text/csv';if(format==='qualifier'){$('dropTitle').textContent='Choose a ProspectPilot CSV';$('dropCopy').textContent='Import your combined lead list or Age 59½ pipeline export.';$('importHelp').textContent='Age basis, pipeline score, nurture dates and call-screening status stay with each person. Unknown ages and unscreened records stay out of new calls.'}else if(format==='listmatch'){$('dropTitle').textContent='Drop the ZoomInfo ListMatch preview CSV here';$('dropCopy').textContent='Every row is reconciled by External ID and labeled Person Match, Out of Scope, or No Match.';$('importHelp').textContent='The preview may contain duplicate column names. The importer preserves the original candidate fields, stores ZoomInfo Contact IDs, and does not treat No Match as an invalid lead.'}else if(format==='linkedin_csv'){$('dropTitle').textContent='Drop LinkedIn Connections.csv here';$('dropCopy').textContent='Imports names, profile URLs, employers, positions, emails when available, and connection dates.';$('importHelp').innerHTML='<a href=\"https://www.linkedin.com/help/linkedin/answer/a566336/export-connections-from-linkedin\" target=\"_blank\" rel=\"noopener noreferrer\">Request your LinkedIn data archive</a>, then upload <b>Connections.csv</b>. Each record is saved as a first-degree relationship and can be enriched later through ZoomInfo.'}else{$('dropTitle').textContent='Drop a lead or ZoomInfo Enhance CSV here';$('dropCopy').textContent='Add a lead file exported from your provider.';$('importHelp').textContent='ZoomInfo fields take precedence when present; ownership, follow-up status, notes, match history, and source history are preserved during the merge.'}}}\n\nasync function bulkAction(action,extra={}){\n  const ids=[...state.selected];if(!ids.length)return;\n  try{\n    const d=await api('/leads/bulk',{method:'PATCH',body:{lead_ids:ids,action,...extra}}),result=d?.result||d||{};\n    const updated=num(result.updated??result.affected??(d?.message?ids.length:0)),skipped=num(result.skipped),errors=result.errors&&typeof result.errors==='object'?result.errors:{};\n    const errorSummary=Object.entries(errors).slice(0,2).map(([id,message])=>id+': '+errorText(message)).join(' · ');\n    const message=d?.message||cap(action)+': '+updated+' updated'+(skipped?', '+skipped+' skipped':'')+(errorSummary?'. '+errorSummary:'')+'.';\n    toast(message,skipped?(updated?'warning':'error'):'success');\n    if(action==='delete'){\n      const removed=arr(result.lead_ids);if(removed.length)removed.forEach(id=>state.selected.delete(id));else if(!skipped)state.selected.clear();\n    }\n    await Promise.all([loadLeads(),loadMetrics()]);syncSelection();return result;\n  }\n  catch(e){toast(cap(action)+' failed: '+e.message,'error')}\n}\nasync function exportSelected(kind='salesforce'){\n  const ids=[...state.selected];if(!ids.length)return;const button=$(kind==='zoominfo'?'btnZoomInfoExport':'btnExport');setBusy(button,true,'Exporting…');\n  try{const blob=await api('/export/'+kind,{method:'POST',body:{lead_ids:ids}});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(kind==='zoominfo'?'zoominfo-candidates-':'salesforce-prospects-')+today()+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast((kind==='zoominfo'?'ZoomInfo candidate':'Salesforce')+' CSV exported for '+ids.length+' selected leads.','success')}\n  catch(e){toast('Export failed: '+e.message,'error')}finally{setBusy(button,false)}\n}\nasync function exportCampaignCompanies(id,button){\n  setBusy(button,true,'Exporting…');\n  try{const blob=await api('/campaigns/'+encodeURIComponent(id)+'/export-companies',{method:'POST'});downloadBlob(blob,'zoominfo-companies-'+today()+'.csv');const campaign=state.campaigns.find(c=>c.id===id);toast('ZoomInfo company CSV exported for '+fmt(arr(campaign?.discovered_companies).length)+' businesses.','success')}\n  catch(e){toast('Company export failed: '+e.message,'error')}finally{setBusy(button,false)}\n}\nfunction openEmailAction(action){state.emailAction=action;$('emailTitle').textContent=action==='assign'?'Assign selected leads':'Share selected leads';$('emailCopy').textContent=action==='assign'?'Ownership moves to this advisor. The previous owner loses access unless the lead is shared back.':'The advisor can review these leads while ownership stays unchanged.';$('emailSubmit').textContent=action==='assign'?'Assign leads':'Share leads';$('advisorEmail').value='';openModal('emailModal');setTimeout(()=>$('advisorEmail').focus(),50)}\nfunction confirmAction({title,copy,warning,label,onConfirm}){const dialog=$('confirmModal');dialog.returnValue='';$('confirmTitle').textContent=title;$('confirmCopy').textContent=copy;$('confirmWarning').textContent=warning;$('confirmAction').textContent=label;$('confirmForm').onsubmit=null;openModal('confirmModal');dialog.addEventListener('close',function once(){this.removeEventListener('close',once);const confirmed=this.returnValue==='confirm';this.returnValue='';if(confirmed)onConfirm()})}\n\nasync function openLead(id){\n  const requestId=++state.leadRequestSeq;state.drawerId=id;let l=state.leads.find(x=>x.id===id);$('dName').textContent=l?fullName(l):'Loading…';$('dRole').textContent=l?[l.current_title,l.company].filter(Boolean).join(' · '):'';$('drawerBody').innerHTML='<div class=\"empty-state\" role=\"status\"><div><div class=\"empty-icon\">⌕</div><h3>Loading person details…</h3></div></div>';openDrawer();\n  try{const d=await api('/leads/'+encodeURIComponent(id));if(requestId!==state.leadRequestSeq||state.drawerId!==id)return;l=d.lead||d;renderDrawer(l)}catch(e){if(requestId!==state.leadRequestSeq||state.drawerId!==id)return;if(l){renderDrawer(l);$('drawerBody').insertAdjacentHTML('afterbegin','<div class=\"danger-callout\" style=\"margin-bottom:12px\"><b>Full lead details could not be loaded.</b> '+esc(e.message)+'</div>')}else $('drawerBody').innerHTML='<div class=\"danger-callout\">'+esc(e.message)+'</div>'}\n}\nfunction openDrawer(){const drawer=$('drawer');if(!drawer.classList.contains('open'))state.drawerTrigger=document.activeElement;drawer.removeAttribute('inert');drawer.classList.add('open');$('drawerBackdrop').classList.add('open');drawer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';requestAnimationFrame(()=>$('closeDrawer').focus())}\nfunction closeDrawer(){const trigger=state.drawerTrigger,drawer=$('drawer');state.leadRequestSeq++;drawer.classList.remove('open');$('drawerBackdrop').classList.remove('open');drawer.setAttribute('aria-hidden','true');drawer.setAttribute('inert','');document.body.style.overflow='';state.drawerId='';state.drawerTrigger=null;if(trigger&&trigger.isConnected)trigger.focus()}\nfunction trapDrawerFocus(e){if(e.key!=='Tab'||!$('drawer').classList.contains('open'))return;const focusable=[...$('drawer').querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex=\"-1\"])')].filter(el=>el.offsetParent!==null);if(!focusable.length){e.preventDefault();return}const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}\nfunction identityReviewPanel(l){\n  if(!['review','excluded'].includes(l.identity_status))return'';const conflicts=arr(l.identity_conflicts),items=(conflicts.length?conflicts:['The record is incomplete or could not be matched safely.']).map(value=>'<li>'+esc(value)+'</li>').join('');\n  if(!(state.me||{}).is_admin)return '<section class=\"identity-review\" aria-labelledby=\"identityReviewTitle\"><b id=\"identityReviewTitle\">'+(l.identity_status==='excluded'?'Excluded record':'Identity review needed')+'</b><ul class=\"identity-conflicts\">'+items+'</ul><p class=\"identity-help\">An admin must check the source evidence and decide whether to approve or exclude this record.</p></section>';\n  return '<section class=\"identity-review\" aria-labelledby=\"identityReviewTitle\"><b id=\"identityReviewTitle\">Review and correct identity</b><ul class=\"identity-conflicts\">'+items+'</ul><p class=\"identity-help\">Compare the evidence with the source record. Approve a verified person, keep uncertain data in review, or exclude a bad record. Excluded records can be restored here later.</p><form id=\"dIdentityForm\"><div class=\"split\"><div class=\"field-row\"><label class=\"label\" for=\"dFirstName\">First name</label><input class=\"field\" id=\"dFirstName\" maxlength=\"100\" value=\"'+esc(l.first_name||'')+'\"></div><div class=\"field-row\"><label class=\"label\" for=\"dLastName\">Last name</label><input class=\"field\" id=\"dLastName\" maxlength=\"100\" value=\"'+esc(l.last_name||'')+'\"></div></div><div class=\"split\"><div class=\"field-row\"><label class=\"label\" for=\"dCurrentTitle\">Current title</label><input class=\"field\" id=\"dCurrentTitle\" maxlength=\"200\" value=\"'+esc(l.current_title||'')+'\"></div><div class=\"field-row\"><label class=\"label\" for=\"dCompany\">Company</label><input class=\"field\" id=\"dCompany\" maxlength=\"200\" value=\"'+esc(l.company||'')+'\"></div></div><div class=\"field-row\"><label class=\"label\" for=\"dLocation\">Location</label><input class=\"field\" id=\"dLocation\" maxlength=\"200\" value=\"'+esc(l.location||'')+'\"></div><div class=\"split\"><div class=\"field-row\"><label class=\"label\" for=\"dIdentityEmail\">Email</label><input class=\"field\" id=\"dIdentityEmail\" type=\"email\" maxlength=\"254\" value=\"'+esc(l.email||'')+'\"></div><div class=\"field-row\"><label class=\"label\" for=\"dLinkedInUrl\">LinkedIn URL</label><input class=\"field\" id=\"dLinkedInUrl\" type=\"url\" maxlength=\"500\" value=\"'+esc(l.linkedin_url||'')+'\"></div></div><div class=\"field-row\"><label class=\"label\" for=\"dIdentityStatus\">Review decision</label><select class=\"field\" id=\"dIdentityStatus\"><option value=\"review\" '+(l.identity_status==='review'?'selected':'')+'>Keep in review</option><option value=\"matched\">Approve verified person</option><option value=\"excluded\" '+(l.identity_status==='excluded'?'selected':'')+'>Exclude from active leads</option></select></div><div class=\"drawer-form-actions\"><button class=\"btn primary\" type=\"submit\">Save decision</button></div></form></section>';\n}\nfunction renderDrawer(l){\n  $('dName').textContent=fullName(l);$('dRole').textContent=[l.current_title,l.company,l.location].filter(Boolean).join(' · ');\n  const zi=zoomInfoStatus(l.zoominfo_match_status),ziProfile=safeUrl(l.zoominfo_profile_url);\n  const components=Object.entries(l.score_breakdown||{}).map(([name,c])=>'<div class=\"score-component\"><div class=\"component-top\"><b>'+esc(cap(name))+'</b><span>'+num(c.points)+' / '+num(c.maximum)+'</span></div><div class=\"bar\"><i style=\"width:'+Math.min(100,num(c.points)/Math.max(1,num(c.maximum))*100)+'%\"></i></div><div class=\"component-reason\">'+esc(c.reason||'No scoring explanation recorded.')+'</div></div>').join('')||'<p class=\"rail-empty\">No score breakdown recorded.</p>';\n  const activities=arr(l.activity_signals).length?arr(l.activity_signals).map(a=>{const url=safeUrl(a.source_url);return '<article class=\"activity\"><div class=\"activity-top\"><span class=\"badge '+(num(a.recency_score)>=65?'hot':'')+'\">'+esc(cap(a.kind))+'</span><b>'+esc(cap(a.activity_type))+'</b><time>'+esc(a.occurred_at||'Date unknown')+'</time></div><p>'+esc(a.text)+'</p>'+(url?'<div class=\"evidence-meta\"><span>Recency '+num(a.recency_score)+'</span><a href=\"'+esc(url)+'\" target=\"_blank\" rel=\"noopener\">Open activity ↗</a></div>':'')+'</article>'}).join(''):'<p class=\"rail-empty\">No dated updates are available for this person.</p>';\n  const evidence=arr(l.evidence).length?arr(l.evidence).map(e=>{const url=safeUrl(e.source_url);return '<article class=\"evidence-item\"><div class=\"evidence-top\"><b>'+esc(cap(e.field))+' · '+esc(e.value)+'</b><span>'+Math.round(num(e.confidence)*100)+'%</span></div><p>'+esc(e.snippet||'No excerpt recorded.')+'</p><div class=\"evidence-meta\"><span>'+esc(cap(e.kind))+'</span><span>'+esc(e.source||'Unknown source')+'</span>'+(url?'<a href=\"'+esc(url)+'\" target=\"_blank\" rel=\"noopener\">View source ↗</a>':'')+'</div></article>'}).join(''):'<p class=\"rail-empty\">No evidence entries recorded.</p>';\n  const sources=arr(l.source_names).map(x=>'<span class=\"source-chip\">'+esc(cap(x))+'</span>').join('');\n  $('drawerBody').innerHTML='<div class=\"drawer-score-grid\"><div class=\"score-card main\"><b>'+num(l.score)+'</b><small>'+esc(l.tier||'Watch')+' qualification</small></div><div class=\"score-card\"><b>'+num(l.priority_score)+'</b><small>Opportunity priority</small></div><div class=\"score-card\"><b>'+num(l.timing_score)+'</b><small>Timing</small></div><div class=\"score-card\"><b>'+num(l.relationship_score)+'</b><small>Relationship</small></div></div>'+\n  identityReviewPanel(l)+\n  '<section class=\"section\" style=\"border-top:0;margin-top:0;padding-top:0\"><div class=\"section-head\"><h3>Person details</h3><span>'+num(l.confidence)+'/100 evidence coverage</span></div><div class=\"facts\"><div class=\"fact\"><label>Estimated age</label><div>'+esc(l.estimated_age_range||'Unknown')+(l.graduation_year?' · Class of '+esc(l.graduation_year):'')+'</div></div><div class=\"fact\"><label>Income estimate</label><div>'+esc(money(l.estimated_income))+'</div></div><div class=\"fact\"><label>Investable assets</label><div>'+esc(money(l.estimated_assets))+'</div></div><div class=\"fact\"><label>Total experience</label><div>'+(l.years_of_experience!=null?esc(l.years_of_experience)+' years':'Unknown')+'</div></div><div class=\"fact\"><label>Years in this job</label><div>'+(l.years_in_current_role!=null?esc(l.years_in_current_role)+' years':l.role_start_year?'Since '+esc(l.role_start_year):'Unknown')+'</div></div><div class=\"fact\"><label>Years at this company</label><div>'+(l.years_at_company!=null?esc(l.years_at_company)+' years':l.company_start_year?'Since '+esc(l.company_start_year):'Unknown')+'</div></div><div class=\"fact\"><label>Former employers</label><div>'+esc(arr(l.former_employers).join(', ')||'None recorded')+'</div></div><div class=\"fact\"><label>Previous role</label><div>'+esc(l.previous_job_title||'None recorded')+'</div></div><div class=\"fact\"><label>Education</label><div>'+esc(l.education||'Unknown')+'</div></div><div class=\"fact\"><label>People you may know</label><div>'+esc(l.warm_path||(l.mutual_connections?l.mutual_connections+' mutual connections':'No path recorded'))+'</div></div><div class=\"fact\"><label>ZoomInfo match</label><div><span class=\"badge '+zi.className+'\">'+zi.label+'</span>'+(ziProfile?' · <a href=\"'+esc(ziProfile)+'\" target=\"_blank\" rel=\"noopener\">Open profile ↗</a>':'')+'</div></div><div class=\"fact\"><label>ZoomInfo Contact ID</label><div>'+esc(l.zoominfo_contact_id||'Not available')+'</div></div><div class=\"fact\"><label>Email</label><div>'+esc(l.email||'Unknown')+'</div></div><div class=\"fact\"><label>Phone</label><div>'+esc(l.phone||'Unknown')+'</div></div></div><div class=\"source-chips\" style=\"margin-top:9px\">'+sources+'</div></section>'+\n  '<section class=\"section\"><div class=\"section-head\"><h3>Score explanation</h3><span>100-point financial fit</span></div>'+components+'</section>'+\n  '<section class=\"section\"><div class=\"section-head\"><h3>Recent updates</h3><span>'+arr(l.activity_signals).length+' signals</span></div><div class=\"signal-list\">'+activities+'</div></section>'+\n  '<section class=\"section\"><div class=\"section-head\"><h3>Sources and estimates</h3><span>'+arr(l.evidence).length+' entries</span></div><div class=\"evidence-list\">'+evidence+'</div></section>'+\n  (l.qualifier?'<section class=\"section\"><h3>ProspectPilot</h3><p>'+esc(l.qualifier.route.replaceAll('_',' '))+' · Original score: '+esc(l.qualifier.score??'Unknown')+'</p><p>Age basis: '+esc(l.qualifier.age_basis)+' · Maturity: '+esc(l.qualifier.maturity_date||'Unknown')+'</p><p>Call screening: '+esc(l.qualifier.dnc_status)+'</p><p>'+esc(l.qualifier.source)+'</p></section>':'')+\n  '<p><a href=\"/research?lead_id='+encodeURIComponent(l.id)+'\">Build sourced profile</a></p><section class=\"section\"><div class=\"section-head\"><h3>Advisor workflow</h3></div><form id=\"drawerForm\"><div class=\"split\"><div class=\"field-row\"><label class=\"label\">Follow-up status</label><select class=\"field\" id=\"dStatus\">'+['New','Researching','Ready to Contact','Contacted','Follow-up','Meeting Set','Nurture','Not a Fit'].map(x=>'<option '+(x===l.follow_up_status?'selected':'')+'>'+x+'</option>').join('')+'</select></div><div class=\"field-row\"><label class=\"label\">Follow-up date</label><input class=\"field\" id=\"dDate\" type=\"date\" value=\"'+esc(l.follow_up_date||'')+'\"></div></div><div class=\"field-row\"><label class=\"label\">Notes</label><textarea class=\"field\" id=\"dNotes\" placeholder=\"Add context for the next advisor action…\">'+esc(l.notes||'')+'</textarea></div><div class=\"fact\"><label>Ownership</label><div>'+esc(l.owner_email||'Unassigned')+(arr(l.shared_with).length?'<br><small>Shared: '+esc(arr(l.shared_with).join(', '))+'</small>':'')+'</div></div><div class=\"drawer-form-actions\"><button class=\"btn\" type=\"button\" id=\"dSelect\">'+(state.selected.has(l.id)?'Remove selection':'Select for export')+'</button><button class=\"btn primary\" type=\"submit\">Save follow-up</button></div></form></section>';\n  const identityForm=$('dIdentityForm');if(identityForm)identityForm.onsubmit=e=>saveIdentityReview(e,l.id);$('dStatus').setAttribute('aria-label','Follow-up status');$('dDate').setAttribute('aria-label','Follow-up date');$('dNotes').setAttribute('aria-label','Advisor notes');$('drawerForm').onsubmit=e=>saveLeadWorkflow(e,l.id);$('dSelect').onclick=()=>{toggleSelection(l.id,!state.selected.has(l.id));$('dSelect').textContent=state.selected.has(l.id)?'Remove selection':'Select for export'};\n}\nasync function saveIdentityReview(e,id){e.preventDefault();const btn=e.currentTarget.querySelector('[type=submit]'),body={first_name:$('dFirstName').value.trim(),last_name:$('dLastName').value.trim(),current_title:$('dCurrentTitle').value.trim(),company:$('dCompany').value.trim(),location:$('dLocation').value.trim(),email:$('dIdentityEmail').value.trim(),linkedin_url:$('dLinkedInUrl').value.trim(),identity_status:$('dIdentityStatus').value};setBusy(btn,true,'Saving…');try{await api('/leads/'+encodeURIComponent(id),{method:'PATCH',body});closeDrawer();await Promise.all([loadLeads(),loadMetrics()]);toast(body.identity_status==='matched'?'Person approved and returned to the active list.':body.identity_status==='excluded'?'Record excluded from active leads.':'Corrections saved; record remains in review.','success')}catch(err){toast('Identity review could not be saved: '+err.message,'error')}finally{setBusy(btn,false)}}\nasync function saveLeadWorkflow(e,id){e.preventDefault();const btn=e.currentTarget.querySelector('[type=submit]');setBusy(btn,true,'Saving…');try{const body={follow_up_status:$('dStatus').value,follow_up_date:$('dDate').value||null,notes:$('dNotes').value};const d=await api('/leads/'+encodeURIComponent(id),{method:'PATCH',body});const updated=d.lead||d;const i=state.leads.findIndex(x=>x.id===id);if(i>=0)state.leads[i]={...state.leads[i],...updated};renderLeads();toast('Follow-up saved.','success')}catch(err){toast(err.message,'error')}finally{setBusy(btn,false)}}\n\nfunction setIdentityFilter(id){['reviewFilter','excludedFilter'].forEach(key=>{const on=key===id;$(key).classList.toggle('on',on);$(key).setAttribute('aria-pressed',on)});state.page=1;state.sort='confidence';state.order='asc';renderFilterChips();return loadLeads()}\nasync function openReviewWorkspace(){await setIdentityFilter('reviewFilter');$('tableShell').scrollIntoView({behavior:'smooth',block:'start'})}\nfunction clearFilters(){state.activeCampaign='';$('search').value='';$('tierFilter').value='';$('statusFilter').value='';$('ownershipFilter').value='';$('zoominfoFilter').value='';['priorityFilter','reviewFilter','excludedFilter'].forEach(id=>{$(id).classList.remove('on');$(id).setAttribute('aria-pressed','false')});state.page=1;renderCampaigns();renderFilterChips();Promise.all([loadLeads(),loadJobs()])}\nlet searchTimer;\nfunction wire(){\n  ['btnCampaign','btnHeroCampaign','btnRailCampaign'].forEach(id=>$(id).onclick=openNewCampaign);['btnImport','btnRailImport'].forEach(id=>$(id).onclick=()=>openModal('importModal'));$('btnRefresh').onclick=refreshAll;$('btnEmptyCampaign').onclick=()=>hasFilters()?clearFilters():openNewCampaign();$('openReview').onclick=openReviewWorkspace;$('showExcluded').onclick=()=>setIdentityFilter('excludedFilter');$('openFirstReview').onclick=()=>{if(state.leads[0])openLead(state.leads[0].id);else toast('There are no records in this queue.','success')};\n  $('btnDiscoverSources').onclick=discoverSources;\n  document.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>closeModal(x.dataset.close));\n  $('campaignForm').addEventListener('submit',e=>{e.preventDefault();saveCampaign(e.submitter?.value==='run',e.submitter)});$('importForm').addEventListener('submit',importFile);\n  document.querySelectorAll('.tab').forEach(x=>x.onclick=()=>setImportFormat(x.dataset.format));\n  $('importFile').onchange=()=>{const f=$('importFile').files[0];$('fileName').textContent=f?f.name+' · '+Math.max(1,Math.round(f.size/1024))+' KB':'';$('submitImport').disabled=!f};\n  const dz=$('dropzone');['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>{if(e.dataTransfer.files.length){const dt=new DataTransfer();dt.items.add(e.dataTransfer.files[0]);$('importFile').files=dt.files;$('importFile').onchange()}});\n  $('campaignList').onclick=e=>{const run=e.target.closest('[data-run]'),companyExport=e.target.closest('[data-export-companies]'),edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-delete-campaign]');if(run){e.stopPropagation();const campaign=state.campaigns.find(c=>c.id===run.dataset.run);if(!campaignRunReady(campaign)){openCampaignEditor(run.dataset.run);toast(campaign?.run_blocker||'Add a target website before running this campaign.','warning');return}runCampaign(run.dataset.run);return}if(companyExport){e.stopPropagation();exportCampaignCompanies(companyExport.dataset.exportCompanies,companyExport);return}if(edit){e.stopPropagation();openCampaignEditor(edit.dataset.edit);return}if(remove){e.stopPropagation();confirmDeleteCampaign(remove.dataset.deleteCampaign);return}const card=e.target.closest('[data-campaign]');if(card){state.activeCampaign=state.activeCampaign===card.dataset.campaign?'':card.dataset.campaign;state.page=1;renderCampaigns();renderFilterChips();Promise.all([loadLeads(),loadJobs()])}};\n  $('leadRows').onclick=e=>{const check=e.target.closest('[data-select]');if(check){e.stopPropagation();toggleSelection(check.dataset.select,check.checked);return}const row=e.target.closest('tr[data-id]');if(row)openLead(row.dataset.id)};\n  $('selectAll').onchange=e=>{const checked=e.target.checked;state.leads.forEach(l=>{if(checked)state.selected.add(l.id);else state.selected.delete(l.id)});renderLeads()};$('btnClearSelection').onclick=()=>{state.selected.clear();renderLeads()};\n  document.querySelectorAll('th.sort').forEach(th=>th.onclick=()=>{if(state.sort===th.dataset.sort)state.order=state.order==='asc'?'desc':'asc';else{state.sort=th.dataset.sort;state.order='desc'}state.page=1;loadLeads()});\n  $('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.page=1;renderFilterChips();loadLeads()},280)};['tierFilter','statusFilter','ownershipFilter','zoominfoFilter'].forEach(id=>$(id).onchange=()=>{state.page=1;renderFilterChips();loadLeads()});$('priorityFilter').onclick=()=>{$('priorityFilter').classList.toggle('on');$('priorityFilter').setAttribute('aria-pressed',$('priorityFilter').classList.contains('on'));state.page=1;renderFilterChips();loadLeads()};$('reviewFilter').onclick=()=>$('reviewFilter').classList.contains('on')?clearFilters():setIdentityFilter('reviewFilter');$('excludedFilter').onclick=()=>$('excludedFilter').classList.contains('on')?clearFilters():setIdentityFilter('excludedFilter');\n  $('clearFilters').onclick=clearFilters;$('pageSize').onchange=e=>{state.pageSize=num(e.target.value);state.page=1;loadLeads()};$('prevPage').onclick=()=>{state.page=Math.max(1,state.page-1);loadLeads()};$('nextPage').onclick=()=>{state.page++;loadLeads()};\n  $('btnBulkUpdate').onclick=()=>{const extra={};if($('bulkStatus').value)extra.follow_up_status=$('bulkStatus').value;if($('bulkDate').value)extra.follow_up_date=$('bulkDate').value;if(!Object.keys(extra).length){toast('Choose a status or follow-up date first.','error');return}bulkAction('update',extra)};\n  $('btnShare').onclick=()=>openEmailAction('share');$('btnAssign').onclick=()=>openEmailAction('assign');$('emailForm').onsubmit=e=>{e.preventDefault();const email=$('advisorEmail').value.trim();if(!email)return;closeModal('emailModal');bulkAction(state.emailAction,{advisor_email:email})};\n  $('btnReclaim').onclick=()=>confirmAction({title:'Reclaim selected leads?',copy:'Ownership will move to your admin queue.',warning:state.selected.size+' selected lead'+(state.selected.size===1?'':'s')+' will be removed from the current owners’ queues unless separately shared.',label:'Reclaim leads',onConfirm:()=>bulkAction('reclaim')});\n  $('btnDelete').onclick=()=>confirmAction({title:'Delete selected leads?',copy:'This removes the lead records and their enrichment payloads.',warning:'This action permanently deletes '+state.selected.size+' selected lead'+(state.selected.size===1?'':'s')+'. Export a copy first if the records may be needed.',label:'Delete permanently',onConfirm:()=>bulkAction('delete')});\n  $('btnExport').onclick=()=>exportSelected('salesforce');$('btnZoomInfoExport').onclick=()=>exportSelected('zoominfo');$('btnExportDiscovered').onclick=previewCompanyCSV;$('closeDrawer').onclick=closeDrawer;$('drawerBackdrop').onclick=closeDrawer;document.addEventListener('keydown',e=>{trapDrawerFocus(e);if(e.key==='Escape'&&$('drawer').classList.contains('open'))closeDrawer()});\n}\nasync function refreshAll(){setBusy($('btnRefresh'),true,'Refreshing…');await Promise.all([loadProviders(),loadCampaigns(),loadLeads(),loadMetrics(),loadJobs()]);setBusy($('btnRefresh'),false)}\nasync function init(){wire();renderLoading();await loadMe();try{state.callPreferences=(await (await fetch('/api/beta/preferences')).json()).preferences}catch{};if(!(state.me||{}).signed_in){renderLeads();return}await Promise.all([loadProviders(),loadCampaigns(),loadLeads(),loadMetrics(),loadJobs()]);renderFilterChips()}\ninit();\n</script>\n<a href=\"/enrichment\" style=\"display:inline-block;margin:16px;padding:12px 18px;background:#155ac8;color:white;border-radius:8px\">Add provider details</a></body>\n</html>\n";
const BETA_HTML="<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>ProspectPilot — Weekly calls</title>\n<style>\n:root{font-family:Inter,Arial,sans-serif;color:#152641;background:#f3f6fb;font-size:16px}*{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}button,a{touch-action:manipulation}button,.button{background:#155ac8;color:white;border:1px solid #155ac8;border-radius:8px;padding:11px 16px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}button:disabled{opacity:.5;cursor:not-allowed}.secondary{color:#193c69;background:white;border-color:#bbcadd}a{color:#155ac8}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #f1a52c;outline-offset:3px}header{background:#102b4d;color:white;display:flex;align-items:center;justify-content:space-between;padding:20px 4%;gap:20px}header b{font-size:20px}header span{font-size:14px;color:#c3d4ed}nav{display:flex;gap:20px;align-items:center}nav a{color:white}main{max-width:1440px;margin:auto;padding:30px 4%}h1{font-size:32px;letter-spacing:-1px;margin:0 0 8px}h2{font-size:21px;margin:0 0 12px}p{line-height:1.55}small,.muted{color:#526780;font-size:14px}.top{display:flex;justify-content:space-between;align-items:start;gap:16px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}.metric,.card{background:white;border:1px solid #d8e1ed;border-radius:12px;padding:22px}.metric strong{display:block;font-size:36px;margin:9px 0}.metric:first-child{background:#102b4d;color:white}.metric:first-child small{color:#c3d4ed}.notice{background:#fff5dd;border:1px solid #e8c578;border-radius:9px;padding:14px 18px;line-height:1.5;margin-bottom:24px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:22px}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px}.toolbar input{flex:1;min-width:180px}input,select,textarea{padding:11px;border:1px solid #b7c6d8;border-radius:7px;background:white;color:#152641;width:100%}label{display:block;font-size:14px;font-weight:600;margin-bottom:7px}.toolbar select{width:auto}table{border-collapse:collapse;width:100%;font-size:14px}th{text-align:left;color:#526780;background:#f5f8fc;font-weight:600}th,td{padding:16px 12px;border-bottom:1px solid #e3e9f1}td p{margin:5px 0}.name{border:0;background:none;color:#155ac8;padding:0;text-align:left;font-weight:700}.table-wrap{overflow:auto}.empty{text-align:center;padding:40px 20px}.empty p{max-width:470px;margin:12px auto 22px}.tag{display:inline-block;background:#e8f1ff;color:#234d88;padding:5px 8px;border-radius:5px;font-size:14px}.stack{display:grid;gap:20px;align-content:start}.stack p{font-size:14px}.stack ul{padding-left:20px;font-size:14px;line-height:1.7}.progress{height:8px;border-radius:8px;background:#334d6d;overflow:hidden}.progress i{display:block;background:#70c7fc;height:100%}dialog{width:min(680px,calc(100% - 24px));max-height:90vh;overflow:auto;border:0;border-radius:14px;padding:28px;color:#152641}dialog::backdrop{background:#071d39a8}.dialog-head{display:flex;justify-content:space-between;align-items:start;gap:12px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}.facts>div{background:#f3f6fb;padding:14px;border-radius:8px;overflow-wrap:anywhere}.facts b{display:block;margin-top:7px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.message{min-height:24px;color:#9c311f}.activity{border-left:3px solid #b9cde8;padding-left:12px;margin:12px 0}.activity p{margin:5px 0}footer{padding:30px 0;color:#526780;font-size:14px}.hidden{display:none!important}@media(max-width:950px){.layout{grid-template-columns:1fr}.stack{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:1fr 1fr}}@media(max-width:600px){header,.top{display:block}nav{margin-top:16px;flex-wrap:wrap}.stack{grid-template-columns:1fr}.metric,.card{padding:16px}.metric strong{font-size:30px}.facts{grid-template-columns:1fr}th,td{padding:12px 8px}h1{font-size:28px}.toolbar{align-items:stretch;flex-direction:column}.toolbar select{width:100%}}\n</style></head><body>\n<header><div><b>ProspectPilot</b><br><span>Your weekly calling list</span></div><nav aria-label=\"Main navigation\"><a href=\"/\" aria-current=\"page\">Weekly calls</a><a href=\"/lab\">Research lab</a> <a href=\"/discovery\">Find leads</a><a href=\"/enrichment\">Enrich existing leads</a><span id=\"user\">Checking sign-in…</span></nav><a href=\"/research\" style=\"color:inherit;margin:0 12px\">Research sources</a></header>\n<main><div class=\"top\"><div><h1>This week’s calls</h1><p class=\"muted\" id=\"weekLabel\">500 different leads per person, each week.</p></div><button id=\"refresh\" class=\"secondary\">Refresh list</button></div>\n<div id=\"status\" role=\"status\" aria-live=\"polite\" class=\"message\"></div>\n<section class=\"metrics\" aria-label=\"Your weekly progress\"><div class=\"metric\"><small>Leads you called</small><strong id=\"called\">—</strong><div class=\"progress\"><i id=\"progress\"></i></div><p><small>Weekly target: 500</small></p></div><div class=\"metric\"><small>Available for your next calls</small><strong id=\"ready\">—</strong><small>Different numbers, assigned to you</small></div><div class=\"metric\"><small>More leads needed</small><strong id=\"shortfall\">—</strong><small>To cover this week’s target</small></div><div class=\"metric\"><small>Leads missing a phone</small><strong id=\"missing\">—</strong><small>Not included in your calling list</small></div></section>\n<div class=\"notice\"><b>Beta setup is incomplete.</b> Automatic weekly lead delivery and in-app calling are not connected. Phone links open your own calling app. Saved call results are entered by you, not verified by a phone service.</div>\n<section class=\"card\" style=\"margin-bottom:22px\"><h2>Who do you want to help?</h2><p class=\"muted\">Search area: Long Island. New website searches start within 25 miles of Suffolk County, NY. Adjust the area before searching and check each person’s location; imported leads may be from elsewhere.</p><form id=\"focusForm\"><div class=\"facts\"><div><label for=\"focusAge\">Age focus</label><select id=\"focusAge\"><option value=\"all\">All ages, including unknown</option><option value=\"59half\">Estimated range includes age 59½</option></select></div><div><label for=\"focusEvent\">Recent event · past 90 days</label><select id=\"focusEvent\"><option value=\"all\">Any or unknown</option><option value=\"recent_job_change\">Job change</option><option value=\"retirement_announcement\">Retirement announcement</option><option value=\"liquidity_event\">Business sale or acquisition</option><option value=\"layoff\">Layoff</option></select></div></div><label for=\"focusTitles\">Job titles (optional; separate with commas)</label><input id=\"focusTitles\" maxlength=\"300\" placeholder=\"Owner, Director, Engineer\"><p class=\"muted\">An estimate can include age 59½ without confirming it. Recent events require a dated source. Neither age nor an event proves interest in financial advice or a product.</p><button id=\"saveFocus\" class=\"secondary\">Save my choices</button><p id=\"focusMessage\" class=\"message\" role=\"status\"></p></form></section><div class=\"layout\"><section class=\"card\"><div class=\"toolbar\"><input id=\"search\" type=\"search\" aria-label=\"Search your calling list\" placeholder=\"Search a name, company or job\"><select id=\"ageFilter\" aria-label=\"Filter by age information\"><option value=\"all\">All ages</option><option value=\"known\">Has an age estimate</option><option value=\"unknown\">Age not available</option></select></div><div id=\"list\" aria-live=\"polite\"><p>Loading your leads…</p></div></section>\n<aside class=\"stack\"><section class=\"card\"><h2>Keep your list full</h2><p>Choose the people and places you want to reach. Search company websites or add a list from your lead provider.</p><a class=\"button\" href=\"/discovery\">Find leads</a><p>Website research does not guarantee a direct phone number or an age estimate.</p></section><section class=\"card\"><h2>Before you call</h2><ul><li>Check that the name and job match the person.</li><li>Read the source behind an age estimate.</li><li>Use available LinkedIn updates as conversation context.</li><li>Honor requests not to call again.</li></ul><p>Your list excludes numbers marked “Do not call” or “Wrong number” in this workspace. This does not check an external do-not-call registry.</p></section></aside></div>\n<footer id=\"history\"></footer></main>\n<dialog id=\"detail\" aria-labelledby=\"personName\"><div class=\"dialog-head\"><div><h2 id=\"personName\"></h2><p id=\"personRole\" class=\"muted\"></p></div><button class=\"secondary\" id=\"close\">Close</button></div><div id=\"personFacts\"></div><div id=\"personActivity\"></div><div class=\"actions\"><a class=\"button\" id=\"dial\">Open calling app</a><a class=\"button secondary hidden\" id=\"profile\" target=\"_blank\" rel=\"noopener noreferrer\">View LinkedIn</a></div><p class=\"muted\">After calling, choose what happened. Opening a phone link does not count as a call.</p><form id=\"callForm\"><label for=\"outcome\">Call result</label><select id=\"outcome\" required><option value=\"\">Choose a result</option><option>No answer</option><option>Voicemail</option><option>Spoke</option><option>Meeting booked</option><option>Wrong number</option><option>Do not call</option></select><p><label for=\"notes\">Notes (optional)</label><textarea id=\"notes\" rows=\"3\" maxlength=\"4000\" placeholder=\"What should you remember?\"></textarea></p><p id=\"saveError\" class=\"message\" role=\"alert\"></p><button id=\"save\" type=\"submit\">Save call result</button></form></dialog>\n<script>\nconst el=id=>document.getElementById(id);let data=null,current=null,callId='',loading=false;\nconst escapeHtml=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nfunction safeLink(v,linkedin=false){try{const u=new URL(v);return u.protocol==='https:'&&(!linkedin||u.hostname==='linkedin.com'||u.hostname==='www.linkedin.com')?u.href:''}catch{return ''}}\nasync function request(path,options={}){const r=await fetch(path,{...options,headers:{'content-type':'application/json'}});const d=await r.json();if(!r.ok)throw Error(d.detail||'Something went wrong. Please try again.');return d}\nasync function refresh(){if(loading)return;loading=true;el('refresh').disabled=true;el('status').textContent='Updating your list…';try{data=await request('/api/beta/week');el('focusAge').value=data.preferences.age_focus;el('focusEvent').value=data.preferences.timely_focus;el('focusTitles').value=data.preferences.ideal_prospect;el('called').textContent=data.called+' / 500';el('ready').textContent=data.ready;el('shortfall').textContent=data.shortfall;el('missing').textContent=data.missing_phone;el('progress').style.width=Math.min(100,data.called/5)+'%';el('weekLabel').textContent='Week beginning '+data.week_start+' · Resets Monday at 00:00 UTC';el('history').innerHTML='<h2>Recent calls</h2><p>'+data.attempts+' saved call results this week. Repeat calls to the same lead count once toward your target.</p>'+data.history.map(r=>'<div class=\"activity\"><b>'+escapeHtml(r.name)+' · '+escapeHtml(r.outcome)+'</b><p>'+escapeHtml(r.notes||'No notes')+'</p><small>'+escapeHtml(r.created_at)+'</small></div>').join('');render();el('status').textContent=''}catch(e){el('status').textContent=e.message;el('list').textContent='Your calling list could not be loaded. Please refresh to try again.'}finally{loading=false;el('refresh').disabled=false}}\nfunction render(){const q=el('search').value.toLowerCase(),filter=el('ageFilter').value;const leads=data.leads.filter(l=>([l.first_name,l.last_name,l.company,l.current_title].join(' ').toLowerCase().includes(q))&&(filter==='all'||(filter==='known'?!!l.age.range:!l.age.range)));if(!leads.length){el('list').innerHTML='<div class=\"empty\"><h2>'+(data.ready?'No matching leads':'Your next call starts here')+'</h2><p>'+(data.ready?'Try a different search or age filter.':'You have no new leads with usable phone numbers assigned to you. Find leads, add phone information, and check their identity to fill this list.')+'</p><a class=\"button\" href=\"/discovery\">Find and manage leads</a></div>';return}el('list').innerHTML='<p class=\"muted\">Showing '+leads.length+' of '+data.ready+' available leads</p><div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Person</th><th scope=\"col\">Approximate age</th><th scope=\"col\">LinkedIn</th><th scope=\"col\">Next step</th></tr></thead><tbody>'+leads.map(l=>'<tr><td><button class=\"name\" data-open=\"'+escapeHtml(l.id)+'\">'+escapeHtml(l.first_name+' '+l.last_name)+'</button><p>'+escapeHtml(l.current_title)+'</p><small>'+escapeHtml(l.company)+' · '+escapeHtml(l.location||'Location not available')+'</small></td><td>'+escapeHtml(l.age.range||'Not available')+'</td><td>'+(safeLink(l.linkedin_url,true)?'Profile available':'Not available')+'</td><td><button class=\"secondary\" data-open=\"'+escapeHtml(l.id)+'\">Review & call</button></td></tr>').join('')+'</tbody></table></div>';el('list').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openLead(b.dataset.open))}\nfunction openLead(id){current=data.leads.find(l=>l.id===id);if(!current)return;callId=crypto.randomUUID();el('personName').textContent=current.first_name+' '+current.last_name;el('personRole').textContent=[current.current_title,current.company].filter(Boolean).join(' · ');el('personFacts').innerHTML='<div class=\"facts\"><div><small>Phone · format checked only</small><b>'+escapeHtml(current.call.phone)+'</b></div><div><small>Approximate age</small><b>'+escapeHtml(current.age.range||'Not available')+'</b></div></div><p class=\"muted\">'+escapeHtml(current.age.basis)+'</p>'+(safeLink(current.age.source_url)?'<a href=\"'+escapeHtml(safeLink(current.age.source_url))+'\" target=\"_blank\" rel=\"noopener noreferrer\">Check age source</a>':'');const activities=(current.activity_signals||[]).filter(a=>safeLink(a.source_url||a.url,true));el('personActivity').innerHTML='<h2>LinkedIn context</h2>'+(activities.length?activities.map(a=>'<div class=\"activity\"><small>'+escapeHtml(a.occurred_at||a.date||a.created_at||'Date not supplied')+'</small><p>'+escapeHtml(a.text||a.snippet||a.summary||'Open the source to read this update.')+'</p><a href=\"'+escapeHtml(safeLink(a.source_url||a.url,true))+'\" target=\"_blank\" rel=\"noopener noreferrer\">Read original update</a></div>').join(''):'<p class=\"muted\">No sourced LinkedIn updates are available for this person.</p>');el('dial').href='tel:'+current.call.phone;const profile=safeLink(current.linkedin_url,true);el('profile').classList.toggle('hidden',!profile);if(profile)el('profile').href=profile;el('callForm').reset();el('saveError').textContent='';el('detail').showModal()}\nel('callForm').onsubmit=async e=>{e.preventDefault();el('save').disabled=true;el('saveError').textContent='';try{await request('/api/beta/calls',{method:'POST',body:JSON.stringify({id:callId,lead_id:current.id,outcome:el('outcome').value,notes:el('notes').value})});el('detail').close();await refresh();el('status').textContent='Call result saved.'}catch(err){el('saveError').textContent=err.message}finally{el('save').disabled=false}};\nel('focusForm').onsubmit=async e=>{e.preventDefault();el('saveFocus').disabled=true;el('focusMessage').textContent='';try{await request('/api/beta/preferences',{method:'PUT',body:JSON.stringify({location:'Long Island',age_focus:el('focusAge').value,timely_focus:el('focusEvent').value,ideal_prospect:el('focusTitles').value})});await refresh();el('focusMessage').textContent='Your choices are saved.'}catch(err){el('focusMessage').textContent=err.message}finally{el('saveFocus').disabled=false}};el('close').onclick=()=>el('detail').close();el('refresh').onclick=refresh;el('search').oninput=()=>data&&render();el('ageFilter').onchange=()=>data&&render();\n(async()=>{try{const me=await request('/api/me');el('user').textContent=me.name||me.email;await refresh()}catch(e){el('user').innerHTML='<a href=\"/signin-with-chatgpt?return_to=%2F\" target=\"_top\">Sign in</a>';el('status').textContent=e.message;el('list').textContent='Sign in to see your weekly calling list.'}})();\n</script></body></html>\n";
const ENRICHMENT_HTML="<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Provider details · ProspectPilot</title>\n<style>body{font:16px/1.5 system-ui;margin:0;background:#f3f6fb;color:#152641}header{background:#102b4d;padding:20px;color:white}header a{color:white;margin-right:24px}main{max-width:1000px;margin:auto;padding:24px}section{background:white;padding:24px;border:1px solid #d8e1ed;border-radius:12px;margin-bottom:20px}h1{font-size:30px}h2{font-size:22px}button,select,input{font:inherit;padding:10px}button{background:#155ac8;color:white;border:0;border-radius:7px;cursor:pointer}button:disabled{opacity:.5;cursor:default}label{display:block;margin:12px 0}input[type=checkbox]{width:20px;height:20px;vertical-align:middle}a{color:#155ac8}.notice{padding:16px;background:#fff5dd;border:1px solid #e8c578}.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}#leads{max-height:320px;overflow:auto}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:10px;border-bottom:1px solid #d8e1ed;overflow-wrap:anywhere}#preview{overflow:auto}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #f1a52c;outline-offset:3px}</style>\n<header><a href=\"/\">Weekly calls</a><a href=\"/discovery\">Find and manage leads</a><b>Provider details</b><a href=\"/research\" style=\"color:inherit;margin:0 12px\">Research sources</a></header>\n<main><h1>Enrich existing leads</h1><p>Providers only fill gaps for candidates already found in your workspace. They are not the primary source of candidates. <a href=\"/discovery\">Find candidates first</a>, or <a href=\"/wealthfeed\">use WealthFeed for optional direct enrichment</a>.</p>\n<p class=\"notice\"><b>Release blocked: provider formats need verification.</b> Candidate CSVs are draft formats. Confirm accepted columns in your provider account before upload. A successful upload and return import must be tested for each provider.</p>\n<p id=\"message\" role=\"status\" aria-live=\"polite\">Loading your leads…</p>\n<section><h2>1. Choose people and download a file</h2><label for=\"provider\">Provider</label><select id=\"provider\"><option value=\"zoominfo\">ZoomInfo</option><option value=\"wealthfeed\">WealthFeed</option></select><p><b>Connection:</b> File exchange only. No account connected.</p><div id=\"leads\"></div><button id=\"download\" disabled>Download candidate CSV</button></section>\n<section><h2>2. Add details in your provider account</h2><p>Open your provider, sign in there, and use its list upload or enrichment feature if your subscription includes it. Select the downloaded CSV, check the column mapping and any credit charges, then download the results.</p><a id=\"handoff\" href=\"https://app.zoominfo.com/\" target=\"_blank\" rel=\"noopener noreferrer\" referrerpolicy=\"no-referrer\">Open ZoomInfo</a><p>Opens the provider’s sign-in/home page. Navigate to upload inside your account. Your password, cookies and private pages are never read by this workspace. Opening the page does not upload the file or connect your account.</p></section>\n<section><h2>3. Preview the returned file</h2><label for=\"file\">Provider export (CSV, up to 5 MB)</label><input id=\"file\" type=\"file\" accept=\".csv,text/csv\"><p>Provider-specific identifiers are recognized automatically. If absent, your selected provider supplies the source label. Rows need a shared identifier such as email, LinkedIn URL or returned External ID; names alone are held.</p><button id=\"inspect\" disabled>Preview returned details</button><div id=\"preview\"></div><button id=\"apply\" disabled>Apply ready rows</button><p>Up to 500 ready leads are saved in small groups. If interrupted, earlier saved groups are kept. Only empty fields are filled. Conflicting details and ambiguous matches remain unchanged for review. Importing information does not verify identity, wealth or permission to call.</p></section></main>\n<script>\nconst $=id=>document.getElementById(id);let exportId=null,previewId=null,revision=0;\nconst escape=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nasync function api(route,body){const r=await fetch('/api/enrichment/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.detail||d.message||'Unable to complete this step. Please try again.');return d;}\nfunction resetPreview(){revision++;previewId=null;$('apply').disabled=true;$('preview').textContent='';}\nfunction state(s){$('message').textContent=s;}\n$('provider').onchange=()=>{exportId=null;resetPreview();const w=$('provider').value==='wealthfeed';$('handoff').href=w?'https://portal.wealthfeed.com/':'https://app.zoominfo.com/';$('handoff').textContent='Open '+(w?'WealthFeed':'ZoomInfo');state('Provider changed. Download a new candidate file or select a returned export.');};\n$('leads').onchange=()=>{exportId=null;resetPreview();};$('file').onchange=()=>{resetPreview();$('inspect').disabled=!$('file').files.length;};\n$('download').onclick=async()=>{resetPreview();exportId=null;const expected=revision;$('download').disabled=true;try{const lead_ids=[...document.querySelectorAll('[name=lead]:checked')].map(x=>x.value);const d=await api('export',{provider:$('provider').value,lead_ids});if(expected!==revision)return;exportId=d.batch_id;const url=URL.createObjectURL(new Blob([d.csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=d.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);state('File prepared. Upload it in your provider account, then bring the results here.');}catch(e){state(e.message);}finally{$('download').disabled=false;}};\n$('inspect').onclick=async()=>{resetPreview();const expected=revision;$('inspect').disabled=true;try{const f=$('file').files[0];if(!f||f.size>5*1024*1024)throw Error('Choose a CSV smaller than 5 MB.');const d=await api('preview',{csv:await f.text(),provider:$('provider').value,batch_id:exportId});if(expected!==revision)return;previewId=d.batch_id;$('preview').innerHTML=(d.ignored_columns?.length?'<p role=\\\"status\\\">Columns not imported: '+escape(d.ignored_columns.join(', '))+'. For phone numbers, use Business Phone or Mobile Phone after confirming the number type.</p>':'')+'<p>Source: '+escape(d.provider)+(d.recognized?' · recognized from headers':' · selected by you')+'</p><p>'+escape(Object.entries(d.counts).map(([k,v])=>v+' '+k).join(' · '))+'</p><table><thead><tr><th>Row</th><th>Status</th><th>Details</th></tr></thead><tbody>'+d.results.map(r=>'<tr><td>'+r.row+'</td><td>'+escape(r.status)+'</td><td>'+escape(r.reason||[...Object.entries(r.changes).map(([k,v])=>'Add '+k.replaceAll('_',' ')+': '+v),...r.conflicts.map(c=>c.field+': '+c.current+' → '+c.incoming),...r.invalid.map(k=>'Invalid '+k)].join('; '))+'</td></tr>').join('')+'</tbody></table>';$('apply').disabled=!d.counts.ready;state(d.message);}catch(e){state(e.message);}finally{$('inspect').disabled=false;}};\n$('apply').onclick=async()=>{const expected=revision;$('apply').disabled=true;try{let d;const batch=previewId;do{d=await api('commit',{batch_id:batch});if(expected!==revision)return;state('Saved '+d.applied+' leads'+(d.remaining?' · '+d.remaining+' remaining.':'.'));}while(d.status==='partial');state('Details saved. '+(d.applied||0)+' leads updated. Review rows were not changed.');previewId=null;}catch(e){state(e.message+' Preview the file again before retrying.');}};\n(async()=>{try{const d=await api('leads');$('leads').innerHTML=d.leads.length?d.leads.map(l=>'<label><input type=\"checkbox\" name=\"lead\" value=\"'+escape(l.id)+'\"> '+escape(l.first_name+' '+l.last_name)+' · '+escape(l.company)+'</label>').join(''):'<p>No leads are assigned to you. Add or assign leads in the workspace first.</p>';$('download').disabled=!d.leads.length;state('Choose a provider and the people to enrich.');}catch(e){state(e.message);$('leads').textContent='Sign in from the workspace and reload this page.';}})();\n</script></html>\n";
const WEALTHFEED_HTML="<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Connect WealthFeed · ProspectPilot</title>\n<style>\n*{box-sizing:border-box}body{font:16px/1.5 system-ui;margin:0;background:#f3f6fb;color:#152641}header{background:#102b4d;padding:20px 4%;color:white;display:flex;gap:24px;flex-wrap:wrap}header a{color:white}main{max-width:1100px;padding:28px;margin:auto}h1{font-size:30px;margin:0 0 12px}h2{font-size:22px}section{padding:24px;background:white;border:1px solid #d8e1ed;border-radius:12px;margin:20px 0}button,input,select{font:inherit}button{padding:10px 16px;border:1px solid #155ac8;border-radius:7px;background:#155ac8;color:white;cursor:pointer}button:disabled{opacity:.5;cursor:default}.secondary{background:white;color:#155ac8}input[type=password],input[type=search],select{width:100%;padding:12px;border:1px solid #bbcadd;border-radius:7px;margin:8px 0 16px;background:white}label{display:block}input[type=checkbox]{width:20px;height:20px;vertical-align:middle;margin-right:10px}.actions{display:flex;flex-wrap:wrap;gap:12px}.note{background:#fff5dd;padding:16px;border-left:4px solid #e4b455}.muted{font-size:14px;color:#526780}#leads{max-height:320px;overflow:auto;margin:16px 0}#leads label{padding:8px;border-bottom:1px solid #eee}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #d8e1ed;overflow-wrap:anywhere}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #f1a52c;outline-offset:3px}#message{min-height:24px;font-weight:600}a{color:#155ac8}[hidden]{display:none!important}@media(max-width:600px){main{padding:16px}section{padding:16px}}\n</style></head><body>\n<header><a href=\"/\">Weekly calls</a><a href=\"/discovery\">Find leads</a><a href=\"/enrichment\">Import provider files</a></header>\n<main><h1>Optional WealthFeed enrichment</h1><p class=\"note\"><b>Candidate sourcing starts in <a href=\"/discovery\">Find leads</a>.</b> WealthFeed does not supply the primary candidate list. Use it only to fill missing details for people already found in the workspace.</p><p id=\"message\" role=\"status\" aria-live=\"polite\">Loading connection…</p>\n<section><h2>Your connection</h2><p id=\"connection\">Checking…</p><form id=\"connectForm\"><label for=\"key\">WealthFeed API key</label><input id=\"key\" type=\"password\" autocomplete=\"new-password\" maxlength=\"1024\" required spellcheck=\"false\"><p class=\"muted\">Generate a key in WealthFeed Account settings. It is stored encrypted for your signed-in account and is never shown again here.</p><button id=\"connect\" type=\"submit\">Check and save connection</button></form><button id=\"disconnect\" class=\"secondary\" hidden>Disconnect WealthFeed</button></section>\n<section><h2>1. Choose people to enrich</h2><p>Start with a small, varied batch. WealthFeed may charge one credit per person. Submitting sends names and available contact details to WealthFeed.</p><label for=\"need\">Show</label><select id=\"need\"><option value=\"recommended\">Best candidates</option><option value=\"age\">Missing age</option><option value=\"phone\">Missing phone</option><option value=\"linkedin\">Missing LinkedIn profile</option><option value=\"all\">All eligible people</option></select><label for=\"search\">Find someone in your list</label><input id=\"search\" type=\"search\" placeholder=\"Search name or company\"><p id=\"available\" class=\"muted\"></p><div class=\"actions\"><button id=\"select\" class=\"secondary\">Select best 10</button><button id=\"clear\" class=\"secondary\">Clear selection</button></div><div id=\"leads\"></div><p id=\"selected\">0 selected</p><button id=\"submit\" disabled>Send selected people to WealthFeed</button></section>\n<section><h2>2. Check results</h2><p>Enrichment can take several minutes. Jobs are saved, so you can close this page and return later. Choose “Check results” when ready.</p><button id=\"refresh\" class=\"secondary\">Refresh job list</button><div id=\"jobs\" class=\"table\"></div></section>\n<section id=\"review\" hidden><h2>3. Review returned details</h2><p>Ready rows fill empty fields. Conflicting information stays unchanged. Reported ages are approximate; unknown ages remain blank. LinkedIn profile links do not include posts or activity.</p><div id=\"preview\" class=\"table\"></div><button id=\"apply\" disabled>Apply ready rows</button></section>\n<p class=\"note\">This connection enriches existing people. A recurring supply of 500 new qualified leads each week still needs to be established.</p></main>\n<script>\nconst $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nlet connected=false,leads=[],selection=new Set(),batchId=null,busy=false;\nconst say=m=>$('message').textContent=m;\nasync function api(route,body,prefix='wealthfeed'){const r=await fetch('/api/'+prefix+'/'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.detail||'The request could not be completed.');return d;}\nfunction updateSelection(){$('selected').textContent=selection.size+' selected';$('submit').disabled=busy||!connected||!selection.size||selection.size>100;}\nfunction shown(){const q=$('search').value.toLowerCase(),n=$('need').value;return leads.filter(l=>l.eligible&&(n==='all'||n==='recommended'&&l.identity_status==='matched'&&(l.missing_age||l.missing_phone||l.missing_linkedin)||n==='age'&&l.missing_age||n==='phone'&&l.missing_phone||n==='linkedin'&&l.missing_linkedin)&&(l.first_name+' '+l.last_name+' '+l.company).toLowerCase().includes(q)).sort((a,b)=>(b.match_strength-a.match_strength)||(b.priority_score-a.priority_score)||(a.company||'').localeCompare(b.company||''));}\nfunction bestTen(){const picked=[],counts=new Map();for(const l of shown()){const company=(l.company||'Unknown').trim().toLowerCase(),count=counts.get(company)||0;if(count>=2)continue;picked.push(l);counts.set(company,count+1);if(picked.length===10)break;}return picked;}\nfunction renderLeads(){const rows=shown();$('available').textContent=rows.length+' eligible people shown. Page labels and records without enough identifying information are excluded.';$('leads').innerHTML=rows.map(l=>'<label><input type=\"checkbox\" value=\"'+esc(l.id)+'\" '+(selection.has(l.id)?'checked':'')+'>'+esc(l.first_name+' '+l.last_name)+' · '+esc(l.company)+'</label>').join('')||'<p>No eligible people match this view.</p>';updateSelection();}\nasync function status(){const d=await api('status');connected=d.connected;$('connection').textContent=connected?'Your WealthFeed connection is saved.':d.secure_storage_ready?'No account connected.':'Secure connection setup is not finished.';$('connectForm').hidden=connected;$('disconnect').hidden=!connected;$('connect').disabled=!d.secure_storage_ready;const labels={sending:'Receipt not confirmed',uncertain:'Receipt not confirmed',rejected:'Not submitted',queued:'Waiting for WealthFeed',created:'Waiting for WealthFeed',processing:'In progress',failed:'WealthFeed could not complete this job',preview:'Results available'};$('jobs').innerHTML=d.jobs.length?'<table><thead><tr><th>Submitted</th><th>Status</th><th>Action</th></tr></thead><tbody>'+d.jobs.map(j=>'<tr><td>'+esc(j.created_at)+'</td><td>'+esc(labels[j.status]||j.status)+'</td><td>'+(j.provider_job_id?'<button data-job=\"'+esc(j.id)+'\">Check results</button>':'Check your WealthFeed account before resubmitting.')+'</td></tr>').join('')+'</tbody></table>':'<p>No enrichment jobs yet.</p>';updateSelection();}\nasync function run(action){if(busy)return;busy=true;updateSelection();try{await action();}catch(e){say(e.message);}finally{busy=false;updateSelection();}}\n$('connectForm').onsubmit=e=>{e.preventDefault();run(async()=>{let key=$('key').value;$('key').value='';try{await api('connect',{key});say('WealthFeed connected. Choose people below.');await status();}finally{key='';}});};\n$('disconnect').onclick=()=>run(async()=>{await api('disconnect',{});say('Connection removed. Existing lead information is kept.');await status();});\n$('search').oninput=renderLeads;$('need').onchange=()=>{selection.clear();renderLeads();};$('leads').onchange=e=>{if(e.target.type==='checkbox'){e.target.checked?selection.add(e.target.value):selection.delete(e.target.value);updateSelection();}};\n$('select').onclick=()=>{selection=new Set(bestTen().map(l=>l.id));renderLeads();};$('clear').onclick=()=>{selection.clear();renderLeads();};\n$('submit').onclick=()=>run(async()=>{const request_id=crypto.randomUUID();say('Sending selected people…');try{await api('submit',{request_id,lead_ids:[...selection]});selection.clear();renderLeads();say('Submitted. Check the job below for results.');}finally{await status();}});\n$('refresh').onclick=()=>run(status);\n$('jobs').onclick=e=>{const id=e.target.dataset.job;if(!id)return;run(async()=>{const d=await api('check',{id});if(d.status==='complete'){say('These results have already been saved.');return;}if(d.status!=='preview'){say(d.status==='failed'?'WealthFeed could not complete this job. Check your provider account.':'WealthFeed is still working. Check again in a few minutes.');return;}batchId=d.batch_id;$('review').hidden=false;const fieldName=k=>({phone:'Phone number',phone1:'Phone number',phone2:'Alternate phone',age:'Age',estimated_age_range:'Age range',linkedin_url:'LinkedIn profile',company:'Company',city:'City',state:'State'}[k]||k.replaceAll('_',' ')),resultName=s=>({ready:'Ready to save',review:'Needs review',unchanged:'No changes'}[s]||s);$('preview').innerHTML='<p>'+esc(Object.entries(d.counts).map(([k,v])=>v+' '+({ready:'ready to save',review:'need review',unchanged:'unchanged'}[k]||k)).join(' · '))+'</p><table><thead><tr><th>Person</th><th>Status</th><th>Details</th></tr></thead><tbody>'+d.results.map(r=>{const l=leads.find(l=>l.id===r.lead_id);return '<tr><td>'+esc(l?l.first_name+' '+l.last_name:r.lead_id)+'</td><td>'+esc(resultName(r.status))+'</td><td>'+esc(r.reason||[...Object.entries(r.changes).map(([k,v])=>fieldName(k)+': '+v),...r.conflicts.map(c=>fieldName(c.field)+': '+c.current+' → '+c.incoming),...new Set(r.invalid.map(k=>fieldName(k)+' needs review')),...Object.entries(r.phone_checks||{}).map(([p,c])=>fieldName(p)+': '+(c.status==='clear'?'provider reports no do-not-call flag':c.status==='blocked'?'do not call':'do-not-call status unknown'))].join('; '))+'</td></tr>';}).join('')+'</tbody></table>';$('apply').disabled=!d.results.some(r=>r.status==='ready');say('Results are ready to review.');$('review').scrollIntoView({behavior:'smooth'});});};\n$('apply').onclick=()=>run(async()=>{$('apply').disabled=true;let d;do{d=await api('commit',{batch_id:batchId},'enrichment');say('Saved '+d.applied+' people.');}while(d.status==='partial');say('Details saved. Open Weekly calls to review the updated list.');await status();});\n(async()=>{try{await status();leads=(await api('leads',null,'enrichment')).leads;renderLeads();say('Connect your account or choose people to enrich.');}catch(e){say(e.message);}})();\n</script></body></html>\n";
const RESEARCH_HTML="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Research sources · ProspectPilot</title><style>\n*{box-sizing:border-box}body{margin:0;font:16px system-ui;background:#f3f6fb;color:#102b49}header{background:#102b49;color:white;padding:18px 5%;display:flex;gap:24px;flex-wrap:wrap}header a{color:white}main{max-width:1160px;margin:28px auto;padding:0 20px}section{background:white;border:1px solid #cbd7e5;border-radius:12px;padding:20px;margin:18px 0}label{display:block;margin:12px 0 6px;font-weight:600}input,select,textarea,button{font:inherit;padding:10px;border-radius:6px;border:1px solid #9aadc3;max-width:100%}input,select,textarea{width:100%}button{background:#175ac4;color:white;cursor:pointer;margin:10px 8px 0 0}button:disabled{opacity:.5;cursor:default}a{color:#175ac4}#cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.source{border:1px solid #b9cbe0;border-radius:8px;padding:14px}.source h3{margin-top:0}.source button{background:white;color:#175ac4}.muted{color:#52677f;font-size:.9rem}#message{white-space:pre-wrap}article{border-top:1px solid #cbd7e5;padding:14px 0;overflow-wrap:anywhere}.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:600px){.row{grid-template-columns:1fr}}:focus-visible{outline:3px solid #e18f00;outline-offset:2px}</style></head><body>\n<header><strong>ProspectPilot</strong><a href=\"/\">Weekly calls</a><a href=\"/discovery\">Find leads</a><a href=\"/enrichment\">Provider details</a><a href=\"/research\" aria-current=\"page\">Research sources</a><a href=\"/warn\">WARN dashboard</a><a href=\"/settings/linkedin\">LinkedIn connection</a></header>\n<main><h1>Build a sourced lead profile</h1><p>Research people and businesses across industries. Choose a source, review the matching evidence, and save it with its date and link.</p><p id=\"message\" role=\"status\" aria-live=\"polite\">Loading…</p>\n<section><div class=\"row\"><div><label for=\"lead\">Lead to research</label><select id=\"lead\"><option value=\"\">Choose a lead</option></select><p class=\"muted\">Showing up to 500 accessible leads. Open research from a lead’s details to select it directly.</p></div><div><label for=\"region\">Research location (optional)</label><input id=\"region\" placeholder=\"State, city, or country\"><p class=\"muted\">Source coverage varies by jurisdiction. This research is not limited to a particular industry.</p></div></div></section>\n<section id=\"researchPicture\"><h2>Research overview</h2><p>Choose a lead to see its evidence together.</p></section><section><h2>Automatic lead research</h2><p>Check all 12 public-source categories using this lead’s saved details. No links, account connections, or API keys needed.</p><button id=\"autoResearch\">Research this lead</button><p id=\"autoProgress\" role=\"status\" aria-live=\"polite\">Choose a lead, then start research. Research runs in the background. You can leave this page and return to the saved progress.</p><div id=\"autoResults\"></div></section><details><summary>Optional manual research tools</summary><div id=\"cards\"></div>\n<section><h2>Review a source</h2><label for=\"source\">Source category</label><select id=\"source\"></select><p id=\"sourceNote\" class=\"muted\"></p><label for=\"url\">Original record or page URL</label><input id=\"url\" type=\"url\" placeholder=\"https://…\"><label for=\"excerpt\">Short source excerpt</label><textarea id=\"excerpt\" rows=\"5\" maxlength=\"1500\" placeholder=\"Leave blank to fetch a public HTML page, or paste a short excerpt from a source you can access.\"></textarea><label for=\"csv\">Or upload a directory / WARN CSV export (up to 1 MB)</label><input id=\"csv\" type=\"file\" accept=\".csv,text/csv\"><p class=\"muted\">Include the company name, or the person’s name and company/location. Imports work across jurisdictions. PDF and interactive dashboards use an excerpt or export; login-only pages are not fetched.</p><button id=\"preview\">Preview matching evidence</button><div id=\"matches\"></div><label for=\"date\">Source publication / notice date</label><input id=\"date\" type=\"date\"><p class=\"muted\">Required for WARN. Leave unknown dates blank for other sources.</p><label><input id=\"confirm\" type=\"checkbox\" style=\"width:auto\"> I checked the source and its connection to this lead.</label><button id=\"save\" disabled>Save to profile</button></section>\n<section><h2>Search certified businesses</h2><p>Search the public NYC certified business dataset by business name, service or industry. Other states and cities can be researched through the source links or imported CSV files.</p><label for=\"directoryQuery\">Business or service</label><input id=\"directoryQuery\" minlength=\"3\" placeholder=\"Accounting, construction, consulting…\"><button id=\"directorySearch\">Search directory</button><div id=\"directoryResults\"></div></section>\n</details><section><h2>Saved research</h2><p class=\"muted\">Records are labeled as machine-matched or user-reviewed evidence, not independent verification. Research does not change wealth estimates, priority scores, or permission to call.</p><div id=\"records\"></div></section></main>\n<script src=\"/research-native.js\" defer></script><script>\nconst R=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));let sources=[],leads=[],revision=0;\nconst tell=s=>R('message').textContent=s;\nasync function api(path,body){const response=await fetch('/api/research/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.detail||'Unable to complete research.');return data;}\nfunction reset(){revision++;R('save').disabled=true;R('confirm').checked=false;R('matches').replaceChildren();}\nfunction sourceChanged(){reset();R('sourceNote').textContent=sources.find(s=>s.id===R('source').value)?.note||'';}\nfunction renderCards(){const lead=leads.find(l=>l.id===R('lead').value)||{};R('cards').innerHTML=sources.map(s=>{const who=s.scope==='company'?lead.company:[lead.first_name,lead.last_name,lead.company].filter(Boolean).join(' ');const query=[who,R('region').value,s.query].filter(Boolean).join(' ');return '<div class=\"source\"><h3>'+esc(s.label)+'</h3><p class=\"muted\">'+esc(s.scope==='company'?'Business-level context':'Professional identity and experience')+'</p><a target=\"_blank\" rel=\"noopener noreferrer\" href=\"https://www.google.com/search?q='+encodeURIComponent(query)+'\">Find public sources</a>'+(s.directory?' · <a target=\"_blank\" rel=\"noopener noreferrer\" href=\"'+esc(s.directory)+'\">'+(s.id==='warn'?'New York WARN dashboard':s.id==='mwbe'?'New York MWBE hub':s.id==='registry'?'New York registry':'Official directory')+'</a>':'')+'<br><button data-source=\"'+s.id+'\">Use this source</button></div>'}).join('');R('cards').querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{R('source').value=b.dataset.source;sourceChanged();R('url').focus();});}\nasync function loadRecords(){const expected=revision;if(!R('lead').value){R('records').textContent='Choose a lead to see its research.';return;}const d=await api('records?lead_id='+encodeURIComponent(R('lead').value));if(expected!==revision)return;R('records').innerHTML=d.records.length?d.records.map(r=>'<article><strong>'+esc(r.label)+'</strong> · '+esc(r.scope)+' context<p>'+esc(r.excerpt)+'</p><a target=\"_blank\" rel=\"noopener noreferrer\" href=\"'+esc(r.url)+'\">Original source</a><p class=\"muted\">Source date: '+esc(r.source_date||'unknown')+' · Checked: '+esc(r.checked_at)+' · '+esc(r.status)+'</p><p class=\"muted\">'+esc(r.note)+'</p></article>').join(''):'No saved research yet.';}\nR('lead').onchange=async()=>{reset();R('excerpt').value='';R('url').value='';R('csv').value='';R('date').value='';renderCards();try{await loadRecords();}catch(e){tell(e.message);}};R('region').oninput=renderCards;R('source').onchange=sourceChanged;for(const id of ['url','excerpt','csv','date'])R(id).addEventListener('input',reset);R('confirm').onchange=()=>R('save').disabled=!R('confirm').checked;\nR('preview').onclick=async()=>{reset();const expected=revision;R('preview').disabled=true;try{if(!R('lead').value)throw Error('Choose a lead first.');const file=R('csv').files[0];if(file&&file.size>1024*1024)throw Error('Choose a CSV up to 1 MB.');const d=await api('preview',{lead_id:R('lead').value,source:R('source').value,url:R('url').value,excerpt:R('excerpt').value,...(file?{csv:await file.text()}:{})});if(expected!==revision)return;if(d.matches){R('matches').innerHTML=d.matches.map((m,i)=>'<article><p>'+esc(m)+'</p><button data-match=\"'+i+'\">Use this row</button></article>').join('');R('matches').querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>{R('excerpt').value=d.matches[Number(b.dataset.match)];R('csv').value='';reset();tell('Check the source URL and date, then save this excerpt.');});tell(d.total+' matching rows. '+d.note);}else{R('excerpt').value=d.excerpt;R('url').value=d.url||R('url').value;tell(d.match?'Matching text found. Review the excerpt and date before saving.':'This excerpt does not establish the required identity match. Do not attach it to this lead.');}}catch(e){tell(e.message);}finally{R('preview').disabled=false;}};\nR('save').onclick=async()=>{R('save').disabled=true;try{if(!R('confirm').checked)throw Error('Confirm your source review first.');const d=await api('save',{lead_id:R('lead').value,source:R('source').value,url:R('url').value,excerpt:R('excerpt').value,source_date:R('date').value});tell(d.duplicate?'This research is already saved.':'Research saved to the profile.');reset();await loadRecords();}catch(e){tell(e.message);R('save').disabled=!R('confirm').checked;}};\nR('directorySearch').onclick=async()=>{R('directorySearch').disabled=true;try{const d=await api('mwbe?q='+encodeURIComponent(R('directoryQuery').value));R('directoryResults').innerHTML=d.results.map((r,i)=>'<article><strong>'+esc(r.company)+'</strong><p>'+esc(r.location)+' · '+esc(r.certification)+'</p><p>'+esc(r.description)+'</p><button data-directory=\"'+i+'\">Use as business evidence</button></article>').join('')||'No matching certified businesses found.';R('directoryResults').querySelectorAll('[data-directory]').forEach(b=>b.onclick=()=>{const r=d.results[Number(b.dataset.directory)];R('source').value='mwbe';R('url').value=r.source_url;R('excerpt').value=[r.company,r.location,'Certification: '+r.certification,r.description].join(' | ').slice(0,1500);sourceChanged();tell('Select the matching lead and check this business record before saving.');R('excerpt').focus();});tell(d.coverage);}catch(e){tell(e.message);}finally{R('directorySearch').disabled=false;}};\n(async()=>{try{const [a,b]=await Promise.all([api('catalog'),api('leads?lead_id='+encodeURIComponent(new URLSearchParams(location.search).get('lead_id')||''))]);sources=a.sources;leads=b.leads;R('source').innerHTML=sources.map(s=>'<option value=\"'+s.id+'\">'+esc(s.label)+'</option>').join('');R('lead').innerHTML='<option value=\"\">Choose a lead</option>'+leads.map(l=>'<option value=\"'+esc(l.id)+'\">'+esc([l.first_name,l.last_name].join(' ')+' · '+l.company)+'</option>').join('');const selected=new URLSearchParams(location.search).get('lead_id');if(selected&&leads.some(l=>l.id===selected))R('lead').value=selected;sourceChanged();renderCards();await loadRecords();tell('12 source categories available. Public-page fetch, reviewed excerpts and CSV imports are supported.');}catch(e){tell(e.message);}})();\n</script></body></html>\n";
// Legacy Lead Qualifier metadata is kept separately from the current app score.
export function qualifierMetadata(raw, get) {
  if (raw.qualifier) return raw.qualifier;
  const route = String(get('Route') || '').toUpperCase();
  const legacy = route || get('Age Basis') || get('Pipeline Score') || get('Qualifier Source');
  if (!legacy) return null;
  const number = value => value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const age = number(get('Age Estimate', 'age_estimate'));
  return {
    route: ['SELL','NURTURE','HOLD_UNKNOWN_AGE','DISQUALIFIED','DISQUALIFIED_UNDER_55'].includes(route) ? route : 'HOLD_UNKNOWN_AGE',
    age_estimate: age, age_basis: String(get('Age Basis') || 'UNKNOWN').toUpperCase(),
    maturity_date: String(get('Maturity Date') || ''),
    score: number(get('Pipeline Score', 'score')), tier: String(get('Pipeline Tier', 'tier') || ''),
    asset_estimate: number(get('Asset Estimate')), asset_basis: String(get('Asset Basis') || 'UNKNOWN'),
    dnc_status: String(get('DNC Status') || 'UNSCRUBBED').toUpperCase(),
    source: String(get('Qualifier Source') || 'Lead Qualifier').slice(0, 500),
  };
}

export function qualifierCallReasons(lead) {
  const q = lead.qualifier;
  if (!q) return [];
  const reasons = [];
  if (q.route !== 'SELL') reasons.push('Lead Qualifier: ' + q.route.replaceAll('_', ' ').toLowerCase());
  if (!Number.isFinite(q.age_estimate) || q.age_estimate < 59.5 || q.age_basis !== 'CONFIRMED') reasons.push('Verify age 59½ or older');
  if (q.maturity_date && (!Number.isFinite(Date.parse(q.maturity_date)) || Date.parse(q.maturity_date) > Date.now())) reasons.push('Maturity date has not been reached');
  if (q.dnc_status !== 'CLEAR') reasons.push('Lead Qualifier call screening: ' + q.dnc_status.toLowerCase());
  return reasons;
}

const PAGE_HTML = typeof DISCOVERY_HTML === "string" ? DISCOVERY_HTML : "";
const TEAM = "wealth-management";
const API = "/api/v3/discovery";
const MAX_IMPORT_BYTES = 5_000_000;
const MAX_IMPORT_ROWS = 5_000;
const CRAWLER_AGENT = "WealthLeadDiscoveryBot";
const MAX_CRAWL_PAGES = 12;
const MAX_CRAWL_BYTES = 1_000_000;
const MAX_SOURCE_PAGES_PER_COMPANY = 4;
const MAX_DISCOVERY_EMPLOYERS = 6;
const MAX_MARKET_COMPANIES = 100;
const MAX_MARKET_RADIUS_MILES = 100;
const DEFAULT_MARKET_RADIUS_MILES = 25;
const SOURCE_DISCOVERY_VERSION = 6;
const HIGH_PRIORITY_SHARE = 0.20;
const HIGH_PRIORITY_MINIMUM = 55;
const VERIFIED_TARGET_CATALOG = [
  { company: "Catholic Health Long Island", company_location: "Long Island, NY", regions: ["long island", "nassau", "suffolk"], url: "https://www.catholichealthli.org/about-catholic-health/our-leadership" },
  { company: "Stony Brook Medicine", company_location: "Stony Brook, NY", regions: ["long island", "suffolk", "stony brook"], url: "https://www.stonybrookmedicine.edu/leadership/health-system-leadership", verified_at: "2026-09-03", profiles: [
    { first_name: "William", last_name: "Wertheim", current_title: "Executive Vice President" },
    { first_name: "Todd", last_name: "Griffin", current_title: "Vice President for Clinical Services" },
    { first_name: "Carol", last_name: "Gomes", current_title: "Chief Executive Officer" },
    { first_name: "Gary", last_name: "Bie", current_title: "Chief Financial Officer and Vice President for Health System Finance and Strategy" },
    { first_name: "Jonathan", last_name: "Buscaglia", current_title: "Chief Medical Officer" },
    { first_name: "Carolyn", last_name: "Santora", current_title: "Chief Nursing Officer and Chief of Regulatory Affairs" },
    { first_name: "Gerald", last_name: "Kelly", current_title: "Chief Information Officer" },
    { first_name: "Eric", last_name: "Morley", current_title: "Chief Quality Officer" },
    { first_name: "Colette", last_name: "Brown", current_title: "Chief Human Resources Officer" },
    { first_name: "Nicole", last_name: "Rossol", current_title: "Chief Patient Experience Officer" },
    { first_name: "Patricia", last_name: "Cooper", current_title: "Chief Compliance Officer" },
    { first_name: "Timothy", last_name: "Brown", current_title: "Chief Communications and Marketing Officer" },
    { first_name: "Emily", last_name: "Mastaler", current_title: "Chief Administrative Officer, Stony Brook Southampton Hospital" },
    { first_name: "Paul", last_name: "Connor III", current_title: "Chief Administrative Officer, Stony Brook Eastern Long Island Hospital" },
  ] },
  { company: "PSEG Long Island", company_location: "Long Island, NY", regions: ["long island", "nassau", "suffolk"], url: "https://www.psegliny.com/en/aboutpseglongisland/LeadershipPage" },
  { company: "Henry Schein", company_location: "Melville, NY", regions: ["long island", "melville", "suffolk"], url: "https://www.henryschein.com/us-en/corporate/executive-management.aspx" },
  { company: "Broadridge", company_location: "Lake Success, NY", regions: ["long island", "lake success", "nassau"], url: "https://www.broadridge.com/our-leadership-team", verified_at: "2026-09-03", profiles: [
    { first_name: "Tim", last_name: "Gokey", current_title: "Chief Executive Officer" },
    { first_name: "Chris", last_name: "Perry", current_title: "President" },
    { first_name: "Ashima", last_name: "Ghei", current_title: "Chief Financial Officer" },
    { first_name: "Thomas", last_name: "Carey", current_title: "President, GTO and Global Head of Product & Technology" },
    { first_name: "Doug", last_name: "DeSchutter", current_title: "President, ICS" },
    { first_name: "Michael", last_name: "Tae", current_title: "Group President of Funds, Issuer, and Data-Driven Solutions, ICS" },
    { first_name: "Hope", last_name: "Jarkowski", current_title: "Chief Legal Officer" },
    { first_name: "Tyler", last_name: "Derr", current_title: "Chief Technology Officer" },
    { first_name: "Germán", last_name: "Soto Sanchez", current_title: "Chief Product Officer and Co-President, Digital Assets" },
    { first_name: "Rich", last_name: "Stingi", current_title: "Chief Human Resources Officer" },
    { first_name: "Michael", last_name: "Alexander", current_title: "President, Wealth Management" },
    { first_name: "Naadia", last_name: "Burrows", current_title: "Chief Impact Officer" },
    { first_name: "Matt", last_name: "Connor", current_title: "Chief Operating Officer, Global Technology and Operations" },
    { first_name: "Dan", last_name: "Cwenar", current_title: "President, Data-Driven Fund Solutions" },
    { first_name: "Danielle", last_name: "Gurrieri", current_title: "Chief Product Officer, ICS" },
    { first_name: "Michael", last_name: "Liberatore", current_title: "Chief Financial Officer, GTO" },
    { first_name: "Michael", last_name: "Natoli", current_title: "Chief Client Officer" },
    { first_name: "Swatika", last_name: "Rajaram", current_title: "President, Bank Broker-Dealer" },
    { first_name: "Mike", last_name: "Sleightholme", current_title: "President, Broadridge International" },
    { first_name: "Frank", last_name: "Troise", current_title: "President, Global Capital Markets" },
    { first_name: "Allen", last_name: "Weinberg", current_title: "Chief Growth and Strategy Officer" },
  ] },
  { company: "Dime Community Bank", company_location: "Hauppauge, NY", regions: ["long island", "hauppauge", "suffolk"], url: "https://investors.dime.com/corporate-governance/management/" },
  { company: "Verizon", company_location: "Basking Ridge, NJ", regions: [], source_type: "Official leadership directory", url: "https://www.verizon.com/about/our-company/executive-bios", verified_at: "2026-09-03", profiles: [
    { first_name: "Dan", last_name: "Schulman", current_title: "Chief Executive Officer of Verizon" },
    { first_name: "Kyle", last_name: "Malady", current_title: "Executive Vice President and CEO Verizon Business Group" },
    { first_name: "Leslie", last_name: "Berland", current_title: "Executive Vice President and Chief Marketing Officer" },
    { first_name: "Donna", last_name: "Epps", current_title: "Senior Vice President and Chief Responsible Business Officer" },
    { first_name: "Franz", last_name: "Paasche", current_title: "Executive Vice President, Corporate Affairs" },
    { first_name: "Joe", last_name: "Russo", current_title: "Executive Vice President and President of Global Networks and Technology" },
    { first_name: "Tony", last_name: "Skiadas", current_title: "Executive Vice President and Chief Financial Officer" },
    { first_name: "Vandana", last_name: "Venkatesh", current_title: "Executive Vice President and Chief Legal Officer" },
    { first_name: "Hans", last_name: "Vestberg", current_title: "Special Advisor and Former Chairman and Chief Executive Officer of Verizon Communications" },
    { first_name: "Alfonso", last_name: "Villanueva", current_title: "Executive Vice President and CEO Verizon Consumer Group" },
  ] },
  { company: "Verizon", company_location: "Basking Ridge, NJ", regions: [], source_type: "SEC filing", url: "https://www.sec.gov/Archives/edgar/data/732712/000130817926000210/vz014688_def14a.htm", verified_at: "2026-09-03", profiles: [
    { first_name: "Dan", last_name: "Schulman", current_title: "Chief Executive Officer of Verizon" },
    { first_name: "Tony", last_name: "Skiadas", current_title: "Executive Vice President and Chief Financial Officer" },
    { first_name: "Kyle", last_name: "Malady", current_title: "Executive Vice President and CEO Verizon Business Group" },
    { first_name: "Vandana", last_name: "Venkatesh", current_title: "Executive Vice President and Chief Legal Officer" },
  ] },
  { company: "Verizon", company_location: "Basking Ridge, NJ", regions: [], source_type: "Company newsroom", url: "https://www.verizon.com/about/news/verizon-business-channel-partners-2026", verified_at: "2026-09-03", profiles: [
    { first_name: "Mark", last_name: "Tina", current_title: "Channel Chief and Vice President of Channel", role_start_year: 2026, signals: ["recent_job_change"] },
  ] },
  { company: "Verizon", company_location: "New York, NY", regions: [], source_type: "Leadership announcement", url: "https://www.verizon.com/about/news/verizon-announces-ceo-transition", verified_at: "2026-09-03", profiles: [
    { first_name: "Dan", last_name: "Schulman", current_title: "Chief Executive Officer of Verizon", role_start_year: 2025, former_employers: ["PayPal", "AT&T", "Priceline", "Virgin Mobile", "American Express"], signals: ["recent_job_change"] },
  ] },
  { company: "Verizon", company_location: "Basking Ridge, NJ", regions: [], source_type: "Leadership announcement", url: "https://www.verizon.com/about/news/executive-leadership-transition", verified_at: "2026-09-03", profiles: [
    { first_name: "Alfonso", last_name: "Villanueva", current_title: "Executive Vice President and CEO Verizon Consumer Group", role_start_year: 2026, signals: ["recent_job_change"] },
  ] },
];
const SOURCE_PATH_PATTERN = /(?:leadership|leaders|executive|management|governance|board|officers|team|people|staff|directory|professionals?|experts?|advisors?|agents?|brokers?|attorneys?|physicians?|doctors?|biograph|bio\b|owners?|meet-us|meet-the-team|about-us|our-story|who-we-are|newsroom|press-release|news\/|investor)/i;
const SOURCE_LINK_LABEL_PATTERN = /^(?:(?:meet|get to know)\s+(?:our\s+)?|our\s+)?(?:leadership|leaders|executives?|management(?:\s+team)?|governance|board(?:\s+of\s+directors)?|officers|team|people|staff|directory|professionals|experts|advisors|agents|brokers|attorneys|physicians|doctors|biographies|bios|owners|about\s+us|our\s+story|who\s+we\s+are)$/i;
const PARKED_DOMAIN_HOST_PATTERN = /(?:^|\.)(?:hugedomains\.com|afternic\.com|sedo\.com|sedoparking\.com|dan\.com|bodis\.com|parkingcrew\.net|above\.com|domainmarket\.com)$/i;
const PARKED_DOMAIN_TEXT_PATTERN = /\b(?:domain (?:name )?(?:is )?for sale|buy this domain|purchase this domain|inquire about this domain|this domain may be for sale|premium domain|domain parking|make an offer on this domain)\b/i;
const SOURCE_TYPE_WEIGHTS = {
  "Official leadership directory": 28,
  "Staff directory": 27,
  "Professional directory": 26,
  "Executive biography": 26,
  "Corporate governance": 24,
  "SEC filing": 23,
  "Leadership announcement": 20,
  "Company newsroom": 15,
  "Company website": 8,
};

const FOLLOW_UP_STATUSES = new Set([
  "New", "Researching", "Ready to Contact", "Contacted", "Follow-up",
  "Meeting Set", "Nurture", "Not a Fit",
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const uid = prefix => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const text = (value, limit = 2_000) => String(value ?? "").trim().slice(0, limit);
const lower = value => text(value).toLowerCase();
const array = value => Array.isArray(value) ? value : value ? [value] : [];
const unique = values => [...new Set(values.map(value => text(value)).filter(Boolean))];
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});
const parseJSON = value => {
  try { return JSON.parse(value); } catch { return null; }
};
const normalizedHeader = value => lower(value).replace(/[^a-z0-9]/g, "");
const canonicalLinkedIn = value => {
  const raw = text(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "linkedin.com" || host.endsWith(".linkedin.com")) && ['http:', 'https:'].includes(url.protocol) ? `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}` : '';
  } catch { return raw; }
};

function decodeName(request) {
  const raw = request.headers.get("oai-authenticated-user-full-name") || "";
  if (request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return raw;
}

function requestIdentity(request) {
  const userId = text(request.headers.get("oai-authenticated-user-id"), 200);
  const email = lower(request.headers.get("oai-authenticated-user-email"));
  if (!userId || !email) return null;
  const fullName = text(decodeName(request), 200) || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return { user_id: userId, email, full_name: fullName };
}

async function one(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

async function many(db, sql, ...params) {
  return (await db.prepare(sql).bind(...params).all()).results || [];
}

async function execute(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}

export function resolvedRole(identity, currentRole = "", userCount = 0) {
  if (currentRole === "admin" || currentRole === "advisor") return currentRole;
  return Number(userCount || 0) === 0 ? "admin" : "advisor";
}

export function canManageCampaign(user, createdByUserId) {
  return user.role === "admin" || user.user_id === createdByUserId;
}

async function ensureUser(db, identity) {
  let user = await one(db, "SELECT user_id,email,full_name,role FROM discovery_users WHERE user_id=?", identity.user_id);
  if (!user) {
    await execute(
      db,
      "INSERT INTO discovery_users(user_id,email,full_name,role,last_seen_at) SELECT ?,?,?,CASE WHEN EXISTS(SELECT 1 FROM discovery_users) THEN 'advisor' ELSE 'admin' END,CURRENT_TIMESTAMP ON CONFLICT(user_id) DO NOTHING",
      identity.user_id, identity.email, identity.full_name,
    );
    user = await one(db, "SELECT user_id,email,full_name,role FROM discovery_users WHERE user_id=?", identity.user_id);
  } else {
    const role = resolvedRole(identity, user.role);
    await execute(
      db,
      "UPDATE discovery_users SET email=?,full_name=?,role=?,last_seen_at=CURRENT_TIMESTAMP WHERE user_id=?",
      identity.email, identity.full_name, role, identity.user_id,
    );
    user = { ...user, email: identity.email, full_name: identity.full_name, role };
  }
  return user;
}

function moneyRange(value, basis = "") {
  if (value && typeof value === "object") {
    const lowValue = value.low == null || value.low === "" ? NaN : Number(value.low);
    const highValue = value.high == null || value.high === "" ? NaN : Number(value.high);
    return {
      low: Number.isFinite(lowValue) ? Math.max(0, Math.round(lowValue)) : null,
      high: Number.isFinite(highValue) ? Math.max(0, Math.round(highValue)) : null,
      currency: text(value.currency || "USD", 10), basis: text(value.basis || basis, 200),
    };
  }
  const raw = lower(value).replaceAll(",", "");
  if (!raw) return { low: null, high: null, currency: "USD", basis };
  const nums = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*([kmb])?/g)].map(row => {
    const multiplier = row[2] === "b" ? 1_000_000_000 : row[2] === "m" ? 1_000_000 : row[2] === "k" ? 1_000 : 1;
    return Math.round(Number(row[1]) * multiplier);
  });
  if (!nums.length) return { low: null, high: null, currency: "USD", basis };
  const low = Math.min(...nums), high = Math.max(...nums);
  return { low, high, currency: "USD", basis };
}

function evidence(field, value, source, kind = "reported", confidence = 0.75, sourceUrl = "", snippet = "") {
  const raw = `${field}|${value}|${source}|${sourceUrl}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return {
    id: `ev_${(hash >>> 0).toString(16)}`, field, value: text(value), source: text(source, 200),
    source_url: text(sourceUrl, 500), snippet: text(snippet || value, 1_200), kind,
    confidence: clamp(confidence, 0, 1), observed_at: now(),
  };
}

function titleSeniority(title) {
  const value = lower(title);
  if (/\b(chief|ceo|cfo|coo|cio|cto|cmo|cro)\b/.test(value)) return "C-suite";
  if (/\b(svp|evp|vice president|vp)\b/.test(value)) return "Vice President";
  if (/\b(founder|owner|partner|president)\b/.test(value)) return "Owner / Partner";
  if (/\bdirector\b/.test(value)) return "Director";
  if (/\b(manager|supervisor|team lead|department head)\b/.test(value)) return "Manager";
  return value ? "Professional" : "";
}

function inferredIncome(title, reported) {
  if (reported.low != null || reported.high != null) return reported;
  const seniority = titleSeniority(title);
  if (seniority === "C-suite" || seniority === "Owner / Partner") return { low: 300_000, high: 550_000, currency: "USD", basis: "title compensation model" };
  if (seniority === "Vice President") return { low: 220_000, high: 400_000, currency: "USD", basis: "title compensation model" };
  if (seniority === "Director") return { low: 160_000, high: 300_000, currency: "USD", basis: "title compensation model" };
  if (seniority === "Manager") return { low: 125_000, high: 240_000, currency: "USD", basis: "title compensation model" };
  return { low: 100_000, high: 200_000, currency: "USD", basis: "title compensation model" };
}

function ageRange(graduationYear) {
  const year = Number(graduationYear);
  if (!Number.isInteger(year) || year < 1940 || year > new Date().getUTCFullYear()) return "";
  const current = new Date().getUTCFullYear();
  return `${Math.max(18, current - year + 21)}–${Math.max(18, current - year + 25)}`;
}

function durationYears(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value * 10) / 10);
  const raw = String(value);
  const years = Number(raw.match(/([\d.]+)\s*(?:years?|yrs?)/i)?.[1] || 0);
  const months = Number(raw.match(/([\d.]+)\s*(?:months?|mos?)/i)?.[1] || 0);
  if (years || months) return Math.round((years + months / 12) * 10) / 10;
  const numeric = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 10) / 10 : null;
}

function yearFromValue(value) {
  const match = String(value || "").match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function inferredAssets(income, age, reported) {
  if (reported.low != null || reported.high != null) return reported;
  const high = Number(income.high || income.low || 0);
  const ageLow = Number(String(age).split(/[–-]/)[0]) || 45;
  const factor = ageLow >= 55 ? 6 : ageLow >= 45 ? 4 : 2;
  return {
    low: Math.round(high * Math.max(1, factor - 2)), high: Math.round(high * factor),
    currency: "USD", basis: "income/accumulation model",
  };
}

function signalList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[;,|]/);
  return unique(raw.map(item => lower(item).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")));
}

export function qualifyLead(lead) {
  if(webOnlyLead(lead)){
    if(/model/i.test(lead.estimated_income?.basis||''))lead.estimated_income={low:null,high:null,basis:'Not verified'};
    if(/model/i.test(lead.estimated_assets?.basis||''))lead.estimated_assets={low:null,high:null,basis:'Not verified'};
  }
  const incomeHigh = Number(lead.estimated_income?.high || lead.estimated_income?.low || 0);
  const assetsHigh = Number(lead.estimated_assets?.high || lead.estimated_assets?.low || 0);
  const signals = new Set(lead.signals || []);
  const ageLow = Number(String(lead.estimated_age_range || "").split(/[–-]/)[0]) || 0;
  const incomePoints = incomeHigh >= 300_000 ? 25 : incomeHigh >= 220_000 ? 20 : incomeHigh >= 150_000 ? 12 : incomeHigh > 0 ? 5 : 0;
  const rolloverSignals = ["recent_job_change", "retirement_announcement", "retirement_window", "layoff", "long_tenure"];
  const lifeSignals = ["business_sale", "liquidity_event", "inheritance", "executive_departure", "relocation"];
  const rolloverPoints = rolloverSignals.some(value => signals.has(value)) ? 25 : Number(lead.years_at_company || 0) >= 10 ? 15 : 0;
  const lifePoints = lifeSignals.some(value => signals.has(value)) ? 20 : 0;
  const agePoints = ageLow >= 50 && ageLow <= 70 ? 15 : ageLow >= 45 ? 8 : 0;
  const assetPoints = assetsHigh >= 2_000_000 ? 15 : assetsHigh >= 1_000_000 ? 12 : assetsHigh >= 500_000 ? 8 : 0;
  const score = incomePoints + rolloverPoints + lifePoints + agePoints + assetPoints;
  const timing = lifePoints ? 90 : rolloverPoints === 25 ? 80 : rolloverPoints ? 55 : 10;
  const relationship = clamp((Number(lead.mutual_connections || 0) * 15) + (lead.connection_degree === 1 ? 45 : lead.connection_degree === 2 ? 25 : 0), 0, 100);
  const evidenceRows = array(lead.evidence);
  const confidence = evidenceCoverage(lead);
  const roleStrength = lead.seniority === "C-suite" ? 92 : lead.seniority === "Owner / Partner" ? 90
    : lead.seniority === "Vice President" ? 78 : lead.seniority === "Director" ? 66 : lead.seniority === "Manager" ? 54 : lead.seniority === "Professional" ? 42 : 35;
  const incomeStrength = incomeHigh >= 500_000 ? 100 : incomeHigh >= 350_000 ? 90 : incomeHigh >= 250_000 ? 75 : incomeHigh >= 150_000 ? 55 : incomeHigh > 0 ? 35 : 0;
  const assetStrength = assetsHigh >= 5_000_000 ? 100 : assetsHigh >= 2_000_000 ? 90 : assetsHigh >= 1_000_000 ? 70 : assetsHigh >= 500_000 ? 50 : assetsHigh > 0 ? 30 : 0;
  const wealthStrength = Math.round((incomeStrength + assetStrength) / 2);
  const timingStrength = timing > 10 ? timing : 0;
  const relationshipStrength = relationship > 0 ? relationship : 0;
  const ageStrength = ageLow >= 50 && ageLow <= 70 ? 85 : ageLow >= 45 ? 65 : ageLow > 0 ? 35 : 0;
  const contactability = clamp((lead.email ? 35 : 0) + (lead.phone || lead.business_phone || lead.mobile_phone ? 30 : 0) + (lead.linkedin_url ? 35 : 0), 0, 100);
  const priority = Math.round(roleStrength * 0.30 + wealthStrength * 0.25 + timingStrength * 0.15
    + ageStrength * 0.10 + relationshipStrength * 0.05 + contactability * 0.10 + confidence * 0.05);
  lead.score = score;
  lead.tier = score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : "Watch";
  lead.timing_score = timing;
  lead.relationship_score = relationship;
  lead.priority_score = priority;
  lead.priority_model = "opportunity-v2";
  lead.priority_components = { role: roleStrength, wealth: wealthStrength, timing: timingStrength, age: ageStrength, relationship: relationshipStrength, contactability, confidence };
  lead.score_breakdown = {
    income: { points: incomePoints, maximum: 25, reason: incomePoints >= 20 ? "Senior-role compensation is in the target range." : "Compensation estimate is below the primary target.", evidence_ids: [] },
    rollover: { points: rolloverPoints, maximum: 25, reason: rolloverPoints ? "Employment timing indicates possible assets in motion." : "No current rollover timing signal is recorded.", evidence_ids: [] },
    life_event: { points: lifePoints, maximum: 20, reason: lifePoints ? "A reported liquidity or life event is present." : "No qualifying life event is recorded.", evidence_ids: [] },
    age: { points: agePoints, maximum: 15, reason: agePoints ? "Estimated age is in a retirement-planning window." : "Age evidence does not place the lead in the target window.", evidence_ids: [] },
    assets: { points: assetPoints, maximum: 15, reason: assetPoints ? "Estimated assets meet a target band." : "Assets are unknown or below the target band.", evidence_ids: [] },
  };
  const evidenceFields = {
    income: ["estimated_income", "current_title"], rollover: ["role_start_year", "years_in_current_role", "years_at_company", "signals"],
    life_event: ["signals", "activity"], age: ["estimated_age_range", "graduation_year"], assets: ["estimated_assets", "estimated_income"],
  };
  for (const [name, component] of Object.entries(lead.score_breakdown)) {
    component.evidence_ids = evidenceRows.filter(row => evidenceFields[name].includes(row.field)).slice(0, 3).map(row => row.id);
  }
  lead.confidence = confidence;
  return lead;
}

export function highPriorityLeadIds(leads) {
  const eligible = array(leads).filter(lead => Number(lead.priority_score || 0) >= HIGH_PRIORITY_MINIMUM);
  const count = Math.min(eligible.length, Math.ceil(array(leads).length * HIGH_PRIORITY_SHARE));
  return new Set(eligible.slice().sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0)
    || Number(b.score || 0) - Number(a.score || 0)
    || Number(b.confidence || 0) - Number(a.confidence || 0)
    || String(a.id || "").localeCompare(String(b.id || ""))).slice(0, count).map(lead => lead.id));
}

function field(raw, ...aliases) {
  const entries = Object.entries(raw || {});
  for (const alias of aliases) {
    const target = normalizedHeader(alias);
    const values = entries
      .filter(([key]) => {
        const normalized = normalizedHeader(key);
        return normalized === target || new RegExp(`^${target}duplicate\\d+$`).test(normalized);
      })
      .map(([, value]) => value)
      .filter(value => value != null && text(value));
    if (values.length) return values.at(-1);
  }
  return "";
}

export function normalizeZoomInfoMatchStatus(value) {
  const status = lower(value).replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (status === "person_match" || status === "match" || status === "matched") return "person_match";
  if (status === "match_out_of_scope" || status === "out_of_scope") return "out_of_scope";
  if (status === "no_match" || status === "unmatched") return "no_match";
  return status || "not_submitted";
}

export function normalizeLead(raw, context = {}) {
  const qualifier = qualifierMetadata(raw, (...names) => field(raw, ...names));
  const full = text(field(raw, "Full Name", "Name") || raw.name, 200);
  const first = text(field(raw, "First Name", "FirstName") || raw.first_name || full.split(/\s+/)[0], 100);
  const last = text(field(raw, "Last Name", "LastName") || raw.last_name || full.split(/\s+/).slice(1).join(" "), 100);
  const title = text(field(raw, "Current Title", "Job Title", "Title", "Position") || raw.current_title || raw.job_title, 200);
  const company = text(field(raw, "Company", "Company Name", "Job Company Name") || raw.company || raw.job_company_name, 200);
  const city = text(field(raw, "City", "Person City") || raw.city, 100);
  const state = text(field(raw, "State", "Person State") || raw.state, 100);
  const country = text(field(raw, "Country", "Person Country") || raw.country || "US", 100);
  const location = text(field(raw, "Location", "Person Location") || raw.location || [city, state, country].filter(Boolean).join(", "), 240);
  const graduationYear = Number(field(raw, "Graduation Year", "Education End Year") || raw.graduation_year) || null;
  const reportedIncome = moneyRange(field(raw, "Estimated Income", "Income") || raw.estimated_income, "reported source");
  const income = inferredIncome(title, reportedIncome);
  const estimatedAge = text(field(raw, "Estimated Age Range", "Age Range") || raw.estimated_age_range || (qualifier?.age_estimate != null ? String(qualifier.age_estimate) : ageRange(graduationYear)), 40);
  const reportedAssets = moneyRange(field(raw, "Estimated Assets", "Assets", "Investable Assets") || raw.estimated_assets, "reported source");
  const assets = inferredAssets(income, estimatedAge, reportedAssets);
  const roleStartValue = field(raw, "Role Start Year", "Current Role Start", "Job Start Date", "Start Year") || raw.role_start_year;
  const roleStartYear = yearFromValue(roleStartValue) || null;
  const companyStartValue = field(raw, "Current Company Start", "Company Start Date") || raw.company_start_year;
  const companyStartYear = yearFromValue(companyStartValue) || null;
  const yearsInCurrentRole = durationYears(field(raw, "Years in Current Role", "Current Role Tenure") || raw.years_in_current_role);
  const yearsAtCompany = durationYears(field(raw, "Years at Current Company", "Company Tenure", "Years at Current Employer") || raw.years_at_company)
    ?? (companyStartYear ? Math.max(0, new Date().getUTCFullYear() - companyStartYear) : null);
  const yearsOfExperience = durationYears(field(raw, "Years of Work Experience", "Years of Experience", "Total Experience") || raw.years_of_experience);
  const formerEmployers = unique(Array.isArray(raw.former_employers) ? raw.former_employers : String(field(raw, "Former Employers", "Previous Employers", "Previous Employer") || raw.former_employers || "").split(/[;|]/));
  const previousJobTitle = text(field(raw, "Previous Job Title") || raw.previous_job_title, 200);
  const educationValue = text(field(raw, "Education", "Highest Level of Education") || raw.education, 500);
  const signals = signalList(field(raw, "Signals", "Intent Signals", "Trigger Events") || raw.signals);
  const linkedIn = canonicalLinkedIn(field(raw, "LinkedIn URL", "LinkedIn Contact Profile URL", "Person LinkedIn URL", "Profile URL", "Public Profile URL", "URL") || raw.linkedin_url);
  const emailValue = lower(field(raw, "Email", "Email Address", "Work Email") || raw.email);
  const source = text(context.source || raw.source || "manual import", 100);
  const sourceUrl = text(field(raw, "Source URL") || raw.source_url, 500) || linkedIn;
  const evidenceRows = array(raw.evidence).filter(row => row && row.id);
  for (const [name, value] of [["current_title", title], ["company", company], ["location", location], ["graduation_year", graduationYear]]) {
    if (value) evidenceRows.push(evidence(name, String(value), source, "reported", 0.8, sourceUrl, String(value)));
  }
  if (estimatedAge) evidenceRows.push(evidence("estimated_age_range", estimatedAge, source, graduationYear || qualifier?.age_basis === "INFERRED" ? "inferred" : "reported", graduationYear ? 0.55 : 0.8, sourceUrl));
  if (reportedIncome.low != null || reportedIncome.high != null) evidenceRows.push(evidence("estimated_income", moneyLabel(reportedIncome), source, "reported", 0.8, sourceUrl));
  if (reportedAssets.low != null || reportedAssets.high != null) evidenceRows.push(evidence("estimated_assets", moneyLabel(reportedAssets), source, "reported", 0.8, sourceUrl));
  if (roleStartYear) evidenceRows.push(evidence("role_start_year", String(roleStartYear), source, "reported", 0.8, sourceUrl));
  if (companyStartYear) evidenceRows.push(evidence("company_start_year", String(companyStartYear), source, "reported", 0.8, sourceUrl));
  if (yearsInCurrentRole != null) evidenceRows.push(evidence("years_in_current_role", String(yearsInCurrentRole), source, "reported", 0.8, sourceUrl));
  if (yearsAtCompany != null) evidenceRows.push(evidence("years_at_company", String(yearsAtCompany), source, "reported", 0.8, sourceUrl));
  if (yearsOfExperience != null) evidenceRows.push(evidence("years_of_experience", String(yearsOfExperience), source, "reported", 0.8, sourceUrl));
  if (formerEmployers.length) evidenceRows.push(evidence("former_employers", formerEmployers.join("; "), source, "reported", 0.8, sourceUrl));
  if (previousJobTitle) evidenceRows.push(evidence("previous_job_title", previousJobTitle, source, "reported", 0.8, sourceUrl));
  if (educationValue) evidenceRows.push(evidence("education", educationValue, source, "reported", 0.8, sourceUrl));
  if (signals.length) evidenceRows.push(evidence("signals", signals.join(", "), source, "reported", 0.75, sourceUrl));
  if (income.basis === "title compensation model") evidenceRows.push(evidence("estimated_income", `$${income.low}-$${income.high}`, "title compensation model", "inferred", 0.4));
  if (assets.basis === "income/accumulation model") evidenceRows.push(evidence("estimated_assets", `$${assets.low}-$${assets.high}`, "income/accumulation model", "inferred", 0.35));
  const createdAt = text(raw.created_at || now(), 60);
  const zoomInfoContactId = text(field(raw, "ZoomInfo Contact ID") || raw.zoominfo_contact_id, 160);
  const zoomInfoMatchStatus = normalizeZoomInfoMatchStatus(
    field(raw, "Match status", "Match Status") || raw.zoominfo_match_status || (zoomInfoContactId ? "Person Match" : ""),
  );
  const zoomInfoProfileUrl = text(field(raw, "ZoomInfo Contact Profile URL") || raw.zoominfo_profile_url, 500);
  const zoomInfoCompanyId = text(field(raw, "ZoomInfo Company ID") || raw.zoominfo_company_id, 160);
  const zoomInfoMatchEvidence = {
    name: text(field(raw, "match_insights_person_name", "name_desc_match") || raw.zoominfo_match_evidence?.name, 1_000),
    title: text(field(raw, "match_insights_person_title", "resume_desc_match") || raw.zoominfo_match_evidence?.title, 2_000),
    social_url: text(field(raw, "match_insights_person_social_url", "socialurl_desc_match") || raw.zoominfo_match_evidence?.social_url, 1_000),
  };
  const qualityWarnings = unique(raw.data_quality_warnings || []);
  if (zoomInfoMatchStatus === "no_match") qualityWarnings.push("ZoomInfo ListMatch did not identify this person from the supplied fields.");
  if (zoomInfoMatchStatus === "out_of_scope") qualityWarnings.push("ZoomInfo identified this person, but the record is outside the current subscription data scope.");
  const lead = {
    qualifier,
    imported_dnc: [...new Set([...(raw.imported_dnc || []), ...[["Direct Phone Do Not Call", field(raw,"Direct Phone Number","Phone")],["Mobile Phone Do Not Call",field(raw,"Mobile Phone")]].filter(([key]) => /^(true|yes|1|blocked|dnc)$/i.test(String(field(raw,key)))).map(([,phone]) => String(phone).replace(/\D/g,""))])].filter(Boolean),
    id: text(raw.id || field(raw, "External ID") || uid("lead"), 160),
    team: TEAM, owner_email: lower(context.owner_email || raw.owner_email), shared_with: unique(raw.shared_with || []),
    first_name: first, last_name: last, current_title: title, seniority: text(raw.seniority || titleSeniority(title), 100), company,
    company_domain: text(field(raw, "Company Domain", "Website Domain") || raw.company_domain, 200), company_website: text(field(raw, "Company Website") || raw.company_website, 500),
    company_location: text(field(raw, "Company Location") || raw.company_location, 240),
    city, state, country, location, email: emailValue, phone: text(field(raw, "Phone", "Direct Phone Number") || raw.phone, 80),
    business_phone: text(field(raw, "Business Phone") || raw.business_phone, 80), mobile_phone: text(field(raw, "Mobile Phone") || raw.mobile_phone, 80),
    linkedin_url: linkedIn, profile_urls: unique([linkedIn, ...array(raw.profile_urls)]), graduation_year: graduationYear,
    estimated_age_range: estimatedAge, estimated_income: income, estimated_assets: assets, role_start_year: roleStartYear,
    company_start_year: companyStartYear, years_in_current_role: yearsInCurrentRole,
    years_at_company: yearsAtCompany ?? (roleStartYear ? Math.max(0, new Date().getUTCFullYear() - roleStartYear) : null),
    years_of_experience: yearsOfExperience, education: educationValue,
    previous_job_title: previousJobTitle, former_employers: formerEmployers,
    plan_average_balance: Number(field(raw, "Plan Average Balance") || raw.plan_average_balance) || null,
    signals, activity_signals: array(raw.activity_signals), connection_degree: Number(raw.connection_degree) || null,
    mutual_connections: Number(raw.mutual_connections) || 0, relationship_score: 0, timing_score: 0, priority_score: 0,
    warm_path: text(raw.warm_path, 240), follow_up_status: text(raw.follow_up_status || "New", 80), follow_up_date: raw.follow_up_date || null,
    notes: text(field(raw, "Notes") || raw.notes, 20_000), score: 0, tier: "Watch", confidence: 0, score_breakdown: {},
    identity_status: raw.identity_status === "review" ? "review" : "matched", identity_conflicts: unique(raw.identity_conflicts || []),
    data_quality_warnings: unique(qualityWarnings), evidence: evidenceRows.slice(-200),
    zoominfo_match_status: zoomInfoMatchStatus, zoominfo_contact_id: zoomInfoContactId,
    zoominfo_profile_url: zoomInfoProfileUrl, zoominfo_company_id: zoomInfoCompanyId,
    zoominfo_match_evidence: zoomInfoMatchEvidence,
    zoominfo_matched_at: text(raw.zoominfo_matched_at || (zoomInfoMatchStatus !== "not_submitted" ? now() : ""), 60),
    source_record_ids: {
      ...(raw.source_record_ids || {}),
      ...(zoomInfoContactId ? { zoominfo: zoomInfoContactId } : {}),
      ...(field(raw, "Person ID") ? { provider: text(field(raw, "Person ID"), 160) } : {}),
      ...(field(raw, "External ID") ? { candidate: text(field(raw, "External ID"), 160) } : {}),
    }, source_names: unique([source, ...array(raw.source_names)]),
    campaign_ids: unique([context.campaign_id, ...array(raw.campaign_ids)]), created_at: createdAt, updated_at: now(),
  };
  if (!first || !last || (!emailValue && !linkedIn)) {
    lead.identity_status = "review";
    lead.identity_conflicts = unique([...lead.identity_conflicts, "Identity needs a full name plus email or profile URL before automatic matching."]);
  }
  return qualifyLead(lead);
}

export function parseCSV(source) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value); rows.push(row); row = []; value = ""; }
    else if (char !== "\r") value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const nonempty = rows.filter(values => values.some(item => text(item)));
  if (nonempty.length < 2) return [];
  const headerIndex = nonempty.slice(0, 20).findIndex(values => {
    const names = new Set(values.map(normalizedHeader));
    return names.has("firstname") && names.has("lastname")
      && ["url", "email", "emailaddress", "company", "title", "position"].some(name => names.has(name));
  });
  const start = headerIndex >= 0 ? headerIndex : 0;
  const duplicateCounts = new Map();
  const headers = nonempty[start].map(item => {
    const header = text(item, 200);
    const key = normalizedHeader(header);
    const occurrence = (duplicateCounts.get(key) || 0) + 1;
    duplicateCounts.set(key, occurrence);
    return occurrence === 1 ? header : `${header} duplicate ${occurrence}`;
  });
  return nonempty.slice(start + 1, start + MAX_IMPORT_ROWS + 1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

export function normalizeZoomInfoListMatch(row) {
  const matchStatus = normalizeZoomInfoMatchStatus(field(row, "Match status", "Match Status"));
  return normalizeLead({
    ...row,
    zoominfo_match_status: matchStatus,
    zoominfo_matched_at: now(),
    source_names: ["ZoomInfo ListMatch"],
  }, { source: "ZoomInfo ListMatch" });
}

export function summarizeZoomInfoMatches(leads) {
  const summary = { person_match: 0, out_of_scope: 0, no_match: 0, not_submitted: 0 };
  for (const lead of leads) {
    const status = normalizeZoomInfoMatchStatus(lead.zoominfo_match_status);
    if (Object.prototype.hasOwnProperty.call(summary, status)) summary[status] += 1;
    else summary.not_submitted += 1;
  }
  return summary;
}

export function normalizeLinkedInConnection(row) {
  const connectedOn = text(field(row, "Connected On", "Connected Date"), 80);
  const profileUrl = field(row, "URL", "Profile URL", "Public Profile URL", "LinkedIn URL");
  const relationship = `1st-degree LinkedIn connection${connectedOn ? ` since ${connectedOn}` : ""}`;
  return normalizeLead({
    ...row,
    current_title: field(row, "Position", "Current Title", "Job Title", "Title"),
    linkedin_url: profileUrl,
    connection_degree: 1,
    warm_path: relationship,
    activity_signals: connectedOn ? [{
      id: `connection_${lower(profileUrl || `${field(row, "First Name")}-${field(row, "Last Name")}`).replace(/[^a-z0-9]+/g, "_")}`,
      kind: "connection", text: relationship, occurred_at: connectedOn, source_url: profileUrl,
      activity_type: "connection", confidence: 0.95, recency_score: 25,
    }] : [],
    evidence: [evidence("relationship", relationship, "LinkedIn connections export", "reported", 0.95, profileUrl, relationship)],
  }, { source: "LinkedIn connections export" });
}

function activityKind(value) {
  const body = lower(value);
  if (/retir|stepping down|last day/.test(body)) return "retirement_announcement";
  if (/acqui|sold (the|my|our) (company|business)|private equity|liquidity/.test(body)) return "liquidity_event";
  if (/new role|new position|joined/.test(body)) return "recent_job_change";
  if (/layoff|laid off|reduction in force/.test(body)) return "layoff";
  if (/relocat|moved to/.test(body)) return "relocation";
  return "engagement";
}

export function parseLinkedInSnapshot(source) {
  let payload;
  try { payload = JSON.parse(source); }
  catch {
    const rows = source.split(/\r?\n/).filter(Boolean).map(line => parseJSON(line));
    if (rows.some(row => !row)) throw new HttpError(400, "The LinkedIn snapshot contains invalid JSON.");
    payload = { profiles: rows };
  }
  let profiles;
  if (Array.isArray(payload)) profiles = payload;
  else if (payload.profiles || payload.people || payload.connections) profiles = array(payload.profiles || payload.people || payload.connections);
  else if (payload.linkedin_url && !/linkedin\.com\/company\//i.test(payload.linkedin_url)) profiles = [payload];
  else if (array(payload.employees).length) profiles = array(payload.employees).map(employee => ({
    ...employee,
    current_title: employee.current_title || employee.title || employee.designation,
    company: employee.company || payload.name,
    linkedin_url: employee.linkedin_url,
    location: employee.location || payload.headquarters,
  }));
  else profiles = [];
  const results = profiles.map(profile => {
    const experience = array(profile.experiences || profile.experience || profile.positions);
    const current = experience.find(item => item.current || item.is_current) || experience[0] || {};
    const education = array(profile.educations || profile.education);
    const endYear = education.map(item => Number(String(item.end_date || item.end_year || item.to_date || "").match(/\b(19|20)\d{2}\b/)?.[0])).filter(Boolean).sort()[0];
    const educationSummary = education.map(item => [item.institution_name || item.school_name || item.school, item.degree].filter(Boolean).join(" · ")).filter(Boolean).join("; ");
    const startYears = experience.map(item => Number(String(item.start_date || item.start_year || item.from_date || "").match(/\b(19|20)\d{2}\b/)?.[0])).filter(Boolean);
    const earliestStart = startYears.length ? Math.min(...startYears) : null;
    const currentCompany = current.company_name || current.institution_name || current.company?.name;
    const sameCompanyYears = experience.filter(item => lower(item.company_name || item.institution_name || item.company?.name) === lower(currentCompany)).map(item => Number(String(item.start_date || item.start_year || item.from_date || "").match(/\b(19|20)\d{2}\b/)?.[0])).filter(Boolean);
    const companyStartYear = sameCompanyYears.length ? Math.min(...sameCompanyYears) : null;
    const previous = experience.find(item => item !== current) || {};
    const contacts = array(profile.contacts);
    const contact = type => contacts.find(item => lower(item.type).includes(type))?.value || "";
    return normalizeLead({
      ...profile, id: profile.profile_id || profile.id, name: profile.name || profile.full_name,
      current_title: profile.current_title || profile.title || profile.designation || current.title || current.position_title,
      company: profile.company || currentCompany,
      location: profile.location || current.location, linkedin_url: profile.linkedin_url || profile.profile_url,
      email: profile.email || contact("email"), phone: profile.phone || contact("phone"), notes: profile.notes || profile.about,
      graduation_year: profile.graduation_year || endYear,
      role_start_year: profile.role_start_year || Number(String(current.start_date || current.start_year || current.from_date || "").match(/\b(19|20)\d{2}\b/)?.[0]),
      company_start_year: profile.company_start_year || companyStartYear,
      years_of_experience: profile.years_of_experience ?? (earliestStart ? Math.max(0, new Date().getUTCFullYear() - earliestStart) : null),
      education: profile.education_summary || educationSummary,
      previous_job_title: profile.previous_job_title || previous.title || previous.position_title,
      former_employers: experience.filter(item => item !== current).map(item => item.company_name || item.institution_name || item.company?.name).filter(Boolean).join(";"),
      signals: profile.open_to_work ? ["open_to_work"] : profile.signals,
    }, { source: "LinkedIn snapshot" });
  });
  for (const activity of array(payload.activities)) {
    const author = activity.author || {};
    const name = activity.author_name || author.name || activity.name;
    if (!name) continue;
    const body = text(activity.text || activity.content, 1_500);
    const kind = activityKind(body);
    const occurred = text(activity.occurred_at || activity.posted_date || activity.observed_at, 80);
    const profileUrl = author.linkedin_url || activity.author_url || activity.linkedin_url;
    const lead = normalizeLead({
      id: author.profile_id || activity.profile_id || "", name, linkedin_url: profileUrl,
      signals: kind === "engagement" ? [] : [kind],
      activity_signals: [{ id: text(activity.activity_id || uid("activity"), 160), kind, text: body, occurred_at: occurred, source_url: text(activity.post_url, 500), context: text(activity.parent_post?.text, 1_500), activity_type: text(activity.kind || "post", 30), confidence: 0.75, recency_score: kind === "engagement" ? 35 : 80 }],
    }, { source: "LinkedIn activity" });
    results.push(lead);
  }
  return results.slice(0, MAX_IMPORT_ROWS);
}

export function identityKeys(lead) {
  const keys = [];
  if (lead.email) keys.push(`email:${lower(lead.email)}`);
  if (lead.linkedin_url) keys.push(`linkedin:${lower(canonicalLinkedIn(lead.linkedin_url))}`);
  for (const [provider, id] of Object.entries(lead.source_record_ids || {})) if (text(id)) keys.push(`${lower(provider)}:${lower(id)}`);
  if (lead.first_name && lead.last_name && lead.company) keys.push(`person:${lower(`${lead.first_name}|${lead.last_name}|${lead.company}`)}`);
  if (lead.id) keys.push(`id:${lead.id}`);
  return unique(keys);
}

export function mergeLead(existing, incoming) {
  const workflow = {
    id: existing.id, owner_email: existing.owner_email, shared_with: existing.shared_with,
    follow_up_status: existing.follow_up_status, follow_up_date: existing.follow_up_date,
    notes: existing.notes, created_at: existing.created_at,
  };
  const merged = { ...existing };
  const isZoomInfoSource = lead => array(lead.source_names).some(source => source === "ZoomInfo CSV" || source === "ZoomInfo ListMatch");
  const existingZoomInfo = isZoomInfoSource(existing);
  const incomingZoomInfo = isZoomInfoSource(incoming);
  const authoritativeFields = new Set(["first_name", "last_name", "current_title", "company", "company_domain", "company_website", "company_location", "city", "state", "country", "location", "email", "phone", "business_phone", "mobile_phone", "linkedin_url", "graduation_year", "estimated_age_range", "estimated_income", "estimated_assets", "role_start_year", "company_start_year", "years_in_current_role", "years_at_company", "years_of_experience", "education", "former_employers", "previous_job_title", "zoominfo_match_status", "zoominfo_contact_id", "zoominfo_profile_url", "zoominfo_company_id", "zoominfo_match_evidence", "zoominfo_matched_at"]);
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) continue;
    if (existingZoomInfo && !incomingZoomInfo && authoritativeFields.has(key) && existing[key] != null && existing[key] !== "") continue;
    merged[key] = value;
  }
  Object.assign(merged, workflow);
  merged.evidence = [...new Map([...array(existing.evidence), ...array(incoming.evidence)].map(row => [row.id, row])).values()].slice(-200);
  merged.activity_signals = [...new Map([...array(existing.activity_signals), ...array(incoming.activity_signals)].map(row => [row.id, row])).values()].slice(-100);
  merged.signals = unique([...array(existing.signals), ...array(incoming.signals)]);
  merged.source_names = unique([...array(existing.source_names), ...array(incoming.source_names)]);
  merged.campaign_ids = unique([...array(existing.campaign_ids), ...array(incoming.campaign_ids)]);
  merged.profile_urls = unique([...array(existing.profile_urls), ...array(incoming.profile_urls)]);
  merged.former_employers = unique([...array(existing.former_employers), ...array(incoming.former_employers)]);
  merged.source_record_ids = { ...(existing.source_record_ids || {}), ...(incoming.source_record_ids || {}) };
  merged.identity_conflicts = unique([...array(existing.identity_conflicts), ...array(incoming.identity_conflicts)]);
  merged.data_quality_warnings = unique([...array(existing.data_quality_warnings), ...array(incoming.data_quality_warnings)]);
  if (existing.identity_status === "matched" && !array(incoming.identity_conflicts).some(value => String(value).startsWith("Different identifiers"))) merged.identity_status = "matched";
  merged.imported_dnc = unique([...(existing.imported_dnc || []), ...(incoming.imported_dnc || [])]);
  if (existing.qualifier && incoming.qualifier) merged.qualifier = {...incoming.qualifier, dnc_status: existing.qualifier.dnc_status === "BLOCKED" || incoming.qualifier.dnc_status === "BLOCKED" ? "BLOCKED" : incoming.qualifier.dnc_status};
  merged.updated_at = now();
  return qualifyLead(merged);
}

async function audit(db, user, action, recordType, recordId, detail = "") {
  await execute(db, "INSERT INTO discovery_audit(team,actor_user_id,actor_email,action,record_type,record_id,detail) VALUES(?,?,?,?,?,?,?)", TEAM, user.user_id, user.email, action, recordType, recordId, text(detail, 1_000));
}

async function allLeadRows(db) {
  return many(db, "SELECT id,owner_user_id,owner_email,payload,created_at,updated_at FROM discovery_leads WHERE team=? ORDER BY updated_at DESC", TEAM);
}

function canReadLead(row, lead, user) {
  return user.role === "admin" || row.owner_user_id === user.user_id || lower(row.owner_email) === lower(user.email) || array(lead.shared_with).map(lower).includes(lower(user.email));
}

function leadFromRow(row) {
  const lead = row ? parseJSON(row.payload) : null;
  if (lead) lead.id = row.id;
  return lead;
}

async function visibleLeadRows(db, user) {
  return (await allLeadRows(db)).map(row => {
    const lead = leadFromRow(row);
    return { row, lead: lead ? qualifyLead(lead) : null };
  }).filter(item => item.lead && isUsableStoredLead(item.lead) && canReadLead(item.row, item.lead, user));
}

async function saveCandidates(db, user, candidates, campaignId = "") {
  const current = await allLeadRows(db);
  const byKey = new Map();
  current.forEach(row => {
    const lead = leadFromRow(row);
    if (lead) for (const key of identityKeys(lead)) byKey.set(key, { row, lead });
  });
  let saved = 0, duplicates = 0, rejected = 0;
  for (const sourceLead of candidates.slice(0, MAX_IMPORT_ROWS)) {
    const incoming = normalizeLead(sourceLead, { source: sourceLead.source_names?.[0] || "import", owner_email: user.email, campaign_id: campaignId });
    if (!isUsableStoredLead(incoming)) {
      rejected += 1;
      continue;
    }
    const keys = identityKeys(incoming);
    const matches = unique(keys.map(key => byKey.get(key)?.row?.id).filter(Boolean));
    const match = keys.map(key => byKey.get(key)).find(Boolean);
    if (matches.length > 1) {
      incoming.identity_status = "review";
      incoming.identity_conflicts = unique([...incoming.identity_conflicts, "Different identifiers match multiple existing prospects; review before consolidating."]);
    }
    if (match) {
      const merged = mergeLead(match.lead, incoming);
      await execute(db, "UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=?", JSON.stringify(merged), match.row.id, TEAM);
      for (const identity of identityKeys(merged)) byKey.set(identity, { row: match.row, lead: merged });
      duplicates += 1;
    } else {
      incoming.id = incoming.id || uid("lead");
      await execute(db, "INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)", incoming.id, TEAM, user.user_id, user.email, JSON.stringify(incoming));
      for (const identity of identityKeys(incoming)) byKey.set(identity, { row: { id: incoming.id, owner_user_id: user.user_id, owner_email: user.email }, lead: incoming });
      saved += 1;
    }
  }
  return { saved, duplicates, rejected };
}

function isUnsafeHostname(hostname) {
  const host = lower(hostname).replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal") || !host.includes(".") || host.includes(":")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value))) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

export function safeTargetUrl(value) {
  try {
    const url = new URL(text(value, 1_000).includes("://") ? text(value, 1_000) : `https://${text(value, 1_000)}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isUnsafeHostname(url.hostname)) return null;
    url.hash = "";
    return url;
  } catch { return null; }
}

function restrictedCrawlReason(url) {
  const host = lower(url?.hostname);
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "LinkedIn page content cannot be crawled. Company URLs are accepted as identity hints for official-source discovery; import a LinkedIn snapshot for LinkedIn-only profile and activity data.";
  return "";
}

export function linkedInCompanyHint(value) {
  const url = safeTargetUrl(value);
  if (!url || !restrictedCrawlReason(url)) return "";
  const parts = url.pathname.split("/").filter(Boolean);
  const companyIndex = parts.findIndex(part => lower(part) === "company");
  if (companyIndex < 0 || !parts[companyIndex + 1]) return "";
  let slug = "";
  try { slug = decodeURIComponent(parts[companyIndex + 1]); } catch { slug = parts[companyIndex + 1]; }
  const slugKey = lower(slug).replace(/[^a-z0-9]/g, "");
  if (!slugKey) return "";
  const catalogMatch = unique(VERIFIED_TARGET_CATALOG.map(entry => entry.company)).find(company => {
    const companyKey = lower(company).replace(/[^a-z0-9]/g, "");
    return companyKey.length >= 3 && (slugKey.includes(companyKey) || companyKey.includes(slugKey));
  });
  if (catalogMatch) return catalogMatch;
  return slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase()).slice(0, 200);
}

function htmlText(value) {
  return String(value ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&mdash;|&#8212;/gi, "—").replace(/&ndash;|&#8211;/gi, "–")
    .replace(/\s+/g, " ").trim().slice(0, 10_000);
}

function jsonLdPeople(value, output = []) {
  if (Array.isArray(value)) for (const item of value) jsonLdPeople(item, output);
  else if (value && typeof value === "object") {
    const types = array(value["@type"]).map(lower);
    if (types.includes("person")) output.push(value);
    if (value.mainEntity) jsonLdPeople(value.mainEntity, output);
    if (value["@graph"]) jsonLdPeople(value["@graph"], output);
    if (value.employee) jsonLdPeople(value.employee, output);
    if (value.member) jsonLdPeople(value.member, output);
  }
  return output;
}

function organizationName(value, fallback = "") {
  if (typeof value === "string") return text(value, 200);
  return text(value?.name || fallback, 200);
}

function addressLabel(value) {
  if (typeof value === "string") return text(value, 240);
  return text([value?.addressLocality, value?.addressRegion, value?.addressCountry].filter(Boolean).join(", "), 240);
}

const LEADERSHIP_TITLE_PATTERN = /\b(?:chief|ceo|cfo|coo|cio|cto|president|vice president|vp|director|founder|owner|partner|head of|managing director|executive vice president|senior vice president)\b/i;
const MARKET_DECISION_MAKER_PATTERN = /\b(?:chief|ceo|cfo|coo|cio|cto|president|vice president|vp|director|founder|co-founder|owner|partner|principal|head of|managing director|general manager|operations manager|office manager|project manager)\b/i;
const ROLE_NAME_WORD_PATTERN = /\b(?:chief|ceo|cfo|coo|cio|cto|president|vice|executive|senior|director|officer|advisor|founder|owner|partner|manager|supervisor|estimator|engineer|attorney|physician|doctor|accountant|architect|project|management|leadership|board|team|company|business|group|public|sector|connect|mobile|online|support|solutions|network|technology|consumer|corporate|resources|contact|about|meet|our|free|estimate|client|customer|testimonial|testimonials|read|more|review|reviews|view|learn|request|electric|electrical|solar|electricians?|mechanics?|technicians?|contractors?|services?|inc|llc|corp|corporation)\b/i;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function targetRolePattern(campaign = {}) {
  const titles = unique(campaign.titles || []).map(value => text(value, 100)).filter(Boolean);
  const seniorities = array(campaign.seniorities).map(lower);
  const parts = titles.map(value => escapeRegex(value).replace(/\s+/g, "\\s+"));
  const add = pattern => { if (!parts.includes(pattern)) parts.push(pattern); };
  if (seniorities.some(value => /c[- ]?suite|chief|executive/.test(value))) add("chief|ceo|cfo|coo|cio|cto|cmo|cro");
  if (seniorities.some(value => /owner|partner|founder|president/.test(value))) add("owner|partner|founder|president");
  if (seniorities.some(value => /vice president|\bvp\b|svp|evp/.test(value))) add("vice\\s+president|vp|svp|evp");
  if (seniorities.some(value => /director/.test(value))) add("director");
  if (seniorities.some(value => /manager|supervisor|lead/.test(value))) add("manager|supervisor|team\\s+lead|department\\s+head");
  if (parts.length) return new RegExp(`\\b(?:${parts.join("|")})\\b`, "i");
  if (!array(campaign.industries).length) return LEADERSHIP_TITLE_PATTERN;
  const industry = lower(array(campaign.industries).join(" "));
  const marketParts = [MARKET_DECISION_MAKER_PATTERN.source];
  if (/electric|construction|contractor|builder|architect|engineer|manufactur/.test(industry)) marketParts.push("estimator|master\\s+electrician|superintendent|foreman|project\\s+coordinator|engineer|architect");
  if (/legal|law|attorney/.test(industry)) marketParts.push("attorney|counsel|lawyer");
  if (/medical|health|physician|doctor|dental|dentist|veterinar/.test(industry)) marketParts.push("physician|doctor|dentist|veterinarian|practice\\s+administrator");
  if (/account|cpa|tax|insurance|real estate|realtor|broker/.test(industry)) marketParts.push("accountant|cpa|tax\\s+advisor|broker|agent|advisor");
  return new RegExp(`\\b(?:${marketParts.join("|")})\\b`, "i");
}

function isLikelyPersonName(value) {
  if (/\b(?:other|boards|committees|members|directors|officers|overview|biography|biographies|governance|investor|investors|relations|news|events)\b/i.test(value)) return false;
  const name = text(value, 120);
  return /^[A-Z][A-Za-z'’.-]+(?:\s+(?:[A-Z][A-Za-z'’.-]+|(?:de|da|del|di|du|la|le|van|von))){1,4}$/.test(name)
    && !/^[A-Z\s.'’-]+$/.test(name) && !ROLE_NAME_WORD_PATTERN.test(name);
}

export function isUsableStoredLead(lead) {
  if (!lead) return false;
  const sources = array(lead.source_names).map(lower);
  if (sources.some(source => /\b(?:demo|demonstration|sample data)\b/.test(source))) return false;
  const publicWebGenerated = sources.includes("public website");
  const hasIndependentIdentitySource = sources.some(source => /zoominfo|linkedin|csv|manual|user import/.test(source));
  if (!publicWebGenerated || hasIndependentIdentitySource) return true;
  return isLikelyPersonName([lead.first_name, lead.last_name].filter(Boolean).join(" ")) && knownCompany(lead.company) && Boolean(lead.current_title) && !historicalTitle(lead.current_title);
}

function publicWebCandidate(name, title, company, pageUrl, confidence, snippet) {
  return {
    name, current_title: title, company, source_url: pageUrl, source_names: ["Public website"],
    evidence: [evidence("current_title", title, "Public website", "reported", confidence, pageUrl, snippet)],
  };
}

function cleanExtractedTitle(value) {
  return text(value, 200)
    .replace(/^our\s+team\s*[–—-]\s*/i, "")
    .replace(/^get\s+to\s+know\s+our\s+/i, "")
    .replace(/\s+/g, " ").trim();
}

export function parsePublicWebPage(html, pageUrl, fallbackCompany = "", campaign = {}) {
  const rolePattern = targetRolePattern(campaign);
  const candidates = [];
  for (const match of String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const parsed = parseJSON(match[1].trim());
    for (const person of jsonLdPeople(parsed)) {
      const name = text(person.name, 200), title = text(person.jobTitle || person.description, 200);
      if (!name || !title) continue;
      const sameAs = array(person.sameAs).map(String);
      const linkedIn = sameAs.find(url => /linkedin\.com\/in\//i.test(url)) || "";
      candidates.push({
        name, current_title: title, company: organizationName(person.worksFor || person.affiliation, fallbackCompany),
        location: addressLabel(person.address), email: text(person.email, 254).replace(/^mailto:/i, ""),
        phone: text(person.telephone, 80),
        linkedin_url: linkedIn, profile_urls: unique([person.url, ...sameAs]), source_url: pageUrl,
        source_names: ["Public website"], evidence: [evidence("current_title", title, "Public website", "reported", 0.86, pageUrl, `${name} — ${title}`)],
      });
    }
  }
  const labels = [...String(html || "").matchAll(/<(?:h1|h2|h3|h4|p|a)\b[^>]*>([\s\S]{1,500}?)<\/(?:h1|h2|h3|h4|p|a)>/gi)]
    .map(match => htmlText(match[1])).filter(label => label && label.length <= 180);
  for (let index = 0; index < labels.length; index += 1) {
    const name = labels[index];
    if (!isLikelyPersonName(name)) continue;
    const nearby = [labels[index + 1]].filter(Boolean);
    const title = nearby.find(label => label.length <= 160 && rolePattern.test(label));
    if (!title) continue;
    candidates.push(publicWebCandidate(name, title, fallbackCompany, pageUrl, 0.72, `${name} — ${title}`));
  }
  const narrative = htmlText(html);
  const namedRolePatterns = [
    /\b([A-Z][A-Za-z'’-]+(?:\s+(?:[A-Z][A-Za-z'’-]+|[A-Z]\.)){1,3})\s*(?:is|serves as|is the|serves as the|,\s*(?:the\s+)?)\s*(?:(?:a|an|the|our)\s+)?(?:(?:key|senior|lead)\s+)?((?:[Cc]o-)?[Ff]ounder|[Oo]wner|[Pp]resident|[Pp]rincipal|[Pp]artner|CEO|CFO|COO|CIO|CTO|[Cc]hief [A-Za-z -]+ [Oo]fficer|[Gg]eneral [Mm]anager|[Oo]perations [Mm]anager|[Oo]ffice [Mm]anager|[Pp]roject [Mm]anager|[Pp]roject [Cc]oordinator|[Ee]stimator|[Mm]aster [Ee]lectrician|[Ss]uperintendent|[Ff]oreman|[Dd]irector)\b/g,
    /\b((?:[Cc]o-)?[Ff]ounder|[Oo]wner|[Pp]resident|[Pp]rincipal|[Pp]artner|CEO|CFO|COO|CIO|CTO|[Cc]hief [A-Za-z -]+ [Oo]fficer|[Gg]eneral [Mm]anager|[Oo]perations [Mm]anager|[Oo]ffice [Mm]anager|[Pp]roject [Mm]anager|[Pp]roject [Cc]oordinator|[Ee]stimator|[Mm]aster [Ee]lectrician|[Ss]uperintendent|[Ff]oreman|[Dd]irector)\s*[:—-]\s*([A-Z][A-Za-z'’-]+(?:\s+(?:[A-Z][A-Za-z'’-]+|[A-Z]\.)){1,3})\b/g,
    /\b(?:[Ff]ounded|[Oo]wned|[Oo]perated|[Mm]anaged|[Ll]ed)\s+by\s+([A-Z][A-Za-z'’-]+(?:\s+(?:[A-Z][A-Za-z'’-]+|[A-Z]\.)){1,3})\b/g,
  ];
  for (const [patternIndex, pattern] of namedRolePatterns.entries()) {
    for (const match of narrative.matchAll(pattern)) {
      if (patternIndex !== 0 || !/\b(?:is|serves as)\b/i.test(match[0])) continue;
      const name = patternIndex === 1 ? match[2] : match[1];
      const title = patternIndex === 0 ? match[2] : patternIndex === 1 ? match[1] : /founded/i.test(match[0]) ? "Founder" : /owned/i.test(match[0]) ? "Owner" : "General Manager";
      if (!isLikelyPersonName(name) || !rolePattern.test(title)) continue;
      candidates.push(publicWebCandidate(name, title.replace(/\b\w/g, char => char.toUpperCase()), fallbackCompany, pageUrl, 0.66, match[0]));
    }
  }
  const byPerson = new Map();
  for (const candidate of candidates) {
    candidate.current_title = cleanExtractedTitle(candidate.current_title);
    candidate.evidence = array(candidate.evidence).map(row => row.field === "current_title" ? { ...row, value: candidate.current_title } : row);
    if (!isLikelyPersonName(candidate.name) || !knownCompany(candidate.company) || historicalTitle(candidate.current_title) || !rolePattern.test(candidate.current_title)) continue;
    const key = `${lower(candidate.name)}|${lower(candidate.company)}`;
    const existing = byPerson.get(key);
    const confidence = Number(candidate.evidence?.[0]?.confidence || 0);
    const existingConfidence = Number(existing?.evidence?.[0]?.confidence || 0);
    if (!existing || confidence > existingConfidence || (confidence === existingConfidence && candidate.current_title.length < existing.current_title.length)) byPerson.set(key, candidate);
  }
  return [...byPerson.values()].slice(0, 100);
}

export async function readLimitedResponse(response, maxBytes = MAX_CRAWL_BYTES) {
  const message = 'response exceeds ' + Math.round(maxBytes / 1024 / 1024) + ' MB limit';
  if (Number(response.headers.get('content-length') || 0) > maxBytes) { await discardResponse(response); throw new Error(message); }
  if (!response.body) return '';
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error(message); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { merged.set(chunk,offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function discardResponse(response) {
  try { await response?.body?.cancel(); } catch { /* response may already be locked or closed */ }
}

async function mapInBatches(values, size, mapper) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(...await Promise.all(values.slice(index, index + size).map(mapper)));
  }
  return output;
}

export async function fetchPublicPage(target, timeoutMs = 10_000) {
  const deadline = AbortSignal.timeout(timeoutMs);
  let url = safeTargetUrl(target);
  if (!url) throw new Error("unsafe or invalid URL");
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(url, { redirect: "manual", signal: deadline, headers: { "user-agent": `${CRAWLER_AGENT}/1.0`, accept: "text/html,application/xhtml+xml,text/plain;q=0.8" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location") || "";
      await discardResponse(response);
      const next = safeTargetUrl(new URL(location, url).href);
      if (!next) throw new Error("redirected to an unsafe URL"); url = next; continue;
    }
    if (!response.ok) { await discardResponse(response); throw new Error(`HTTP ${response.status}`); }
    if (!/text\/html|application\/xhtml\+xml|application\/xml|text\/xml|text\/plain/i.test(response.headers.get("content-type") || "text/html")) {
      await discardResponse(response); throw new Error("not an HTML or XML page");
    }
    return { url: url.href, html: await readLimitedResponse(response) };
  }
  throw new Error("too many redirects");
}

function robotsAllowed(robots, path) {
  if (!robots) return true;
  let active = false, best = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); const index = line.indexOf(":"); if (index < 0) continue;
    const key = lower(line.slice(0, index)), value = line.slice(index + 1).trim();
    if (key === "user-agent") active = value === "*" || lower(value) === lower(CRAWLER_AGENT);
    else if (active && (key === "allow" || key === "disallow") && value && path.startsWith(value.replace(/\*.*$/, ""))) {
      if (!best || value.length >= best.length) best = { allowed: key === "allow", length: value.length };
    }
  }
  return best ? best.allowed : true;
}

function sourceTypeForUrl(value, label = "") {
  const declared = Object.keys(SOURCE_TYPE_WEIGHTS).find(type => lower(type) === lower(label));
  if (declared) return declared;
  const haystack = lower(`${value} ${label}`);
  if (/sec\.gov\/archives|def14a|10-k|8-k/.test(haystack)) return "SEC filing";
  if (/governance|board-of-directors|board\/|officers|management\/?$/.test(haystack)) return "Corporate governance";
  if (/executive-bio|executive_bio|biograph|\/bio\//.test(haystack)) return "Executive biography";
  if (/appoint|named-|joins-|transition|promot|new-(?:ceo|cfo|president)|leadership-change/.test(haystack)) return "Leadership announcement";
  if (/newsroom|press-release|\/news\//.test(haystack)) return "Company newsroom";
  if (/staff|employee-directory|staff-directory|directory/.test(haystack)) return "Staff directory";
  if (/professionals?|experts?|advisors?|agents?|brokers?|attorneys?|physicians?|doctors?/.test(haystack)) return "Professional directory";
  if (/leadership|leaders|executive|management|team|people/.test(haystack)) return "Official leadership directory";
  return "Company website";
}

function sourceScore(value, label = "", method = "") {
  const type = sourceTypeForUrl(value, label);
  let score = SOURCE_TYPE_WEIGHTS[type] || 0;
  if (method === "catalog") score += 70;
  else if (method === "manual") score += 65;
  else if (method === "site_link") score += 58;
  else if (method === "sitemap") score += 52;
  else if (method === "market_directory") score += 40;
  else if (method === "site_home") score += 24;
  else if (method === "path_probe") score += 30;
  if (/leadership|executive-bios?|management-team|our-team|our-people|staff|directory|professionals?|experts?/i.test(`${value} ${label}`)) score += 12;
  if (/tag|category|search|author|privacy|careers|job/i.test(value)) score -= 25;
  return score;
}

function domainRoot(hostname) {
  const parts = lower(hostname).replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const suffix = parts.slice(-2).join(".");
  if (["co.uk", "org.uk", "com.au", "com.br", "co.jp"].includes(suffix)) return parts.slice(-3).join(".");
  return suffix;
}

function sameOrganizationHost(left, right) {
  return domainRoot(left) === domainRoot(right);
}

export function sourceLinksFromDocument(document, baseUrl) {
  const base = safeTargetUrl(baseUrl);
  if (!base) return [];
  const links = [];
  for (const match of String(document || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,6000}?)<\/a>/gi)) {
    try {
      const target = safeTargetUrl(new URL(match[1], base).href);
      if (!target || !sameOrganizationHost(target.hostname, base.hostname)) continue;
      const label = htmlText(match[2]);
      if (!SOURCE_PATH_PATTERN.test(target.pathname) && !SOURCE_LINK_LABEL_PATTERN.test(label)) continue;
      links.push({ url: target.href, label, method: "site_link" });
    } catch { /* ignore malformed links */ }
  }
  for (const match of String(document || "").matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
    const target = safeTargetUrl(match[1]);
    if (!target || !sameOrganizationHost(target.hostname, base.hostname) || !SOURCE_PATH_PATTERN.test(target.pathname)) continue;
    links.push({ url: target.href, label: "Sitemap result", method: "sitemap" });
  }
  const byUrl = new Map();
  for (const link of links) {
    const key = catalogTargetKey(link.url);
    const existing = byUrl.get(key);
    if (!existing || sourceScore(link.url, link.label, link.method) > sourceScore(existing.url, existing.label, existing.method)) byUrl.set(key, link);
  }
  return [...byUrl.values()].sort((a, b) => sourceScore(b.url, b.label, b.method) - sourceScore(a.url, a.label, a.method));
}

function robotsSitemaps(robots, origin) {
  const found = [];
  for (const line of String(robots || "").split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (!match) continue;
    const url = safeTargetUrl(match[1]);
    if (url && sameOrganizationHost(url.hostname, new URL(origin).hostname)) found.push(url.href);
  }
  return unique(found).slice(0, 2);
}

function companySearchTokens(company) {
  const ignored = new Set(["the", "and", "of", "inc", "incorporated", "corp", "corporation", "company", "co", "llc", "ltd", "group", "holdings", "services", "business", "usa", "us"]);
  return lower(company).replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(token => token.length >= 3 && !ignored.has(token));
}

function companyIdentityKey(company) {
  return companySearchTokens(company).join("") || lower(company).replace(/[^a-z0-9]/g, "");
}

export function parkedDomainPage(pageUrl, document = "") {
  const parsed = safeTargetUrl(pageUrl);
  if (!parsed) return true;
  return PARKED_DOMAIN_HOST_PATTERN.test(parsed.hostname) || PARKED_DOMAIN_TEXT_PATTERN.test(htmlText(document).slice(0, 12_000));
}

function likelyCompanyPage(document, company, pageUrl = "") {
  if (parkedDomainPage(pageUrl, document)) return false;
  const body = lower(htmlText(document));
  const tokens = companySearchTokens(company);
  return !tokens.length || tokens.some(token => body.includes(token));
}

function marketIndustrySpec(industries) {
 const result=resolveCategories(industries);
 if(result.unmatched.length) console.warn(JSON.stringify({event:'unmapped_business_terms',terms:result.unmatched.map(t=>t.slice(0,120))}));
 return result;
}

async function geocodeMarketLocation(location) {
  const locationText = text(location, 200);
  const zip = locationText.match(/^\d{5}(?:-\d{4})?$/)?.[0];
  const url = zip
    ? `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=us&postalcode=${encodeURIComponent(zip)}`
    : `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(locationText)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(6_000),
    headers: { "user-agent": `${CRAWLER_AGENT}/2.1 (https://wealth-lead-workspace.treads77.chatgpt.site)`, referer: "https://wealth-lead-workspace.treads77.chatgpt.site/", accept: "application/json", "accept-language": "en-US,en;q=0.8" },
  });
  if (!response.ok) { await discardResponse(response); throw new Error(`location lookup returned HTTP ${response.status}`); }
  const place = array(JSON.parse(await readLimitedResponse(response, 4 * 1024 * 1024)))[0];
  const bounds = array(place?.boundingbox).map(Number);
  if (bounds.length !== 4 || bounds.some(value => !Number.isFinite(value))) throw new Error(`location “${text(location, 100)}” was not found`);
  return {
    query: text(location, 200), label: text(place.display_name || location, 300),
    south: bounds[0], north: bounds[1], west: bounds[2], east: bounds[3],
    lat: Number(place.lat), lon: Number(place.lon), address: place.address || {},
    source_url: `https://www.openstreetmap.org/${place.osm_type || "relation"}/${place.osm_id || ""}`,
  };
}

async function geocodeMarketLocationWithRetry(location) {
  try { return await geocodeMarketLocation(location); }
  catch (firstError) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text(location, 200))}&count=1&language=en&format=json&countryCode=US`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6_000), headers: { "user-agent": `${CRAWLER_AGENT}/2.2`, accept: "application/json" } });
      if (!response.ok) { await discardResponse(response); throw new Error(`fallback location lookup returned HTTP ${response.status}`); }
      const place = array((JSON.parse(await readLimitedResponse(response, 4 * 1024 * 1024))).results)[0];
      const lat = Number(place?.latitude), lon = Number(place?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("fallback location lookup returned no result");
      return {
        query: text(location, 200), label: text([place.name, place.admin2, place.admin1, place.country].filter(Boolean).join(", ") || location, 300),
        south: lat - 0.1, north: lat + 0.1, west: lon - 0.1, east: lon + 0.1, lat, lon,
        address: { city: place.name, county: place.admin2, state: place.admin1, country: place.country },
        source_url: "https://open-meteo.com/en/docs/geocoding-api", geocode_provider: "Open-Meteo fallback",
      };
    } catch { throw firstError; }
  }
}

function nominatimBusinessLocation(place, fallback) {
  const address = place?.address || {};
  const locality = address.city || address.town || address.village || address.hamlet || address.suburb || address.municipality || "";
  const region = address.state || address.county || "";
  return text([locality, region].filter(Boolean).join(", ") || fallback, 240);
}

function distanceMiles(fromLat, fromLon, toLat, toLon) {
  const values = [fromLat, fromLon, toLat, toLon].map(Number);
  if (values.some(value => !Number.isFinite(value))) return null;
  const [lat1, lon1, lat2, lon2] = values.map(value => value * Math.PI / 180);
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function nominatimBusinessSearch(area, searchTerms, maxCompanies, radiusMiles) {
  const results = [];
  const latDelta = radiusMiles / 69;
  const lonDelta = radiusMiles / Math.max(20, 69 * Math.cos(Number(area.lat) * Math.PI / 180));
  const viewbox = [Number(area.lon) - lonDelta, Number(area.lat) + latDelta, Number(area.lon) + lonDelta, Number(area.lat) - latDelta].join(",");
  for (const term of searchTerms.slice(0, 1)) {
    // Respect the public geocoder's one-request-per-second limit after the
    // radius center lookup. The bounded box is filtered again by true distance.
    await new Promise(resolve => setTimeout(resolve, 1_100));
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${Math.min(40, maxCompanies)}&addressdetails=1&extratags=1&namedetails=1&bounded=1&viewbox=${encodeURIComponent(viewbox)}&q=${encodeURIComponent(term)}`;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { "user-agent": `${CRAWLER_AGENT}/2.2 (https://wealth-lead-workspace.treads77.chatgpt.site)`, referer: "https://wealth-lead-workspace.treads77.chatgpt.site/", accept: "application/json", "accept-language": "en-US,en;q=0.8" },
      });
      if (!response.ok) { await discardResponse(response); throw new Error(`nearby business lookup returned HTTP ${response.status}`); }
      results.push(...array(JSON.parse(await readLimitedResponse(response, 4 * 1024 * 1024))).map(place => ({
        ...place, search_scope: area.query, distance_miles: distanceMiles(area.lat, area.lon, place.lat, place.lon),
      })).filter(place => place.distance_miles == null || place.distance_miles <= radiusMiles));
      if (results.length >= maxCompanies) return results;
    } catch { /* the exact map-tag query remains available as a fallback */ }
  }
  return results;
}

async function overpassMarketSearch(area, selectors, radiusMiles) {
  const radiusMeters = Math.round(radiusMiles * 1_609.344);
  const around = `around:${radiusMeters},${area.lat},${area.lon}`;
  const clauses = selectors.map(([key, value]) => `nwr["${key}"="${value}"]["name"](${around});`).join("\n");
  const query = `[out:json][timeout:18];(${clauses});out center tags ${MAX_MARKET_COMPANIES * 3};`;
  let lastError = null;
  for (const endpoint of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    try {
      const response = await fetch(endpoint, {
        method: "POST", body: new URLSearchParams({ data: query }).toString(), signal: AbortSignal.timeout(22_000),
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": `${CRAWLER_AGENT}/2.1 (https://wealth-lead-workspace.treads77.chatgpt.site)`, accept: "application/json" },
      });
      if (!response.ok) { await discardResponse(response); throw new Error(`business directory returned HTTP ${response.status}`); }
      const payload = JSON.parse(await readLimitedResponse(response, 4 * 1024 * 1024));
      if (!Array.isArray(payload.elements)) throw new Error("business directory returned an invalid response");
      return payload.elements;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("public business directory unavailable");
}

function osmWebsite(tags) {
  return safeTargetUrl(tags.website || tags["contact:website"] || tags.url || tags["contact:url"])?.href || "";
}

function osmBusinessLocation(tags, fallback) {
  const locality = tags["addr:city"] || tags["addr:place"] || tags["addr:suburb"] || "";
  const region = tags["addr:state"] || tags["addr:county"] || "";
  return text([locality, region].filter(Boolean).join(", ") || fallback, 240);
}

export function broadMarketLocation(value) {
  const normalized = lower(value).replace(/\./g, "").replace(/\s+/g, " ").trim();
  return /^(?:ny|new york|new york state|nj|new jersey|ct|connecticut|pa|pennsylvania|united states|usa|us)$/.test(normalized);
}

export async function discoverMarketCompanies(campaign = {}) {
  const industries = marketIndustrySpec(campaign.industries);
  const location = array(campaign.locations)[0];
  const maxCompanies = clamp(campaign.max_companies || 20, 1, MAX_MARKET_COMPANIES);
  const radiusMiles = clamp(campaign.radius_miles || DEFAULT_MARKET_RADIUS_MILES, 1, MAX_MARKET_RADIUS_MILES);
  if (!industries.requested.length) return { companies: [], errors: [], provider: "", location: null, industry_labels: [] };
  if (!location) return { companies: [], errors: ["Market discovery needs a location."], provider: "OpenStreetMap", location: null, industry_labels: industries.labels };
  if (broadMarketLocation(location)) return { companies: [], errors: [`“${location}” is too broad to use as a radius center. Enter a ZIP code, address, city, county, or named location.`], provider: "OpenStreetMap", location: null, radius_miles: radiusMiles, industry_labels: industries.labels, attribution: "© OpenStreetMap contributors · ODbL" };
  if (!industries.selectors.length) return { companies: [], errors: [`Business type “${industries.requested.join(', ')}” is not recognized yet. Try a broader category or another name. Your search terms are saved with the campaign for future category updates.`], provider: "OpenStreetMap", location: null, industry_labels: [], unmatched_terms: industries.unmatched };
  if (industries.selectors.length > 64) return { companies: [], errors: ['Please split this search into smaller groups of business types.'], provider: 'OpenStreetMap', location: null, industry_labels: industries.labels };
  try {
    const cachedArea = campaign.market_discovery?.location;
    const reusableArea = cachedArea && lower(cachedArea.query) === lower(location)
      && [cachedArea.lat, cachedArea.lon, cachedArea.south, cachedArea.north, cachedArea.west, cachedArea.east].every(value => Number.isFinite(Number(value)));
    const area = reusableArea ? cachedArea : await geocodeMarketLocationWithRetry(location);
    const byName = new Map();
    if (industries.search_terms.length && area.geocode_provider !== "Open-Meteo fallback") {
      try {
        const nearby = await nominatimBusinessSearch(area, industries.search_terms, maxCompanies, radiusMiles);
        for (const place of nearby) {
          const extras = place.extratags || {}, address = place.address || {};
          const name = text(place.name || place.namedetails?.name || address[place.type] || address[place.category], 200);
          if (!name || /department|authority|association|school|university|municipal|government|substation|power plant|utility|auto electric|automotive/i.test(name)) continue;
          if (place.category !== "craft" || place.type !== "electrician") continue;
          const website = osmWebsite(extras), phone = text(extras.phone || extras["contact:phone"], 80);
          const company = {
            name, website, phone, location: nominatimBusinessLocation(place, place.search_scope || area.query), industries: industries.labels,
            source: "OpenStreetMap nearby business search", source_url: `https://www.openstreetmap.org/${place.osm_type || "node"}/${place.osm_id || ""}`,
            discovery_method: "market_directory_nearby", distance_miles: place.distance_miles == null ? null : Math.round(place.distance_miles * 10) / 10,
            confidence: website ? 0.82 : phone ? 0.7 : 0.62,
          };
          const key = companyIdentityKey(name);
          const previous = byName.get(key);
          if (!previous || Number(company.confidence) > Number(previous.confidence)) byName.set(key, company);
        }
      } catch { /* exact map tags remain available as a fallback */ }
    }
    if (!byName.size) {
      const elements = await overpassMarketSearch(area, industries.selectors, radiusMiles);
      for (const element of elements) {
        const tags = element.tags || {}, name = text(tags.name || tags.operator || tags.brand, 200);
        const distance = distanceMiles(area.lat, area.lon, element.lat ?? element.center?.lat, element.lon ?? element.center?.lon);
        if (distance == null || !Number.isFinite(distance) || distance > radiusMiles) continue;
        if (!industries.selectors.some(([key,value]) => tags[key] === value)) continue;
        if (!name) continue;
        const website = osmWebsite(tags), phone = text(tags.phone || tags["contact:phone"], 80);
        const company = {
          name, website, phone, location: osmBusinessLocation(tags, area.query), industries: industries.labels,
          source: "OpenStreetMap business directory", source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
          discovery_method: "market_directory", distance_miles: (() => {
            const miles = distanceMiles(area.lat, area.lon, element.lat ?? element.center?.lat, element.lon ?? element.center?.lon);
            return miles == null ? null : Math.round(miles * 10) / 10;
          })(), confidence: website ? 0.82 : phone ? 0.7 : 0.62,
        };
        const key = companyIdentityKey(name);
        const previous = byName.get(key);
        if (!previous || Number(company.confidence) > Number(previous.confidence)) byName.set(key, company);
      }
    }
    const companies = [...byName.values()].sort((a, b) => Number(Boolean(b.website)) - Number(Boolean(a.website))
      || Number(a.distance_miles ?? Number.MAX_SAFE_INTEGER) - Number(b.distance_miles ?? Number.MAX_SAFE_INTEGER)
      || Number(b.confidence) - Number(a.confidence) || a.name.localeCompare(b.name)).slice(0, maxCompanies);
    return {
      companies, errors: companies.length ? [] : [`No mapped ${industries.labels.join(" or ").toLowerCase()} businesses were found within ${radiusMiles} miles of ${location}. Try a larger radius or another business type.`],
      provider: "OpenStreetMap", location: area, radius_miles: radiusMiles, industry_labels: industries.labels, unmatched_terms: industries.unmatched,
      attribution: "© OpenStreetMap contributors · ODbL",
    };
  } catch (error) {
    return { companies: [], errors: [`Market directory: ${text(error.message, 240)}`], provider: "OpenStreetMap", location: null, radius_miles: radiusMiles, industry_labels: industries.labels, attribution: "© OpenStreetMap contributors · ODbL" };
  }
}

async function wikidataOfficialWebsites(company) {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(company)}&language=en&format=json&limit=4&origin=*`;
    const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(7_000), headers: { "user-agent": `${CRAWLER_AGENT}/2.0` } });
    if (!searchResponse.ok) { await discardResponse(searchResponse); return []; }
    const search = await searchResponse.json();
    const ids = array(search.search).filter(item => {
      const label = lower(item.label), description = lower(item.description);
      const tokens = companySearchTokens(company);
      return tokens.some(token => label.includes(token)) && /company|business|corporation|bank|hospital|university|organization|enterprise|manufacturer|retailer|provider|utility|firm/.test(description);
    }).map(item => item.id).filter(Boolean).slice(0, 3);
    if (!ids.length) return [];
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids.join("|"))}&props=claims&format=json&origin=*`;
    const entityResponse = await fetch(entityUrl, { signal: AbortSignal.timeout(7_000), headers: { "user-agent": `${CRAWLER_AGENT}/2.0` } });
    if (!entityResponse.ok) { await discardResponse(entityResponse); return []; }
    const entities = (await entityResponse.json()).entities || {};
    return unique(ids.flatMap(id => array(entities[id]?.claims?.P856).map(claim => claim?.mainsnak?.datavalue?.value).filter(value => safeTargetUrl(value))));
  } catch { return []; }
}

function inferredCompanyWebsites(company) {
  const tokens = companySearchTokens(company).slice(0, 5);
  if (!tokens.length) return [];
  const joined = tokens.join("");
  const compact = tokens.slice(0, 3).join("");
  const acronym = tokens.map(token => token[0]).join("");
  return unique([
    `https://${joined}.com`, `https://${compact}.com`, `https://${joined}.org`,
    acronym.length >= 2 ? `https://${acronym}.com` : "",
  ]);
}

async function resolveCompanyWebsites(company, websiteHints = [], resolutionMode = "full") {
  const catalogOrigins = unique(VERIFIED_TARGET_CATALOG.filter(entry => lower(entry.company) === lower(company)).map(entry => new URL(entry.url).origin));
  if (catalogOrigins.length) return catalogOrigins.map(url => ({ url, method: "catalog" }));
  const testCandidates = async (values, method, limit = 3, timeoutMs = 6_000) => (await mapInBatches(unique(values).slice(0, limit), 2, async value => {
    try {
      const page = await fetchPublicPage(value, timeoutMs);
      if (!likelyCompanyPage(page.html, company, page.url)) return null;
      const requested = safeTargetUrl(value), resolved = safeTargetUrl(page.url);
      if (method === "company_resolution" && requested && resolved && !sameOrganizationHost(requested.hostname, resolved.hostname)) return null;
      return { url: new URL(page.url).origin, page_url: page.url, document: page.html, method };
    } catch { return null; }
  })).filter(Boolean).slice(0, 2);
  const hinted = array(websiteHints).map(value => safeTargetUrl(value)?.href).filter(Boolean);
  if (hinted.length) {
    const resolvedHints = await testCandidates(hinted, "market_directory", 3, 5_000);
    if (resolvedHints.length) return resolvedHints;
    if (resolutionMode === "market") return [];
  }
  if (resolutionMode === "market") return testCandidates(inferredCompanyWebsites(company), "company_resolution", 2, 4_000);
  const supplied = safeTargetUrl(company);
  const candidates = unique([
    ...(supplied && /\./.test(supplied.hostname) ? [supplied.origin] : []),
    ...(await wikidataOfficialWebsites(company)),
    ...inferredCompanyWebsites(company),
  ]).slice(0, 7);
  return testCandidates(candidates, supplied ? "manual" : "company_resolution", 3, 6_000);
}

async function validateSourceCandidate(candidate, company, robotsByOrigin, campaign = {}) {
  const parsed = safeTargetUrl(candidate.url);
  if (!parsed || restrictedCrawlReason(parsed)) return null;
  let robots = robotsByOrigin.get(parsed.origin);
  if (robots === undefined) {
    try { robots = (await fetchPublicPage(new URL("/robots.txt", parsed.origin), 15_000)).html; }
    catch (error) { robots = error.message.startsWith("HTTP 4") ? "" : "DISALLOW_ALL"; }
    robotsByOrigin.set(parsed.origin, robots);
  }
  const snapshotCount = verifiedSnapshotCandidates(parsed.href).length;
  if (robots === "DISALLOW_ALL" || !robotsAllowed(robots, parsed.pathname)) {
    if (!snapshotCount) return null;
    return { ...candidate, url: parsed.href, company, source_type: sourceTypeForUrl(parsed.href, candidate.label), status: "verified_snapshot", score: sourceScore(parsed.href, candidate.label, candidate.method) + snapshotCount, people_found: snapshotCount };
  }
  if (!candidate.document && ["site_link", "sitemap"].includes(candidate.method)) {
    return { ...candidate, url: parsed.href, company, source_type: sourceTypeForUrl(parsed.href, candidate.label), status: "linked", score: sourceScore(parsed.href, candidate.label, candidate.method), people_found: 0 };
  }
  try {
    const page = candidate.document ? { url: parsed.href, html: candidate.document } : await fetchPublicPage(parsed.href, 12_000);
    if (parkedDomainPage(page.url, page.html)) return null;
    const peopleFound = parsePublicWebPage(page.html, page.url, company, campaign).length;
    const relevant = SOURCE_PATH_PATTERN.test(`${page.url} ${htmlText(page.html).slice(0, 4_000)}`);
    if (!peopleFound && !relevant && !["manual", "site_home"].includes(candidate.method)) return null;
    const { document, ...cleanCandidate } = candidate;
    return { ...cleanCandidate, url: page.url, company, source_type: sourceTypeForUrl(page.url, candidate.label), status: "live", score: sourceScore(page.url, candidate.label, candidate.method) + Math.min(peopleFound, 10) * 3, people_found: peopleFound };
  } catch {
    if (!snapshotCount) return null;
    return { ...candidate, url: parsed.href, company, source_type: sourceTypeForUrl(parsed.href, candidate.label), status: "verified_snapshot", score: sourceScore(parsed.href, candidate.label, candidate.method) + snapshotCount, people_found: snapshotCount };
  }
}

async function discoverCompanySources(company, websiteHints = [], campaign = {}, resolutionMode = "full") {
  const catalog = VERIFIED_TARGET_CATALOG.filter(entry => lower(entry.company) === lower(company)).map(entry => ({
    url: entry.url, label: entry.source_type || "Official leadership directory", method: "catalog",
  }));
  const websites = await resolveCompanyWebsites(company, websiteHints, resolutionMode);
  const candidates = [...catalog];
  const robotsByOrigin = new Map();
  for (const website of websites) {
    try {
      const home = website.document ? { url: website.page_url || website.url, html: website.document } : await fetchPublicPage(website.url, 15_000);
      candidates.push({ url: home.url, label: `${company} official website`, method: "site_home", document: home.html });
      candidates.push(...sourceLinksFromDocument(home.html, home.url));
      const homeOrigin = new URL(home.url).origin;
      if (resolutionMode === "market") {
        // The crawl phase performs the authoritative robots check. Avoid spending the
        // synchronous market-discovery budget fetching robots and sitemaps twice.
        robotsByOrigin.set(homeOrigin, "");
      } else {
        let robots = "";
        try { robots = (await fetchPublicPage(new URL("/robots.txt", home.url), 15_000)).html; }
        catch (error) { robots = error.message.startsWith("HTTP 4") ? "" : "DISALLOW_ALL"; }
        robotsByOrigin.set(homeOrigin, robots);
        for (const sitemapUrl of robotsSitemaps(robots, homeOrigin)) {
          try { candidates.push(...sourceLinksFromDocument((await fetchPublicPage(sitemapUrl, 6_000)).html, home.url).slice(0, 20)); } catch { /* optional */ }
        }
      }
      const commonPaths = (resolutionMode === "market" ? [
        // Market runs follow links found on the official homepage; blind path probes
        // are reserved for named-employer campaigns where a longer run is expected.
      ] : [
        "/our-team", "/team", "/meet-the-team", "/people", "/our-people", "/staff",
        "/professionals", "/leadership", "/about-us", "/about",
      ]);
      candidates.push(...commonPaths.map(path => ({ url: new URL(path, home.url).href, label: path, method: "path_probe" })));
    } catch { /* another resolved website may still work */ }
  }
  const deduped = new Map();
  for (const candidate of candidates) {
    const parsed = safeTargetUrl(candidate.url);
    if (!parsed) continue;
    const key = catalogTargetKey(parsed.href);
    const existing = deduped.get(key);
    if (!existing || sourceScore(candidate.url, candidate.label, candidate.method) > sourceScore(existing.url, existing.label, existing.method)) deduped.set(key, candidate);
  }
  const shortlist = [...deduped.values()].sort((a, b) => sourceScore(b.url, b.label, b.method) - sourceScore(a.url, a.label, a.method)).slice(0, 12);
  const validated = await mapInBatches(shortlist, 2, candidate => validateSourceCandidate(candidate, company, robotsByOrigin, campaign));
  const distinctTypes = new Set(), selected = [];
  for (const candidate of validated.filter(Boolean).sort((a, b) => b.score - a.score)) {
    if (selected.length >= MAX_SOURCE_PAGES_PER_COMPANY) break;
    const marketCandidate = resolutionMode === "market";
    if (Number(candidate.people_found) > 0 || ["site_link", "sitemap"].includes(candidate.method)
      || (!marketCandidate && (!distinctTypes.has(candidate.source_type) || selected.length < 2))) {
      selected.push(candidate); distinctTypes.add(candidate.source_type);
    }
  }
  return selected;
}

export async function discoverCampaignSources(campaign = {}) {
  const discoveredAt = now();
  const errors = [], sourcePlan = [];
  const marketDiscovery = await discoverMarketCompanies(campaign);
  const marketScoped = array(campaign.industries).length > 0 && array(campaign.locations).length > 0;
  errors.push(...marketDiscovery.errors);
  const priorAutomaticTargets = new Set(array(campaign.source_plan)
    .filter(source => source.discovery_method && source.discovery_method !== "manual")
    .map(source => catalogTargetKey(source.url)));
  const linkedInCompanyHints = unique(array(campaign.seed_urls).map(linkedInCompanyHint));
  const hintedCampaign = {
    ...campaign,
    employers: unique([...(campaign.employers || []), ...(campaign.target_companies || []), ...linkedInCompanyHints]),
  };
  const explicit = unique(campaign.seed_urls || []).map(value => safeTargetUrl(value)?.href).filter(Boolean)
    .filter(url => !priorAutomaticTargets.has(catalogTargetKey(url)));
  for (const url of marketScoped ? [] : explicit) {
    const catalogEntry = VERIFIED_TARGET_CATALOG.find(entry => catalogTargetKey(entry.url) === catalogTargetKey(url));
    if (!restrictedCrawlReason(safeTargetUrl(url))) sourcePlan.push({
      url, company: catalogEntry?.company || (array(campaign.employers).length === 1 ? campaign.employers[0] : ""),
      source_type: catalogEntry?.source_type || sourceTypeForUrl(url), status: catalogEntry?.profiles?.length ? "verified_snapshot" : "manual",
      score: sourceScore(url, "", catalogEntry ? "catalog" : "manual"), discovery_method: catalogEntry ? "catalog" : "manual", discovered_at: discoveredAt,
    });
  }
  const suggested = marketScoped ? [] : suggestCampaignTargets(hintedCampaign);
  for (const entry of suggested) sourcePlan.push({
    url: entry.url, company: entry.company, source_type: entry.source_type || "Official leadership directory",
    status: entry.profiles?.length ? "verified_snapshot" : "catalog", score: sourceScore(entry.url, entry.source_type, "catalog"),
    discovery_method: "catalog", discovered_at: discoveredAt,
  });
  const coveredCompanies = new Set(sourcePlan.map(source => lower(source.company)).filter(Boolean));
  const marketByCompany = new Map(marketDiscovery.companies.map(company => [lower(company.name), company]));
  const allEmployers = unique([...(marketScoped ? [] : hintedCampaign.employers || []), ...marketDiscovery.companies.map(company => company.name)]);
  const employers = allEmployers.slice(0, MAX_DISCOVERY_EMPLOYERS);
  if (allEmployers.length > employers.length) errors.push(`Kept all ${allEmployers.length} businesses, while this run inspected websites for the first ${MAX_DISCOVERY_EMPLOYERS} to stay within the live request budget. The full business list remains available for ZoomInfo export.`);
  for (let index = 0; index < employers.length; index += 3) {
    const batch = employers.slice(index, index + 3).map(async company => {
      if (coveredCompanies.has(lower(company))) return [];
      try {
        const marketCompany = marketByCompany.get(lower(company));
        if (marketScoped && !marketCompany?.website) return [];
        const sources = await discoverCompanySources(company, marketCompany?.website ? [marketCompany.website] : [], campaign, marketCompany ? "market" : "full");
        if (!sources.length) errors.push(`${company}: no accessible team, staff, professional, leadership, or newsroom page was verified`);
        return sources.map(source => ({
          ...source, discovery_method: source.method || "automatic", discovered_at: discoveredAt,
          company_location: marketCompany?.location || "", market_source_url: marketCompany?.source_url || "",
        }));
      } catch (error) {
        errors.push(`${company}: ${text(error.message, 240)}`); return [];
      }
    });
    sourcePlan.push(...(await Promise.all(batch)).flat());
  }
  const deduped = new Map();
  for (const source of sourcePlan) {
    if (marketScoped && !marketDiscovery.companies.some(company => lower(company.name) === lower(source.company) && safeTargetUrl(company.website) && safeTargetUrl(source.url) && sameOrganizationHost(new URL(company.website).hostname,new URL(source.url).hostname))) continue;
    const key = catalogTargetKey(source.url), existing = deduped.get(key);
    if (!existing || Number(source.score) > Number(existing.score)) deduped.set(key, source);
  }
  const ranked = [...deduped.values()].sort((a, b) => Number(b.score) - Number(a.score));
  const selected = [], selectedKeys = new Set();
  for (const source of ranked) {
    const companyKey = lower(source.company) || new URL(source.url).hostname;
    if (selectedKeys.has(companyKey)) continue;
    selected.push(source); selectedKeys.add(companyKey);
    if (selected.length >= MAX_CRAWL_PAGES) break;
  }
  for (const source of ranked) {
    if (selected.length >= MAX_CRAWL_PAGES) break;
    if (!selected.some(item => catalogTargetKey(item.url) === catalogTargetKey(source.url))) selected.push(source);
  }
  return {
    seed_urls: selected.map(source => source.url), source_plan: selected,
    target_companies: unique(selected.map(source => source.company)), source_types: unique(selected.map(source => source.source_type)),
    discovered_companies: marketDiscovery.companies, market_discovery: {
      provider: marketDiscovery.provider, location: marketDiscovery.location, industry_labels: marketDiscovery.industry_labels,
      radius_miles: marketDiscovery.radius_miles || clamp(campaign.radius_miles || DEFAULT_MARKET_RADIUS_MILES, 1, MAX_MARKET_RADIUS_MILES),
      attribution: marketDiscovery.attribution || "", source_discovery_version: SOURCE_DISCOVERY_VERSION,
    },
    errors: errors.slice(0, 20), discovered_at: discoveredAt,
  };
}

function cleanSourcePlan(value) {
  return array(value).slice(0, MAX_CRAWL_PAGES).map(source => {
    const url = safeTargetUrl(source?.url);
    if (!url || restrictedCrawlReason(url)) return null;
    return {
      url: url.href, company: text(source.company, 200), source_type: sourceTypeForUrl(url.href, source.source_type),
      status: ["live", "linked", "verified_snapshot", "catalog", "manual"].includes(source.status) ? source.status : "manual",
      score: clamp(source.score, 0, 200), discovery_method: text(source.discovery_method || "manual", 40),
      discovered_at: text(source.discovered_at || now(), 50), people_found: clamp(source.people_found, 0, 10_000),
      company_location: text(source.company_location, 240), market_source_url: text(source.market_source_url, 500),
    };
  }).filter(Boolean);
}

function cleanMarketCompanies(value) {
  return array(value).slice(0, MAX_MARKET_COMPANIES).map(company => ({
    name: text(company?.name, 200), website: safeTargetUrl(company?.website)?.href || "",
    phone: text(company?.phone, 80), location: text(company?.location, 240), industries: unique(company?.industries || []).slice(0, 10),
    source: text(company?.source || "Public business directory", 120), source_url: safeTargetUrl(company?.source_url)?.href || "",
    discovery_method: text(company?.discovery_method || "market_directory", 40),
    distance_miles: company?.distance_miles == null ? null : Math.round(clamp(company.distance_miles, 0, MAX_MARKET_RADIUS_MILES) * 10) / 10,
    confidence: clamp(company?.confidence, 0, 1),
  })).filter(company => company.name);
}

function cleanMarketDiscovery(value = {}) {
  const location = value?.location && typeof value.location === "object" ? {
    query: text(value.location.query, 200), label: text(value.location.label, 300),
    south: Number(value.location.south), north: Number(value.location.north), west: Number(value.location.west), east: Number(value.location.east),
    lat: Number(value.location.lat), lon: Number(value.location.lon), source_url: safeTargetUrl(value.location.source_url)?.href || "",
  } : null;
  return {
    provider: text(value?.provider, 100), location,
    industry_labels: unique(value?.industry_labels || []).slice(0, 20),
    radius_miles: clamp(value?.radius_miles || DEFAULT_MARKET_RADIUS_MILES, 1, MAX_MARKET_RADIUS_MILES),
    attribution: text(value?.attribution, 200), source_discovery_version: Number(value?.source_discovery_version) || 0,
  };
}

export function cachedCampaignDiscovery(campaign = {}) {
  const sourcePlan = cleanSourcePlan(campaign.source_plan);
  const companies = cleanMarketCompanies(campaign.discovered_companies);
  const marketDiscovery = cleanMarketDiscovery(campaign.market_discovery);
  const seedUrls = unique([...(campaign.seed_urls || []), ...sourcePlan.map(source => source.url)])
    .map(value => safeTargetUrl(value)?.href).filter(Boolean).filter(value => !restrictedCrawlReason(safeTargetUrl(value))).slice(0, MAX_CRAWL_PAGES);
  if (!sourcePlan.length && !companies.length && !seedUrls.length) return null;
  if (sourcePlan.some(source => source.discovery_method !== "manual") && marketDiscovery.source_discovery_version !== SOURCE_DISCOVERY_VERSION) return null;
  const marketDefined = array(campaign.industries).length > 0 && array(campaign.locations).length > 0;
  const requestedRadius = clamp(campaign.radius_miles || DEFAULT_MARKET_RADIUS_MILES, 1, MAX_MARKET_RADIUS_MILES);
  if (marketDefined && Number(marketDiscovery.radius_miles) !== requestedRadius) return null;
  return {
    seed_urls: seedUrls, source_plan: sourcePlan,
    target_companies: unique([...(campaign.target_companies || []), ...sourcePlan.map(source => source.company), ...companies.map(company => company.name)]),
    source_types: unique([...(campaign.source_types || []), ...sourcePlan.map(source => source.source_type)]),
    discovered_companies: companies, market_discovery: marketDiscovery,
    errors: array(campaign.source_discovery_errors), discovered_at: campaign.source_discovered_at || campaign.updated_at || now(), cached: true,
  };
}

export async function crawlCampaign(campaign) {
  const marketScoped = array(campaign.industries).length > 0 && array(campaign.locations).length > 0;
  if (marketScoped && campaign.market_discovery?.source_discovery_version !== SOURCE_DISCOVERY_VERSION) throw new Error("Refresh business discovery before running this saved search.");
  const parsedSeeds = unique(array(campaign.seed_urls).map(value => safeTargetUrl(value)?.href).filter(Boolean));
  const restricted = parsedSeeds.map(value => safeTargetUrl(value)).filter(url => restrictedCrawlReason(url));
  const seeds = parsedSeeds.filter(value => !restrictedCrawlReason(safeTargetUrl(value)));
  if (!seeds.length && restricted.length) throw new Error(restrictedCrawlReason(restricted[0]));
  if (!seeds.length) throw new Error("Add at least one public company, team, staff, professional, or leadership page URL before running this campaign.");
  const urls = [...seeds], expandedUrls = [];
  for (const seed of seeds) {
    const parsed = new URL(seed);
    if ((!array(campaign.source_plan).length || !array(campaign.source_plan).some(source => safeTargetUrl(source.url)?.origin === parsed.origin))
      && (parsed.pathname === "/" || !parsed.pathname)) for (const path of ["/about", "/leadership", "/team", "/our-team", "/people", "/staff", "/professionals", "/management", "/company/leadership"]) expandedUrls.push(new URL(path, parsed.origin).href);
  }
  const selected = unique([...urls, ...expandedUrls]).slice(0, MAX_CRAWL_PAGES), robotsByOrigin = new Map(), candidates = [];
  const errors = restricted.map(url => `${url.pathname}: ${restrictedCrawlReason(url)}`), warnings = [], sourceResults = [];
  await mapInBatches(unique(selected.map(target => new URL(target).origin)), 2, async origin => {
    try { robotsByOrigin.set(origin, (await fetchPublicPage(new URL("/robots.txt", origin))).html); }
    catch (error) { robotsByOrigin.set(origin, error.message.startsWith("HTTP 4") ? "" : "DISALLOW_ALL"); }
  });
  const visit = async target => {
    const parsed = new URL(target), robots = robotsByOrigin.get(parsed.origin);
    const plannedSource = array(campaign.source_plan).find(source => catalogTargetKey(source.url) === catalogTargetKey(target))
      || array(campaign.source_plan).find(source => safeTargetUrl(source.url)?.origin === parsed.origin);
    const fallbackCandidates = [];
    if (robots === "DISALLOW_ALL" || !robotsAllowed(robots, parsed.pathname)) {
      if (fallbackCandidates.length) {
        candidates.push(...fallbackCandidates);
        warnings.push(`${parsed.pathname}: live crawl blocked; used ${fallbackCandidates.length} profiles from the verified official-directory snapshot`);
        sourceResults.push({ url: target, company: catalogCompanyForTarget(target), status: "verified_snapshot", candidates: fallbackCandidates.length });
      } else {
        errors.push(`${parsed.pathname}: blocked by robots policy`);
        sourceResults.push({ url: target, company: catalogCompanyForTarget(target), status: "blocked", candidates: 0 });
      }
      return;
    }
    try {
      const page = await fetchPublicPage(target);
      const fallback = plannedSource?.company || (array(campaign.employers).length === 1 ? campaign.employers[0] : catalogCompanyForTarget(target));
      const extracted = parsePublicWebPage(page.html, page.url, fallback, campaign);
      const rolePattern = targetRolePattern(campaign);
      for (const link of sourceLinksFromDocument(page.html, page.url)) {
        if (selected.length >= MAX_CRAWL_PAGES) break;
        const likelyProfile = /\/(?:our-)?(?:team|people)\/|\/(?:staff|professionals?|leadership)\//i.test(new URL(link.url).pathname);
        if (likelyProfile && !rolePattern.test(`${new URL(link.url).pathname} ${link.label}`)) continue;
        if (!selected.some(value => catalogTargetKey(value) === catalogTargetKey(link.url))) selected.push(link.url);
      }
      if (extracted.length) {
        candidates.push(...extracted.map(candidate => ({ ...candidate, company_location: plannedSource?.company_location || catalogCompanyLocationForTarget(target) })));
        sourceResults.push({ url: page.url, company: fallback, status: "live", candidates: extracted.length });
      } else if (fallbackCandidates.length) {
        candidates.push(...fallbackCandidates);
        warnings.push(`${parsed.pathname}: page returned no extractable markup; used ${fallbackCandidates.length} profiles from the verified official-directory snapshot`);
        sourceResults.push({ url: page.url, company: fallback, status: "verified_snapshot", candidates: fallbackCandidates.length });
      } else sourceResults.push({ url: page.url, company: fallback, status: "no_people", candidates: 0 });
    } catch (error) {
      if (fallbackCandidates.length) {
        candidates.push(...fallbackCandidates);
        warnings.push(`${parsed.pathname}: ${error.message}; used ${fallbackCandidates.length} profiles from the verified official-directory snapshot`);
        sourceResults.push({ url: target, company: catalogCompanyForTarget(target), status: "verified_snapshot", candidates: fallbackCandidates.length });
      } else {
        errors.push(`${parsed.pathname}: ${error.message}`);
        sourceResults.push({ url: target, company: catalogCompanyForTarget(target), status: "failed", candidates: 0 });
      }
    }
  };
  let cursor = 0;
  while (cursor < selected.length) {
    const batch = selected.slice(cursor, cursor + 4);
    cursor += batch.length;
    await Promise.all(batch.map(visit));
  }
  const uniqueCandidates = new Map();
  for (const raw of candidates) {
    const lead = normalizeLead(raw, { source: "Public website", campaign_id: campaign.id });
    if (!campaignMatches(lead, campaign)) continue;
    const key = identityKeys(lead)[0] || `${lower(lead.first_name)}|${lower(lead.last_name)}|${lower(lead.company)}`;
    if (uniqueCandidates.has(key)) uniqueCandidates.set(key, mergeLead(uniqueCandidates.get(key), lead));
    else uniqueCandidates.set(key, lead);
  }
  return {
    candidates: [...uniqueCandidates.values()].slice(0, campaign.max_leads), pages_attempted: selected.length,
    errors: errors.slice(0, 20), warnings: warnings.slice(0, 20), source_results: sourceResults,
  };
}

export function campaignMatches(lead, campaign) {
  const matchAny = (values, haystack) => !array(values).length || !text(haystack) || array(values).some(value => lower(haystack).includes(lower(value)));
  const knownPersonLocation = /^us(?:a|, united states)?$/i.test(text(lead.location)) ? "" : lead.location;
  const marketRadiusApplied = Number(campaign.radius_miles) > 0 && array(campaign.industries).length > 0;
  return matchAny(campaign.employers, lead.company) && matchAny(campaign.titles, lead.current_title)
    && (marketRadiusApplied || matchAny(campaign.locations, [knownPersonLocation, lead.company_location].filter(Boolean).join(" | ")))
    && matchAny(campaign.seniorities, lead.seniority);
}

async function readBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_IMPORT_BYTES) throw new HttpError(413, "The import is larger than the 5 MB limit.");
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new HttpError(413, "The import is larger than the 5 MB limit.");
  return new TextDecoder().decode(buffer);
}

async function requestJSON(request) {
  try { return await request.json(); }
  catch { throw new HttpError(400, "The request body must be valid JSON."); }
}

function csvCell(value) {
  let output = String(value ?? "");
  if (/^[=+\-@]/.test(output)) output = `'${output}`;
  return /[",\r\n]/.test(output) ? `"${output.replaceAll('"', '""')}"` : output;
}

function moneyLabel(value) {
  const lowValue = value?.low, highValue = value?.high;
  if (lowValue == null && highValue == null) return "";
  if (lowValue === highValue || highValue == null) return `$${Number(lowValue).toLocaleString("en-US")}`;
  return `$${Number(lowValue || 0).toLocaleString("en-US")}-$${Number(highValue).toLocaleString("en-US")}`;
}

export function salesforceCSV(leads) {
  const headers = ["First Name", "Last Name", "Title", "Company", "Email", "Business Phone", "Mobile Phone", "City", "State", "Country", "Lead Source", "Status", "Owner Email", "Follow Up Date", "Qualification Score", "Priority Score", "Estimated Age Range", "Estimated Income", "Estimated Assets", "LinkedIn URL", "Description"];
  const lines = [headers.join(",")];
  for (const lead of leads) {
    const description = [
      `Tier ${lead.tier}`, `Timing ${lead.timing_score}`, `Relationship ${lead.relationship_score}`,
      lead.years_of_experience != null ? `Experience ${lead.years_of_experience} years` : "",
      lead.years_at_company != null ? `Company tenure ${lead.years_at_company} years` : "",
      array(lead.former_employers).length ? `Former employers: ${array(lead.former_employers).join("; ")}` : "",
      lead.previous_job_title ? `Previous role: ${lead.previous_job_title}` : "",
      lead.graduation_year ? `Graduation year ${lead.graduation_year}` : "",
      lead.education ? `Education: ${lead.education}` : "",
      array(lead.signals).length ? `Signals: ${array(lead.signals).join("; ")}` : "", lead.notes,
    ].filter(Boolean).join(" | ");
    lines.push([
      lead.first_name, lead.last_name, lead.current_title, lead.company, lead.email,
      lead.business_phone || lead.phone, lead.mobile_phone, lead.city, lead.state, lead.country,
      "Prospect Discovery", lead.follow_up_status, lead.owner_email, lead.follow_up_date,
      lead.score, lead.priority_score, lead.estimated_age_range, moneyLabel(lead.estimated_income),
      moneyLabel(lead.estimated_assets), lead.linkedin_url, description,
    ].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function zoomInfoCandidateCSV(leads) {
  const headers = ["First Name", "Last Name", "Job Title", "Company Name", "Company Domain", "Company Website", "City", "State", "Country", "Location", "Email", "LinkedIn Contact Profile URL", "Source URL", "Discovery Reason", "External ID"];
  const lines = [headers.join(",")];
  for (const lead of leads) {
    const sourceEvidence = array(lead.evidence).filter(row => row.source_url).slice(0, 3);
    const sourceUrl = sourceEvidence[0]?.source_url || lead.linkedin_url || lead.company_website || "";
    const reason = sourceEvidence.map(row => row.snippet || `${row.field}: ${row.value}`).filter(Boolean).join(" | ");
    const externalId = lead.id;
    lines.push([lead.first_name, lead.last_name, lead.current_title, lead.company, lead.company_domain, lead.company_website,
      lead.city, lead.state, lead.country, lead.location, lead.email, lead.linkedin_url, sourceUrl, reason, externalId].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function companyDomain(value) {
  const parsed = safeTargetUrl(value);
  return parsed ? parsed.hostname.replace(/^www\./i, "") : "";
}

function companyLocationParts(value) {
  const parts = text(value, 240).split(",").map(part => part.trim()).filter(Boolean);
  const country = parts.find(part => /^(?:united states|usa|us|canada|uk|united kingdom)$/i.test(part)) || "";
  const state = parts.find(part => /^(?:[A-Z]{2}|New York|New Jersey|Connecticut|Pennsylvania)$/i.test(part)) || "";
  const city = parts.find(part => part !== state && part !== country) || "";
  return { city, state, country: country || (state ? "United States" : "") };
}

export function zoomInfoCompanyCSV(companies, campaign = {}) {
  const headers = ["Company Name", "Company Website", "Company Domain", "Phone", "City", "State", "Country", "Location", "Distance (Miles)", "Industry", "Source URL", "Discovery Method", "Confidence", "Campaign Name", "External ID"];
  const lines = [headers.join(",")];
  for (const company of cleanMarketCompanies(companies)) {
    const location = companyLocationParts(company.location);
    const externalId = `${text(campaign.id || "market", 120)}:${lower(company.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    lines.push([
      company.name, company.website, companyDomain(company.website), company.phone,
      location.city, location.state, location.country, company.location, company.distance_miles ?? "", array(company.industries).join("; "),
      company.source_url, company.discovery_method, Math.round(Number(company.confidence || 0) * 100),
      campaign.name, externalId,
    ].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function catalogTargetKey(value) {
  return lower(value).replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/+$/, "");
}

function catalogCompanyForTarget(value) {
  const key = catalogTargetKey(value);
  return VERIFIED_TARGET_CATALOG.find(entry => catalogTargetKey(entry.url) === key)?.company || "";
}

function catalogCompanyLocationForTarget(value) {
  const key = catalogTargetKey(value);
  return VERIFIED_TARGET_CATALOG.find(entry => catalogTargetKey(entry.url) === key)?.company_location || "";
}

export function verifiedSnapshotCandidates(value, campaignId = "") {
  const key = catalogTargetKey(value);
  const entry = VERIFIED_TARGET_CATALOG.find(item => catalogTargetKey(item.url) === key);
  if (!entry?.profiles?.length) return [];
  const sourceName = entry.source_type || "Official leadership directory";
  return entry.profiles.map(profile => ({
    ...profile,
    company: entry.company,
    company_location: entry.company_location,
    source_url: entry.url,
    source_names: [sourceName],
    campaign_ids: campaignId ? [campaignId] : [],
    notes: `Verified against the company's ${lower(sourceName)} on ${entry.verified_at}. Recheck the source page before outreach.`,
    evidence: [evidence(
      "current_title", profile.current_title, sourceName, "reported", 0.82,
      entry.url, `${profile.first_name} ${profile.last_name} — ${profile.current_title}; verified ${entry.verified_at}`,
    )],
  }));
}

export function suggestCampaignTargets(campaign = {}) {
  const employers = unique([
    ...(campaign.employers || []),
    ...(campaign.target_companies || []),
    ...array(campaign.seed_urls).map(linkedInCompanyHint),
  ]).map(lower);
  if (!employers.length && array(campaign.industries).length) return [];
  const regionalText = lower([campaign.name, ...array(campaign.locations), ...array(campaign.keywords)].join(" "));
  const longIslandIntent = /\b(long island|nassau|suffolk|melville|hauppauge|ronkonkoma|stony brook|lake success)\b/.test(regionalText);
  return VERIFIED_TARGET_CATALOG.filter(entry => {
    if (employers.length && employers.some(employer => lower(entry.company).includes(employer) || employer.includes(lower(entry.company)))) return true;
    return longIslandIntent && entry.regions.some(region => regionalText.includes(region));
  }).slice(0, MAX_CRAWL_PAGES).map(entry => ({ ...entry }));
}

export function campaignRunReadiness(campaign = {}) {
  const explicitSeedUrls = unique(campaign.seed_urls || []).slice(0, 20);
  const linkedInCompanyHints = unique(explicitSeedUrls.map(linkedInCompanyHint));
  const hintedCampaign = {
    ...campaign,
    employers: unique([...(campaign.employers || []), ...(campaign.target_companies || []), ...linkedInCompanyHints]),
  };
  const usableExplicitUrls = explicitSeedUrls.filter(value => {
    const parsed = safeTargetUrl(value);
    return parsed && !restrictedCrawlReason(parsed);
  });
  const explicitCatalogEntries = usableExplicitUrls
    .map(value => VERIFIED_TARGET_CATALOG.find(entry => catalogTargetKey(entry.url) === catalogTargetKey(value)))
    .filter(Boolean);
  const expandedCompanies = new Set(explicitCatalogEntries.map(entry => lower(entry.company)));
  const expandedTargets = expandedCompanies.size
    ? VERIFIED_TARGET_CATALOG.filter(entry => expandedCompanies.has(lower(entry.company))).slice(0, MAX_CRAWL_PAGES)
    : [];
  const suggestedTargets = usableExplicitUrls.length ? expandedTargets : suggestCampaignTargets(hintedCampaign);
  const seedUrls = usableExplicitUrls.length
    ? unique([...usableExplicitUrls, ...expandedTargets.map(target => target.url)]).slice(0, MAX_CRAWL_PAGES)
    : suggestedTargets.map(target => target.url);
  const selectedCatalogEntries = seedUrls
    .map(value => VERIFIED_TARGET_CATALOG.find(entry => catalogTargetKey(entry.url) === catalogTargetKey(value)))
    .filter(Boolean);
  const sourceTypes = unique(selectedCatalogEntries.map(entry => entry.source_type || "Official leadership directory"));
  const wasExpanded = seedUrls.length > usableExplicitUrls.length;
  let sources = unique(campaign.sources || []).filter(source => source === "public_web").slice(0, 10);
  // Campaigns created by older releases used non-runnable placeholder sources
  // such as "demo". Once real target URLs exist, safely migrate them to the
  // only runnable source instead of failing at run time.
  const hasMarketDefinition = array(campaign.industries).length > 0 && array(campaign.locations).length > 0;
  const canAutoDiscover = campaign.auto_discover_sources !== false && (array(hintedCampaign.employers).length > 0 || suggestedTargets.length > 0 || hasMarketDefinition);
  if (!sources.length && (seedUrls.length || canAutoDiscover)) sources = ["public_web"];
  if (!seedUrls.length) {
    if (canAutoDiscover && sources.includes("public_web")) {
      return {
        runnable: true,
        seed_urls: [],
        sources,
        auto_targeted: true,
        source_discovery_pending: true,
        target_companies: unique(hintedCampaign.employers || []),
        source_types: [],
        message: "",
      };
    }
    return {
      runnable: false,
      seed_urls: seedUrls,
      sources,
      auto_targeted: false,
      target_companies: [],
      source_types: [],
      message: explicitSeedUrls.length
        ? "The supplied pages cannot be crawled and no verified company target was found. Add the employer name or an official company team, staff, professional, or leadership page."
        : array(campaign.industries).length && !array(campaign.locations).length
          ? "Add a location for market discovery."
          : "Add a business type plus location, a known employer, or an official company website.",
    };
  }
  if (!sources.includes("public_web")) {
    return {
      runnable: false,
      seed_urls: seedUrls,
      sources,
      auto_targeted: suggestedTargets.length > 0,
      target_companies: unique(selectedCatalogEntries.map(target => target.company)),
      source_types: sourceTypes,
      message: "Select Targeted public websites before running this campaign.",
    };
  }
  return {
    runnable: true,
    seed_urls: seedUrls,
    sources,
    auto_targeted: suggestedTargets.length > 0 || wasExpanded,
    source_discovery_pending: hasMarketDefinition,
    target_companies: unique(selectedCatalogEntries.map(target => target.company)),
    source_types: sourceTypes,
    message: "",
  };
}

async function campaignRoutes(request, db, user, path, url) {
  if (path === `${API}/campaigns` && request.method === "GET") {
    const rows = await many(db, "SELECT payload FROM discovery_campaigns WHERE team=? ORDER BY updated_at DESC", TEAM);
    const campaigns = rows.map(row => parseJSON(row.payload)).filter(Boolean).map(campaign => {
      const readiness = campaignRunReadiness(campaign);
      return {
        ...campaign, seed_urls: readiness.seed_urls, sources: readiness.sources,
        run_ready: readiness.runnable, run_blocker: readiness.message,
        auto_targeted: campaign.auto_targeted || readiness.auto_targeted,
        source_discovery_pending: readiness.source_discovery_pending,
        target_companies: readiness.target_companies.length ? readiness.target_companies : array(campaign.target_companies),
        source_types: readiness.source_types.length ? readiness.source_types : array(campaign.source_types),
      };
    });
    return json({ campaigns });
  }
  if (path === `${API}/campaigns` && request.method === "POST") {
    const body = await requestJSON(request);
    const stamp = now();
    const campaign = {
      id: uid("campaign"), team: TEAM, created_by: user.email, name: text(body.name, 120),
      employers: unique(body.employers || []).slice(0, 100), titles: unique(body.titles || []).slice(0, 100),
      locations: unique(body.locations || []).slice(0, 100), seniorities: unique(body.seniorities || []).slice(0, 20),
      industries: unique(body.industries || []).slice(0, 20), max_companies: clamp(body.max_companies || 20, 1, MAX_MARKET_COMPANIES),
      radius_miles: clamp(body.radius_miles || DEFAULT_MARKET_RADIUS_MILES, 1, MAX_MARKET_RADIUS_MILES),
      keywords: unique(body.keywords || []).slice(0, 50), seed_urls: unique(body.seed_urls || []).slice(0, 20),
      sources: unique(body.sources || []).filter(source => source === "public_web").slice(0, 10),
      max_leads: clamp(body.max_leads || 50, 1, 500), enrich_web: Boolean(body.enrich_web),
      auto_discover_sources: body.auto_discover_sources !== false, source_plan: cleanSourcePlan(body.source_plan), discovered_companies: cleanMarketCompanies(body.discovered_companies), market_discovery: cleanMarketDiscovery(body.market_discovery), source_discovery_errors: [], source_discovered_at: "",
      schedule: "manual",
      last_run_at: "", next_run_at: "", status: "draft", created_at: stamp, updated_at: stamp,
    };
    if (!campaign.name) throw new HttpError(422, "Campaign name is required.");
    const readiness = campaignRunReadiness(campaign);
    campaign.seed_urls = readiness.seed_urls;
    campaign.sources = readiness.sources;
    campaign.auto_targeted = readiness.auto_targeted;
    campaign.target_companies = readiness.target_companies;
    campaign.source_types = readiness.source_types;
    if (campaign.source_plan.length || campaign.discovered_companies.length) {
      campaign.source_discovered_at = now();
      campaign.target_companies = unique([...campaign.source_plan.map(source => source.company), ...campaign.discovered_companies.map(company => company.name)]);
      campaign.source_types = unique(campaign.source_plan.map(source => source.source_type));
    }
    await execute(db, "INSERT INTO discovery_campaigns(id,team,created_by_user_id,payload,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)", campaign.id, TEAM, user.user_id, JSON.stringify(campaign));
    await audit(db, user, "create", "campaign", campaign.id, campaign.name);
    return json({ campaign }, 201);
  }
  const match = path.match(new RegExp(`^${API}/campaigns/([^/]+)(?:/(run|export-companies))?$`));
  if (!match) return null;
  const campaignId = decodeURIComponent(match[1]);
  const row = await one(db, "SELECT * FROM discovery_campaigns WHERE id=? AND team=?", campaignId, TEAM);
  if (!row) throw new HttpError(404, "Campaign not found.");
  let campaign = parseJSON(row.payload);
  if (!canManageCampaign(user, row.created_by_user_id)) throw new HttpError(403, "Only the campaign owner or an admin can manage this campaign.");
  if (match[2] === "export-companies" && request.method === "POST") {
    const companies = cleanMarketCompanies(campaign.discovered_companies);
    if (!companies.length) throw new HttpError(422, "Run market discovery before exporting a company list.");
    await audit(db, user, "export", "campaign", campaign.id, `${companies.length} ZoomInfo company candidates`);
    return new Response(zoomInfoCompanyCSV(companies, campaign), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="zoominfo-companies-${today()}.csv"`, "cache-control": "no-store" } });
  }
  if (match[2] === "run" && request.method === "POST") {
    const cachedDiscovery = cachedCampaignDiscovery(campaign);
    const sourceDiscovery = cachedDiscovery || await discoverCampaignSources(campaign);
    campaign.seed_urls = sourceDiscovery.seed_urls;
    campaign.source_plan = sourceDiscovery.source_plan;
    campaign.discovered_companies = sourceDiscovery.discovered_companies;
    campaign.market_discovery = sourceDiscovery.market_discovery;
    campaign.source_discovery_errors = sourceDiscovery.errors;
    campaign.source_discovered_at = sourceDiscovery.discovered_at;
    campaign.target_companies = sourceDiscovery.target_companies;
    campaign.source_types = sourceDiscovery.source_types;
    if (!sourceDiscovery.seed_urls.length && sourceDiscovery.discovered_companies.length) {
      const completedAt = now();
      const job = {
        id: uid("job"), team: TEAM, campaign_id: campaign.id, requested_by: user.email,
        status: "partial", phase: "finished", discovered: 0, saved: 0, enriched: 0, duplicates: 0,
        companies_discovered: sourceDiscovery.discovered_companies.length, provider_errors: {},
        message: `Found ${sourceDiscovery.discovered_companies.length} businesses. No accessible pages listing the requested people were verified, so no person records were created. Export the business list to ZoomInfo to identify contacts by title or seniority.`,
        source_results: { source_discovery: {
          pages_selected: 0, source_types: [], target_companies: sourceDiscovery.target_companies,
          errors: sourceDiscovery.errors, sources: [], companies_discovered: sourceDiscovery.discovered_companies.length,
          companies: sourceDiscovery.discovered_companies, market: sourceDiscovery.market_discovery,
        } }, created_at: completedAt, updated_at: completedAt, completed_at: completedAt,
      };
      campaign.status = "partial"; campaign.last_run_at = completedAt; campaign.next_run_at = ""; campaign.updated_at = completedAt;
      await db.batch([
        db.prepare("INSERT INTO discovery_jobs(id,team,campaign_id,requested_by_user_id,payload,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)").bind(job.id, TEAM, campaign.id, user.user_id, JSON.stringify(job)),
        db.prepare("UPDATE discovery_campaigns SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(campaign), campaign.id),
      ]);
      await audit(db, user, "run", "campaign", campaign.id, job.message);
      return json({ job });
    }
    if (!sourceDiscovery.seed_urls.length) {
      const detail = sourceDiscovery.errors[0] || "No businesses or accessible company intelligence pages were found.";
      throw new HttpError(422, `Website search could not produce a usable company or people list. ${detail}`);
    }
    const readiness = campaignRunReadiness(campaign);
    if (!readiness.runnable) throw new HttpError(422, readiness.message);
    campaign.seed_urls = readiness.seed_urls;
    campaign.sources = readiness.sources;
    campaign.auto_targeted = readiness.auto_targeted;
    campaign.target_companies = sourceDiscovery.target_companies.length ? sourceDiscovery.target_companies : readiness.target_companies;
    campaign.source_types = sourceDiscovery.source_types.length ? sourceDiscovery.source_types : readiness.source_types;
    campaign.status = "running";
    campaign.updated_at = now();
    await execute(db, "UPDATE discovery_campaigns SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", JSON.stringify(campaign), campaign.id);
    const job = { id: uid("job"), team: TEAM, campaign_id: campaign.id, requested_by: user.email, status: "running", phase: "discovering", discovered: 0, saved: 0, enriched: 0, duplicates: 0, companies_discovered: sourceDiscovery.discovered_companies.length, provider_errors: {}, message: "", created_at: now(), updated_at: now(), completed_at: "" };
    await execute(db, "INSERT INTO discovery_jobs(id,team,campaign_id,requested_by_user_id,payload,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)", job.id, TEAM, campaign.id, user.user_id, JSON.stringify(job));
    try {
      const discovery = await crawlCampaign(campaign);
      const crawlResultsByUrl = new Map(discovery.source_results.map(result => [catalogTargetKey(result.url), result]));
      const refreshedPlan = sourceDiscovery.source_plan.map(source => {
        const result = crawlResultsByUrl.get(catalogTargetKey(source.url));
        return result ? { ...source, status: result.status, people_found: result.candidates } : source;
      });
      for (const result of discovery.source_results) {
        if (Number(result.candidates) <= 0 || refreshedPlan.some(source => catalogTargetKey(source.url) === catalogTargetKey(result.url))) continue;
        refreshedPlan.push({
          url: result.url, company: result.company, source_type: sourceTypeForUrl(result.url), status: result.status,
          score: sourceScore(result.url, "", "site_link") + Math.min(Number(result.candidates), 10) * 3,
          discovery_method: "crawl_link", discovered_at: sourceDiscovery.discovered_at, people_found: result.candidates,
        });
      }
      const discardedStatuses = discovery.candidates.length ? ["failed", "blocked", "no_people"] : ["failed", "blocked"];
      sourceDiscovery.source_plan = cleanSourcePlan(refreshedPlan.filter(source => !discardedStatuses.includes(source.status)));
      sourceDiscovery.seed_urls = sourceDiscovery.source_plan.map(source => source.url);
      sourceDiscovery.source_types = unique(sourceDiscovery.source_plan.map(source => source.source_type));
      sourceDiscovery.target_companies = unique(sourceDiscovery.source_plan.map(source => source.company));
      campaign.seed_urls = sourceDiscovery.seed_urls;
      campaign.source_plan = sourceDiscovery.source_plan;
      campaign.source_types = sourceDiscovery.source_types;
      campaign.target_companies = sourceDiscovery.target_companies;
      const result = await saveCandidates(db, user, discovery.candidates, campaign.id);
      job.status = discovery.errors.length && !discovery.candidates.length ? "partial" : "complete";
      job.phase = "finished"; job.discovered = discovery.candidates.length; job.saved = result.saved; job.duplicates = result.duplicates;
      job.source_results = { public_web: {
        pages_attempted: discovery.pages_attempted, candidates: discovery.candidates.length,
        errors: discovery.errors, warnings: discovery.warnings, sources: discovery.source_results,
      }, source_discovery: {
        pages_selected: sourceDiscovery.seed_urls.length, source_types: sourceDiscovery.source_types,
        target_companies: sourceDiscovery.target_companies, errors: sourceDiscovery.errors,
        sources: sourceDiscovery.source_plan, companies_discovered: sourceDiscovery.discovered_companies.length,
        companies: sourceDiscovery.discovered_companies, market: sourceDiscovery.market_discovery,
      } };
      if (discovery.errors.length && !discovery.candidates.length) job.provider_errors.public_web = discovery.errors.join("; ");
      const verifiedPeopleCompanies = new Set(discovery.source_results.filter(source => Number(source.candidates) > 0).map(source => lower(source.company)).filter(Boolean));
      const companyOnlyCount = Math.max(0, sourceDiscovery.discovered_companies.length - verifiedPeopleCompanies.size);
      job.message = job.discovered
        ? `Website search${sourceDiscovery.discovered_companies.length ? ` found ${sourceDiscovery.discovered_companies.length} businesses and` : ""} verified ${sourceDiscovery.seed_urls.length} public page(s)${verifiedPeopleCompanies.size ? ` with people at ${verifiedPeopleCompanies.size} business(es)` : ""}. Extracted ${job.discovered} unique people; added ${job.saved} new lead(s) and updated ${job.duplicates} existing lead(s).${companyOnlyCount ? ` ${companyOnlyCount} business(es) remain company-only ZoomInfo candidates.` : ""}${discovery.warnings.length ? ` ${discovery.warnings.length} source(s) used a verified directory snapshot.` : ""}${discovery.errors.length ? ` ${discovery.errors.length} source(s) were skipped.` : ""}`
        : sourceDiscovery.discovered_companies.length
          ? `Found ${sourceDiscovery.discovered_companies.length} businesses, but no people matching the requested titles or seniority were confirmed on accessible pages. Export the business list to ZoomInfo to identify those contacts.`
        : discovery.errors.length
          ? `No people were extracted. ${discovery.errors[0]}`
          : `No matching people were extracted from ${discovery.pages_attempted} page(s). Check the page URLs and campaign filters.`;
      campaign.status = job.status;
    } catch (error) {
      job.status = "failed"; job.phase = "finished"; job.provider_errors.public_web = text(error.message, 1_000);
      job.message = `Campaign could not run: ${text(error.message, 500)}`; campaign.status = "failed";
    }
    job.completed_at = now(); job.updated_at = job.completed_at;
    campaign.last_run_at = job.completed_at; campaign.next_run_at = ""; campaign.updated_at = job.completed_at;
    await db.batch([
      db.prepare("UPDATE discovery_jobs SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(job), job.id),
      db.prepare("UPDATE discovery_campaigns SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(campaign), campaign.id),
    ]);
    await audit(db, user, "run", "campaign", campaign.id, job.message);
    return json({ job });
  }
  if (!match[2] && request.method === "PATCH") {
    const patch = await requestJSON(request);
    for (const name of ["name", "employers", "titles", "locations", "seniorities", "industries", "max_companies", "radius_miles", "keywords", "seed_urls", "sources", "max_leads", "enrich_web", "auto_discover_sources", "schedule"]) {
      if (Object.prototype.hasOwnProperty.call(patch, name)) campaign[name] = patch[name];
    }
    campaign.name = text(campaign.name, 120);
    campaign.max_leads = clamp(campaign.max_leads, 1, 500);
    campaign.max_companies = clamp(campaign.max_companies || 20, 1, MAX_MARKET_COMPANIES);
    campaign.radius_miles = clamp(campaign.radius_miles || DEFAULT_MARKET_RADIUS_MILES, 1, MAX_MARKET_RADIUS_MILES);
    if (Object.prototype.hasOwnProperty.call(patch, "source_plan")) campaign.source_plan = cleanSourcePlan(patch.source_plan);
    else campaign.source_plan = cleanSourcePlan(campaign.source_plan);
    if (Object.prototype.hasOwnProperty.call(patch, "discovered_companies")) campaign.discovered_companies = cleanMarketCompanies(patch.discovered_companies);
    else campaign.discovered_companies = cleanMarketCompanies(campaign.discovered_companies);
    if (Object.prototype.hasOwnProperty.call(patch, "market_discovery")) campaign.market_discovery = cleanMarketDiscovery(patch.market_discovery);
    else campaign.market_discovery = cleanMarketDiscovery(campaign.market_discovery);
    campaign.source_discovery_errors = [];
    campaign.source_discovered_at = "";
    const readiness = campaignRunReadiness(campaign);
    campaign.seed_urls = readiness.seed_urls;
    campaign.sources = readiness.sources;
    campaign.auto_targeted = readiness.auto_targeted;
    campaign.target_companies = readiness.target_companies;
    campaign.source_types = readiness.source_types;
    if (campaign.source_plan.length || campaign.discovered_companies.length) {
      campaign.source_discovered_at = now();
      campaign.target_companies = unique([...campaign.source_plan.map(source => source.company), ...campaign.discovered_companies.map(company => company.name)]);
      campaign.source_types = unique(campaign.source_plan.map(source => source.source_type));
    }
    campaign.schedule = "manual"; campaign.next_run_at = "";
    campaign.status = "draft"; campaign.updated_at = now();
    await execute(db, "UPDATE discovery_campaigns SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", JSON.stringify(campaign), campaign.id);
    await audit(db, user, "update", "campaign", campaign.id);
    return json({ campaign });
  }
  if (!match[2] && request.method === "DELETE") {
    await execute(db, "DELETE FROM discovery_campaigns WHERE id=? AND team=?", campaign.id, TEAM);
    await audit(db, user, "delete", "campaign", campaign.id);
    return new Response(null, { status: 204 });
  }
  throw new HttpError(405, "Method not allowed.");
}

async function jobsRoutes(request, db, user, path, url) {
  if (path === `${API}/jobs` && request.method === "GET") {
    let rows = await many(db, "SELECT payload,requested_by_user_id FROM discovery_jobs WHERE team=? ORDER BY updated_at DESC LIMIT 100", TEAM);
    if (user.role !== "admin") rows = rows.filter(row => row.requested_by_user_id === user.user_id);
    let jobs = rows.map(row => parseJSON(row.payload)).filter(Boolean);
    const campaignId = text(url.searchParams.get("campaign_id"), 160);
    if (campaignId) jobs = jobs.filter(job => job.campaign_id === campaignId);
    return json({ jobs, count: jobs.length });
  }
  const match = path.match(new RegExp(`^${API}/jobs/([^/]+)$`));
  if (!match || request.method !== "GET") return null;
  const row = await one(db, "SELECT payload,requested_by_user_id FROM discovery_jobs WHERE id=? AND team=?", decodeURIComponent(match[1]), TEAM);
  if (!row || (user.role !== "admin" && row.requested_by_user_id !== user.user_id)) throw new HttpError(404, "Job not found.");
  return json({ job: parseJSON(row.payload) });
}

function sortLeads(leads, fieldName, direction) {
  const multiplier = direction === "asc" ? 1 : -1;
  return leads.sort((a, b) => {
    const av = a[fieldName] ?? "", bv = b[fieldName] ?? "";
    return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * multiplier;
  });
}

async function leadRoutes(request, db, user, path, url) {
  if (path === `${API}/leads` && request.method === "GET") {
    let items = await visibleLeadRows(db, user);
    const search = lower(url.searchParams.get("search"));
    const tier = text(url.searchParams.get("tier"), 20);
    const status = text(url.searchParams.get("status"), 80);
    const ownership = text(url.searchParams.get("ownership"), 20);
    const campaignId = text(url.searchParams.get("campaign_id"), 160);
    const identityStatus = text(url.searchParams.get("identity_status"), 20);
    const zoomInfoStatus = normalizeZoomInfoMatchStatus(url.searchParams.get("zoominfo_status"));
    const minPriority = Number(url.searchParams.get("min_priority") || 0);
    const priorityBand = text(url.searchParams.get("priority_band"), 20);
    if (search) items = items.filter(({ lead }) => lower([lead.first_name, lead.last_name, lead.current_title, lead.company, lead.location, lead.email].join(" ")).includes(search));
    if (tier) items = items.filter(({ lead }) => lead.tier === tier);
    if (status) items = items.filter(({ lead }) => lead.follow_up_status === status);
    if (campaignId) items = items.filter(({ lead }) => array(lead.campaign_ids).includes(campaignId));
    if (identityStatus) items = items.filter(({ lead }) => lead.identity_status === identityStatus);
    else items = items.filter(({ lead }) => lead.identity_status !== "excluded");
    if (zoomInfoStatus !== "not_submitted" || url.searchParams.has("zoominfo_status")) items = items.filter(({ lead }) => normalizeZoomInfoMatchStatus(lead.zoominfo_match_status) === zoomInfoStatus);
    if (minPriority) items = items.filter(({ lead }) => Number(lead.priority_score || 0) >= minPriority);
    if (ownership === "mine") items = items.filter(({ row }) => row.owner_user_id === user.user_id || lower(row.owner_email) === lower(user.email));
    if (ownership === "shared") items = items.filter(({ row, lead }) => row.owner_user_id !== user.user_id && lower(row.owner_email) !== lower(user.email) && array(lead.shared_with).map(lower).includes(lower(user.email)));
    if (priorityBand === "high") {
      const highPriorityIds = highPriorityLeadIds(items.map(item => item.lead));
      items = items.filter(({ lead }) => highPriorityIds.has(lead.id));
    }
    const sort = text(url.searchParams.get("sort") || "priority_score", 80);
    const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
    const leads = sortLeads(items.map(item => item.lead), sort, order);
    const total = leads.length;
    const limit = clamp(url.searchParams.get("limit") || 50, 1, 500);
    const offset = clamp(url.searchParams.get("offset") || 0, 0, 100_000_000);
    return json({ leads: leads.slice(offset, offset + limit), total, page: Math.floor(offset / limit) + 1, pages: Math.max(1, Math.ceil(total / limit)) });
  }
  const match = path.match(new RegExp(`^${API}/leads/([^/]+)$`));
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  const row = await one(db, "SELECT * FROM discovery_leads WHERE id=? AND team=?", id, TEAM);
  const lead = row ? qualifyLead(leadFromRow(row)) : null;
  if (!row || !lead || !canReadLead(row, lead, user)) throw new HttpError(404, "Lead not found.");
  if (request.method === "GET") return json({ lead });
  if (request.method !== "PATCH") throw new HttpError(405, "Method not allowed.");
  const patch = await requestJSON(request);
  const workflowOnly = new Set(["follow_up_status", "follow_up_date", "notes"]);
  if (user.role !== "admin" && row.owner_user_id !== user.user_id && lower(row.owner_email) !== lower(user.email)) {
    if (Object.keys(patch).some(key => !workflowOnly.has(key))) throw new HttpError(403, "Shared advisors can update only follow-up status, date, and notes.");
  }
  const allowed = new Set(["first_name", "last_name", "current_title", "company", "location", "email", "linkedin_url", "identity_status", "follow_up_status", "follow_up_date", "notes"]);
  if (Object.prototype.hasOwnProperty.call(patch, "identity_status") && !["review", "matched", "excluded"].includes(patch.identity_status)) throw new HttpError(422, "Unknown identity status.");
  for (const [key, value] of Object.entries(patch)) if (allowed.has(key)) lead[key] = value;
  if (lead.follow_up_status && !FOLLOW_UP_STATUSES.has(lead.follow_up_status)) throw new HttpError(422, "Unknown follow-up status.");
  lead.updated_at = now();
  qualifyLead(lead);
  await execute(db, "UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=?", JSON.stringify(lead), id, TEAM);
  await audit(db, user, "update", "lead", id, Object.keys(patch).join(","));
  return json({ lead });
}

async function bulkRoute(request, db, user) {
  const body = await requestJSON(request);
  const ids = unique(body.lead_ids || []).slice(0, 1_000);
  if (!ids.length) throw new HttpError(422, "Select at least one lead.");
  const action = text(body.action, 30);
  let updated = 0, skipped = 0;
  const errors = {};
  for (const id of ids) {
    try {
      const row = await one(db, "SELECT * FROM discovery_leads WHERE id=? AND team=?", id, TEAM);
      let lead = leadFromRow(row);
      if (!row || !lead || !canReadLead(row, lead, user)) throw new HttpError(404, "Lead not found.");
      let ownerUserId = row.owner_user_id, ownerEmail = row.owner_email;
      if (action === "delete") {
        if (user.role !== "admin" && row.owner_user_id !== user.user_id) throw new HttpError(403, "Only the owner or an admin can delete this lead.");
        await execute(db, "DELETE FROM discovery_leads WHERE id=? AND team=?", id, TEAM);
      } else if (action === "update") {
        if (body.follow_up_status) {
          if (!FOLLOW_UP_STATUSES.has(body.follow_up_status)) throw new HttpError(422, "Unknown follow-up status.");
          lead.follow_up_status = body.follow_up_status;
        }
        if (Object.prototype.hasOwnProperty.call(body, "follow_up_date")) lead.follow_up_date = body.follow_up_date || null;
        lead.updated_at = now();
        qualifyLead(lead);
        await execute(db, "UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=?", JSON.stringify(lead), id, TEAM);
      } else {
        if (user.role !== "admin") throw new HttpError(403, "Only an admin can change lead access.");
        if (action === "share") {
          const sharedEmail = lower(body.advisor_email);
          if (!sharedEmail.includes("@")) throw new HttpError(422, "Enter a valid advisor email.");
          lead.shared_with = unique([...array(lead.shared_with), sharedEmail]);
        }
        else if (action === "assign") {
          ownerEmail = lower(body.advisor_email);
          if (!ownerEmail.includes("@")) throw new HttpError(422, "Enter a valid advisor email.");
          const recipient = await one(db, "SELECT user_id FROM discovery_users WHERE email=?", ownerEmail);
          ownerUserId = recipient?.user_id || "";
          lead.owner_email = ownerEmail;
        } else if (action === "reclaim") {
          ownerEmail = user.email; ownerUserId = user.user_id; lead.owner_email = user.email;
        } else throw new HttpError(422, "Unknown bulk action.");
        lead.updated_at = now();
        qualifyLead(lead);
        await execute(db, "UPDATE discovery_leads SET owner_user_id=?,owner_email=?,payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=?", ownerUserId, ownerEmail, JSON.stringify(lead), id, TEAM);
      }
      await audit(db, user, action, "lead", id, body.advisor_email || "");
      updated += 1;
    } catch (error) {
      skipped += 1;
      errors[id] = error.message || "Update failed";
    }
  }
  return json({ result: { action, requested: ids.length, updated, skipped, lead_ids: ids.filter(id => !errors[id]), errors } });
}

async function importRoute(request, db, user, path, url) {
  const format = path.endsWith("/linkedin") ? "linkedin" : "csv";
  const source = await readBody(request);
  let leads;
  if (format === "linkedin") leads = parseLinkedInSnapshot(source);
  else {
    const rows = parseCSV(source);
    const detectedZoomInfo = rows.length && Object.keys(rows[0]).some(header => normalizedHeader(header).includes("zoominfo"));
    const headers = rows.length ? new Set(Object.keys(rows[0]).map(normalizedHeader)) : new Set();
    const detectedListMatch = headers.has("matchstatus") && headers.has("externalid") && headers.has("zoominfocontactid");
    const detectedLinkedIn = headers.has("firstname") && headers.has("lastname") && headers.has("url")
      && (headers.has("position") || headers.has("connectedon"));
    const provider = text(url.searchParams.get("provider") || (detectedListMatch ? "zoominfo_listmatch" : detectedZoomInfo ? "zoominfo" : detectedLinkedIn ? "linkedin" : "csv"), 50);
    if (!new Set(["csv", "zoominfo", "zoominfo_listmatch", "apollo", "linkedin", "qualifier"]).has(provider)) throw new HttpError(422, "Unsupported CSV provider.");
    leads = provider === "linkedin"
      ? rows.map(normalizeLinkedInConnection)
      : provider === "zoominfo_listmatch"
        ? rows.map(normalizeZoomInfoListMatch)
        : rows.map(row => normalizeLead(provider === "qualifier" ? {...row, "Qualifier Source": field(row, "Qualifier Source") || "Lead Qualifier"} : row, { source: provider === "qualifier" ? "Lead Qualifier" : provider === "zoominfo" ? "ZoomInfo CSV" : provider === "apollo" ? "Apollo CSV" : "CSV import" }));
  }
  if (!leads.length) throw new HttpError(400, "No lead records were found in that file.");
  if (leads.length > MAX_IMPORT_ROWS) throw new HttpError(413, `Imports are limited to ${MAX_IMPORT_ROWS.toLocaleString("en-US")} records.`);
  const campaignId = text(url.searchParams.get("campaign_id"), 160);
  const result = await saveCandidates(db, user, leads, campaignId);
  await audit(db, user, "import", "lead", format, `${result.saved} saved; ${result.duplicates} merged`);
  const match_summary = leads.some(lead => array(lead.source_names).includes("ZoomInfo ListMatch")) ? summarizeZoomInfoMatches(leads) : null;
  return json({ status: "complete", imported: leads.length, ...result, ...(match_summary ? { match_summary } : {}) }, 201);
}

async function apiRoutes(request, env, path, url) {
  if (!env.DB) throw new HttpError(503, "Shared database is unavailable.");
  const identity = requestIdentity(request);
  if (!identity) throw new HttpError(401, "Sign in with ChatGPT to access this workspace.");
  const user = await ensureUser(env.DB, identity);
  if(path.startsWith('/api/research/')) return researchRoutes(request,env,user,path,url);
  if(path.startsWith('/api/wealthfeed/')) return wealthfeedRoutes(request,env,user,path);
  if(path.startsWith('/api/enrichment/')) return enrichmentRoutes(request,env,user,path);
  if (path.startsWith('/api/beta/') && typeof weeklyRoutes === 'function') return weeklyRoutes(request, env, user, path, url);
  if (path === "/api/me") return json({ signed_in: true, email: user.email, name: user.full_name, is_admin: user.role === "admin", providers: { google: false, microsoft: false, password: false }, storage: "shared" });
  if (path === `${API}/providers` && request.method === "GET") return json({ providers: [
    { name: "public_web", label: "Website search", configured: true, runnable: true, kind: "crawl", description: "Finds and ranks official team, staff, professional, leadership, governance, biography, filing, and newsroom pages automatically." },
    { name: "market_directory", label: "Market company discovery", configured: true, runnable: false, kind: "discovery", description: "Finds businesses within a selected radius before locating people by title or seniority. Uses public OpenStreetMap business data." },
    { name: "csv", label: "Lead files", configured: true, runnable: false, kind: "import", description: "Candidate lists, ZoomInfo ListMatch previews, and Enhance exports merge into one prospect." },
    { name: "linkedin_connections", label: "LinkedIn connections export", configured: true, runnable: false, kind: "import", description: "Imports LinkedIn's Connections.csv with profile URLs, company, position, email when supplied, and connection date." },
    { name: "linkedin_snapshot", label: "LinkedIn scraper JSON", configured: true, runnable: false, kind: "import", description: "Imports dst-boop/linkedin_scraper v3 profile JSON with roles, tenure, education, contacts, and source evidence." },
    { name: "broad_web_search", label: "Broad web search", configured: false, runnable: false, kind: "connector", description: "Requires a search-provider connector; targeted website crawling works without one." },
  ] });
  if (path === `${API}/source-discovery` && request.method === "POST") {
    const body = await requestJSON(request);
    const campaign = {
      name: text(body.name, 120), employers: unique(body.employers || []).slice(0, 100),
      titles: unique(body.titles || []).slice(0, 100), seniorities: unique(body.seniorities || []).slice(0, 20),
      locations: unique(body.locations || []).slice(0, 100), keywords: unique(body.keywords || []).slice(0, 50),
      industries: unique(body.industries || []).slice(0, 20), max_companies: clamp(body.max_companies || 20, 1, MAX_MARKET_COMPANIES),
      radius_miles: clamp(body.radius_miles || DEFAULT_MARKET_RADIUS_MILES, 1, MAX_MARKET_RADIUS_MILES),
      seed_urls: unique(body.seed_urls || []).slice(0, 20), source_plan: cleanSourcePlan(body.source_plan),
      market_discovery: cleanMarketDiscovery(body.market_discovery), auto_discover_sources: body.auto_discover_sources !== false,
    };
    if (!campaign.employers.length && !campaign.seed_urls.length && !suggestCampaignTargets(campaign).length && !(campaign.industries.length && campaign.locations.length)) {
      throw new HttpError(422, "Add a business type plus location, a known employer, or an official company website before finding sources.");
    }
    const previous = cachedCampaignDiscovery(body);
    let discovery = await discoverCampaignSources(campaign);
    if (!discovery.seed_urls.length && !discovery.discovered_companies.length && previous) {
      discovery = { ...previous, errors: unique([...(discovery.errors || []), "The refresh did not replace your last successful company and source list."]), preserved_previous_results: true };
    }
    if (!discovery.seed_urls.length && !discovery.discovered_companies.length) throw new HttpError(422, `No businesses or accessible intelligence pages were verified. ${discovery.errors[0] || "Try a more specific location or add a company domain."}`);
    return json(discovery);
  }
  if (path === `${API}/metrics` && request.method === "GET") {
    const allLeads = (await visibleLeadRows(env.DB, user)).map(item => item.lead);
    const leads = allLeads.filter(lead => lead.identity_status !== "excluded");
    return json({ leads: leads.length, total_leads: leads.length, high_priority: highPriorityLeadIds(leads).size, high_priority_share: HIGH_PRIORITY_SHARE, timely_signals: leads.filter(lead => lead.timing_score >= 65).length, follow_ups_due: leads.filter(lead => lead.follow_up_date && lead.follow_up_date <= today() && !["Meeting Set", "Not a Fit"].includes(lead.follow_up_status)).length, identity_review: leads.filter(lead => lead.identity_status === "review").length, identity_excluded: allLeads.filter(lead => lead.identity_status === "excluded").length, zoominfo: summarizeZoomInfoMatches(leads) });
  }
  const campaigns = await campaignRoutes(request, env.DB, user, path, url);
  if (campaigns) return campaigns;
  const jobs = await jobsRoutes(request, env.DB, user, path, url);
  if (jobs) return jobs;
  if (path === `${API}/leads/bulk` && request.method === "PATCH") return bulkRoute(request, env.DB, user);
  const leads = await leadRoutes(request, env.DB, user, path, url);
  if (leads) return leads;
  if ((path === `${API}/imports/csv` || path === `${API}/imports/linkedin`) && request.method === "POST") return importRoute(request, env.DB, user, path, url);
  if (path === `${API}/export/salesforce` && request.method === "POST") {
    const body = await requestJSON(request);
    const selected = new Set(unique(body.lead_ids || []));
    if (!selected.size) throw new HttpError(422, "Select at least one lead before export.");
    const leadsForExport = (await visibleLeadRows(env.DB, user)).filter(item => selected.has(item.lead.id)).map(item => item.lead);
    if (leadsForExport.length !== selected.size) throw new HttpError(404, "One or more selected leads are unavailable.");
    await audit(env.DB, user, "export", "lead", "salesforce", `${leadsForExport.length} leads`);
    return new Response(salesforceCSV(leadsForExport), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="salesforce-prospects-${today()}.csv"`, "cache-control": "no-store" } });
  }
  if (path === `${API}/export/zoominfo` && request.method === "POST") {
    const body = await requestJSON(request);
    const selected = new Set(unique(body.lead_ids || []));
    if (!selected.size) throw new HttpError(422, "Select at least one lead before export.");
    const leadsForExport = (await visibleLeadRows(env.DB, user)).filter(item => selected.has(item.lead.id)).map(item => item.lead);
    if (leadsForExport.length !== selected.size) throw new HttpError(404, "One or more selected leads are unavailable.");
    await audit(env.DB, user, "export", "lead", "zoominfo", `${leadsForExport.length} leads`);
    return new Response(zoomInfoCandidateCSV(leadsForExport), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="zoominfo-candidates-${today()}.csv"`, "cache-control": "no-store" } });
  }
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('origin') && request.headers.get('origin') !== url.origin) throw new HttpError(403, 'Please use this app to save changes.');
      if (path === "/" || path === "/discovery") return new Response(path === '/' && typeof BETA_HTML === 'string' ? BETA_HTML : PAGE_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } });
      if(path === '/research-native.js' && request.method === 'GET') return new Response(NATIVE_RESEARCH_JS,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
      if(path === '/research' && request.method === 'GET') return new Response(RESEARCH_HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
      if(path === '/enrichment' && request.method === 'GET') return new Response(ENRICHMENT_HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
      if(path === '/wealthfeed' && request.method === 'GET') return new Response(WEALTHFEED_HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'"}});
      if (path === "/favicon.ico") return new Response(null, { status: 204 });
      if (path.startsWith("/api/")) return await apiRoutes(request, env, path, url);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error("Prospect Discovery request failed", error);
      return json({ detail: status === 500 ? "The request could not be completed." : error.message }, status);
    }
  },
};

const ENRICH=(()=>{
// Provider file exchange. No provider network requests, credentials or browser access.
const providers = Object.freeze({
  zoominfo: {name:'ZoomInfo', url:'https://app.zoominfo.com/', verified:false},
  wealthfeed: {name:'WealthFeed', url:'https://portal.wealthfeed.com/', verified:false}
});
const norm = v => String(v ?? '').normalize('NFKC').trim().toLowerCase();
const header = v => norm(v).replace(/[^a-z0-9]/g,'');
const aliases = {
  first_name:['first name','firstname'], last_name:['last name','lastname'],
  company:['company name','company','employer'], current_title:['job title','title','position'],
  email:['email','email address','business email'], business_phone:['direct phone number','direct phone','business phone'],
  mobile_phone:['mobile phone','mobile phone number'], city:['city','person city'], state:['state','person state'],
  postal_code:['zip','zip code','postal code'], address:['street address','address'],
  linkedin_url:['linkedin contact profile url','linkedin url','linkedin profile url'],
  company_domain:['company domain'], external_id:['external id','workspace lead id'],
  zoominfo_id:['zoominfo contact id','zoominfo person id'], wealthfeed_id:['wealthfeed id','wealthfeed contact id','wealthfeed person id'],
  estimated_net_worth:['estimated net worth','net worth','net worth range'], match_status:['match status']
};
const keys = new Map(Object.entries(aliases).flatMap(([k,v])=>v.map(a=>[header(a),k])));
const fields = ['email','business_phone','mobile_phone','current_title','company','city','state','postal_code','address','linkedin_url','company_domain','estimated_net_worth'];
function parseCSV(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 5*1024*1024) throw Error('Choose a CSV smaller than 5 MB.');
  source=source.replace(/^\uFEFF/,'');
  if (source.includes('\0')) throw Error('This file is not a supported UTF-8 CSV.');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const endCell=()=>{row.push(cell);cell='';closed=false;};
  const endRow=()=>{endCell();if(row.some(x=>x!==''))rows.push(row);row=[];if(rows.length>5001)throw Error('Choose at most 5,000 records.');};
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c==='"'){if(cell||closed)throw Error('Invalid CSV quoting.');quoted=true;}
    else if(c===',')endCell();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;endRow();}
    else {if(closed)throw Error('Unexpected text after a quoted CSV value.');cell+=c;}
    if(cell.length>20000||row.length>200)throw Error('CSV cells or columns exceed the supported size.');
  }
  if(quoted)throw Error('The CSV contains an unfinished quoted value.');
  if(cell||row.length||closed)endRow();
  if(rows.length<2)throw Error('The CSV needs headers and at least one record.');
  const headers=rows.shift();const names=headers.map(header);
  if(names.some(x=>!x)||new Set(names).size!==names.length)throw Error('CSV headers must be unique and nonempty.');
  const mapped=headers.map(h=>keys.get(header(h)));
  if(new Set(mapped.filter(Boolean)).size!==mapped.filter(Boolean).length)throw Error('Two columns describe the same field. Keep one before importing.');
  return {headers,rows:rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`Row ${i+2} has the wrong number of columns.`);return Object.fromEntries(mapped.flatMap((k,j)=>k?[[k,r[j].trim()]]:[]));})};
}
function recognize(headers) {
  const names=new Set(headers.map(header));
  const z=aliases.zoominfo_id.some(x=>names.has(header(x))), w=aliases.wealthfeed_id.some(x=>names.has(header(x)));
  if(z&&w)throw Error('This file contains identifiers from both providers. Export one provider at a time.');
  return z?'zoominfo':w?'wealthfeed':null;
}
function cell(v){let s=String(v??'');if(/^[\s\uFEFF]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportCSV(provider,leads,template=null) {
  if(!providers[provider])throw Error('Choose a supported provider.');
  if(!leads.length||leads.length>5000)throw Error('Select between 1 and 5,000 leads.');
  // Draft defaults must not be described as verified provider templates.
  const headers=template||['First Name','Last Name','Company Name','Email','City','State','LinkedIn URL','External ID'];
  if(!Array.isArray(headers)||!headers.length||headers.some(h=>!keys.has(header(h))))throw Error('The provider template contains unsupported columns.');
  if(new Set(headers.map(header)).size!==headers.length)throw Error('Duplicate template columns.');
  const rows=leads.map(l=>headers.map(h=>cell(keys.get(header(h))==='external_id'?l.id:l[keys.get(header(h))])) .join(','));
  return '\uFEFF'+[headers.map(cell).join(','),...rows].join('\r\n');
}
function linkedin(v){try{const u=new URL(v);return u.protocol==='https:'&&/^(www\.)?linkedin\.com$/.test(u.hostname)&&/^\/in\/[^/]+\/?$/.test(u.pathname)?u.pathname.replace(/\/$/,'').toLowerCase():'';}catch{return '';}}
function valueValid(k,v){
  if(v.length>1000)return false;
  if(k==='email')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if(k==='linkedin_url')return !!linkedin(v);
  if(k.endsWith('phone'))return /^\+?[\d ().-]+$/.test(v)&&v.replace(/\D/g,'').length>=8&&v.replace(/\D/g,'').length<=15;
  return true;
}
function planImport(source,leads,{provider:chosen,batchIds=null}={}) {
  const parsed=parseCSV(source), detected=recognize(parsed.headers);
  if(chosen&&!providers[chosen])throw Error('Choose a supported provider.');
  if(detected&&chosen&&chosen!==detected)throw Error('The file belongs to a different provider.');
  const provider=detected||chosen;
  if(!provider)throw Error('Provider not recognized. Select the provider that exported this file.');
  const scoped=batchIds?leads.filter(l=>batchIds.includes(l.id)):leads;
  const results=[],seen=new Set(),matched=new Map();
  for(const [i,r] of parsed.rows.entries()){
    const item={row:i+2,status:'unmatched',lead_id:null,changes:{},conflicts:[],invalid:[]};
    const fingerprint=JSON.stringify(r);
    if(seen.has(fingerprint)){results.push({...item,status:'duplicate'});continue;}seen.add(fingerprint);
    if(r.match_status&&!['matched','match','exact match','exact','unique match'].includes(norm(r.match_status))){results.push({...item,status:'review',reason:'Provider did not report a unique match.'});continue;}
    const identifiers=[['external_id',l=>l.id],['email',l=>l.email],[provider+'_id',l=>l.source_record_ids?.[provider]],[ 'linkedin_url',l=>l.linkedin_url]];
    const sets=identifiers.filter(([k])=>r[k]).map(([k,get])=>scoped.filter(l=>{const a=k==='linkedin_url'?linkedin(r[k]):norm(r[k]);const b=k==='linkedin_url'?linkedin(get(l)):norm(get(l));return a&&b&&a===b;}));
    const candidates=new Map(sets.flat().map(l=>[l.id,l]));
    if(candidates.size!==1||sets.some(s=>s.length>1)){results.push({...item,status:candidates.size?'review':'unmatched',reason:'A unique shared identifier is required.'});continue;}
    const lead=[...candidates.values()][0];item.lead_id=lead.id;
    const contradictions=identifiers.filter(([k,get])=>r[k]&&get(lead)&& (k==='linkedin_url'?linkedin(r[k])!==linkedin(get(lead)):norm(r[k])!==norm(get(lead))));
    if(contradictions.length||['first_name','last_name'].some(k=>r[k]&&lead[k]&&norm(r[k])!==norm(lead[k]))){results.push({...item,status:'review',reason:'Identity details disagree.'});continue;}
    for(const k of fields){if(!r[k])continue;if(!valueValid(k,r[k])){item.invalid.push(k);continue;}if(!lead[k])item.changes[k]=r[k];else if(norm(lead[k])!==norm(r[k]))item.conflicts.push({field:k,current:lead[k],incoming:r[k]});}
    item.provider_id=r[provider+'_id']||null;
    item.status=item.conflicts.length||item.invalid.length?'review':Object.keys(item.changes).length||(item.provider_id&&!lead.source_record_ids?.[provider])?'ready':'unchanged';
    if(matched.has(lead.id)){const previous=matched.get(lead.id);previous.status='review';previous.reason='Multiple different rows target this person.';item.status='review';item.reason=previous.reason;}else matched.set(lead.id,item);
    results.push(item);
  }
  return {provider,recognized:!!detected,ignored_columns:parsed.headers.filter(h=>!keys.has(header(h))),results,counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})};
}
function applyPlan(plan,leads,{batchId,now=new Date().toISOString()}={}) {
  if(!batchId)throw Error('An import batch reference is required.');
  const byId=new Map(plan.results.filter(r=>r.status==='ready').map(r=>[r.lead_id,r]));
  return leads.map(l=>{const r=byId.get(l.id);if(!r)return l;
    if(Object.keys(r.changes).some(k=>l[k]))throw Error('A lead changed after preview. Preview the file again.');
    const api=plan.source==='WealthFeed API';
    return {...l,...r.changes,...(api?{wealthfeed_phone_checks:{...l.wealthfeed_phone_checks,...r.phone_checks},evidence:[...(l.evidence||[]),...Object.entries(r.changes).map(([field,value])=>({id:batchId+':'+field,field,value,source:'WealthFeed',kind:'reported',observed_at:now,source_url:'',snippet:'Provider-reported information; not independently verified.'}))]}:{}),source_record_ids:{...l.source_record_ids,...(r.provider_id?{[plan.provider]:r.provider_id}:{})},enrichment_history:[...(l.enrichment_history||[]),{provider:plan.provider,batch_id:batchId,imported_at:now,fields:Object.keys(r.changes),source:plan.source||'user-uploaded CSV'}]};
  });
}
const releaseStatus = {ready:false,blockers:['ZoomInfo account CSV template and upload/download round trip not verified.','WealthFeed account CSV template and upload/download round trip not verified.','Provider-assisted browser workflow requires acceptance testing in the user’s own account.']};

return {providers,parseCSV,recognize,exportCSV,planImport,applyPlan,releaseStatus};})();
// Concatenate after worker-runtime.js with ENRICH namespace and ENRICHMENT_HTML.
async function enrichmentRoutes(request, env, user, path) {
  if (!path.startsWith('/api/enrichment/')) return null;
  const db=env.DB;
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(path==='/api/enrichment/status'&&request.method==='GET')return reply({providers:ENRICH.providers,release:ENRICH.releaseStatus,connection:'File exchange only. Your provider account is not connected.'});
  // Read access alone does not authorize enrichment writes or exporting shared leads.
  const owned=(await visibleLeadRows(db,user)).filter(({row})=>row.owner_user_id===user.user_id||lower(row.owner_email)===lower(user.email));
  if(path==='/api/enrichment/leads'&&request.method==='GET')return reply({leads:owned.map(({lead})=>{
    const phone=[lead.phone,lead.mobile_phone,lead.business_phone].some(callNumber);
    const locator=!!(lead.email||phone||lead.linkedin_url||(lead.first_name&&lead.last_name&&(lead.address||(lead.city&&lead.state))));
    const matchStrength=(lead.email?4:0)+(phone?4:0)+(lead.linkedin_url?3:0)+(lead.address?2:0)+(lead.city&&lead.state?1:0);
    const pageLabel=/^(privacy|news|disclosure|terms|careers?|contact|read more|learn more|home|about)(\s|$)/i.test(String(lead.first_name||'')+' '+String(lead.last_name||''));
    return {id:lead.id,first_name:lead.first_name,last_name:lead.last_name,company:lead.company,eligible:locator&&!pageLabel&&lead.identity_status!=='excluded',identity_status:lead.identity_status,match_strength:matchStrength,priority_score:Number(lead.priority_score||0),missing_age:!lead.estimated_age_range,missing_phone:!phone,missing_linkedin:!lead.linkedin_url};
  })});
  if(request.method!=='POST')throw new HttpError(404,'Not found.');
  let body;try{body=JSON.parse(await readBody(request));}catch(e){throw new HttpError(422,e.message||'Choose a valid file.');}
  if(path==='/api/enrichment/export') {
    const ids=Array.isArray(body.lead_ids)?[...new Set(body.lead_ids)]:[];
    const selected=owned.filter(({lead})=>ids.includes(lead.id));
    if(!ids.length||selected.length!==ids.length)throw new HttpError(422,'Select available leads assigned to you.');
    let csv;try{csv=ENRICH.exportCSV(body.provider,selected.map(x=>x.lead));}catch(e){throw new HttpError(422,e.message);}
    const id=crypto.randomUUID();
    await execute(db,'INSERT INTO enrichment_batches(id,user_id,provider,status,payload) VALUES(?,?,?,?,?)',id,user.user_id,body.provider,'awaiting_upload',JSON.stringify({ids}));
    return reply({batch_id:id,csv,filename:body.provider+'-candidates.csv',status:'awaiting_upload',format_verified:false});
  }
  if(path==='/api/enrichment/preview') {
    let batch=null;
    if(body.batch_id){batch=await one(db,'SELECT * FROM enrichment_batches WHERE id=? AND user_id=?',body.batch_id,user.user_id);if(!batch)throw new HttpError(404,'This export is unavailable.');}
    let plan;try{plan=ENRICH.planImport(body.csv,owned.map(x=>x.lead),{provider:batch?.provider||body.provider||undefined,batchIds:batch?JSON.parse(batch.payload).ids:null});}catch(e){throw new HttpError(422,e.message);}
    const id=crypto.randomUUID(),targets=new Set(plan.results.filter(r=>r.status==='ready').map(r=>r.lead_id));
    if(targets.size>500)throw new HttpError(422,'Choose at most 500 ready leads per file.');
    const snapshot=await Promise.all(owned.filter(x=>targets.has(x.lead.id)).map(async x=>({id:x.row.id,hash:await hash(x.row.payload)})));
    const stored=JSON.stringify({plan,snapshot,export_id:batch?.id||null,applied:0});
    if(new TextEncoder().encode(stored).length>1800000)throw new HttpError(422,'This preview contains too much detail. Choose a smaller file.');
    await execute(db,'INSERT INTO enrichment_batches(id,user_id,provider,status,payload) VALUES(?,?,?,?,?)',id,user.user_id,plan.provider,'preview',stored);
    return reply({batch_id:id,...plan,status:'preview',message:'Only ready rows will fill empty fields. Review rows are held without changes.'});
  }
  if(path==='/api/enrichment/commit') {
    const batch=await one(db,'SELECT * FROM enrichment_batches WHERE id=? AND user_id=?',body.batch_id,user.user_id);
    if(!batch)throw new HttpError(404,'This preview is unavailable.');
    if(batch.status==='complete')return reply({status:'complete',replayed:true,applied:JSON.parse(batch.payload).applied||0});
    if(batch.status!=='preview')throw new HttpError(409,'Preview the file before applying it.');
    const saved=JSON.parse(batch.payload),{plan}=saved,remaining=saved.snapshot.slice(40);
    const snapshot=[];
    for(const original of saved.snapshot.slice(0,40)){const item=owned.find(x=>x.row.id===original.id);if(!item||await hash(item.row.payload)!==original.hash)throw new HttpError(409,'A lead changed or is no longer assigned to you. Earlier saved groups were kept. Preview the remaining file again.');snapshot.push({id:original.id,payload:item.row.payload});}
    if(!snapshot.length)throw new HttpError(422,'There are no ready rows to apply.');
    const merged=ENRICH.applyPlan(plan,snapshot.map(s=>({...JSON.parse(s.payload),id:s.id})),{batchId:batch.id});
    // The guard CHECK aborts the entire D1 batch if another writer changed any target.
    const conditions=snapshot.map(()=>'(SELECT payload FROM discovery_leads WHERE id=?) IS NOT DISTINCT FROM ?').join(' AND ');
    const params=snapshot.flatMap(s=>[s.id,s.payload]);
    const statements=[db.prepare("SELECT id FROM discovery_leads WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id FOR UPDATE").bind(JSON.stringify(snapshot.map(s=>s.id))),db.prepare(`INSERT INTO enrichment_commit_guards(id,ok) SELECT ?,CASE WHEN (${conditions}) AND (SELECT status FROM enrichment_batches WHERE id=?)='preview' AND (SELECT count(*) FROM discovery_leads WHERE id IN (SELECT value FROM json_each(?)) AND (owner_user_id=? OR lower(owner_email)=lower(?)))=? THEN 1 ELSE 0 END`).bind(batch.id,...params,batch.id,JSON.stringify(snapshot.map(s=>s.id)),user.user_id,user.email,snapshot.length)];
    merged.forEach(l=>statements.push(db.prepare('UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(l),l.id)));
    const applied=(saved.applied||0)+snapshot.length;
    const processed=new Set(snapshot.map(s=>s.id));
    const nextPlan={...plan,results:plan.results.map(r=>processed.has(r.lead_id)&&r.status==='ready'?{...r,status:'applied'}:r)};
    const nextPayload=remaining.length?{...saved,plan:nextPlan,snapshot:remaining,applied}:{counts:plan.counts,applied};
    statements.push(db.prepare('UPDATE enrichment_batches SET status=?,payload=? WHERE id=? AND user_id=?').bind(remaining.length?'preview':'complete',JSON.stringify(nextPayload),batch.id,user.user_id));
    statements.push(db.prepare('DELETE FROM enrichment_commit_guards WHERE id=?').bind(batch.id));
    try{await db.batch(statements);}catch{throw new HttpError(409,'The import could not be applied safely. Refresh and preview again.');}
    return reply({status:remaining.length?'partial':'complete',applied,remaining:remaining.length,held:plan.results.filter(r=>r.status==='review').length});
  }
  throw new HttpError(404,'Not found.');
}

export { ENRICH };

// Concatenated with the existing Worker: authentication and lead access stay server-side.
export function callWeek(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function callNumber(value) {
  const raw = String(value || '').trim();
  if (!/^[+\d().\s-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? '+' + digits : '';
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15 && digits[0] !== '0') return '+' + digits;
  return '';
}

export function ageExplanation(lead) {
  const row = array(lead.evidence).findLast(e => e.field === 'estimated_age_range');
  if (!lead.estimated_age_range) return {range: '', basis: 'Age is not available.', source_url: ''};
  return {range: lead.estimated_age_range, basis: row?.kind === 'inferred'
    ? 'Estimated from a reported graduation year. People graduate at different ages; this is not a verified age.'
    : 'Imported estimate; the person’s age has not been independently verified.', source_url: safeTargetUrl(row?.source_url)?.href || ''};
}

export function callEligibility(lead, blocked = new Set()) {
  const phone = [lead.phone, lead.mobile_phone, lead.business_phone].map(callNumber).find(Boolean) || '';
  const reasons = qualifierCallReasons(lead);
  if ((lead.imported_dnc || []).some(value => callNumber(value) === phone)) reasons.push('Imported do-not-call restriction');
  if (!phone) reasons.push('No usable phone number');
  if (blocked.has(phone)) reasons.push('Do not call');
  const providerCheck=lead.wealthfeed_phone_checks?.[phone];
  if(providerCheck?.status==='blocked') reasons.push('WealthFeed reports do not call');
  if(providerCheck?.status==='unknown') reasons.push('Check do-not-call status');
  if (lead.identity_status !== 'matched') reasons.push('Check the person’s identity');
  if (['Not a Fit', 'Meeting Set', 'Nurture'].includes(lead.follow_up_status)) reasons.push('Removed from new calls');
  return {phone, ready: reasons.length === 0, reasons};
}

const CALL_OUTCOMES = new Set(['No answer', 'Voicemail', 'Spoke', 'Meeting booked', 'Wrong number', 'Do not call']);
export function matchesCallFocus(lead,preferences) {
  const titles=String(preferences.ideal_prospect || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(titles.length && !titles.some(title=>String(lead.current_title || '').toLowerCase().includes(title)))return false;
  if (preferences.age_focus === '59half') {
    const ages=String(lead.estimated_age_range || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!ages.length || ages[0]>59.5 || (ages[1] ?? ages[0])<59.5) return false;
  }
  if(preferences.timely_focus !== 'all') {
    const cutoff=Date.now()-90*86400000;
    const found=array(lead.activity_signals).some(activity=>{
      const date=Date.parse(activity.occurred_at || '');
      return date>=cutoff && date<=Date.now() && safeTargetUrl(activity.source_url) && activity.kind === preferences.timely_focus;
    });
    if(!found)return false;
  }
  return true;
}
async function weeklyRoutes(request, env, user, path, url) {
  if (!path.startsWith('/api/beta/')) return null;
  const db = env.DB;
  const savedPreferences = await one(db,'SELECT location,age_focus,timely_focus,ideal_prospect FROM lead_call_preferences WHERE user_id=?',user.user_id);
  const preferences=savedPreferences || {location:'Long Island',age_focus:'all',timely_focus:'all',ideal_prospect:''};
  if(path==='/api/beta/preferences' && request.method==='GET')return json({preferences});
  if(path==='/api/beta/preferences' && request.method==='PUT') {
    const body=await requestJSON(request);
    if(!['Long Island'].includes(body.location) || !['all','59half'].includes(body.age_focus) || !['all','recent_job_change','retirement_announcement','liquidity_event','layoff'].includes(body.timely_focus))throw new HttpError(422,'Choose one of the available search options.');
    await execute(db,'INSERT INTO lead_call_preferences(user_id,location,age_focus,timely_focus,ideal_prospect,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET location=excluded.location,age_focus=excluded.age_focus,timely_focus=excluded.timely_focus,ideal_prospect=excluded.ideal_prospect,updated_at=excluded.updated_at',user.user_id,body.location,body.age_focus,body.timely_focus,text(body.ideal_prospect,300),now());
    return json({saved:true});
  }
  const visible = (await many(db, "SELECT id,owner_user_id,owner_email,payload,created_at,updated_at FROM discovery_leads WHERE team=? AND (owner_user_id=? OR lower(owner_email)=lower(?)) ORDER BY updated_at DESC", TEAM, user.user_id, user.email)).map(row=>{const lead=leadFromRow(row);return {row,lead:lead?qualifyLead(lead):null};}).filter(item=>item.lead&&isUsableStoredLead(item.lead)&&canReadLead(item.row,item.lead,user));
  // An administrator's team visibility must never inflate their personal calling target.
  const owned = visible.filter(({row}) => row.owner_user_id === user.user_id || lower(row.owner_email) === lower(user.email));
  const blocks = new Set((await many(db, 'SELECT phone FROM lead_call_blocks')).map(row => row.phone));
  if (path === '/api/beta/week' && request.method === 'GET') {
    const week = callWeek();
    const records = await many(db, 'SELECT * FROM lead_call_records WHERE user_id=? AND week_start=? ORDER BY created_at DESC', user.user_id, week);
    const called = new Set(records.map(r => r.lead_id));
    const phoneSeen = new Set(owned.filter(({lead}) => called.has(lead.id)).map(({lead}) => callEligibility(lead).phone).filter(Boolean));
    const all = owned.map(({lead}) => ({...lead, call: callEligibility(lead, blocks), age: ageExplanation(lead)}));
    const ready = all.filter(lead => {
      if (!lead.call.ready || !matchesCallFocus(lead,preferences) || called.has(lead.id) || phoneSeen.has(lead.call.phone)) return false;
      phoneSeen.add(lead.call.phone); return true;
    }).sort((a,b) => (b.priority_score || 0) - (a.priority_score || 0));
    return json({preferences,week_start: week, week_timezone: 'UTC', goal: 500, called: called.size,
      attempts: records.length, ready: ready.length, shortfall: Math.max(0, 500 - called.size - ready.length),
      total_owned: owned.length, missing_phone: all.filter(l=>!l.call.phone).length,
      leads: ready.slice(0,500), history: records.slice(0,50).map(record => {const lead=owned.find(item=>item.lead.id===record.lead_id)?.lead;return {...record,name:lead ? `${lead.first_name} ${lead.last_name}` : 'Lead no longer assigned to you'};}),
      release: {ready: false, blockers: ['Automatic weekly lead delivery is not connected.', 'In-app calling is not connected.', '500 usable leads per person per week has not been verified.']}});
  }
  if (path === '/api/beta/calls' && request.method === 'POST') {
    const body = await requestJSON(request);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(body.id || '')) throw new HttpError(422, 'A valid call reference is required.');
    if (!CALL_OUTCOMES.has(body.outcome)) throw new HttpError(422, 'Choose a call result.');
    const item = owned.find(({lead}) => lead.id === body.lead_id);
    if (!item) throw new HttpError(404, 'This lead is not assigned to you.');
    const existing = await one(db, 'SELECT * FROM lead_call_records WHERE id=?', body.id);
    if (existing) {
      if (existing.user_id !== user.user_id || existing.lead_id !== body.lead_id || existing.outcome !== body.outcome) throw new HttpError(409, 'This call reference was already used.');
      return json({saved: true, id: existing.id});
    }
    const eligible = callEligibility(item.lead, blocks);
    if (!eligible.ready) throw new HttpError(422, eligible.reasons.join('. '));
    const statements = [db.prepare('INSERT INTO lead_call_records(id,user_id,lead_id,week_start,outcome,notes,created_at) VALUES(?,?,?,?,?,?,?)').bind(body.id,user.user_id,item.lead.id,callWeek(),body.outcome,text(body.notes,4000),now())];
    if (body.outcome === 'Do not call' || body.outcome === 'Wrong number') statements.push(db.prepare('INSERT OR IGNORE INTO lead_call_blocks(phone,lead_id,user_id,reason,created_at) VALUES(?,?,?,?,?)').bind(eligible.phone,item.lead.id,user.user_id,body.outcome,now()));
    if (body.outcome === 'Meeting booked') statements.push(db.prepare("UPDATE discovery_leads SET payload=json_set(payload,'$.follow_up_status','Meeting Set'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=?").bind(item.lead.id,TEAM));
    await db.batch(statements);
    return json({saved: true, id: body.id},201);
  }
  throw new HttpError(404, 'Page not found.');
}

// Per-user provider credentials never leave the server after connection.
export const WF = (() => {
  const encode = v => new TextEncoder().encode(v);
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
  const un64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function cipherKey(env) {
    if (!/^[a-f0-9]{64}$/i.test(env.PROVIDER_ENCRYPTION_KEY || '')) throw new HttpError(503, 'Secure connection storage is not configured yet.');
    return crypto.subtle.importKey('raw', Uint8Array.from(env.PROVIDER_ENCRYPTION_KEY.match(/../g), x => parseInt(x,16)), 'AES-GCM', false, ['encrypt','decrypt']);
  }
  async function seal(key, user, env) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode(user)}, await cipherKey(env), encode(key)));
  }
  async function open(value, user, env) {
    const [iv,data]=value.split('.');
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv),additionalData:encode(user)},await cipherKey(env),un64(data)));
  }
  async function call(key, path, body) {
    let r;
    try { r=await fetch('https://api.wealthfeed.com'+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'x-api-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}); }
    catch (error) { console.error('WealthFeed network failure',{name:error?.name||'Error',message:String(error?.message||'').slice(0,240)});throw new HttpError(502, body?'WealthFeed did not confirm receipt. Do not resubmit until you check the job in your provider account.':'WealthFeed could not be reached. Try checking again.'); }
    if(r.status===429){const e=new HttpError(429,'WealthFeed is busy. Wait before checking again.');e.retryAfter=Math.max(1,Math.min(86400,Number(r.headers.get('retry-after'))||60));throw e;}
    if(r.status>=300&&r.status<400)throw new HttpError(502,'WealthFeed redirected the secure request. The connection was not saved.');
    if(r.status===401||r.status===403)throw new HttpError(r.status,'WealthFeed did not accept this connection. Check your key and subscription.');
    if(!r.ok)throw new HttpError(r.status===400?422:502,r.status===400?'WealthFeed rejected the submitted details. Check the names and contact information.':'WealthFeed could not complete the request. Check your provider account before resubmitting.');
    // Bound response storage and reject malformed responses without echoing provider content.
    const reader=r.body.getReader();let size=0;const chunks=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();throw new HttpError(502,'WealthFeed returned too much detail. Use a smaller group.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(502,'WealthFeed returned an unreadable response.');}
    if(!result||!Object.hasOwn(result,'data')){console.error('WealthFeed response shape failure',{status:r.status,contentType:r.headers.get('content-type')||'',keys:result&&typeof result==='object'?Object.keys(result).slice(0,10):[]});throw new HttpError(502,'WealthFeed returned an unexpected response.');}
    return result;
  }
  function locator(l) {
    const r={id:l.id};
    const mappings={firstName:'first_name',lastName:'last_name',city:'city',state:'state',address:'address',email:'email',linkedin:'linkedin_url'};
    for(const [key,field] of Object.entries(mappings))if(l[field])r[key]=String(l[field]).trim();
    const p=[l.phone,l.mobile_phone,l.business_phone].map(x=>String(x||'').replace(/\D/g,'')).find(x=>/^\d{10}$/.test(x)||/^1\d{10}$/.test(x));
    if(p)r.phone=p;
    if(!(r.email||r.phone||r.linkedin||(r.firstName&&r.lastName&&(r.address||(r.city&&r.state)))))throw new HttpError(422,'Each selected person needs an email, phone, LinkedIn profile, or full name with an address or city and state.');
    return r;
  }
  function plan(rows, leads, ids) {
    if(!Array.isArray(rows)||rows.length>100)throw new HttpError(502,'WealthFeed returned an unexpected number of results.');
    const used=new Set(), result=[];
    for(const r of rows){
      const id=String(r.inputId||'');
      if(!ids.includes(id)||used.has(id))throw new HttpError(502,'WealthFeed returned missing, repeated, or unrelated record references.');
      used.add(id);
      const l=leads.find(l=>l.id===id);
      if(!l)throw new HttpError(409,'A selected person is no longer assigned to you.');
      const item={row:result.length+1,lead_id:id,changes:{},conflicts:[],invalid:[],status:'review'};
      if(r.validMatch!==1){item.reason='WealthFeed did not confirm a match.';result.push(item);continue;}
      if(!r.firstName||!r.lastName||[ ['firstName','first_name'],['lastName','last_name'] ].some(([a,b])=>!l[b]||String(r[a]).trim().toLowerCase()!==String(l[b]).trim().toLowerCase())){
        item.reason='Returned name does not match the selected person.';result.push(item);continue;
      }
      const incoming={company:r.currentCompany,current_title:r.currentJobTitle,email:r.email1,phone:r.phone1,linkedin_url:r.linkedinUrl,city:r.city,state:r.state,address:r.address,postal_code:r.zip};
      if(r.age!=null){if(!Number.isInteger(r.age)||r.age<18||r.age>120)item.invalid.push('age');else incoming.estimated_age_range=String(r.age);}
      const phoneChecks={};
      for(const n of [1,2]){if(r['phone'+n]!=null&&String(r['phone'+n]).trim()){
        const p=callNumber(String(r['phone'+n]));if(!p)item.invalid.push('phone'+n);
        else phoneChecks[p]={status:r['phone'+n+'Dnc']===0?'clear':r['phone'+n+'Dnc']===1?'blocked':'unknown',observed_at:new Date().toISOString(),source:'WealthFeed'};
      }}
      for(const [k,v] of Object.entries(incoming)){
        if(v==null||String(v).trim()==='')continue;const value=String(v).trim();
        if(value.length>1000||(k==='phone'&&!callNumber(value))||(k==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))||(k==='linkedin_url'&&!/^https:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+\/?$/.test(value))){item.invalid.push(k);continue;}
        if(!l[k])item.changes[k]=value;
        else if((k==='phone'?callNumber(l[k])!==callNumber(value):String(l[k]).trim().toLowerCase()!==value.toLowerCase()))item.conflicts.push({field:k,current:l[k],incoming:value});
      }
      item.provider_id=Number.isSafeInteger(r.leadId)&&r.leadId>0?String(r.leadId):null;
      if(item.provider_id&&l.source_record_ids?.wealthfeed&&String(l.source_record_ids.wealthfeed)!==item.provider_id)item.conflicts.push({field:'WealthFeed record',current:l.source_record_ids.wealthfeed,incoming:item.provider_id});
      item.phone_checks=phoneChecks;
      item.status=item.invalid.length||item.conflicts.length?'review':Object.keys(item.changes).length||Object.keys(phoneChecks).length||item.provider_id?'ready':'unchanged';
      result.push(item);
    }
    for(const id of ids)if(!used.has(id))result.push({row:result.length+1,lead_id:id,status:'review',changes:{},conflicts:[],invalid:[],reason:'WealthFeed did not return this person.'});
    return {provider:'wealthfeed',source:'WealthFeed API',recognized:true,results:result,counts:result.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})};
  }
  return {seal,open,call,locator,plan};
})();

async function wealthfeedRoutes(request,env,user,path){
  const db=env.DB, connection=await one(db,'SELECT * FROM wealthfeed_connections WHERE user_id=?',user.user_id);
  if(path==='/api/wealthfeed/status'&&request.method==='GET')return json({connected:!!connection,secure_storage_ready:!!env.PROVIDER_ENCRYPTION_KEY,jobs:await many(db,'SELECT id,provider_job_id,status,created_at FROM wealthfeed_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 20',user.user_id)});
  if(request.method!=='POST')throw new HttpError(404,'Page not found.');
  const body=await requestJSON(request);
  if(path==='/api/wealthfeed/connect'){
    const key=typeof body.key==='string'?body.key.trim():'';
    if(!key||key.length>1024||/[\s\x00-\x1f\x7f]/.test(key))throw new HttpError(422,'Enter the API key shown in your WealthFeed account.');
    const encrypted=await WF.seal(key,user.user_id,env);
    await WF.call(key,'/v1/leads?page=1&pageSize=1');
    const cid=crypto.randomUUID();
    await execute(db,'INSERT INTO wealthfeed_connections(user_id,encrypted_key,connection_id,connected_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_key=excluded.encrypted_key,connection_id=excluded.connection_id,connected_at=excluded.connected_at,next_request_at=0',user.user_id,encrypted,cid,new Date().toISOString());
    return json({connected:true});
  }
  if(path==='/api/wealthfeed/disconnect'){await execute(db,'DELETE FROM wealthfeed_connections WHERE user_id=?',user.user_id);return json({connected:false});}
  if(!connection)throw new HttpError(409,'Connect your WealthFeed account first.');
  const owned=(await visibleLeadRows(db,user)).filter(({row})=>row.owner_user_id===user.user_id||lower(row.owner_email)===lower(user.email));
  const key=await WF.open(connection.encrypted_key,user.user_id,env);
  async function provider(path,body){
    // Atomic per-user pace control also persists WealthFeed Retry-After across requests.
    const time=Date.now();
    const slot=await one(db,'UPDATE wealthfeed_connections SET next_request_at=? WHERE user_id=? AND connection_id=? AND next_request_at<=? RETURNING user_id',time+1000,user.user_id,connection.connection_id,time);
    if(!slot)throw new HttpError(429,'Please wait before checking WealthFeed again.');
    try{return await WF.call(key,path,body);}catch(e){if(e.retryAfter)await execute(db,'UPDATE wealthfeed_connections SET next_request_at=? WHERE user_id=? AND connection_id=?',Date.now()+e.retryAfter*1000,user.user_id,connection.connection_id);throw e;}
  }
  if(path==='/api/wealthfeed/submit'){
    if(typeof body.request_id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.request_id))throw new HttpError(422,'Refresh the page before submitting.');
    const previous=await one(db,'SELECT id,status FROM wealthfeed_jobs WHERE id=? AND user_id=?',body.request_id,user.user_id);
    if(previous)return json({...previous,replayed:true});
    const ids=Array.isArray(body.lead_ids)?[...new Set(body.lead_ids)]:[];
    if(!ids.length||ids.length>100||ids.some(id=>!owned.some(x=>x.lead.id===id)))throw new HttpError(422,'Select 1 to 100 people assigned to you.');
    const records=ids.map(id=>WF.locator(owned.find(x=>x.lead.id===id).lead));
    // Claim before sending: uncertain submissions are never automatically sent a second time.
    const claimed=await one(db,'INSERT INTO wealthfeed_jobs(id,user_id,connection_id,status,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id',body.request_id,user.user_id,connection.connection_id,'sending',JSON.stringify({ids}));
    if(!claimed)throw new HttpError(409,'This request is already being processed. Refresh the job list.');
    let data;
    try{data=(await provider('/v1/enrich/persons/direct',records)).data;if(!Number.isSafeInteger(data?.id)||data.id<=0)throw new HttpError(502,'WealthFeed did not confirm a job reference. Check your account before resubmitting.');}
    catch(e){await execute(db,'UPDATE wealthfeed_jobs SET status=? WHERE id=? AND user_id=?',['429','401','403','422'].includes(String(e.status))?'rejected':'uncertain',body.request_id,user.user_id);throw e;}
    await execute(db,'UPDATE wealthfeed_jobs SET status=?,provider_job_id=? WHERE id=? AND user_id=?','queued',String(data.id),body.request_id,user.user_id);
    return json({id:body.request_id,status:'queued'});
  }
  if(path==='/api/wealthfeed/check'){
    const job=await one(db,'SELECT * FROM wealthfeed_jobs WHERE id=? AND user_id=?',body.id,user.user_id);
    if(!job)throw new HttpError(404,'This job is unavailable.');
    if(job.connection_id!==connection.connection_id)throw new HttpError(409,'This job belongs to the previous connection. Use that provider account to check its results.');
    if(!job.provider_job_id)throw new HttpError(409,'Receipt was not confirmed. Check your WealthFeed account before submitting again.');
    const saved=JSON.parse(job.payload);
    if(job.status==='preview'){
      const batch=await one(db,'SELECT status,payload FROM enrichment_batches WHERE id=? AND user_id=?',saved.preview_id,user.user_id);
      if(batch)return json({status:batch.status==='complete'?'complete':'preview',batch_id:saved.preview_id,...JSON.parse(batch.payload).plan});
    }
    const {data}=await provider('/v1/enrich/result/'+job.provider_job_id);
    if(String(data?.id)!==job.provider_job_id||!['created','processing','complete','failed'].includes(data.status))throw new HttpError(502,'WealthFeed returned an unexpected job.');
    if(data.status!=='complete'){await execute(db,'UPDATE wealthfeed_jobs SET status=? WHERE id=? AND user_id=?',data.status,job.id,user.user_id);return json({status:data.status});}
    const plan=WF.plan(data.result?.data,owned.map(x=>x.lead),saved.ids);
    const targets=new Set(plan.results.filter(r=>r.status==='ready').map(r=>r.lead_id));
    const snapshot=await Promise.all(owned.filter(x=>targets.has(x.lead.id)).map(async x=>({id:x.row.id,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x.row.payload)))).map(n=>n.toString(16).padStart(2,'0')).join('')})));
    const previewId='wf-'+job.id;
    const stored=JSON.stringify({plan,snapshot,applied:0});
    if(new TextEncoder().encode(stored).length>1800000)throw new HttpError(422,'These results contain too much detail. Contact support.');
    await db.batch([
      db.prepare('INSERT INTO enrichment_batches(id,user_id,provider,status,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(previewId,user.user_id,'wealthfeed','preview',stored),
      db.prepare('UPDATE wealthfeed_jobs SET status=?,payload=? WHERE id=? AND user_id=?').bind('preview',JSON.stringify({...saved,preview_id:previewId}),job.id,user.user_id)
    ]);
    const actual=await one(db,'SELECT status,payload FROM enrichment_batches WHERE id=? AND user_id=?',previewId,user.user_id);
    return json({status:actual.status==='complete'?'complete':'preview',batch_id:previewId,...JSON.parse(actual.payload).plan});
  }
  throw new HttpError(404,'Page not found.');
}

// Public-source research is separate from qualification and calling eligibility.
export const RESEARCH_SOURCES = [
 ['website','Company websites','person','team biography owner services',null],
 ['registry','Business registrations','company','business entity registration secretary of state','https://dos.ny.gov/corporation-and-business-entity-search-database'],
 ['license','Professional licenses','person','professional license lookup','https://www.careeronestop.org/Toolkit/Training/find-licenses.aspx'],
 ['professional','Public professional profiles','person','professional profile career',null],
 ['announcement','Company announcements','company','newsroom promotion acquisition expansion',null],
 ['news','Local news and interviews','person','interview business news',null],
 ['association','Chambers and trade associations','company','chamber trade association directory',null],
 ['maps','Business listings and maps','company','business address directory','https://www.openstreetmap.org/'],
 ['sec','SEC filings','company','SEC EDGAR filings','https://www.sec.gov/edgar/search/'],
 ['expertise','Conferences, articles and patents','person','speaker author patent inventor','https://www.uspto.gov/patents/search/patent-public-search'],
 ['warn','WARN notices','company','WARN layoff notice','https://dol.ny.gov/warn-dashboard'],
 ['mwbe','MWBE business directories','company','MWBE certified business directory','https://www.mwbe.esd.ny.gov/']
].map(([id,label,scope,query,directory])=>({id,label,scope,query,directory,methods:['public_page','excerpt','csv'],note:id==='warn'?'Employer notice only. Does not establish that this person lost a job.':id==='mwbe'?'Business certification only. No personal demographic inference or scoring.':'Review identity and source date before relying on this record.'}));
const researchNorm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const researchHas=(hay,needle)=>needle.length>=3&&(' '+researchNorm(hay)+' ').includes(' '+researchNorm(needle)+' ');
export function researchMatch(lead,excerpt,scope){
 const company=knownCompany(lead.company)&&researchHas(excerpt,lead.company);
 const person=researchHas(excerpt,[lead.first_name,lead.last_name].filter(Boolean).join(' '));
 const location=researchHas(excerpt,lead.city||lead.location||'');
 return scope==='company'?Boolean(company):Boolean(person&&(company||location));
}
export function researchRecord(lead,body){
 const source=RESEARCH_SOURCES.find(s=>s.id===body.source);if(!source)throw new HttpError(422,'Choose a research source.');
 const url=safeTargetUrl(body.url);if(!url)throw new HttpError(422,'Use a public source URL.');
 const excerpt=text(body.excerpt,1500);if(!excerpt||!researchMatch(lead,excerpt,source.scope))throw new HttpError(422,source.scope==='company'?'The excerpt must name this business.':'The excerpt must name this person and their company or location.');
 const date=text(body.source_date,10);if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new HttpError(422,'Use a valid source date.');
 if(source.id==='warn'&&!date)throw new HttpError(422,'WARN records need the notice date.');
 return {id:uid('research'),source:source.id,label:source.label,scope:source.scope,url:url.href,excerpt,source_date:date||null,checked_at:now(),status:'reviewed_by_user',note:source.note};
}
export function researchCSV(csv){
 if(typeof csv!=='string'||new TextEncoder().encode(csv).length>1024*1024)throw new HttpError(422,'Choose a CSV up to 1 MB.');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r')cell+=c;if(rows.length>1000)throw new HttpError(422,'Import at most 1,000 rows.');}
 if(quoted)throw new HttpError(422,'Unfinished CSV quote.');if(cell||row.length){row.push(cell);rows.push(row);}const headers=(rows.shift()||[]).map(h=>h.replace(/^\uFEFF/,'').trim());if(!headers.length||headers.some(h=>!h)||new Set(headers.map(researchNorm)).size!==headers.length)throw new HttpError(422,'CSV headers must be unique and nonempty.');
 return rows.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==headers.length)throw new HttpError(422,'CSV row has the wrong number of columns.');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export async function researchMWBE(query){
 const q=text(query,120);if(q.length<3)throw new HttpError(422,'Enter at least three characters.');
 const endpoint=new URL('https://data.cityofnewyork.us/resource/ci93-uc8s.json');endpoint.searchParams.set('$q',q);endpoint.searchParams.set('$limit','30');
 // Explicit projection excludes personal demographic fields from this directory.
 endpoint.searchParams.set('$select','account_number,vendor_formal_name,vendor_dba,first_name,last_name,telephone,business_description,certification,cert_renewal_date,city,state,zip,website,naics_title');
 const response=await fetch(endpoint,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});if(!response.ok){await discardResponse(response);throw new HttpError(502,'The public directory is unavailable. Try again later.');}const rows=JSON.parse(await readLimitedResponse(response,4*1024*1024));if(!Array.isArray(rows))throw new HttpError(502,'The directory returned an unexpected format.');
 return rows.map(r=>({company:text(r.vendor_formal_name,200),contact:text([r.first_name,r.last_name].filter(Boolean).join(' '),160),location:text([r.city,r.state,r.zip].filter(Boolean).join(', '),200),website:safeTargetUrl(r.website)?.href||'',phone:text(r.telephone,80),description:text(r.business_description,600),certification:text(r.certification,100),renewal_date:text(r.cert_renewal_date,40),source_url:endpoint.href,record_id:text(r.account_number,100)}));
}
function researchSignature(lead){return JSON.stringify([lead.first_name,lead.last_name,lead.company,lead.city,lead.location,lead.company_location,lead.company_website]);}
async function researchRoutes(request,env,user,path,url){
 const db=env.DB;
 if(path==='/api/research/catalog'&&request.method==='GET')return json({sources:RESEARCH_SOURCES});
 if(path==='/api/research/leads'&&request.method==='GET'){
 const items=(await visibleLeadRows(db,user)).slice(0,500);const selected=url.searchParams.get('lead_id');if(selected&&!items.some(x=>x.lead.id===selected)){const r=await one(db,'SELECT * FROM discovery_leads WHERE id=? AND team=?',selected,TEAM);const l=leadFromRow(r);if(r&&l&&canReadLead(r,l,user))items.push({lead:l});}
 return json({leads:items.map(({lead})=>({id:lead.id,first_name:lead.first_name,last_name:lead.last_name,company:lead.company,location:lead.location}))});
}
 if(path==='/api/research/mwbe'&&request.method==='GET')return json({results:await researchMWBE(url.searchParams.get('q')),coverage:'NYC certified business dataset; not a nationwide directory. Use source links or imports for other jurisdictions.'});
 const body=request.method==='POST'?await requestJSON(request):{};const id=text(body.lead_id||url.searchParams.get('lead_id'),160);const row=await one(db,'SELECT * FROM discovery_leads WHERE id=? AND team=?',id,TEAM);const lead=leadFromRow(row);
 if(!row||!lead||!canReadLead(row,lead,user))throw new HttpError(404,'Lead not found.');
 if(path==='/api/research/records'&&request.method==='GET')return json({records:array(lead.research_records).filter(r=>r.status!=='machine_matched'||(r.engine_version===3&&r.subject_signature===researchSignature(lead))),native_research:Object.fromEntries(Object.entries(lead.native_research||{}).filter(([,v])=>v.engine_version===3&&v.signature===researchSignature(lead))),profile:researchProfile(lead)});
 if(path==='/api/research/job'&&request.method==='GET')return json({job:env.RESEARCH_JOBS?await env.RESEARCH_JOBS.status(id,user):null});
 if(request.method!=='POST')throw new HttpError(405,'Method not allowed.');
 if(user.role!=='admin'&&row.owner_user_id!==user.user_id&&lower(row.owner_email)!==lower(user.email))throw new HttpError(403,'Only the lead owner can add research.');
 if(path==='/api/research/job'){if(!env.RESEARCH_JOBS)throw new HttpError(503,'Background research is not configured.');return json({job:await env.RESEARCH_JOBS.enqueue(id,user,researchSignature(lead))},202);}
 const source=RESEARCH_SOURCES.find(s=>s.id===body.source);if(!source)throw new HttpError(422,'Choose a source.');
 if(path==='/api/research/auto'){
   if(!env.NATIVE_RESEARCH)throw new HttpError(503,'Automatic research is not available on this deployment.');
   const signature=researchSignature(lead);
   if(body.identity_signature&&body.identity_signature!==signature)throw new HttpError(409,'Lead identity changed. Start a new research job.');
   const cached=lead.native_research?.[source.id];
   if(cached?.engine_version===3&&cached?.signature===signature&&(source.id!=='warn'||cached.feed_version===2)&&Date.now()-Date.parse(cached.checked_at)<(cached.status==='partial'?60000:3600000))return json({...cached,cached:true});
   const result=await env.NATIVE_RESEARCH(lead,source.id);
   const fresh=await one(db,'SELECT * FROM discovery_leads WHERE id=? AND team=?',id,TEAM);const current=leadFromRow(fresh);
   if(!current||!canReadLead(fresh,current,user)||(user.role!=='admin'&&fresh.owner_user_id!==user.user_id&&lower(fresh.owner_email)!==lower(user.email)))throw new HttpError(403,'Lead access changed.');
   if(researchSignature(current)!==signature)throw new HttpError(409,'Lead details changed. Research this lead again.');
   const records=array(current.research_records).filter(r=>r.status!=='machine_matched'||(r.engine_version===3&&r.subject_signature===signature));
   const persisted=[];let omitted=0;
   for(const record of result.records){const duplicate=records.find(r=>r.source===source.id&&(record.event?.id?r.event?.id===record.event.id:r.url===record.url&&r.excerpt===record.excerpt));if(duplicate){persisted.push(duplicate);continue;}if(records.length>=100){omitted++;continue;}const saved={...record,subject_signature:signature,engine_version:3,id:uid('research'),label:source.label};records.push(saved);persisted.push(saved);}
   result.records=persisted;result.engine_version=3;result.omitted_records=omitted;
   if(omitted){result.limitations=[...(result.limitations||[]),omitted+' records could not be saved because the profile is full.'];if(!persisted.length)result.status='partial';}
   current.native_research={...(current.native_research||{}),[source.id]:{...result,signature}};
   current.research_records=records;
   const updated=await db.prepare('UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=? AND payload=?').bind(JSON.stringify(current),id,TEAM,fresh.payload).run();
   if(updated.meta.changes!==1)throw new HttpError(409,'Another change was saved. Retry research to resume.');
   return json(result);
 }
 if(path==='/api/research/preview'){
   let content=text(body.excerpt,1500),resolved=safeTargetUrl(body.url)?.href,method='user_excerpt';
   if(body.csv){const records=researchCSV(body.csv);const matches=records.map(r=>Object.entries(r).filter(([k])=>!/ethnic|race|gender|sex|religio/i.test(k)).map(([k,v])=>k+': '+v).join(' | ')).filter(t=>researchMatch(lead,t,source.scope));return json({matches:matches.slice(0,20).map(t=>t.slice(0,1500)),total:matches.length,note:'Imported rows are unverified. Select a matching row and confirm its source date.'});}
   if(!content){
     const target=safeTargetUrl(body.url);if(!target)throw new HttpError(422,'Enter a public page URL.');if(restrictedCrawlReason(target))throw new HttpError(422,'Use an authorized export or short excerpt for this source.');
     try{const robots=await fetchPublicPage(new URL('/robots.txt',target).href,5000);if(!robotsAllowed(robots.html,target.pathname))throw new HttpError(422,'This website does not allow this crawler. Use an authorized excerpt.');}catch(e){if(e instanceof HttpError)throw e;if(!/^HTTP 40[04]/.test(e.message))throw new HttpError(422,'Could not check website access. Use an authorized excerpt.');}
     let page;try{page=await fetchPublicPage(target.href,12000);}catch{throw new HttpError(422,'Could not read this public HTML page. For PDF or interactive sources, use a short excerpt or CSV export.');}resolved=page.url;const plain=htmlText(page.html);const needle=source.scope==='company'?lead.company:[lead.first_name,lead.last_name].join(' ');const at=plain.toLowerCase().indexOf(String(needle).toLowerCase());content=plain.slice(Math.max(0,at-150),Math.max(0,at-150)+1200);method='fetched_page';
   }
   return json({excerpt:content,url:resolved,match:researchMatch(lead,content,source.scope),method,note:source.note});
 }
 if(path==='/api/research/save'){
   const record=researchRecord(lead,body);const previous=array(lead.research_records);if(previous.some(r=>r.source===record.source&&r.url===record.url&&r.excerpt===record.excerpt))return json({saved:false,duplicate:true});if(previous.length>=100)throw new HttpError(422,'This profile already contains 100 research records.');lead.research_records=[...previous,{...record,reviewed_by:user.email}];
   const result=await db.prepare('UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=? AND payload=?').bind(JSON.stringify(lead),id,TEAM,row.payload).run();if(result.meta.changes!==1)throw new HttpError(409,'This lead changed. Reload before saving research.');return json({saved:true,record});
 }
 throw new HttpError(404,'Research action not found.');
}


export function researchProfile(lead){
 const records=array(lead.research_records).filter(r=>r.status!=='machine_matched'||(r.engine_version===3&&r.subject_signature===researchSignature(lead)));
 const groups=RESEARCH_SOURCES.map(s=>({label:s.label,source:s.id,records:records.filter(r=>r.source===s.id).slice(0,5)})).filter(g=>g.records.length);
 const urls=new Set(records.map(r=>r.url));const gaps=[];
 if(!records.some(r=>r.scope==='person'))gaps.push('No person-level identity evidence has been saved.');
 if(!records.some(r=>r.source_date))gaps.push('No dated source evidence has been saved.');
 const warnings=['Saved lead details are input data, not newly verified facts.','Employer events do not establish individual circumstances or intent.'];
 if(records.some(r=>r.source==='warn'))warnings.push('Confirm the affected worksite and whether this person is involved before discussing a WARN event.');
 const facts=[];for(const r of records)for(const f of array(r.facts)){if(typeof f.field==='string'&&typeof f.value==='string')facts.push({...f,scope:r.scope,url:r.url,date:r.source_date,status:r.status});}
 const conflicts=[...new Set(facts.map(f=>f.field))].filter(field=>new Set(facts.filter(f=>f.field===field).map(f=>lower(f.value))).size>1);
 return {facts,conflicts,identity:{name:[lead.first_name,lead.last_name].filter(Boolean).join(' '),company:lead.company||'Unknown',role:lead.current_title||'Unknown',location:lead.location||lead.city||'Unknown'},groups,source_pages:urls.size,gaps,warnings};
}
