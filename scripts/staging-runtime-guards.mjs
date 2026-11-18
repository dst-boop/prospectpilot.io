import {createHttpHandler} from '../http-server.mjs';
export async function assertStagingDatabase(pool,config){
 const marker=(await pool.query('SELECT project_id,owner_uid,expires_at FROM staging_pilot_identity WHERE singleton=true')).rows[0];
 if(!marker||marker.project_id!==config.project||marker.owner_uid!==config.uid||new Date(marker.expires_at).getTime()!==config.expires)throw Error('Isolated staging database marker mismatch');
}
export function createStagingHttpHandler(handler,config){
 const http=createHttpHandler(handler,{maxInflight:8,maxBodyBytes:100000,bodyTooLargeMessage:'Fictional staging requests are limited to 100 KB (100,000 bytes including encoding). Use the supplied unchanged fictional-staging.csv; this rejected request did not save contacts.'});
 return (req,res)=>{if(req.headers.host!==new URL(config.origin).host||req.headers['x-forwarded-host']&&req.headers['x-forwarded-host']!==req.headers.host){res.writeHead(403);res.end('Staging host rejected');return;}return http(req,res);};
}
