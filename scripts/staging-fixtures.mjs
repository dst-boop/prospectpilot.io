// Fixed synthetic-only fixtures, not a provider format validator or arbitrary CSV permission.
export const stagingBodyLimit=500000;
export const fictionalCSV='First Name,Last Name,Company,Title,Email,Country\nAlex,Fiction,Example Legal,Partner,alex@example.test,US\nSam,Sample,Example Engineering,Engineer,sam@example.test,US';
export const largeFixtureRows=1000;
const roles=['Partner','Engineer','Practice Manager','Analyst'];
const note='FICTIONAL TEST RECORD ONLY. This synthetic location note exercises optional imported text and does not identify a real person or business. No contact or outreach is authorized. ';
export const largeFictionalCSV=['First Name,Last Name,Company,Title,Email,Country,State,City,Company Website,Location',...Array.from({length:largeFixtureRows},(_,index)=>{
 const n=String(index+1).padStart(4,'0');
 return ['Fiction'+n,'Synthetic','Example Test Organization '+n,roles[index%roles.length],'fiction'+n+'@example.test','US',index%3?'IL':'',index%2?'Example Test City':'','https://example.test',note+'Fixture row '+n+'.'].join(',');
})].join('\n');
export const fixtureDownloads=new Map([['/staging-fixture.csv',{filename:'fictional-staging.csv',csv:fictionalCSV}],['/staging-fixture-large.csv',{filename:'fictional-staging-large.csv',csv:largeFictionalCSV}]]);
export function allowedStagingCSV(value){
 if(typeof value!=='string'||Buffer.byteLength(value)>stagingBodyLimit)return false;
 const normalized=value.replace(/\r\n/g,'\n').trim();
 return normalized===fictionalCSV||normalized===largeFictionalCSV;
}
