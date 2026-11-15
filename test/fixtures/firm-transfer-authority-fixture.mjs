import {readFileSync} from 'node:fs';
import {migrate} from '../../migrate.mjs';
export const scope={firmId:'firm-a',actorUid:'boss',sourceUid:'source',targetUid:'target'};
export const records=[{kind:'contact',id:'contact'},{kind:'list',id:'list'},{kind:'lead',id:'lead'}];
export async function prepareAuthorityFixture(db) {
 await migrate({connect:async()=>({query:async(s,v)=>s.includes(';')?(await db.exec(s)).at(-1):db.query(s,v),release(){}}),end:async()=>{}});
 for(const file of ['firm-preview-boundary.sql','firm-transfer-authority.sql'])await db.exec(readFileSync(new URL('../../schema-drafts/'+file,import.meta.url),'utf8'));
 await db.exec(`INSERT INTO firm_workspaces(id,name,status)VALUES('firm-a','A','active'),('firm-b','B','active');
 INSERT INTO firm_members(firm_id,user_id,label,role,status,approved_by,approval_reference)VALUES
 ('firm-a','boss','Boss','supervisor','active','provisioner','synthetic'),('firm-a','source','Source','advisor','departed','provisioner','synthetic'),
 ('firm-a','target','Target','advisor','active','provisioner','synthetic'),('firm-b','boss','Other membership','advisor','active','provisioner','synthetic'),
 ('firm-b','source-b','Other source','advisor','departed','provisioner','synthetic'),('firm-b','target-b','Other target','advisor','active','provisioner','synthetic');
 INSERT INTO prospect_contacts(id,user_id,payload)VALUES('contact','source','{"synthetic":"private"}'),('unassigned','source','{}');
 INSERT INTO prospect_lists(id,user_id,name)VALUES('list','source','Synthetic');
 INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload)VALUES('lead','untrusted-global','source','source@example.test','{}');
 INSERT INTO firm_contact_assignments(contact_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by)VALUES('contact','firm-a','source','explicit_assignment','synthetic','boss');
 INSERT INTO firm_list_assignments(list_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by)VALUES('list','firm-a','source','explicit_assignment','synthetic','boss');
 INSERT INTO firm_lead_assignments(lead_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by)VALUES('lead','firm-a','source','explicit_assignment','synthetic','boss');
 INSERT INTO firm_transfer_fences(firm_id,source_uid,target_uid,source_fenced,sessions_revoked,workers_fenced,target_active,target_email_verified,evidence_digest,reviewed_by,expires_at)
 VALUES('firm-a','source','target',true,true,true,true,true,repeat('a',64),'boss',now()+interval '1 hour');
 INSERT INTO firm_transfer_rights(firm_id,record_kind,record_id,source_uid,target_uid,decision,reference_digest,reviewed_by,expires_at)
 VALUES('firm-a','contact','contact','source','target','allowed',repeat('b',64),'boss',now()+interval '1 hour'),
 ('firm-a','list','list','source','target','allowed',repeat('b',64),'boss',now()+interval '1 hour'),
 ('firm-a','lead','lead','source','target','allowed',repeat('b',64),'boss',now()+interval '1 hour');`);
}
