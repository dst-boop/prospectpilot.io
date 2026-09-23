import {createHash} from 'node:crypto';
const BASE='https://raw.githubusercontent.com/dst-boop/lead-qualifier/warn-data/';
const TEXAS={state:'TX',format:'csv',url:'https://data.texas.gov/resource/8w53-c4f6.csv?$limit=50000',source_url:'https://data.texas.gov/dataset/Worker-Adjustment-and-Retraining-Notification-WARN/8w53-c4f6',metadata_url:'https://data.texas.gov/api/views/8w53-c4f6.json'};
const ALL='AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function officialNoticeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(/\.gov$/.test(u.hostname)||/\.state\.[a-z]{2}\.us$/.test(u.hostname))?u.href:null;}catch{return null;}}
export const companyKey=v=>norm(v).replace(/\b(?:incorporated|corporation|company|inc|corp|llc|llp|lp|plc|ltd|limited|co)\b/g,'').replace(/\s+/g,' ').trim();
const ALIASES={
 employer:['business legal name','company','employer','company name','employer name','organization name','affected company','location name','name of company','title','job site name'],
 city:['city','location city','site city','city name'],address:['impacted site address','address','location address','addressfull','address line 1','location','locations','location s','location of layoffs','layoff locations'],
 county:['impacted site county','county','county name'],workers:['number of affected workers','number of employees affected','number of impacted workers','number toemployees affected','employees affected','num employees','affected workers','planned of affected employees','approximate total of full time employees','emp','jobs affected','affected','jobs','workforce affected','laid off','number affected','no of employees','of workers','total layoff number'],
 notice_date:['date of warn notice','notice date','warn date','date of notice','warn document date','initial report date','initial date reported','notification date s','notice received','received date','date received','received sort descending'],
 effective_date:['date layoff closure starts','effective date','date effective','effective layoff date','layoff date','planned starting date','layoff start date','layoff begin date','impact date','date of impact','lo cl date','expected layoff','closing dates','layoff dates','layoff date s'],
 reason:['reason for layoff closure','reason','warn type','notice type','layoff or closure','closure type','layoff closure','layoff type','type'],
 url:['detail page url','source url','notice url'],dba:['doing business as name']
};
export function dateValue(v){
 const s=String(v||'').trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
 if(!m)m=s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)||s.match(/^(\d{4})(\d{2})(\d{2})$/);
 if(!m){const us=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(us)m=[us[0],us[3],us[1],us[2]];}
 if(!m){const written=s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);if(written){const months=['january','february','march','april','may','june','july','august','september','october','november','december'];const month=months.findIndex(name=>name===written[1].toLowerCase()||name.slice(0,3)===written[1].toLowerCase());if(month>=0)m=[s,written[3],String(month+1),written[2]];}}
 if(!m)return null;const iso=[m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')].join('-');
 return Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:null;
}
export function csvRows(text){
 const out=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell);cell='';if(c==='\n'){if(row.some(v=>v.trim()))out.push(row);row=[];}}else if(c!=='\r')cell+=c;}
 if(quoted)throw Error('Malformed CSV quoting');if(cell||row.length){row.push(cell);if(row.some(v=>v.trim()))out.push(row);}return out;
}
export function parseWarn(text,state,now=Date.now()){
 const rows=csvRows(text);
 // Maryland's published feed omits headers; verified against the state's eight-column log.
 if(state==='MD'&&rows[0]?.length===8&&dateValue(rows[0][0]))rows.unshift(['Notice Date','NAICS','Company','Location','County','Employees Affected','Effective Date','Type']);
 const headers=(rows.shift()||[]).map(h=>norm(h.replace(/^\uFEFF/,'')));const schema_notes=[];
 if(state==='WI'&&headers.length===8&&headers[7]==='countyworkforce development area'){
  headers.splice(7,1,'county','workforce development area');schema_notes.push('Split the published merged County/Workforce Development Area header.');
 }
 const mapped=Object.fromEntries(Object.entries(ALIASES).map(([key,names])=>[key,names.map(n=>headers.indexOf(n)).find(i=>i>=0)??-1]));
 if(mapped.employer<0)throw Error('Unrecognized employer column');
 const events=[];let excluded_non_warn=0,malformed_rows=0;const warnIndicator=headers.indexOf('warn notice');const requiredWidth=Math.max(...Object.values(mapped),warnIndicator)+1;
 for(const [i,row] of rows.entries()){
  if(row.length>headers.length||row.length<requiredWidth){malformed_rows++;continue;}
  if(warnIndicator>=0&&/^(false|no|0)$/i.test(String(row[warnIndicator]||'').trim())){excluded_non_warn++;continue;}
  const get=k=>String(row[mapped[k]]||'').trim();const employer=get('employer');if(!employer)continue;
  const numeric=get('workers').replaceAll(',','');const workers=/^\d+$/.test(numeric)&&Number.isSafeInteger(Number(numeric))?Number(numeric):null;
  let notice=dateValue(get('notice_date')),effective=dateValue(get('effective_date'));const quality_flags=[];
  if(notice&&(notice<'1900-01-01'||Date.parse(notice)>now+86400000)){quality_flags.push('implausible_notice_date');notice=null;}
  if(effective&&(effective<'1900-01-01'||Date.parse(effective)>now+5*366*86400000)){quality_flags.push('implausible_effective_date');effective=null;}
  const source=BASE+state.toLowerCase()+'.csv';
  const id=createHash('sha256').update([state,employer,get('address'),get('city'),get('notice_date'),get('effective_date'),workers].join('|')).digest('hex').slice(0,24);
  const aliases=[employer,get('dba'),...employer.split(/\bd\s*\/?\s*b\s*\/?\s*a\b/i)].map(companyKey).filter(k=>k.length>=3);
  events.push({id,employer,employer_keys:[...new Set(aliases)],state,city:get('city'),address:get('address'),county:get('county'),workers,notice_date:notice,effective_date:effective,quality_flags,date_note:!effective?get('effective_date'):null,notice_date_note:!notice?get('notice_date'):null,reason:get('reason'),source_url:officialNoticeURL(get('url'))||source,feed_url:source,source_row:i+2});
 }
 return {events,excluded_non_warn,malformed_rows,schema_notes,mapped_fields:Object.keys(mapped).filter(k=>mapped[k]>=0),missing_fields:Object.keys(mapped).filter(k=>mapped[k]<0)};
}
export function createWarnService({get,ttl=3600000,officialTexas=true}){
 let cache=null,pending=null;
 async function load(){
  if(cache&&Date.now()-cache.at<ttl)return cache.data;
  if(pending)return pending;
  pending=(async()=>{
   const signal=AbortSignal.timeout(45000);
   const manifest=JSON.parse((await get(BASE+'warn_feeds.json',{signal,maxBytes:100000})).text);
   if(!Array.isArray(manifest)||!manifest.length||manifest.length>60)throw Error('WARN feed manifest unavailable');
   const feeds=manifest.map(f=>{if(!ALL.includes(f.state)||f.url!==BASE+f.state.toLowerCase()+'.csv'||f.format!=='csv')throw Error('Unrecognized WARN feed');return {state:f.state,url:f.url,format:f.format};});
   if(new Set(feeds.map(f=>f.state)).size!==feeds.length)throw Error('Duplicate WARN jurisdictions in manifest');
   if(officialTexas&&!feeds.some(f=>f.state==='TX'))feeds.push(TEXAS);
   let published_at=null;try{const value=(await get(BASE+'updated_at.txt',{signal,maxBytes:100})).text.trim();if(/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now()+300000)published_at=value;}catch{}
   const events=[],coverage=[];
   for(let i=0;i<feeds.length;i+=4)await Promise.all(feeds.slice(i,i+4).map(async f=>{
    try{
     const file=await get(f.url,{signal,maxBytes:6000000});const parsed=parseWarn(file.text,f.state);let sourceDate=published_at;
     if(f.metadata_url){
      if(parsed.events.length>=50000)throw Error('Official WARN source exceeds the configured row limit');
      sourceDate=null;try{const metadata=JSON.parse((await get(f.metadata_url,{signal,maxBytes:500000})).text);const milliseconds=Number(metadata.rowsUpdatedAt)*1000;if(Number.isFinite(milliseconds)&&milliseconds>0&&milliseconds<=Date.now()+300000)sourceDate=new Date(milliseconds).toISOString();}catch{}
      for(const event of parsed.events){event.feed_url=f.url;event.source_url=f.source_url;}
     }
     events.push(...parsed.events);coverage.push({state:f.state,status:'loaded',rows:parsed.events.length,source_url:f.source_url||f.url,publication_basis:f.metadata_url?'official_dataset':'mirror',published_at:sourceDate,publication_stale:sourceDate?Date.now()-Date.parse(sourceDate)>48*3600000:null,excluded_non_warn:parsed.excluded_non_warn,malformed_rows:parsed.malformed_rows,schema_notes:parsed.schema_notes,date_anomalies:parsed.events.filter(e=>e.quality_flags.length).length,missing_fields:parsed.missing_fields,sha256:createHash('sha256').update(file.text).digest('hex'),unknown_notice_dates:parsed.events.filter(e=>!e.notice_date).length,latest_notice_date:parsed.events.reduce((last,e)=>e.notice_date&&e.notice_date>last?e.notice_date:last,'')||null});
    }
    catch{coverage.push({state:f.state,status:'unavailable',rows:0});}
   }));
   for(const state of ALL)if(!feeds.some(f=>f.state===state))coverage.push({state,status:'not_published',rows:0});
   const data={published_at,publication_stale:published_at?Date.now()-Date.parse(published_at)>48*3600000:null,events:[...new Map(events.map(e=>[e.id,e])).values()],coverage:coverage.sort((a,b)=>a.state.localeCompare(b.state)),fetched_at:new Date().toISOString(),manifest_url:BASE+'warn_feeds.json'};
   cache={at:Date.now(),data};return data;
  })().finally(()=>pending=null);return pending;
 }
 async function query(filters={}){
  const data=await load();const company=norm(filters.company),state=String(filters.state||'').toUpperCase();
  let events=data.events.filter(e=>(!state||e.state===state)&&(!company||norm(e.employer).includes(company)));
  if(filters.from)events=events.filter(e=>(e.notice_date||e.effective_date||'')>=filters.from);
  if(filters.to)events=events.filter(e=>(e.notice_date||e.effective_date||'9999')<=filters.to);
  events.sort((a,b)=>(b.notice_date||b.effective_date||'').localeCompare(a.notice_date||a.effective_date||''));
  const offset=Math.max(0,Math.min(100000,Number(filters.offset)||0));
  return {...data,events:events.slice(offset,offset+100).map(({employer_keys,...e})=>e),total:events.length,total_notices:data.events.length,offset};
 }
 async function research(lead){
  try{
   const data=await load(),key=companyKey(lead.company);const matches=key.length>=3?data.events.filter(e=>e.employer_keys.includes(key)):[];
   const sorted=matches.sort((a,b)=>(b.notice_date||b.effective_date||'').localeCompare(a.notice_date||a.effective_date||''));
   const count=data.coverage.filter(c=>c.status==='loaded').length;
   return {source:'warn',feed_version:3,retryable:false,status:matches.length?'matched':'partial',checked_at:new Date().toISOString(),published_at:data.published_at,publication_stale:data.publication_stale,coverage:count+' of 51 US jurisdictions loaded from the published WARN feeds.',limitations:['Employer match only; this does not establish that the person or their workplace was affected.',...(!data.published_at?['Feed publication date is unknown.']:data.publication_stale?['Feed publication is over 48 hours old; recent notices may be missing.']:[]),...data.coverage.filter(c=>c.status==='loaded'&&(!c.published_at||c.publication_stale)).map(c=>c.state+': '+(c.published_at?'source publication is over 48 hours old; recent notices may be missing.':'source publication date is unknown.')),...data.coverage.filter(c=>c.status!=='loaded').map(c=>c.state+': '+c.status)],total_matches:matches.length,records:sorted.slice(0,20).map(e=>({source:'warn',scope:'company',url:e.source_url,excerpt:e.employer+' — '+[e.city||e.address,e.state,e.workers!==null?e.workers+' workers':null].filter(Boolean).join(', '),source_date:e.notice_date,checked_at:new Date().toISOString(),status:'machine_matched',method:'Published WARN feed',event:e,note:'Exact normalized employer match. Notice and effective dates are separate; unknown dates remain unknown. No individual layoff inference.'}))};
  }catch{return {source:'warn',retryable:true,status:'partial',records:[],checked_at:new Date().toISOString(),coverage:'Published WARN feeds',limitations:['WARN data could not be loaded. This is not a no-match result.']};}
 }
 return {load,query,research};
}
