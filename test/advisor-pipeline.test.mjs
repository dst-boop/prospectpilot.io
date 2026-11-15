import test from 'node:test';
import assert from 'node:assert/strict';
import {advisorPipeline} from '../advisor-pipeline.mjs';

const window = {since:'2026-08-13T15:00:00Z',asOf:'2026-09-12T15:00:00Z'};
const counts = summary => Object.fromEntries(summary.stages.map(stage => [stage.id,stage.count]));

test('pipeline preserves independent milestones, true zeros and explicit missing log dates', () => {
  const summary = advisorPipeline([
    {id:'inbound',added_at:'2026-08-20',pipeline_conversation_at:'2026-08-21'},
    {id:'client-only',added_at:'2026-09-01',pipeline_client_at:'2026-09-02'},
    {id:'unlogged',added_at:'2026-09-03',follow_up_status:'Client',assets:9000000},
  ],window);
  assert.deepEqual(counts(summary),{added:3,approached:0,conversation:1,booked:0,held:0,client:1});
  const missing = summary.stages.find(stage => stage.id === 'held');
  assert.equal(missing.not_recorded,3);assert.equal(missing.latest_first_recorded_at,null);
  assert.equal(summary.stages.find(stage => stage.id === 'client').latest_first_recorded_at,'2026-09-02T00:00:00.000Z');
  assert.match(summary.scope,/Only outcomes you logged/);
  assert.match(summary.basis,/listed qualifying outcomes, not an assumed sequence/);
  assert.doesNotMatch(JSON.stringify(summary),/9000000|"rate"|"revenue"|"target"/);
});

test('pipeline bounds the same cohort and milestones by its exact as-of instant', () => {
  const summary = advisorPipeline([
    {added_at:'2026-08-13T14:59:59.999Z',pipeline_client_at:'2026-09-01'},
    {added_at:window.since,pipeline_approached_at:new Date(window.since)},
    {added_at:new Date(window.asOf),pipeline_conversation_at:window.asOf},
    {added_at:'2026-09-12T15:00:00.001Z',pipeline_client_at:window.asOf},
    {added_at:'2026-09-01',pipeline_client_at:'2026-09-12T15:00:00.001Z',pipeline_booked_at:'not-a-date'},
    {added_at:null},{added_at:''},{added_at:'invalid'},
  ],window);
  assert.deepEqual(counts(summary),{added:3,approached:1,conversation:1,booked:0,held:0,client:0});
  assert.equal(summary.as_of,'2026-09-12T15:00:00.000Z');
  const empty = advisorPipeline([],window);
  assert.equal(empty.records,0);assert.ok(empty.stages.every(stage => stage.count === 0 && stage.latest_first_recorded_at === null));
  assert.throws(() => advisorPipeline([],{since:'invalid',asOf:window.asOf}),TypeError);
  assert.throws(() => advisorPipeline([],{since:window.asOf,asOf:window.since}),TypeError);
});

test('pipeline aggregation does not use argument spreading for large cohorts', () => {
  const summary = advisorPipeline(Array.from({length:150000},(_,id) => ({id,added_at:window.since})),window);
  assert.equal(summary.records,150000);
  assert.equal(summary.stages[0].latest_first_recorded_at,'2026-08-13T15:00:00.000Z');
});
