// Read-only: assert the exact host contracts this plugin depends on still hold
// on the DSH you are running, and that the row order stays collision-free.
//
// _dcw_livegraph.cjs proves the plugin is compOSABLE; this one proves the
// contracts still MEAN the same thing. When a host release moves the width axis
// (a new preference key, a different clamp, a renamed variable) those edits cost
// nothing to make and are invisible until someone drags a window, so check them
// deliberately.
//
// Matching rules learned the hard way on 0.2.2-rc.2, whose bundles ship with
// backtick string literals and no space around `=`:
//   * every literal below is matched quote-agnostically and whitespace-tolerantly,
//     so a minifier changing " to ` or dropping spaces is not a false failure;
//   * a host bundle's own `example:` / `doc:` strings contain registration
//     snippets, so text found inside one is never counted as a real registration.
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

/** A literal without its quote character, which hosts emit as " or ` or '. */
const Q = `['"\`]`;

/**
 * True when `index` sits inside a real slot *registration snippet* that the host
 * ships as documentation rather than as code.
 *
 * Two shapes exist in these bundles and they need different rules:
 *   * the registry (`dsh-cordis-client-runner`) carries one `example:` template
 *     literal per slot holding a whole `ctx.slots.register({...})` snippet, so a
 *     naive search finds fake rows such as id "my-entry";
 *   * ordinary CSS lives in `css$N = "..."` literals that follow prose
 *     properties like `summary:` and must never be treated as documentation.
 *
 * So the test is deliberately narrow: the offset is documentation only when the
 * nearest preceding doc marker is `example:` (the registry's snippet key) and its
 * template literal is still open. Everything else is treated as code.
 *
 * @param text full file source.
 * @param index offset of the match being judged.
 * @returns whether the match lives in a documentation example.
 */
