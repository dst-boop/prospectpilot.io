const W=id=>document.getElementById(id);let offset=0,busy=false;
for(const state of 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')){const option=document.createElement('option');option.value=state;option.textContent=state;W('state').append(option);}
function line(parent,text,tag='p'){const element=document.createElement(tag);element.textContent=text;parent.append(element);return element;}
async function load(){
 if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);W('status').textContent='Checking published WARN feeds…';
 try{
 const query=new URLSearchParams({company:W('company').value,state:W('state').value,from:W('from').value,to:W('to').value,offset});
 if(W('from').value&&W('to').value&&W('from').value>W('to').value)throw Error('The start date must be before the end date.');
 const response=await fetch('/api/warn?'+query);const d=await response.json();if(!response.ok)throw Error(d.detail||'Could not load WARN feeds.');
 W('status').textContent=d.total+' matching notices · '+d.total_notices+' notices loaded · '+d.coverage.filter(c=>c.status==='loaded').length+' of 51 jurisdictions available';
 W('freshness').textContent='Feeds retrieved '+new Date(d.fetched_at).toLocaleString()+'. Feed published: '+(d.published_at?new Date(d.published_at).toLocaleString():'unknown')+(d.publication_stale?' — publication is over 48 hours old':'')+'. Individual notice dates are shown separately.';
 W('coverage').replaceChildren();for(const c of d.coverage){const row=line(W('coverage'),c.state+': '+c.status.replaceAll('_',' ')+(c.status==='loaded'?' ('+c.rows+' rows)':''));if(c.missing_fields?.length)row.title='Fields not supplied: '+c.missing_fields.join(', ');}
 W('notices').replaceChildren();if(!d.events.length)line(W('notices'),'No matching notices in the loaded feeds. Check coverage before concluding there are no notices.');
 for(const e of d.events){const article=document.createElement('article');line(article,e.employer,'h3');line(article,[e.city||e.address,e.county,e.state].filter(Boolean).join(' · '));line(article,'Notice: '+(e.notice_date||e.notice_date_note||'unknown')+' · Effective: '+(e.effective_date||e.date_note||'unknown'));line(article,'Workers: '+(e.workers??'unknown')+(e.reason?' · '+e.reason:''));const link=document.createElement('a');link.textContent='Published source';link.href=e.source_url;link.target='_blank';link.rel='noopener noreferrer';article.append(link);W('notices').append(article);}
 W('page').textContent=d.total?(offset+1)+'–'+Math.min(offset+100,d.total)+' of '+d.total:'0 results';
 W('previous').disabled=offset===0;W('next').disabled=offset+100>=d.total;
 }catch(e){W('status').textContent=e.message;W('previous').disabled=true;W('next').disabled=true;}
 finally{busy=false;W('filters').querySelector('button').disabled=false;}
}
W('filters').onsubmit=e=>{e.preventDefault();if(busy)return;offset=0;void load();};
W('previous').onclick=()=>{if(busy)return;offset=Math.max(0,offset-100);void load();};W('next').onclick=()=>{if(busy)return;offset+=100;void load();};void load();
