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

const DEFAULT_CATALOG=readCategories();
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
