import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import pg from 'pg';
import {importPlanRecords} from '../plan-catalog.mjs';
const file = process.argv[2];
if (!file) throw Error('Usage: node scripts/import-plan-catalog.mjs plan-catalog.jsonl');
const pool = new pg.Pool({max:1,connectionTimeoutMillis:10000});
async function* records() {
  for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity}))if(line.trim())yield JSON.parse(line);
}
let client;
try {
  client=await pool.connect();
  console.log(JSON.stringify(await importPlanRecords(client,records())));
} finally {client?.release();await pool.end();}
