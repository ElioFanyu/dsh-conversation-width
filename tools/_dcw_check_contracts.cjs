// Read-only: assert the exact host contracts this plugin depends on still hold
// on the DSH you are running, and that the row order stays collision-free.
//
// _dcw_livegraph.cjs proves the plugin is compOSABLE; this one proves the
// contracts still MEAN the same thing. When a host release moves the width axis
// (a new preference key, a different clamp, a renamed variable) those edits cost
// nothing to make and are invisible until someone drags a window, so check them
// deliberately.
//
// Needs DSH_ASAR - see tools/dsh-env.cjs. DSH_PROFILE_DIR is optional and only
// adds the installed-plugin scan for `settings.general.item` order collisions.
const fs = require('node:fs');
const p = require('node:path');
const env = require('./dsh-env.cjs');

const A = env.asar();
const NM = p.join(A, 'dsh', 'node_modules', '@deepseek-ai');

const lines = [];
const say = (s) => lines.push(s);
let failures = 0;
const fail = (s) => { failures++; say('   FAIL  ' + s); };
const ok = (s) => say('   ok    ' + s);

function read(pkg, file) {
  try { return fs.readFileSync(p.join(NM, pkg, file), 'utf8'); } catch { return null; }
}

say('== the seven host contracts ==');
const CONTRACTS = [
  ['dsh-client-modules', 'lib/index.js', 'decl.platform !== "web"',
    'client-plugin gate is still dsh.client.platform === "web"'],
  ['dsh-client-modules', 'lib/index.js', 'exportsField["./client"]',
    'exports["./client"] is still the bundle entry'],
  ['dsh-client-ui-settings-general', 'lib/client.js', 'renderSlot("settings.general.item"',
    'the General section still renders settings.general.item'],
  ['dsh-client-ui-settings-general', 'lib/client.js', 'kind: "list"',
    'settings.general.item is still a list slot (order sorts it)'],
  ['dsh-client-locale', 'lib/client.js', 'register(ns, localeOrDicts, dict)',
    'locale.register(ns, {zh,en}) is still the dictionary API'],
  ['dsh-client-ui-conversation', 'lib/client.js', 'dsh.conversation.contentWidth',
    'the width preference key is unchanged'],
  ['dsh-client-ui-conversation', 'lib/client.js', '--dsh-chat-user-width',
    'the published width variable is unchanged'],
];
for (const [pkg, file, needle, why] of CONTRACTS) {
  const text = read(pkg, file);
  if (text === null) fail(`cannot read ${pkg}/${file}`);
  else if (!text.includes(needle)) fail(`${why}  (missing ${JSON.stringify(needle)})`);
  else ok(why);
}

say('');
say('== the clamp the row mirrors ==');
const conv = read('dsh-client-ui-conversation', 'lib/client.js') || '';
const num = (re) => { const m = conv.match(re); return m === null ? null : Number(m[1]); };
const CONTENT_MIN = num(/const CONTENT_MIN = (\d+)/);
const EDGE = num(/const CONTENT_EDGE_BUDGET = (\d+)/);
const FALLBACK_MAX = num(/Math\.min\(columnWidth \* \.64, (\d+)\)/);
for (const [name, value, expected] of [
  ['CONTENT_MIN', CONTENT_MIN, 640],
  ['CONTENT_EDGE_BUDGET', EDGE, 176],
  ['fallback cap', FALLBACK_MAX, 920],
]) {
  if (value === null) fail(`${name} not found in ui-conversation`);
  else if (value !== expected) fail(`${name} is ${value}, the plugin offers controls for ${expected}`);
  else ok(`${name} = ${value}`);
}

say('');
say('== the row order has no built-in neighbour on 18 ==');
const ORDER = 18;
const hits = [];
for (const entry of fs.readdirSync(NM, { withFileTypes: true })) {
  if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
  const f = p.join(NM, entry.name, 'lib', 'client.js');
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const re = /name:\s*"settings\.general\.item"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const win = text.slice(m.index, m.index + 700);
    const id = win.match(/id:\s*"([^"]*)"/)?.[1];
    const order = Number(win.match(/order:\s*(-?[\d.]+)/)?.[1] ?? 0);
    if (id !== undefined) hits.push({ id, order, pkg: entry.name });
  }
}
hits.sort((a, b) => a.order - b.order);
say('   ' + hits.map((h) => `${h.order} ${h.id}`).join(' | '));
const collided = hits.filter((h) => h.order === ORDER);
for (const c of collided) fail(`built-in row "${c.id}" also uses order ${ORDER} (${c.pkg})`);
if (collided.length === 0) ok(`no built-in registration uses order ${ORDER}`);

say('');
if (process.env.DSH_PROFILE_DIR) {
  say('== installed plugins do not claim 18 either ==');
  const profileNM = p.join(env.profileDir(), 'node_modules');
  const seen = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = p.join(dir, e.name);
      let isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) { try { isDir = fs.statSync(full).isDirectory(); } catch { isDir = false; } }
      if (isDir) {
        if (e.name === '.bin' || e.name === '.pnpm' || e.name === '.git' || e.name === '.scratch') continue;
        walk(full, depth + 1);
        continue;
      }
      if (p.basename(p.dirname(full)) !== 'lib' || e.name !== 'client.js') continue;
      let text;
      try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
      if (!text.includes('name: "settings.general.item"')) continue;
      if (full.includes('dsh-conversation-width')) continue;
      for (const m of text.matchAll(/order:\s*(-?[\d.]+)/g)) {
        if (Number(m[1]) === ORDER) seen.push(full.replace(profileNM, '<profile>'));
      }
    }
  };
  walk(profileNM, 0);
  for (const s of seen) fail(`another installed plugin registers order ${ORDER}: ${s}`);
  if (seen.length === 0) ok(`no installed third-party plugin uses order ${ORDER}`);
  say('');
}

say(failures === 0 ? 'RESULT: PASS - every contract still holds on this host' : 'RESULT: ' + failures + ' PROBLEM(S)');
console.log(lines.join('\n'));
process.exit(failures === 0 ? 0 : 2);
