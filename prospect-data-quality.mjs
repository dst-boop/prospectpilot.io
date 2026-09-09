import {emailAddress, phoneNumber, linkedinURL, nameKey} from './lead-quality.mjs';

const fail = message => Object.assign(Error(message), {status: 422});
export const CONTACT_ALIASES = {
  first_name: ['first name', 'firstname', 'contact first name'],
  last_name: ['last name', 'lastname', 'contact last name'],
  company: ['company', 'company name', 'employer'],
  title: ['title', 'job title', 'position', 'current title'],
  email: ['email', 'work email', 'email address', 'business email', 'contact email'],
  phone: ['phone', 'business phone', 'direct phone', 'direct phone number'],
  linkedin_url: ['linkedin url', 'linkedin profile url', 'linkedin contact profile url'],
  country: ['country', 'contact country'], state: ['state', 'region', 'contact state'],
  city: ['city', 'contact city'], company_domain: ['company domain', 'domain', 'company website'],
  industry: ['industry', 'primary industry'], seniority: ['seniority', 'seniority level', 'management level'],
  suppressed: ['suppressed', 'do not contact'],
};
export const columnKey = value => nameKey(value).replaceAll(' ', '');
export const CONTACT_COLUMNS = new Map(Object.entries(CONTACT_ALIASES).flatMap(([key, aliases]) => [key, ...aliases].map(alias => [columnKey(alias), key])));
const states = 'Alabama:AL|Alaska:AK|Arizona:AZ|Arkansas:AR|California:CA|Colorado:CO|Connecticut:CT|Delaware:DE|District of Columbia:DC|Florida:FL|Georgia:GA|Hawaii:HI|Idaho:ID|Illinois:IL|Indiana:IN|Iowa:IA|Kansas:KS|Kentucky:KY|Louisiana:LA|Maine:ME|Maryland:MD|Massachusetts:MA|Michigan:MI|Minnesota:MN|Mississippi:MS|Missouri:MO|Montana:MT|Nebraska:NE|Nevada:NV|New Hampshire:NH|New Jersey:NJ|New Mexico:NM|New York:NY|North Carolina:NC|North Dakota:ND|Ohio:OH|Oklahoma:OK|Oregon:OR|Pennsylvania:PA|Rhode Island:RI|South Carolina:SC|South Dakota:SD|Tennessee:TN|Texas:TX|Utah:UT|Vermont:VT|Virginia:VA|Washington:WA|West Virginia:WV|Wisconsin:WI|Wyoming:WY|Puerto Rico:PR|Guam:GU|US Virgin Islands:VI|American Samoa:AS|Northern Mariana Islands:MP'.split('|').map(pair => pair.split(':'));
const stateCodes = new Map(states.flatMap(([name, code]) => [[name.toLowerCase(), code], [code.toLowerCase(), code]]));
export const stateName = value => states.find(([,code])=>code===String(value).toUpperCase())?.[0] || value;
export const countryAliases = value => normalizeCountry(value)==='US'?['us','usa','u.s.','u.s.a.','united states','united states of america']:[value];
export const stateAliases = (value,country) => !country || normalizeCountry(country)==='US' ? [...new Set([value,normalizeState(value,country),stateName(normalizeState(value,country))])] : [value];
export const normalizeCountry = value => {
  const cleaned = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  return /^(us|u\.s\.?|usa|u\.s\.a\.?|united states(?: of america)?)$/i.test(cleaned) ? 'US' : cleaned;
};
export const normalizeState = (value, country) => {
  const cleaned = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  return !country || normalizeCountry(country) === 'US' ? stateCodes.get(cleaned.toLowerCase()) || cleaned : cleaned;
};
const optionalBlank = value => /^(n\/a|not available|not provided|null|--|-)$/i.test(value);
const cleanField = (value, key) => {
  const cleaned = String(value ?? '').normalize('NFKC').trim();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)) throw fail(`${key}: unsupported control character.`);
  const limit = key === 'linkedin_url' ? 500 : key === 'email' ? 254 : 200;
  if (cleaned.length > limit) throw fail(`${key}: exceeds ${limit} characters; shorten the field before importing.`);
  return key !== 'first_name' && key !== 'last_name' && optionalBlank(cleaned) ? '' : cleaned.replace(/\s+/g, ' ');
};
export const SHARED_MAILBOX_PATTERN = '^(info|sales|hello|contact|support|office|admin|team|reception|service|billing|careers|jobs|hr|marketing|accounts|noreply|no-reply)([+._-][^@]*)?@';
const sharedMailboxRegex=new RegExp(SHARED_MAILBOX_PATTERN,'i');
export const sharedMailbox = email => sharedMailboxRegex.test(email || '');
const hostname = value => value.length<=253&&value.split('.').every(label=>label.length<=63)&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);
export function contactEmail(value){
 const email=emailAddress(value);
 return email&&Buffer.byteLength(email.split('@')[0])<=64&&Buffer.byteLength(email)<=254&&hostname(email.split('@')[1])&&!/^\.|\.\.|\.@/.test(email)?email:'';
}
export function contactPhone(value,country){
 const raw=String(value??'').normalize('NFKC').trim(),location=normalizeCountry(country);
 if(/[^0-9()+.\s-]/.test(raw)||location&&location!=='US'&&!raw.startsWith('+1'))return '';
 return phoneNumber(raw);
}
export function normalizeContact(raw, source) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw)) {
    const target = CONTACT_COLUMNS.get(columnKey(key));
    if (target) mapped[target] = value;
  }
  const contact = Object.fromEntries(Object.keys(CONTACT_ALIASES).map(key => [key, cleanField(mapped[key], key)]));
  if (![contact.first_name, contact.last_name].every(value => /\p{L}/u.test(value))) throw fail('First and last name must each contain a letter.');
  contact.email = contactEmail(contact.email);
  const rawEmail = cleanField(mapped.email, 'email');
  if (rawEmail && !contact.email) throw fail('Invalid email address.');
  const rawPhone = contact.phone;
  contact.phone = contactPhone(rawPhone,contact.country);
  if (rawPhone && !contact.phone) throw fail('Use a supported +1 phone number without an extension. For contacts outside the US, include +1 explicitly.');
  const rawLinkedIn = contact.linkedin_url;
  contact.linkedin_url = linkedinURL(rawLinkedIn && !/^https?:/i.test(rawLinkedIn) ? 'https://' + rawLinkedIn : rawLinkedIn);
  if (rawLinkedIn && !contact.linkedin_url) throw fail('Use a LinkedIn person profile URL.');
  if (contact.company_domain) {
    try {
      const url = new URL(/^https?:\/\//i.test(contact.company_domain) ? contact.company_domain : 'https://' + contact.company_domain);
      if (url.username || url.password || url.port || !hostname(url.hostname)) throw Error();
      contact.company_domain = url.hostname.toLowerCase().replace(/^www\./, '');
    } catch { throw fail('Company website must contain a valid public hostname.'); }
  }
  contact.country = normalizeCountry(contact.country);
  contact.state = normalizeState(contact.state, contact.country);
  const suppression = contact.suppressed;
  if (suppression && !/^(true|yes|1|do not contact|false|no|0)$/i.test(suppression)) throw fail('Suppressed must be yes/no or true/false.');
  contact.suppressed = /^(true|yes|1|do not contact)$/i.test(suppression);
  contact.email_status = contact.email ? 'unverified' : 'missing';
  contact.phone_status = contact.phone ? 'unverified' : 'missing';
  contact.source = String(source ?? '').trim().slice(0, 200) || 'CSV import';
  contact.source_kind = 'import';
  return contact;
}

