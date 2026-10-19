// Read-only: assert the plugin's declared peers all resolve on THIS host.
// Catches host drift that a code-only test cannot see (0.2.1-rc.2 dropped
// @deepseek-ai/dsh-client-ui-slots as a standalone package).
const fs = require('fs');
const p = require('path');

const A = process.argv[2];
const PLUGIN = process.argv[4];
const NM = p.join(A, 'dsh', 'node_modules', '@deepseek-ai');
const lines = [];
const say = (s) => lines.push(s);

const SEED = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', 'zod', '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
]);

const pkg = JSON.parse(fs.readFileSync(p.join(PLUGIN, 'package.json'), 'utf8'));
const peers = Object.keys(pkg.peerDependencies || {});
const optional = new Set(Object.keys(pkg.peerDependenciesMeta || {}).filter((k) => pkg.peerDependenciesMeta[k].optional));

let failures = 0;
say('plugin: ' + pkg.name + '@' + pkg.version);
say('');
say('peer resolution against this host:');
for (const name of peers) {
  // A peer is satisfied by a real package OR by a platform seed word.
  const bare = name.replace('@deepseek-ai/', '');
  const asPackage = name.startsWith('@deepseek-ai/') ? p.join(NM, bare, 'package.json') : null;
  const onDisk = asPackage !== null && fs.existsSync(asPackage);
  const isSeed = SEED.has(name);
  const ok = onDisk || isSeed;
  const how = onDisk ? 'package ' + JSON.parse(fs.readFileSync(asPackage, 'utf8')).version : isSeed ? 'platform seed' : 'MISSING';
  const tag = ok ? 'ok' : (optional.has(name) ? 'missing (optional)' : 'MISSING (required)');
  if (!ok && !optional.has(name)) failures++;
  say('  ' + name.padEnd(42) + tag.padEnd(22) + ' <- ' + how);
}

say('');
say('runtime require() calls in lib/client.js:');
const client = fs.readFileSync(p.join(PLUGIN, 'lib', 'client.js'), 'utf8');
for (const m of client.matchAll(/require\("([^"]+)"\)/g)) {
  const spec = m[1];
  const ok = SEED.has(spec);
  say('  ' + spec.padEnd(42) + (ok ? 'seed ok' : 'NOT A SEED'));
  if (!ok) failures++;
}

say('');
say(failures === 0 ? 'RESULT: PASS - every declared peer and every runtime require is satisfiable on this host' : 'RESULT: ' + failures + ' PROBLEM(S)');
fs.writeFileSync(process.argv[3], lines.join('\n'), 'utf8');
process.exit(failures === 0 ? 0 : 2);
