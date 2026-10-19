// Read-only: prove the plugin is actually composable for the host version you
// are running, by walking the same gate the host itself uses.
//
// dsh-client-modules resolveMeta() accepts a client plugin only when
// dsh.client.platform === "web" AND exports["./client"] is a string; it then
// resolves that path next to the package.json it read. A junction in the
// profile's node_modules means the package.json it reads is this checkout, so
// reading it the same way is a faithful test rather than an approximation.
//
// Needs DSH_ASAR and DSH_PROFILE_DIR - see tools/dsh-env.cjs.
const fs = require('fs');
const p = require('path');
const env = require('./dsh-env.cjs');

const A = env.asar();
const profile = env.profileDir();
const NM = p.join(A, 'dsh', 'node_modules', '@deepseek-ai');

const lines = [];
const say = (s) => lines.push(s);
let failures = 0;

say('== plugin as the host resolves it ==');
const pluginPkg = p.join(profile, 'node_modules', 'dsh-conversation-width', 'package.json');
let gateOk = false;
try {
  const j = JSON.parse(fs.readFileSync(pluginPkg, 'utf8'));
  const root = p.dirname(pluginPkg);
  say('   found through the profile junction : yes');
  say('   name/version                      : ' + j.name + '@' + j.version);
  say('   dsh.client                        : ' + JSON.stringify(j.dsh && j.dsh.client));

  const clientRel = j.exports && j.exports['./client'];
  say('   exports["./client"]               : ' + JSON.stringify(clientRel));
  const clientPath = typeof clientRel === 'string' ? p.join(root, clientRel) : null;
  const clientOk = clientPath !== null && fs.existsSync(clientPath);
  say('   client bundle exists              : ' + clientOk + (clientOk ? ' (' + fs.statSync(clientPath).size + ' bytes)' : ''));

  const patchRel = j.dsh && j.dsh.bundle && j.dsh.bundle.patch;
  const patchPath = typeof patchRel === 'string' ? p.join(patchRel.startsWith('/') ? patchRel : root, patchRel) : null;
  const patchOk = patchPath !== null && fs.existsSync(patchPath);
  say('   bundle patch exists               : ' + patchOk + (patchOk ? ' (' + fs.statSync(patchPath).size + ' bytes)' : ''));

  gateOk = Boolean(j.dsh && j.dsh.client && j.dsh.client.platform === 'web' && typeof clientRel === 'string' && clientOk);
  say('   resolveMeta gate                  : ' + (gateOk ? 'PASS' : 'FAIL'));
  if (!gateOk) failures++;
} catch (e) {
  say('   ERROR reading plugin package: ' + e.message);
  failures++;
}

say('');
say('== host integration points ==');
const checks = [
  ['dsh-client-modules', 'lib/index.js', 'clientExportOf', 'dsh.client + exports["./client"] must resolve'],
  ['dsh-client-ui-settings-general', 'lib/client.js', 'renderSlot("settings.general.item"', 'the slot the row registers into'],
  ['dsh-client-locale', 'lib/client.js', 'register(ns, localeOrDicts, dict)', 'locale.register(ns, {zh,en})'],
  ['dsh-client-ui-conversation', 'lib/client.js', 'dsh.conversation.contentWidth', 'the width preference key'],
  ['dsh-client-ui-conversation', 'lib/client.js', '--dsh-chat-user-width', 'the variable the row drives'],
];
for (const [pkg, file, needle, why] of checks) {
  const f = p.join(NM, pkg, file);
  let ok = false;
  try { ok = fs.readFileSync(f, 'utf8').includes(needle); } catch {}
  if (!ok) failures++;
  say('   ' + (ok ? 'ok  ' : 'MISS') + '  ' + why);
  if (!ok) say('         (expected ' + JSON.stringify(needle) + ' in ' + pkg + '/' + file + ')');
}

say('');
say('== host version ==');
try {
  say('   @deepseek-ai/dsh ' + JSON.parse(fs.readFileSync(p.join(NM, 'dsh', 'package.json'), 'utf8')).version);
} catch {
  say('   (could not read the host version)');
}

say('');
say(failures === 0 ? 'RESULT: PASS - this host would compose the plugin' : 'RESULT: ' + failures + ' PROBLEM(S)');
console.log(lines.join('\n'));
process.exit(failures === 0 ? 0 : 2);