// Parse quoted fields strictly and retain physical source line numbers for review.
export function parseContactCSV(input) {
  if (typeof input !== 'string' || Buffer.byteLength(input) > 4_000_000) throw fail('Choose a CSV up to 4 MB.');
  const csv = input.replace(/^\uFEFF/, '');
  const records = [];
  let cells = [], cell = '', state = 'start', line = 1, rowLine = 1;
  const endCell = () => { cells.push(cell); if(cells.length>500)throw fail(`CSV line ${rowLine} exceeds 500 columns.`); cell = ''; state = 'start'; };
  const endRow = () => {
    endCell();
    if (cells.some(value => value.trim())) records.push({cells, row: rowLine});
    if (records.length > 5001) throw fail('Include headers and no more than 5,000 rows.');
    cells = [];
  };
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (state === 'quoted') {
      if (char === '"') { if (csv[i + 1] === '"') { cell += '"'; i++; } else state = 'closed'; }
      else if (char === '\r' || char === '\n') { if (char === '\r' && csv[i + 1] === '\n') i++; cell += '\n'; line++; }
      else cell += char;
      continue;
    }
    if (char === ',' || char === '\r' || char === '\n') {
      if (char === ',') endCell();
      else { endRow(); if (char === '\r' && csv[i + 1] === '\n') i++; line++; rowLine = line; }
    } else if (char === '"' && state === 'start') state = 'quoted';
    else if (char === '"' || state === 'closed') throw fail(`Malformed CSV quoting on line ${line}.`);
    else { cell += char; state = 'plain'; }
  }
  if (state === 'quoted') throw fail(`Unclosed CSV quote starting on line ${rowLine}.`);
  if (cell || cells.length || state === 'closed') endRow();
  if (records.length < 2) throw fail('Include headers and 1–5,000 rows.');
  const headers = records.shift().cells;
  if (headers.some(header => !header.trim())) throw fail('Every CSV column needs a header.');
  if (headers.some(header => header.length>200)) throw fail('CSV headers must be no longer than 200 characters.');
  const known = headers.map(header => CONTACT_COLUMNS.get(columnKey(header))).filter(Boolean);
  if (new Set(known).size !== known.length || new Set(headers.map(columnKey)).size !== headers.length) throw fail('Duplicate CSV columns.');
  if (!known.includes('first_name') || !known.includes('last_name')) throw fail('Include First Name and Last Name columns.');
  return {headers, records, mapped_columns: known, ignored_columns: headers.filter(header => !CONTACT_COLUMNS.has(columnKey(header)))};
}

