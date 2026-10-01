import test from 'node:test';import assert from 'node:assert/strict';
import {estimateAgeBand} from '../age-band.mjs';
import {assessLead,researchCSV} from '../lead-quality.mjs';

const now=new Date('2026-10-01T00:00:00Z');
const lead={first_name:'Pat',last_name:'Example',company:'Example Hospital',current_title:'Director of Nursing',state:'NY',country:'US'};

test('a reported age is reported, not estimated',()=>{
  const a=estimateAgeBand({...lead,estimated_age_range:'62'},{now});
  assert.equal(a.status,'reported');assert.equal(a.inferred,false);assert.equal(a.label,'62');
  assert.equal(a.band,'60_64');assert.match(a.rollover_stage,/Past 59½/);
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
  assert.equal(both.basis.length,2);
  const clash=estimateAgeBand({...lead,graduation_year:2010,career_start_year:1980},{now});
  assert.equal(clash.status,'conflicting');assert.ok(clash.min<=37&&clash.max>=66);
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
  assert.match(csv.split('\r\n')[0],/"Age Band \(estimate unless reported\)","Age Basis","Class Year","Class Basis","Alumni 1977-1990","Career Stage"/);
  assert.match(csv.split('\r\n')[1],/"About 63–67 \(estimated\)","Graduation year 1984","1984","reported","yes","Established leader"/);
});
