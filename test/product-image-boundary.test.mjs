import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const docker=read('Dockerfile');
const normal=docker.split('FROM node:24-bookworm-slim AS runtime')[1].split('FROM runtime AS rollback-runtime')[0];
const rollback=docker.split('FROM runtime AS rollback-runtime')[1].split('FROM runtime AS runtime-proof')[0];
const runtimeProof=docker.split('FROM runtime AS runtime-proof')[1].split('FROM rollback-runtime AS rollback-proof')[0];
const rollbackProof=docker.split('FROM rollback-runtime AS rollback-proof')[1].split('FROM runtime AS production')[0];
const operational=['download-plan-data.py','prepare-plan-catalog.py','import-plan-catalog.mjs','refresh-plan-catalog.mjs','prepare-contact-benchmark.mjs','evaluate-contact-benchmark.mjs','release-config.mjs','release-rollback-policy.json','verify-candidate-readiness.mjs','verify-release.mjs'];
test('normal runtime carries exact existing operational scripts, not demo, CI or staging tools',()=>{
 const copied=[...normal.matchAll(/^COPY (.+) \.\/scripts\/$/gm)].flatMap(m=>m[1].split(' '));assert.deepEqual(copied.sort(),operational.map(s=>'scripts/'+s).sort());
 for(const path of copied)assert.ok(existsSync(new URL('../'+path,import.meta.url)),path);
 assert.doesNotMatch(normal,/^COPY scripts \.\/scripts$/m);
 for(const dir of ['daily-leads','lead-costs','pricing'])assert.ok(normal.includes(`COPY scripts/${dir} ./scripts/${dir}`));
 assert.doesNotMatch(normal.split('\n').filter(line=>line.startsWith('COPY ')).join('\n'),/demo|staging-|visual-ci|verify-readonly-image|verify-rollback-image|rollback-schema034\.json/);
 assert.match(docker,/FROM runtime AS production\s*$/);
 assert.deepEqual(JSON.parse(read('scripts/release-rollback-policy.json')).floors,[],'no release floor invented');
});
test('optional rollback manifest and proof children are separate without weakening runtime guards',()=>{
 assert.match(rollback,/COPY scripts\/rollback-schema034\.json \.\/scripts\//);
 assert.match(rollback,/COPY rollback-bootstrap\.mjs rollback-schema\.mjs rollback-server\.mjs rollback-worker\.mjs/);
 assert.match(runtimeProof,/COPY scripts\/verify-readonly-image\.mjs \.\/scripts\//);
 assert.match(rollbackProof,/COPY scripts\/verify-rollback-image\.mjs scripts\/verify-rollback-bootstrap-image\.mjs scripts\/rollback-bootstrap-network-guard\.mjs \.\/scripts\//);
 for(const part of [runtimeProof,rollbackProof])assert.doesNotMatch(part,/^(?:RUN|ENV|CMD|ENTRYPOINT|USER|WORKDIR|VOLUME) /m);
 const ci=read('.github/workflows/tests.yml');assert.match(ci,/verify-proof-image-boundary\.py "\$PARENT_ID" "\$IMAGE_ID" runtime/);assert.match(ci,/verify-proof-image-boundary\.py "\$PARENT_ID" "\$IMAGE_ID" rollback/);
 for(const file of ['verify-readonly-image','verify-rollback-image','verify-rollback-bootstrap-image'])assert.ok(ci.includes('scripts/'+file+'.mjs --synthetic-image'));
 for(const marker of ['verify-pinned033-upgrade.mjs','verify-pinned034-upgrade.mjs','initial034-rehearsal.mjs','Fail-fast native rollback compatibility'])assert.ok(ci.includes(marker));
});
