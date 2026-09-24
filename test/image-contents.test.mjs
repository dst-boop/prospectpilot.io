// Every module the server imports has to reach the image.
//
// The Dockerfile names its runtime files one by one and .dockerignore excludes
// everything not explicitly allowed. Both are correct and neither is checked by
// anything, so adding a module and forgetting either one produces a green local
// run and an image that throws ERR_MODULE_NOT_FOUND on the first request. This
// walks the import graph from the entry point and asserts each file it reaches
// is in both lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
// This suite also runs inside the image build, where the context may not carry
// .dockerignore — it is the build client's file, not part of what is sent. The
// Dockerfile half still runs there; the allowlist half is checked on the runner,
// which is where a contributor's mistake is caught either way.
const readOptional = name => { try { return read(name); } catch { return null; } };
const IMPORT = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"](\.\/[^'"]+)['"]|(?:^|[^\w.])import\(\s*['"](\.\/[^'"]+)['"]/g;

/** Local modules reachable from the entry point, by relative path. */
function graph(entry) {
  const seen = new Set(), queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let source;
    try { source = read(file); } catch { continue; }
    for (const m of source.matchAll(IMPORT)) {
      const target = (m[1] || m[2]).replace(/^\.\//, '');
      if (target.endsWith('.mjs') || target.endsWith('.js')) queue.push(target);
    }
  }
  return seen;
}

// Same last-match-wins evaluation Docker applies to .dockerignore.
function dockerignored(path, text) {
  const pattern = p => new RegExp('^' + p.split('**').map(part =>
    part.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');
  let excluded = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negated = line.startsWith('!');
    const rx = pattern(negated ? line.slice(1) : line);
    // A directory rule covers what is under it.
    if (rx.test(path) || path.split('/').slice(0, -1).some((_, i) => rx.test(path.split('/').slice(0, i + 1).join('/'))))
      excluded = !negated;
  }
  return excluded;
}

test('every module the server imports is copied into the image and not ignored', t => {
  const dockerfile = read('Dockerfile'), ignore = readOptional('.dockerignore');
  if (!ignore) t.diagnostic('.dockerignore is not in this build context; checking the Dockerfile only.');
  // Directories the Dockerfile copies wholesale.
  const bulk = [...dockerfile.matchAll(/^COPY (?:--from=build \/app\/)?([\w-]+) \.\/\1$/gm)].map(m => m[1] + '/')
    .concat([...dockerfile.matchAll(/^COPY ([\w-]+) \.\/\1$/gm)].map(m => m[1] + '/'));
  const copied = new Set([...dockerfile.matchAll(/^COPY (?!--from)(.+) \.\/$/gm)]
    .flatMap(m => m[1].trim().split(/\s+/)));

  const missing = {fromDockerfile: [], fromContext: []};
  for (const file of graph('server.mjs')) {
    if (bulk.some(dir => file.startsWith(dir))) continue;
    if (!copied.has(file)) missing.fromDockerfile.push(file);
    if (ignore && dockerignored(file, ignore)) missing.fromContext.push(file);
  }
  assert.deepEqual(missing.fromDockerfile, [],
    'these are imported at runtime but never COPYed into the runtime stage');
  assert.deepEqual(missing.fromContext, [],
    'these are excluded by .dockerignore, so the build stage cannot see them either');
});

test('the check would notice a module that is missing from either list', () => {
  // Proves the assertion above can fail: without this, a broken matcher would
  // pass silently and the guard would be decorative.
  assert.equal(dockerignored('nowhere.mjs', '*\n!server.mjs'), true);
  assert.equal(dockerignored('server.mjs', '*\n!server.mjs'), false);
  assert.equal(dockerignored('migrations/014-outreach-cadence.sql', '*\n!migrations/\n!migrations/**'), false);
  assert.ok(graph('server.mjs').has('outreach-cadence.mjs'),
    'the cadence module is reachable from the entry point, so it is in scope for this check');
});
