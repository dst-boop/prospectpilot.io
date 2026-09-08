import test from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../handler.mjs';
test('research lab pages and APIs require approved sessions; mutations require same origin',async()=>{
  let calls=0;const claims={uid:'u',email:'owner@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
  const handler=createHandler({auth:{verifySessionCookie:async()=>claims},ownerEmail:claims.email,origins:['https://prospectpilot.io'],lab:{route:async()=>{calls++;return {ok:true};}},labPage:'<h1>Research lab</h1>',labScript:'// script',labStyle:'body{}',worker:{fetch:async()=>new Response('original')}});
  const req=(path,headers={},method='GET')=>new Request('https://prospectpilot.io'+path,{headers,method});
  assert.equal((await handler(req('/lab'))).status,303);assert.equal((await handler(req('/api/lab/summary'))).status,401);
  const page=await handler(req('/lab',{cookie:'__session=valid'}));assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await handler(req('/api/lab/runs',{cookie:'__session=valid',origin:'https://evil.example'},'POST'))).status,403);assert.equal(calls,0);
  assert.equal((await handler(req('/api/lab/runs',{cookie:'__session=valid',origin:'https://prospectpilot.io'},'POST'))).status,200);assert.equal(calls,1);
});
