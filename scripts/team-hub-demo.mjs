// Fictional, read-only planner inputs for the loopback demo. Never loaded by
// server.mjs and never connected to the demo's mutable contact workspace.
export function createSyntheticTeamHubAdapters() {
  const team = 'synthetic-firm';
  const accounts = [
    {uid:'demo-departing', label:'Departing advisor (fictional)', disabled:false, emailVerified:true},
    {uid:'demo-receiver', label:'Receiving advisor (fictional)', disabled:false, emailVerified:true},
    {uid:'demo-unverified', label:'Unverified advisor (fictional)', disabled:false, emailVerified:false}
  ];
  const contactsFor = uid => uid === 'demo-departing' ? [1,2,3].map(i => ({id:'demo-contact-'+i,user_id:uid,identity_keys:['fixture-key-'+i]})) : uid === 'demo-receiver' ? [{id:'demo-existing-1',user_id:uid,identity_keys:['fixture-key-1']}] : [];
  const allowed = actor => actor?.uid === 'synthetic-demo';
  return {
    authorizeSupervisor:async ({actor}) => ({approved:allowed(actor), actorUid:actor.uid, scope:'team-lead-hub-preview', team}),
    listAdvisors:async () => structuredClone(accounts),
    plannerAdapters:{
      authorize:async ({actor, sourceUid, targetUid}) => ({approved:allowed(actor) && accounts.some(row => row.uid === sourceUid) && accounts.some(row => row.uid === targetUid), scope:'advisor-reassignment-preview', team, sourceUid, targetUid}),
      resolveAccount:async uid => structuredClone(accounts.find(row => row.uid === uid)),
      loadSnapshot:async ({sourceUid, targetUid}) => {
        const active = sourceUid === 'demo-departing';
        return {complete:true,
          contacts:contactsFor(sourceUid),
          targetContacts:contactsFor(targetUid),
          lists:active ? [{id:'demo-list-1',user_id:sourceUid}] : [],
          listMembers:active ? [1,2,3].map(i => ({list_id:'demo-list-1',contact_id:'demo-contact-'+i})) : [],
          shares:active ? [{list_id:'demo-list-1',recipient_uid:'demo-colleague'}] : [],
          discoveryLeads:active ? [1,2].map(i => ({id:'demo-lead-'+i,owner_user_id:sourceUid,team})) : [],
          contactLinks:active ? [{contact_id:'demo-contact-1',lead_id:'demo-lead-1',user_id:sourceUid}] : [],
          observations:active ? [{lead_id:'demo-lead-1',user_id:sourceUid}] : [],
          activities:active ? [{id:'demo-activity-1',lead_id:'demo-lead-1',user_id:sourceUid}] : [],
          jobs:active ? [{id:'demo-paused-job',user_id:sourceUid,status:'paused'}] : []};
      }
    }
  };
}
