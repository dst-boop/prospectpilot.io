import test from 'node:test';
import assert from 'node:assert/strict';
import {loginDestination} from '../login-destination.mjs';
test('sign-in retains only supported workspace destinations and a valid lead reference',()=>{
 assert.equal(loginDestination('/prospect'),'/prospect');
 assert.equal(loginDestination('/warn?unknown=discard'),'/warn');
 assert.equal(loginDestination('/lab?lead=abc-123&token=discard#private'),'/lab?lead=abc-123');
 assert.equal(loginDestination('/lab?lead='+('a'.repeat(101))),'/lab');
});
test('sign-in rejects external, executable, ambiguous and administrative destinations',()=>{
 for(const value of [undefined,'','https://evil.example','//evil.example','/\\evil.example','javascript:alert(1)','/logout','/api/me','/research','/lab\n','/%2f%2fevil.example','/lab?lead=%3Cscript%3E'])assert.equal(loginDestination(value),'/lab',String(value));
});
