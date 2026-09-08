import test from 'node:test';import assert from 'node:assert/strict';
import {robotsAllowed as allowed} from '../robots-policy.mjs';
test('robots chooses our crawler group, combines duplicates and ignores unrelated agents',()=>{
 const rules='User-agent: OtherBot\nDisallow: /\nUser-agent: *\nDisallow: /fallback\nUser-agent: prospectpilotresearch\nUser-agent: PartnerBot\nDisallow: /private\nUser-agent: ProspectPilotResearch\nDisallow: /other';
 assert.equal(allowed(rules,'/team'),true);assert.equal(allowed(rules,'/private/team'),false);
 assert.equal(allowed(rules,'/other'),false);assert.equal(allowed(rules,'/fallback'),true);
 assert.equal(allowed('User-agent: OtherBot\nDisallow: /','/'),true);
});
test('longest matching rule wins and equal allow/disallow prefers allow in either order',()=>{
 for(const rules of ['Allow: /team\nDisallow: /team','Disallow: /team\nAllow: /team'])assert.equal(allowed('User-agent: *\n'+rules,'/team'),true);
 const rules='User-agent: *\nDisallow: /\nAllow: /team\nDisallow: /team/private';
 assert.equal(allowed(rules,'/team/public'),true);assert.equal(allowed(rules,'/team/private'),false);
});
test('wildcards, end anchors, query strings, comments and encoded paths are matched',()=>{
 const rules='\uFEFFUser-agent: *\nDisallow: /*?secret=*$ # private query\nDisallow: /résumé\nDisallow: /%70rivate\nDisallow: /exact$\nDisallow: /*.pdf$';
 assert.equal(allowed(rules,'/team?secret=yes'),false);assert.equal(allowed(rules,'/team?public=yes'),true);
 assert.equal(allowed(rules,'/r%C3%A9sum%C3%A9'),false);assert.equal(allowed(rules,'/private/a'),false);
 assert.equal(allowed(rules,'/exact'),false);assert.equal(allowed(rules,'/exact/more'),true);assert.equal(allowed(rules,'/exact/exact'),true);
 assert.equal(allowed(rules,'/docs/file.pdf'),false);assert.equal(allowed(rules,'/docs/file.pdf/html'),true);
 assert.equal(allowed('User-agent: *\nDisallow:','/'),true);
});
