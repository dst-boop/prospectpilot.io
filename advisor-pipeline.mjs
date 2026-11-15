// A cohort of visible research records, not estimated assets or a forecast.
// The caller supplies one aggregate row per lead, scoped to the current actor.
const milestones = [
  ['added', 'Records added', 'added_at', 'Created in the research workspace.'],
  ['approached', 'Approached', 'pipeline_approached_at', 'Your outbound No answer, Connected, Follow-up agreed or Meeting booked log.'],
  ['conversation', 'Conversation recorded', 'pipeline_conversation_at', 'Your Connected, Follow-up agreed, Meeting booked or Meeting held log, including inbound conversations.'],
  ['booked', 'Meeting booked', 'pipeline_booked_at', 'Your Meeting booked log; an invitation is not attendance.'],
  ['held', 'Meeting held', 'pipeline_held_at', 'Your Meeting held log; a passed meeting time is not proof it happened.'],
  ['client', 'Client recorded', 'pipeline_client_at', 'Your first Became a client log, even if later reopened; no assets or revenue are implied.'],
];
const timestamp = value => value == null || value === '' ? NaN : new Date(value).getTime();

export function advisorPipeline(rows, {since, asOf}) {
  const start = timestamp(since), end = timestamp(asOf);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new TypeError('A valid pipeline window is required.');
  const cohort = rows.filter(row => timestamp(row.added_at) >= start && timestamp(row.added_at) <= end);
  const stages = milestones.map(([id, label, field, basis]) => {
    const dates = cohort.map(row => timestamp(row[field])).filter(at => Number.isFinite(at) && at <= end);
    return {id, label, count:dates.length, not_recorded:cohort.length - dates.length,
      latest_first_recorded_at:dates.length ? new Date(dates.reduce((latest,at) => Math.max(latest,at), -Infinity)).toISOString() : null, basis};
  });
  return {since:new Date(start).toISOString(), as_of:new Date(end).toISOString(), records:cohort.length, stages,
    scope:'Records created in this window that you can currently access. Only outcomes you logged are counted; this is not a team report. Worklist search, view and page do not filter these counts.',
    basis:'Each record counts once per milestone, using its first matching log. Each milestone uses its listed qualifying outcomes, not an assumed sequence. Client status does not fill missing activity logs. Dates are log dates, not signing dates or scheduled meeting times. This is recorded history, not current client status or a conversion forecast.'};
}
