import test from 'node:test';import assert from 'node:assert/strict';
import {estimateAgeBand} from '../age-band.mjs';
import {assessLead,researchCSV} from '../lead-quality.mjs';

const now=new Date('2026-10-01T00:00:00Z');
const lead={first_name:'Pat',last_name:'Example',company:'Example Hospital',current_title:'Director of Nursing',state:'NY',country:'US'};

test('a reported age is reported, not estimated',()=>{
  const a=estimateAgeBand({...lead,estimated_age_range:'62'},{now});
  assert.equal(a.status,'reported');assert.equal(a.inferred,false);assert.equal(a.label,'62');
  assert.equal(a.band,'60_64');assert.match(a.rollover_stage,/Past 59½: .*if the plan allows it/);assert.equal(a.confidence,0.8);
  assert.equal(a.class_basis,'estimated');assert.equal(a.class_year,'1986');assert.equal(a.alumni_window,'likely','an estimated class is never a yes');
});

test('a graduation year gives an estimated age, the class and a reunion',()=>{
  const a=estimateAgeBand({...lead,graduation_year:1987},{now});
  assert.equal(a.status,'rough_estimate');assert.equal(a.inferred,true);
  assert.equal(a.min,60);assert.equal(a.max,64);assert.match(a.label,/estimated/);
  assert.equal(a.class_year,1987);assert.equal(a.class_basis,'reported');assert.equal(a.alumni_window,'yes');
  assert.deepEqual(a.reunion,{year:2027,milestone:40,label:'40th reunion in 2027'});
  assert.equal(estimateAgeBand({...lead,graduation_year:1995},{now}).alumni_window,'no');
});

test('clues are intersected, and disagreeing clues widen instead of averaging',()=>{
  const both=estimateAgeBand({...lead,graduation_year:1985,career_start_year:1986},{now});
  assert.equal(both.status,'estimated');assert.equal(both.min,62);assert.equal(both.max,66);
  assert.equal(both.basis.length,2);assert.equal(both.confidence,0.74,'agreeing clues earn a bonus');
  const clash=estimateAgeBand({...lead,graduation_year:2010,career_start_year:1980},{now});
  assert.equal(clash.status,'conflicting');assert.equal(clash.confidence,0);assert.ok(clash.min<=37&&clash.max>=66);
});

test('tenure sets a floor and the class is open-ended',()=>{
  const a=estimateAgeBand({...lead,years_at_company:30},{now});
  assert.equal(a.min,51);assert.equal(a.max,null);assert.match(a.label,/51 or older/);
  assert.equal(a.class_year,'1997 or earlier');assert.equal(a.alumni_window,'possible');
});

test('with no age clue, the title still gives a career stage',()=>{
  const a=estimateAgeBand({...lead,current_title:'Chief Financial Officer'},{now});
  assert.equal(a.status,'unknown');assert.equal(a.band,null);assert.equal(a.career_stage,'Senior leadership');
  assert.equal(estimateAgeBand({...lead,current_title:'Junior Analyst'},{now}).career_stage,'Early or mid career');
  assert.equal(estimateAgeBand({...lead,current_title:'Senior Analyst'},{now}).career_stage,'Mid or late career');
});

test('an estimate can make age a candidate but never confirms it',()=>{
  const q=assessLead({...lead,graduation_year:1984},[],{now});
  assert.equal(q.gates.age.state,'candidate');assert.match(q.gates.age.reason,/estimate, not proof/);
  assert.equal(q.age_band.class_year,1984);
  assert.equal(assessLead({...lead,graduation_year:2005},[],{now}).gates.age.state,'unknown','an estimate outside 45–73 is no candidate');
  assert.equal(assessLead(lead,[],{now}).gates.age.state,'unknown');
  const csv=researchCSV([{lead:{...lead,graduation_year:1984},quality:q}]);
  assert.match(csv.split('\r\n')[0],/"Age Band \(estimate unless reported\)","Age Confidence","Age Basis","Class Year","Class Basis","Alumni 1977-1990","Career Stage"/);
  assert.match(csv.split('\r\n')[1],/"About 63–67 \(estimated\)","0.65","Graduation year 1984","1984","reported","yes","Established leader"/);
});

test('providers that disagree on age show as a conflict, not the working value',()=>{
  const a=estimateAgeBand({...lead,estimated_age_range:'48',field_values:{estimated_age_range:[{value:'48',source:'ZoomInfo CSV'},{value:'66',source:'SEC proxy filing'}]}},{now});
  assert.equal(a.status,'conflicting');assert.equal(a.min,48);assert.equal(a.max,66);assert.match(a.label,/sources disagree/);
  assert.equal(a.basis.length,2);assert.equal(a.confidence,0);
  assert.equal(assessLead({...lead,estimated_age_range:'48',field_values:{estimated_age_range:[{value:'48'},{value:'66'}]}},[],{now}).age_band.status,'conflicting');
  const agree=estimateAgeBand({...lead,estimated_age_range:'62',field_values:{estimated_age_range:[{value:'60-64'},{value:'62'}]}},{now});
  assert.equal(agree.status,'reported');assert.equal(agree.label,'62');
});

test('fractional ages are kept, so 59.5 lands past 59½',()=>{
  const a=estimateAgeBand({...lead,estimated_age_range:'59.5'},{now});
  assert.equal(a.min,59.5);assert.equal(a.band,'60_64');assert.equal(a.band_label,'59½–64');assert.match(a.rollover_stage,/Past 59½/);
  assert.equal(estimateAgeBand({...lead,estimated_age_range:'59'},{now}).band,'55_59');
  assert.equal(estimateAgeBand({...lead,estimated_age_range:'59.5'},{now}).class_year,'1988–1989');
});


test('blank and nonnumeric experience never invent an age or alumni cohort',()=>{
 for(const value of [undefined,null,'',' ',false,true,[],[30],{},'unknown',NaN,Infinity]){
  const record={...lead,years_of_experience:value,years_at_company:value,years_in_current_role:value};
  const result=estimateAgeBand(record,{now});
  assert.equal(result.status,'unknown',String(value));
  assert.deepEqual(result.basis,[]);
  assert.equal(result.class_year,null);
  assert.equal(result.alumni_window,'unknown');
  assert.equal(assessLead(record,[],{now}).gates.age.state,'unknown');
 }
 for(const value of [0,'0',30,'30']){
  const result=estimateAgeBand({...lead,years_of_experience:value},{now});
  assert.equal(result.status,'rough_estimate');
  assert.equal(result.min,Number(value)+20);
 }
 const graduation=estimateAgeBand({...lead,graduation_year:1987,years_of_experience:null},{now});
 assert.equal(graduation.status,'rough_estimate');
 assert.deepEqual(graduation.basis,['Graduation year 1987'],'missing experience cannot conflict with real evidence');
});
