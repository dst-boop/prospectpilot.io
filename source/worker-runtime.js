import { qualifierMetadata } from './qualifier-runtime.js';
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
const SOURCE_DISCOVERY_VERSION = 5;
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
const MARKET_INDUSTRY_RULES = [
  { pattern: /construction|general contractor|commercial builder|home builder|civil engineering/i, label: "Construction", selectors: [["office", "construction_company"], ["craft", "builder"], ["company", "construction"], ["office", "engineer"]] },
  { pattern: /\belectric(?:al|ian|ians)?\b|electrical contractor|electrical service/i, label: "Electrical contractors", selectors: [["craft", "electrician"]], search_terms: ["electrician"] },
  { pattern: /architect/i, label: "Architecture", selectors: [["office", "architect"]] },
  { pattern: /manufactur|factory|industrial compan/i, label: "Manufacturing", selectors: [["man_made", "works"], ["industrial", "factory"]] },
  { pattern: /law firm|attorney|legal/i, label: "Legal services", selectors: [["office", "lawyer"]] },
  { pattern: /account|cpa|tax firm/i, label: "Accounting", selectors: [["office", "accountant"], ["office", "tax_advisor"]] },
  { pattern: /insurance/i, label: "Insurance", selectors: [["office", "insurance"]] },
  { pattern: /real estate|property broker|realtor/i, label: "Real estate", selectors: [["office", "estate_agent"]] },
  { pattern: /medical|healthcare|physician|doctor/i, label: "Medical practices", selectors: [["amenity", "doctors"], ["healthcare", "doctor"], ["amenity", "clinic"]] },
  { pattern: /dentist|dental/i, label: "Dental practices", selectors: [["amenity", "dentist"]] },
  { pattern: /restaurant|hospitality group/i, label: "Restaurants", selectors: [["amenity", "restaurant"]] },
  { pattern: /hotel|lodging/i, label: "Hotels", selectors: [["tourism", "hotel"]] },
  { pattern: /auto dealer|car dealer|automotive dealer/i, label: "Automotive dealers", selectors: [["shop", "car"]] },
  { pattern: /funeral home/i, label: "Funeral homes", selectors: [["shop", "funeral_directors"]] },
  { pattern: /veterinar/i, label: "Veterinary practices", selectors: [["amenity", "veterinary"]] },
];
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
  const incomeHigh = Number(lead.estimated_income?.high || lead.estimated_income?.low || 0);
  const assetsHigh = Number(lead.estimated_assets?.high || lead.estimated_assets?.low || 0);
  const signals = new Set(lead.signals || []);
  const ageLow = Number(String(lead.estimated_age_range || "").split(/[–-]/)[0]) || 0;
  const incomePoints = incomeHigh >= 300_000 ? 25 : incomeHigh >= 220_000 ? 20 : incomeHigh >= 150_000 ? 12 : 5;
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
  const confidence = clamp(Math.round(30 + evidenceRows.length * 8 + (lead.email ? 8 : 0) + (lead.linkedin_url ? 8 : 0)), 0, 95);
  const roleStrength = lead.seniority === "C-suite" ? 92 : lead.seniority === "Owner / Partner" ? 90
    : lead.seniority === "Vice President" ? 78 : lead.seniority === "Director" ? 66 : lead.seniority === "Manager" ? 54 : lead.seniority === "Professional" ? 42 : 35;
  const incomeStrength = incomeHigh >= 500_000 ? 100 : incomeHigh >= 350_000 ? 90 : incomeHigh >= 250_000 ? 75 : incomeHigh >= 150_000 ? 55 : 35;
  const assetStrength = assetsHigh >= 5_000_000 ? 100 : assetsHigh >= 2_000_000 ? 90 : assetsHigh >= 1_000_000 ? 70 : assetsHigh >= 500_000 ? 50 : 30;
  const wealthStrength = Math.round((incomeStrength + assetStrength) / 2);
  const timingStrength = timing > 10 ? timing : 50;
  const relationshipStrength = relationship > 0 ? relationship : 35;
  const ageStrength = ageLow >= 50 && ageLow <= 70 ? 85 : ageLow >= 45 ? 65 : 50;
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
  return isLikelyPersonName([lead.first_name, lead.last_name].filter(Boolean).join(" "));
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
  if (!candidates.length) {
    for (const block of String(html || "").matchAll(/<(?:article|li|div)[^>]*(?:class|id)=["'][^"']*(?:team|leader|person|profile|bio|member|executive)[^"']*["'][^>]*>([\s\S]{20,2500}?)<\/(?:article|li|div)>/gi)) {
      const body = htmlText(block[1]);
      const titleMatch = body.match(new RegExp(`${rolePattern.source}[^|•·]{0,100}`, "i"));
      const nameMatch = body.match(/\b([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’.\-]+){1,3})\b/);
      if (!titleMatch || !nameMatch || !isLikelyPersonName(nameMatch[1])) continue;
      const linkedin = block[1].match(/href=["']([^"']*linkedin\.com\/in\/[^"'?#]+)/i)?.[1] || "";
      candidates.push({ name: nameMatch[1], current_title: titleMatch[0].trim(), company: fallbackCompany,
        linkedin_url: linkedin, source_url: pageUrl, source_names: ["Public website"],
        evidence: [evidence("current_title", titleMatch[0].trim(), "Public website", "reported", 0.68, pageUrl, body.slice(0, 400))] });
    }
  }
  const labels = [...String(html || "").matchAll(/<(?:h1|h2|h3|h4|p|a)\b[^>]*>([\s\S]{1,500}?)<\/(?:h1|h2|h3|h4|p|a)>/gi)]
    .map(match => htmlText(match[1])).filter(label => label && label.length <= 180);
  for (let index = 0; index < labels.length; index += 1) {
    const name = labels[index];
    if (!isLikelyPersonName(name)) continue;
    const nearby = [labels[index + 1], labels[index + 2], labels[index - 1]].filter(Boolean);
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
    if (!isLikelyPersonName(candidate.name) || !rolePattern.test(candidate.current_title)) continue;
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
  const requested = unique(industries || []);
  const matched = [];
  for (const value of requested) {
    const rule = MARKET_INDUSTRY_RULES.find(item => item.pattern.test(value));
    if (rule) matched.push(rule);
  }
  const selectors = [], labels = [], searchTerms = [];
  for (const rule of matched) {
    labels.push(rule.label);
    searchTerms.push(...array(rule.search_terms));
    for (const selector of rule.selectors) if (!selectors.some(item => item[0] === selector[0] && item[1] === selector[1])) selectors.push(selector);
  }
  return { requested, labels: unique(labels), selectors: selectors.slice(0, 8), search_terms: unique(searchTerms).slice(0, 3) };
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
  if (!industries.selectors.length) return { companies: [], errors: [`Business type “${industries.requested.join(", ")}” is not mapped yet. Try construction, electrical contractors, legal, accounting, insurance, real estate, medical, dental, restaurants, hotels, automotive dealers, manufacturing, architecture, veterinary, or funeral homes.`], provider: "OpenStreetMap", location: null, industry_labels: [] };
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
        if (!name || /department|authority|association|school|university|municipal|government/i.test(name)) continue;
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
      provider: "OpenStreetMap", location: area, radius_miles: radiusMiles, industry_labels: industries.labels,
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
  for (const url of explicit) {
    const catalogEntry = VERIFIED_TARGET_CATALOG.find(entry => catalogTargetKey(entry.url) === catalogTargetKey(url));
    if (!restrictedCrawlReason(safeTargetUrl(url))) sourcePlan.push({
      url, company: catalogEntry?.company || (array(campaign.employers).length === 1 ? campaign.employers[0] : ""),
      source_type: catalogEntry?.source_type || sourceTypeForUrl(url), status: catalogEntry?.profiles?.length ? "verified_snapshot" : "manual",
      score: sourceScore(url, "", catalogEntry ? "catalog" : "manual"), discovery_method: catalogEntry ? "catalog" : "manual", discovered_at: discoveredAt,
    });
  }
  const suggested = suggestCampaignTargets(hintedCampaign);
  for (const entry of suggested) sourcePlan.push({
    url: entry.url, company: entry.company, source_type: entry.source_type || "Official leadership directory",
    status: entry.profiles?.length ? "verified_snapshot" : "catalog", score: sourceScore(entry.url, entry.source_type, "catalog"),
    discovery_method: "catalog", discovered_at: discoveredAt,
  });
  const coveredCompanies = new Set(sourcePlan.map(source => lower(source.company)).filter(Boolean));
  const marketByCompany = new Map(marketDiscovery.companies.map(company => [lower(company.name), company]));
  const allEmployers = unique([...(hintedCampaign.employers || []), ...marketDiscovery.companies.map(company => company.name)]);
  const employers = allEmployers.slice(0, MAX_DISCOVERY_EMPLOYERS);
  if (allEmployers.length > employers.length) errors.push(`Kept all ${allEmployers.length} businesses, while this run inspected websites for the first ${MAX_DISCOVERY_EMPLOYERS} to stay within the live request budget. The full business list remains available for ZoomInfo export.`);
  for (let index = 0; index < employers.length; index += 3) {
    const batch = employers.slice(index, index + 3).map(async company => {
      if (coveredCompanies.has(lower(company))) return [];
      try {
        const marketCompany = marketByCompany.get(lower(company));
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
    const fallbackCandidates = verifiedSnapshotCandidates(target, campaign.id);
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
