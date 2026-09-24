import {contactQuality,phoneReadiness} from './prospect-data-quality.mjs';
import {DOMAIN_CHECK_LABELS} from './prospect-domain-check.mjs';
import {hash} from './lead-quality.mjs';
export function preparationRevision(contact){
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
 const input={...contact};delete input.preparation;return hash(JSON.stringify(stable(input)));
}

// Preparation is evidence assembly, not a claim of identity, wealth or permission.
export function buildPreparation(contact,check,{now=new Date()}={}){
 const quality=contactQuality(contact,now),phones=phoneReadiness(contact),blocked=contact.suppressed===true;
 const completed=['Preserved source claims and original phone values.','Applied suppression and channel-specific calling restrictions.'];
 const unresolved=[];
 if(blocked)unresolved.push('This contact is suppressed. No outreach draft was produced.');
 for(const [route,p] of Object.entries(contact.phone_import||{}))if(p.status==='needs_review')unresolved.push(`The imported ${route} number is not supported. It remains in source history and is excluded from active phone fields.`);
 if(phones.primary_blocked||phones.mobile_blocked)unresolved.push('Flagged phone routes are excluded from the exported contact fields.');
 const conflict=contact.source_history?.some(e=>e.proposed_values&&!e.resolution);
 if(conflict)unresolved.push('Source claims disagree. Original and proposed values are preserved; no claim was automatically chosen.');
 if(contact.zoominfo?.last_job_change_date||contact.zoominfo?.previous_company)unresolved.push('The reported job change has no independent confirmation here. The draft does not reference it or assume a retirement account.');
 if(check)completed.push('Email domain: '+(DOMAIN_CHECK_LABELS[check.status]||'Lookup inconclusive')+'.');
 else if(!blocked)unresolved.push(contact.email?'Email domain lookup could not be completed.':'No email is supplied; no email lookup was attempted.');
 if(contact.email)unresolved.push('Mailbox deliverability, recipient ownership and permission to contact remain unconfirmed.');
 completed.push('Prepared a brief from the available professional source fields.');
 const badDomain=!check||!['mx_present','address_fallback'].includes(check.status);
 const draft=!blocked&&!conflict&&contact.email&&!badDomain?{subject:'An introduction',body:`Hi ${contact.first_name},\n\nI work with professionals on retirement planning. Would a brief introductory conversation be useful to discuss your priorities and whether I could help?\n\nBest,`}:null;
 return {completed_at:now.toISOString(),completed,unresolved,profile:{name:[contact.first_name,contact.last_name].filter(Boolean).join(' '),company:contact.company||null,role:contact.title||null,source:contact.source||null,provider_validated_at:contact.zoominfo?.validated_at||null},domain_check:check||null,draft,questions:['What would make a financial-planning conversation useful to you?','What planning decisions are you considering?','What would you like the next step to be?'],status:blocked?'suppressed':unresolved.length?'prepared_with_gaps':'prepared',sent:false};
}
