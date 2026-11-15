import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPublicPage} from '../generated/worker.mjs';

test('redirect hops share one page timeout and use bounded public transport',async()=>{
 const signals=[];let calls=0;
 const get=async(url,options)=>{signals.push(options.signal);assert.equal(options.followRedirects,false);assert.equal(options.maxBytes,1000000);calls++;return calls===1?{redirect:'https://example.com/team'}:{text:'<h1>Team</h1>',type:'text/html'};};
 assert.deepEqual(await fetchPublicPage('https://example.com',10000,get),{url:'https://example.com/team',html:'<h1>Team</h1>'});
 assert.equal(signals[0],signals[1]);
 calls=0;
 await assert.rejects(fetchPublicPage('https://example.com',10000,async()=>{calls++;return {redirect:'http://metadata.google.internal/'};}),/unsafe/);
 assert.equal(calls,1);
});
