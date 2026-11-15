import {createTeamDistributionPlanner,DISTRIBUTION_PLAN_VERSION} from '../team-distribution-plan.mjs';
const firmId='fictional-firm';
const recipients=[['advisor-a',1,2],['advisor-b',0,2],['advisor-c',0,1]].map(([uid,activeAssignments,capacity])=>({uid,firmId,status:'active',emailVerified:true,disabled:false,version:'fixture-1',activeAssignments,capacity}));
const planner=createTeamDistributionPlanner({firmId,
 authorize:async scope=>({...scope,scope:DISTRIBUTION_PLAN_VERSION,approved:scope.actorUid==='fictional-supervisor'}),
 loadSnapshot:async()=>({complete:true,firmId,version:'fixture-1',asOf:'2026-11-15T12:00:00.000Z',source:{uid:'departed-advisor',firmId,status:'departed'},recipients,
 leads:Array.from({length:5},(_,i)=>({id:'fictional-lead-'+(i+1),version:'fixture-1',firmId,advisorUid:'departed-advisor',followUpAt:i===0?'2026-11-14T12:00:00.000Z':null,holds:i===0?['dnc']:[],recipientRights:recipients.map(r=>({uid:r.uid,decision:'allowed',version:'fixture-1'}))}))})});
console.log(JSON.stringify(await planner({source_uid:'departed-advisor',recipient_uids:recipients.map(r=>r.uid)},{uid:'fictional-supervisor'}),null,2));