// Observation dates have no time of day. Use the same whole-date boundary in
// detail flags, directory filters and aggregate coverage.
export const sourceFreshnessCutoff = (now = new Date()) => new Date(Number(now) - 180 * 86400000).toISOString().slice(0, 10);

export function contactQuality(contact, now = new Date()) {
  const issues = [];
  if (!contact.email && !contact.phone && !contact.linkedin_url) issues.push({code: 'no_contact_route', message: 'No email, phone or LinkedIn profile.'});
  if (sharedMailbox(contact.email)) issues.push({code: 'shared_mailbox', message: 'Shared mailbox; individual ownership is not established.'});
  if (contact.email && /@(?:[^@]+\.)?(?:example\.(?:com|net|org)|invalid|test)$/i.test(contact.email)) issues.push({code: 'test_address', message: 'Reserved example or test email domain.'});
  if (contact.email && contact.email_status !== 'valid') issues.push({code: 'email_not_verified', message: 'Email has no current valid verification.'});
  if (contact.email_domain_check?.domain===String(contact.email||'').split('@')[1]&&['no_domain','null_mx','no_mail_route'].includes(contact.email_domain_check?.status)) issues.push({code:'domain_mail_issue',message:'The last domain check found no mail route. Review its date and the email domain.'});
  if (!contact.company) issues.push({code: 'missing_company', message: 'Company is missing.'});
  if (!contact.country) issues.push({code: 'missing_country', message: 'Contact country is missing.'});
  const seen = contact.source_observed_at;
  if (!seen) issues.push({code: 'source_date_unknown', message: 'Source observation date is unknown; importing today does not establish freshness.'});
  if (seen && Number.isFinite(Date.parse(seen)) && seen < sourceFreshnessCutoff(now)) issues.push({code: 'stale_source', message: 'Source observation is over 180 days old.'});
  return {issues, suppressed: contact.suppressed === true, contact_routes: ['email', 'phone', 'linkedin_url'].filter(key => !!contact[key]).length};
}