function insideDocString(text, index) {
  const before = text.slice(0, index);
  const marker = before.lastIndexOf("example:");
  if (marker === -1) return false;
  const afterMarker = before.slice(marker);
  // An unterminated template literal means the example never closed: we are in it.
  return (afterMarker.match(/`/g) || []).length % 2 === 1;
}

/**
 * Assert one regex matches the file in executable (non-doc) position.
 * @param label what the contract is, in English.
 * @param text file source, or null.
 * @param re pattern to find.
 */
function assertMatch(label, text) {
  return (re) => {
    if (text === null) return fail(`cannot read ${label}`);
    let m;
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    while ((m = rx.exec(text)) !== null) {
      if (!insideDocString(text, m.index)) return ok(`${label} -> ${m[0].replace(/\s+/g, ' ').slice(0, 70)}`);
    }
    return fail(`${label}  (no match for ${re})`);
  };
}

say('== the seven host contracts ==');
const modulesIdx = read('dsh-client-modules', 'lib/index.js');
const generalClient = read('dsh-client-ui-settings-general', 'lib/client.js');
const localeClient = read('dsh-client-locale', 'lib/client.js');
const convClient = read('dsh-client-ui-conversation', 'lib/client.js');

assertMatch('client-plugin gate is dsh.client.platform === "web"', modulesIdx)(
  new RegExp(`\\.platform\\s*!==\\s*${Q}web${Q}`));
assertMatch('exports["./client"] is the bundle entry', modulesIdx)(
  new RegExp(`exportsField\\[\\s*${Q}\\.\\/client${Q}\\s*\\]`));
assertMatch('General section renders settings.general.item', generalClient)(
  new RegExp(`renderSlot\\(\\s*${Q}settings\\.general\\.item${Q}`));
assertMatch('settings.general.item is a list slot', generalClient)(
  new RegExp(`${Q}settings\\.general\\.item${Q}\\s*:\\s*\\{\\s*kind\\s*:\\s*${Q}list${Q}`));
assertMatch('locale.register(ns, dicts) is the dictionary API', localeClient)(
  /register\(\s*ns\s*,\s*localeOrDicts\b/);
assertMatch('the width preference key is unchanged', convClient)(
  new RegExp(`WIDTH_PREF_KEY\\s*=\\s*${Q}dsh\\.conversation\\.contentWidth${Q}`));
assertMatch('the published width variable is unchanged', convClient)(
  new RegExp(`${Q}--dsh-chat-user-width${Q}|--dsh-chat-user-width`));
assertMatch('the width axis clamps through the user variable', convClient)(
  new RegExp(`--dsh-chat-content-width\\s*:\\s*var\\(\\s*--dsh-chat-user-width`));

/*
 * The two page axes target host chrome rather than a slot, so each one needs an
 * anchor that is semantic (declared for behaviour, not styling) and therefore
 * survives a re-minified bundle whose class names are content hashes. If an
 * anchor ever disappears, the axis silently stops applying - which is invisible
 * in the browser - so assert all three here.
 */
say('');
say('== the page-width anchors ==');
assertMatch('the Settings dialog is marked data-shortcut-modal=settings', generalClient)(
  /* The bundle writes the key as \"data-shortcut-modal\":`settings` (the inner
   * quotes are escaped because it sits in a template literal), so match the
   * attribute name and value tolerantly of both quoting and escaping. */
  new RegExp(`data-shortcut-modal[\\\\"'\`]*\\s*:\\s*[\\\\"'\`]+settings`));
assertMatch('the Settings dialog still defaults to width:800px', generalClient)(
  /width\s*:\s*800px/);
assertMatch('the dialog keeps its viewport max-width safety net', generalClient)(
  new RegExp(`max-width\\s*:\\s*calc\\(\\s*100vw\\s*-\\s*48px\\s*\\)`));

say('');
/*
 * Page presentation depends on the Settings overlay being exactly two children:
 * the mask first, the panel last. `>:first-child` / `>:last-child` are how the
 * mask is hidden and the panel stretched, so if the host inserts another child
 * the presentation would silently target the wrong element.
 */
assertMatch('the Settings overlay still renders a mask before the panel', generalClient)(
  /* The overlay's mask: className bound to the `mask` class and marked aria-hidden.
   * These two are what make `>:first-child` the mask and `>:last-child` the panel,
   * so page presentation targets the right element. */
  new RegExp(`SettingsRoot_module_css_default\\.mask,\\s*${Q}aria-hidden${Q}`));
assertMatch('the Settings panel is still the dialog element', generalClient)(
  /* The host writes the key unquoted (`role:`dialog``), so accept both forms. */
  new RegExp(`(?:^|[,{])\\s*${Q}?role${Q}?\\s*:\\s*${Q}dialog${Q}`));

/*
 * Page presentation budgets for the window chrome with the host's own variable.
 * If it is renamed, the page header slides under the title bar and the panel's
 * buttons stop being clickable - a failure that only shows up visually.
 */
assertMatch('the frame top-clearance variable exists', read('dsh-client-ui-layout', 'lib/client.js'))(
  new RegExp(`--dsh-frame-top-clearance`));
assertMatch('the clearance stays fixed in fullscreen (not lowered like overlay-top)',
  read('dsh-client-ui-layout', 'lib/client.js'))(
  new RegExp(`--dsh-frame-top-clearance\\s*:\\s*48px`));

say('== the clamp the row mirrors ==');
const conv = convClient || '';
const num = (re) => { const m = conv.match(re); return m === null ? null : Number(m[1]); };
const CONTENT_MIN = num(/\bCONTENT_MIN\s*=\s*(\d+)/);
const EDGE = num(/\bCONTENT_EDGE_BUDGET\s*=\s*(\d+)/);
const FALLBACK_MAX = num(/Math\.min\(\s*columnWidth\s*\*\s*\.64\s*,\s*(\d+)\s*\)/);
for (const [name, value, expected] of [
  ['CONTENT_MIN', CONTENT_MIN, 640],
  ['CONTENT_EDGE_BUDGET', EDGE, 176],
  ['fallback cap', FALLBACK_MAX, 920],
]) {
  if (value === null) fail(`${name} not found in ui-conversation`);
  else if (value !== expected) fail(`${name} is ${value}, the plugin offers controls for ${expected}`);
  else ok(`${name} = ${value}`);
}

/**
 * Collect real `settings.general.item` registrations from one source file:
 * an options object that carries both `name: <slot>` and an `id`, outside doc
 * strings. Doc examples always reuse the placeholder id "my-entry", and a real
 * registration always has an id, so requiring both is what separates them.
 * @param text source of a client bundle.
 * @param source label recorded on each hit.
 * @returns registration records.
 */
function rowsIn(text, source) {
  const found = [];
  const re = new RegExp(`name\\s*:\\s*${Q}settings\\.general\\.item${Q}`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    if (insideDocString(text, m.index)) continue;
    const win = text.slice(m.index, m.index + 700);
    const id = win.match(new RegExp(`\\bid\\s*:\\s*${Q}([^${'`"\''}]+)${Q}`))?.[1];
    if (id === undefined) continue;
    const orderRaw = win.match(/\border\s*:\s*(-?[\d.]+)/)?.[1];
    found.push({ id, order: orderRaw === undefined ? null : Number(orderRaw), source });
  }
  return found;
}

say('');
say('== the row order has no built-in neighbour on 18 ==');
const ORDER = 18;
const builtin = [];
for (const entry of fs.readdirSync(NM, { withFileTypes: true })) {
  if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
  let text;
  try { text = fs.readFileSync(p.join(NM, entry.name, 'lib', 'client.js'), 'utf8'); } catch { continue; }
  if (!text.includes('settings.general.item')) continue;
  builtin.push(...rowsIn(text, entry.name));
}
if (builtin.length === 0) {
  fail('found no built-in settings.general.item registration at all - the scan itself is broken');
} else {
  builtin.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  say('   ' + builtin.map((h) => `${h.order} ${h.id}`).join(' | '));
  /* Every order this plugin claims, so a new host row cannot silently land on one. */
  const CLAIMED_ORDERS = [18, 19, 19.5];
  const collided = builtin.filter((h) => CLAIMED_ORDERS.includes(h.order));
  for (const c of collided) fail(`built-in row "${c.id}" also uses order ${c.order} (${c.source})`);
  if (collided.length === 0) ok(`no built-in registration uses ${CLAIMED_ORDERS.join(', ')}`);
}

say('');
if (process.env.DSH_PROFILE_DIR) {
  say('== installed plugins do not claim 18 either ==');
  const profileNM = p.join(env.profileDir(), 'node_modules');
  const seen = [];
  const scanned = { files: 0 };
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
      if (!text.includes('settings.general.item')) continue;
      scanned.files++;
      if (full.includes(`${p.sep}dsh-conversation-width${p.sep}`)) continue;
      for (const row of rowsIn(text, full.replace(profileNM, '<profile>'))) {
        if (row.order === ORDER) seen.push(row.source);
      }
    }
  };
  walk(profileNM, 0);
  for (const s of seen) fail(`another installed plugin registers order ${ORDER}: ${s}`);
  if (seen.length === 0) ok(`no installed third-party plugin uses order ${ORDER} (${scanned.files} bundle(s) inspected)`);
  say('');
}

say(failures === 0 ? 'RESULT: PASS - every contract still holds on this host' : 'RESULT: ' + failures + ' PROBLEM(S)');
console.log(lines.join('\n'));
process.exit(failures === 0 ? 0 : 2);
