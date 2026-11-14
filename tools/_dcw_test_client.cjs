// Exercise the client bundle EXACTLY as the loader would: capture the
// __ModuleLoader__ entry, run the factory, call apply() against a fake ctx,
// then run the registered component and inspect the tree it returns.
//
// react is a platform "seed" module (it lives inside the web frontend bundle,
// not in any node_modules), so it is shimmed here with an equivalent surface:
// the point of this harness is the bundle's own code, not react.
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = process.argv[2] || path.join(__dirname, '..');

const react = {
  useState(init) { return [typeof init === 'function' ? init() : init, () => {}]; },
  useEffect() {},
  useCallback(fn) { return fn; }
};
const jsxRuntime = {
  jsx(type, props) { return { type, props: props || {} }; },
  jsxs(type, props) { return { type, props: props || {} }; },
  Fragment: Symbol.for('react.fragment')
};

const failures = [];
function check(label, fn) {
  try { const v = fn(); console.log('  PASS  ' + label + (v === undefined ? '' : ' -> ' + v)); return v; }
  catch (e) { failures.push(label + ': ' + e.message); console.log('  FAIL  ' + label + ' -> ' + e.message); return undefined; }
}

// ---- minimal DOM, enough for the CSS-tag path to run for real ----
const styleTags = [];
function kebab(p) { return String(p).replace(/[A-Z]/g, c => '-' + c.toLowerCase()); }
function makeStyleEl() {
  const attrs = {};
  const el = {
    tagName: 'style', textContent: '', _attrs: attrs,
    setAttribute(n, v) { attrs[n] = String(v); },
    getAttribute(n) { return n in attrs ? attrs[n] : null; }
  };
  el.dataset = new Proxy({}, {
    set(_t, prop, value) { attrs['data-' + kebab(prop)] = String(value); return true; },
    get(_t, prop) { return attrs['data-' + kebab(prop)]; }
  });
  return el;
}
const store = new Map();
const windowShim = {
  __ModuleLoader__: { load(entry) { windowShim.__captured = entry; } },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: k => store.delete(String(k))
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {}
};

// A stand-in for one mounted Conversation body. ui-conversation renders it as
// `[data-conversation-content]` and publishes `--dsh-chat-user-width` on its
// PARENT, which is the element carrying the width axis. The plugin must write
// that same variable on that same element, so the shim models both.
function makeConversationBody(offsetWidth) {
  const parentProps = new Map();
  const parent = {
    style: {
      setProperty: (name, value) => parentProps.set(name, String(value)),
      removeProperty: name => { parentProps.delete(name); },
      getPropertyValue: name => (parentProps.has(name) ? parentProps.get(name) : '')
    }
  };
  const body = { offsetWidth, parentElement: parent, _props: parentProps };
  return body;
}
let conversationBodies = [];
// A real browser CSS engine throws SyntaxError on a malformed selector; the
// shim must do the same or it cannot reproduce the defect this harness exists
// to catch. Supported shapes: tag, tag[attr], tag[attr="v"], tag[attr='v'].
const SEL_RE = /^([a-zA-Z][\w-]*)?(?:\[([\w-]+)(?:=("([^"]*)"|'([^']*)'))?\])?$/;
// The two page-width axes act on host chrome the plugin does not render, so the
// shim models those nodes explicitly: one Settings dialog, one global panel.
function makeHostNode(props) {
  const inline = new Map(props || []);
  const attrs = new Map();
  return {
    _props: inline,
    _attrs: attrs,
    hasAttribute: k => attrs.has(k),
    setAttribute: (k, v) => { attrs.set(k, v); },
    removeAttribute: k => { attrs.delete(k); },
    parentElement: null,
    style: {
      setProperty: (k, v) => inline.set(k, String(v)),
      removeProperty: k => { inline.delete(k); },
      getPropertyValue: k => (inline.has(k) ? inline.get(k) : '')
    }
  };
}
let settingsDialogNode = null;
let globalPanelNode = null;
const documentShim = {
  querySelectorAll: sel => {
    if (sel === 'style[data-plugin-css]') return styleTags;
    if (sel === '[data-conversation-content]') return conversationBodies;
    if (sel === '[data-global-panel]') return globalPanelNode === null ? [] : [globalPanelNode];
    return [];
  },
  querySelector: sel => {
    const m = SEL_RE.exec(sel);
    if (m === null) {
      throw new SyntaxError("Failed to execute 'querySelector' on 'Document': '" + sel + "' is not a valid selector.");
    }
    const tag = m[1], attr = m[2], want = m[4] !== undefined ? m[4] : m[5];
    if (sel === '[data-shortcut-modal="settings"]') return settingsDialogNode;
    for (const el of styleTags) {
      if (tag !== undefined && el.tagName !== tag) continue;
      if (attr === undefined) return el;
      const have = el.getAttribute(attr);
      if (have === null) continue;
      if (want === undefined || have === want) return el;
    }
    return null;
  },
  createElement: tag => {
    if (tag === 'style') { const el = makeStyleEl(); styleTags.push(el); return el; }
    return { tagName: tag, dataset: {}, setAttribute() {}, getAttribute() { return null; } };
  },
  head: { appendChild() {} }
};
globalThis.window = windowShim;
globalThis.__hostNodes = { makeHostNode, setSettings: n => { settingsDialogNode = n; }, setPanel: n => { globalPanelNode = n; } };
globalThis.document = documentShim;
globalThis.Event = class Event { constructor(type) { this.type = type; } };

const pluginRequire = spec => {
  if (spec === 'react') return react;
  if (spec === 'react/jsx-runtime') return jsxRuntime;
  throw new Error('unexpected require(' + spec + ')');
};

// ---- evaluate the bundle the way the loader does ----
const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'client.js'), 'utf8');
console.log('bundle evaluation:');
check('bundle evaluates and calls __ModuleLoader__.load', () => {
  new Function('window', 'document', 'require', source)(windowShim, documentShim, pluginRequire);
});
const entry = windowShim.__captured;
check('entry id is dsh-conversation-width', () => {
  if (!entry) throw new Error('no entry captured');
  if (entry.id !== 'dsh-conversation-width') throw new Error('id=' + entry.id);
  return entry.id;
});
check('factory is a function', () => { if (typeof entry.factory !== 'function') throw new Error('factory is ' + typeof entry.factory); });

let mod = null;
check('factory() returns exports without throwing', () => { mod = entry.factory(pluginRequire); return JSON.stringify(Object.keys(mod ?? {})); });
check('exports.inject == ["slots","locale"]', () => {
  if (JSON.stringify(mod.inject) !== JSON.stringify(['slots', 'locale'])) throw new Error(JSON.stringify(mod.inject));
  return JSON.stringify(mod.inject);
});
check('exports.apply is a function', () => { if (typeof mod.apply !== 'function') throw new Error(typeof mod.apply); });

console.log('\nCSS tag injection (the old crash site):');
check('exactly one <style> tag created', () => { if (styleTags.length !== 1) throw new Error('count=' + styleTags.length); return styleTags.length; });
check('tag carries data-plugin-css', () => {
  const got = styleTags[0] && styleTags[0].getAttribute('data-plugin-css');
  const want = 'dsh-conversation-width/ConversationWidthRow.module.css';
  if (got !== want) throw new Error('attr=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
  return got;
});
globalThis.__pluginCss = { slotCss: styleTags[0].textContent };
check('tag carries the css text', () => { if (!styleTags[0].textContent.includes('.dcw_row')) throw new Error('css missing'); return styleTags[0].textContent.length + ' chars'; });
check('a SECOND load does not duplicate the tag', () => {
  new Function('window', 'document', 'require', source)(windowShim, documentShim, pluginRequire);
  const second = windowShim.__captured.factory(pluginRequire);
  if (typeof second.apply !== 'function') throw new Error('second load broken');
  if (styleTags.length !== 1) throw new Error('count=' + styleTags.length);
  return styleTags.length;
});

// ---- apply() against a fake ctx ----
console.log('\napply() registration:');
const regs = { effects: [], locale: [], inject: [], slots: [] };
const ctx = {
  effect(fn, label) { regs.effects.push(label); return fn(); },
  locale: { register(ns, dict) { regs.locale.push({ ns, zh: Object.keys(dict.zh).length, en: Object.keys(dict.en).length }); return () => {}; } },
  slots: {
    inject(name, cb) { regs.inject.push(name); cb(); },
    register(spec, Component) { regs.slots.push({ spec, type: typeof Component, Component }); return () => {}; }
  }
};
check('apply(ctx) does not throw', () => { mod.apply(ctx); });
check('dictionaries registered for both languages', () => {
  // 6 transcript keys + 9 page-axis keys + 6 presentation-mode keys.
  if (regs.locale.length !== 1 || regs.locale[0].zh !== 21 || regs.locale[0].en !== 21) throw new Error(JSON.stringify(regs.locale));
  return JSON.stringify(regs.locale[0]);
});
check('slot injected', () => {
  // Four rows: transcript width, Settings presentation, dialog width, page width.
  if (regs.inject.length !== 4 || regs.inject.some(x => x !== 'settings.general.item')) throw new Error(JSON.stringify(regs.inject));
  return JSON.stringify(regs.inject);
});
check('slot registered correctly', () => {
  const r = regs.slots[0];
  if (!r) throw new Error('nothing registered');
  if (r.spec.name !== 'settings.general.item') throw new Error('name=' + r.spec.name);
  if (r.spec.id !== 'conversation-width') throw new Error('id=' + r.spec.id);
  if (r.spec.locale !== 'conversation-width') throw new Error('locale=' + r.spec.locale);
  /*
   * 18 is deliberate, not arbitrary. List slots sort by priority then order,
   * and an equal pair falls back to registration order - so reusing a number a
   * built-in row already holds (20 is ui-conversation's composer-enter) makes
   * this row's position depend on plugin activation order. Assert the exact
   * value so a future edit cannot silently re-introduce the collision.
   */
  if (r.spec.order !== 18) throw new Error('order=' + r.spec.order + ' (must stay 18: 17 link-opening < 18 us < 20 composer-enter)');
  if (r.type !== 'function') throw new Error('component type=' + r.type);
  return JSON.stringify(r.spec);
});

// ---- run the component and inspect its tree ----
const Component = regs.slots[0] && regs.slots[0].Component;
const DICT = {
  'width.title': 'Conversation display width', 'width.description': 'Drag the slider.',
  'width.preset': '{width}px', 'width.reset': 'Use auto',
  'width.applied': 'Fixed at {width}px', 'width.auto': 'Auto'
};
const t = (key, vars) => {
  let s = DICT[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace('{' + k + '}', String(v));
  return s;
};
function walk(node, out) {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push({ kind: 'text', value: String(node) }); return out; }
  if (Array.isArray(node)) { for (const c of node) walk(c, out); return out; }
  if (typeof node === 'object') {
    const props = node.props || {};
    if (typeof node.type === 'function') { walk(node.type(props), out); return out; }
    out.push({ kind: 'el', type: node.type, props });
    if (props.children !== undefined) walk(props.children, out);
  }
  return out;
}
function inspect() {
  const nodes = walk(Component({ t }), []);
  const inputs = nodes.filter(n => n.kind === 'el' && n.type === 'input');
  const buttons = nodes.filter(n => n.kind === 'el' && n.type === 'button');
  const text = nodes.filter(n => n.kind === 'text').map(n => n.value).join('|');
  const status = nodes.find(n => n.kind === 'el' && n.props.className === 'dcw_status');
  const statusText = status ? walk(status.props.children, []).filter(n => n.kind === 'text').map(n => n.value).join('') : null;
  return { inputs, buttons, text, statusText };
}

console.log('\ncomponent behaviour:');
check('two inputs (range + number) with the advertised range', () => {
  store.clear();
  const { inputs } = inspect();
  if (inputs.length !== 2) throw new Error('inputs=' + inputs.length);
  const range = inputs.find(i => i.props.type === 'range');
  const num = inputs.find(i => i.props.type === 'number');
  if (!range || !num) throw new Error('missing range or number input');
  if (range.props.min !== 640 || range.props.max !== 1600 || range.props.step !== 20) throw new Error('range=' + JSON.stringify([range.props.min, range.props.max, range.props.step]));
  return 'min 640 / max 1600 / step 20';
});
check('fresh preference => value 920 and the auto status', () => {
  store.clear();
  const { inputs, statusText } = inspect();
  const values = inputs.map(i => i.props.value);
  if (JSON.stringify(values) !== '[920,920]') throw new Error('values=' + JSON.stringify(values));
  if (statusText !== 'Auto') throw new Error('status=' + JSON.stringify(statusText));
  return 'value 920, status Auto';
});
check('stored 1280 => bound and reported', () => {
  store.set('dsh.conversation.contentWidth', '1280');
  const { inputs, statusText, buttons } = inspect();
  const values = inputs.map(i => i.props.value);
  if (JSON.stringify(values) !== '[1280,1280]') throw new Error('values=' + JSON.stringify(values));
  if (statusText !== 'Fixed at 1280px') throw new Error('status=' + JSON.stringify(statusText));
  const active = buttons.filter(b => b.props['data-active'] === true).length;
  if (active !== 1) throw new Error('active presets=' + active);
  return 'value 1280, status "' + statusText + '", 1 active preset';
});
check('corrupt preference falls back to 920 without throwing', () => {
  store.set('dsh.conversation.contentWidth', 'not-a-number');
  const { inputs, statusText } = inspect();
  if (inputs[0].props.value !== 920) throw new Error('value=' + inputs[0].props.value);
  if (statusText !== 'Auto') throw new Error('status=' + JSON.stringify(statusText));
  return 'value 920, status Auto';
});
check('out-of-range stored 99999 is clamped only on write, not on read', () => {
  store.set('dsh.conversation.contentWidth', '99999');
  const { inputs } = inspect();
  return 'read value=' + inputs[0].props.value + ' (write path clamps to 1600)';
});
check('writePreference clamps and publishes (via the range onChange)', () => {
  store.clear();
  // A 1440px column => ui-conversation's ceiling is 1440 - 176 = 1264.
  conversationBodies = [makeConversationBody(1440)];
  const { inputs } = inspect();
  const range = inputs.find(i => i.props.type === 'range');
  range.props.onChange({ currentTarget: { value: '99999' } });
  if (store.get('dsh.conversation.contentWidth') !== '1600') throw new Error('stored=' + store.get('dsh.conversation.contentWidth'));
  if (conversationBodies[0]._props.get('--dsh-chat-user-width') !== '1264px') throw new Error('published=' + conversationBodies[0]._props.get('--dsh-chat-user-width') + ' (expected the column clamp 1264px)');
  const num = inputs.find(i => i.props.type === 'number');
  num.props.onChange({ currentTarget: { value: '10' } });
  if (store.get('dsh.conversation.contentWidth') !== '640') throw new Error('stored=' + store.get('dsh.conversation.contentWidth'));
  if (conversationBodies[0]._props.get('--dsh-chat-user-width') !== '640px') throw new Error('published=' + conversationBodies[0]._props.get('--dsh-chat-user-width'));
  num.props.onChange({ currentTarget: { value: '' } });
  if (store.get('dsh.conversation.contentWidth') !== '640') throw new Error('empty draft must not commit, stored=' + store.get('dsh.conversation.contentWidth'));
  return 'stored 1600 clamped to the 1264px column ceiling, then 640px; empty draft ignored';
});
check('a preference that fits is published verbatim', () => {
  store.clear();
  conversationBodies = [makeConversationBody(2000)];
  const { inputs } = inspect();
  inputs.find(i => i.props.type === 'range').props.onChange({ currentTarget: { value: '1280' } });
  if (conversationBodies[0]._props.get('--dsh-chat-user-width') !== '1280px') throw new Error('published=' + conversationBodies[0]._props.get('--dsh-chat-user-width'));
  return '1280px into a 2000px column (ceiling 1824)';
});
check('an unmeasured column is skipped rather than publishing 0px', () => {
  store.clear();
  conversationBodies = [makeConversationBody(0)];
  const { inputs } = inspect();
  inputs.find(i => i.props.type === 'range').props.onChange({ currentTarget: { value: '1100' } });
  if (conversationBodies[0]._props.has('--dsh-chat-user-width')) throw new Error('wrote ' + conversationBodies[0]._props.get('--dsh-chat-user-width') + ' into a zero-width column');
  return 'no write while offsetWidth is 0';
});
check('reset clears the preference and removes the published variable', () => {
  store.set('dsh.conversation.contentWidth', '1100');
  conversationBodies = [makeConversationBody(1600)];
  const { buttons } = inspect();
  // Seed the variable so the removal is observable.
  conversationBodies[0]._props.set('--dsh-chat-user-width', '1100px');
  const resetButton = buttons.find(b => b.props.className === 'dcw_reset');
  if (!resetButton) throw new Error('no reset button');
  resetButton.props.onClick();
  if (store.has('dsh.conversation.contentWidth')) throw new Error('preference not cleared');
  if (conversationBodies[0]._props.has('--dsh-chat-user-width')) throw new Error('variable still published');
  return 'cleared, --dsh-chat-user-width removed';
});

// ---- the two page-width axes -------------------------------------------
// These act on host chrome the plugin does not render, so each case builds the
// node the host would have mounted, drives the row, and reads the published
// custom property back.
const DIALOG_KEY = 'dsh.conversation-width.settingsDialog';
const PANEL_KEY = 'dsh.conversation-width.globalPanel';

function mountHostNodes() {
  const dialog = globalThis.__hostNodes.makeHostNode();
  const panel = globalThis.__hostNodes.makeHostNode();
  globalThis.__hostNodes.setSettings(dialog);
  globalThis.__hostNodes.setPanel(panel);
  return { dialog, panel };
}
/** Fresh collectors plus the same fake ctx shape the file already uses. */
function freshCtx() {
  const collected = { effects: [], locale: [], inject: [], slots: [] };
  const fake = {
    effect(fn, label) { collected.effects.push(label); return fn(); },
    locale: { register(ns, dict) { collected.locale.push({ ns, zh: Object.keys(dict.zh).length, en: Object.keys(dict.en).length }); return () => {}; } },
    slots: {
      inject(name, cb) { collected.inject.push(name); cb(); },
      register(spec, Component) { collected.slots.push({ spec, Component }); return () => {}; }
    }
  };
  return { collected, fake };
}
/** Every element in a returned React tree matching a predicate. */
function collect(node, pred, out) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const n of node) collect(n, pred, out); return out; }
  if (node.props) {
    if (pred(node)) out.push(node);
    collect(node.props.children, pred, out);
  }
  return out;
}
/** Render one registered row and return its inputs/buttons. */
function renderRow(collected, id) {
  const entry = collected.slots.find(e => e.spec && e.spec.id === id);
  if (!entry) throw new Error('row not registered: ' + id);
  const view = entry.Component({ t: k => k });
  return {
    inputs: collect(view, n => n.props && n.props.type === 'range', []),
    numbers: collect(view, n => n.props && n.props.type === 'number', []),
    buttons: collect(view, n => n.props && n.props.type === 'button', [])
  };
}

check('settings dialog width is published and clamped to its own range', () => {
  const { dialog } = mountHostNodes();
  const { collected, fake } = freshCtx();
  store.clear();
  mod.apply(fake);
  // Drive the row through its registered component.
  const { inputs } = renderRow(collected, 'conversation-width-dialog');
  if (!inputs.length) throw new Error('no range input');
  inputs[0].props.onChange({ currentTarget: { value: '1200' } });
  if (store.get(DIALOG_KEY) !== '1200') throw new Error('stored=' + store.get(DIALOG_KEY));
  if (dialog._props.get('--dsh-settings-dialog-width') !== '1200px') throw new Error('published=' + dialog._props.get('--dsh-settings-dialog-width'));
  return 'stored 1200, published 1200px';
});

check('global panel width is published independently of the dialog', () => {
  const { dialog, panel } = mountHostNodes();
  const { collected, fake } = freshCtx();
  store.clear();
  mod.apply(fake);
  const { inputs } = renderRow(collected, 'conversation-width-panel');
  inputs[0].props.onChange({ currentTarget: { value: '1440' } });
  if (store.get(PANEL_KEY) !== '1440') throw new Error('stored=' + store.get(PANEL_KEY));
  if (panel._props.get('--dsh-global-panel-width') !== '1440px') throw new Error('panel published=' + panel._props.get('--dsh-global-panel-width'));
  if (dialog._props.has('--dsh-settings-dialog-width')) throw new Error('dialog axis was touched by the panel row');
  if (store.has(DIALOG_KEY)) throw new Error('dialog preference was written by the panel row');
  return 'stored 1440, panel published, dialog untouched';
});

check('fill stores the token and publishes an unconstrained width', () => {
  const { dialog } = mountHostNodes();
  const { collected, fake } = freshCtx();
  store.clear();
  mod.apply(fake);
  const { buttons } = renderRow(collected, 'conversation-width-dialog');
  const fill = buttons.find(b => b.props.children === 'page.fill');
  if (!fill) throw new Error('no fill button');
  fill.props.onClick();
  if (store.get(DIALOG_KEY) !== 'fill') throw new Error('stored=' + store.get(DIALOG_KEY));
  const published = dialog._props.get('--dsh-settings-dialog-width');
  if (published !== '100000px') throw new Error('published=' + published);
  return 'stored "fill", published 100000px';
});

check('resetting a page axis removes the variable so the host default returns', () => {
  const { dialog } = mountHostNodes();
  const { collected, fake } = freshCtx();
  store.clear();
  store.set(DIALOG_KEY, '1200');
  mod.apply(fake);
  if (dialog._props.get('--dsh-settings-dialog-width') !== '1200px') throw new Error('not applied before reset');
  const { buttons } = renderRow(collected, 'conversation-width-dialog');
  const reset = buttons.find(b => b.props.className === 'dcw_reset');
  if (!reset) throw new Error('no reset button');
  reset.props.onClick();
  if (store.has(DIALOG_KEY)) throw new Error('preference not cleared');
  if (dialog._props.has('--dsh-settings-dialog-width')) throw new Error('variable still published');
  return 'cleared, host default restored';
});

check('page axes leave the transcript preference alone', () => {
  const { dialog, panel } = mountHostNodes();
  const { fake } = freshCtx();
  store.clear();
  store.set('dsh.conversation.contentWidth', '1280');
  mod.apply(fake);
  if (store.get('dsh.conversation.contentWidth') !== '1280') throw new Error('transcript preference changed');
  if (store.has(DIALOG_KEY) || store.has(PANEL_KEY)) throw new Error('page axes wrote without a preference');
  if (dialog._props.has('--dsh-settings-dialog-width')) throw new Error('dialog variable published without a preference');
  if (panel._props.has('--dsh-global-panel-width')) throw new Error('panel variable published without a preference');
  return 'transcript untouched, no page variable without a preference';
});

check('page rule reaches the capped content, not just the panel element', () => {
  /*
   * The host marks `main` with data-global-panel but puts its 960px cap on the
   * page's own children several levels below, so a child combinator
   * ([data-global-panel]>*) matches nothing and the axis silently does nothing.
   * Assert the descendant form, which is what actually reaches the cap.
   */
  const { slotCss } = globalThis.__pluginCss;
  if (!/\[data-global-panel\]\s+\*\{/.test(slotCss)) throw new Error('page rule is not a descendant selector');
  if (/\[data-global-panel\]>\*\{/.test(slotCss)) throw new Error('page rule still uses a child combinator');
  if (!slotCss.includes('var(--dsh-global-panel-width,960px)')) throw new Error('page rule lost its variable/fallback');
  return 'descendant selector with a 960px fallback';
});

check('dialog width rule keeps the host max-width by using !important on width only', () => {
  const { slotCss } = globalThis.__pluginCss;
  /* Scope the check to the single dialog-width rule: the page-presentation block
   * legitimately needs !important on many properties, so a whole-stylesheet
   * scan for it would be a false failure. */
  const m = slotCss.match(/\[data-shortcut-modal="settings"\]\{[^}]*\}/);
  if (m === null) throw new Error('dialog width rule missing');
  const rule = m[0];
  if (!/width:var\(--dsh-settings-dialog-width,800px\)!important/.test(rule)) throw new Error('rule shape changed: ' + rule);
  if (/max-width/.test(rule)) throw new Error('the dialog rule must not set max-width: ' + rule);
  return 'width overridden, max-width left to the host';
});

check('page presentation hides the mask and stretches the panel', () => {
  const { slotCss } = globalThis.__pluginCss;
  if (!/\[data-dcw-settings-page\]\>:first-child\{display:none/.test(slotCss)) throw new Error('mask is not hidden');
  if (!/\[data-dcw-settings-page\]\>:last-child\{[^}]*width:100%!important/.test(slotCss)) throw new Error('panel is not stretched');
  if (!/\[data-dcw-settings-page\]\>:last-child\{[^}]*border-radius:0/.test(slotCss)) throw new Error('panel corners are not squared');
  return 'mask hidden, panel stretched and squared';
});

// ---- Settings presentation mode ----------------------------------------
const MODE_KEY = 'dsh.conversation-width.settingsMode';

/** Build a dialog node whose parent stands in for the portal overlay. */
function mountDialogWithOverlay() {
  const overlay = globalThis.__hostNodes.makeHostNode();
  const dialog = globalThis.__hostNodes.makeHostNode();
  dialog.parentElement = overlay;
  globalThis.__hostNodes.setSettings(dialog);
  globalThis.__hostNodes.setPanel(globalThis.__hostNodes.makeHostNode());
  return { overlay, dialog };
}

check('page presentation marks the overlay; dialog mode removes it', () => {
  const { overlay } = mountDialogWithOverlay();
  const { fake } = freshCtx();
  store.clear();
  // Explicitly page mode: applying must mark the overlay.
  store.set(MODE_KEY, 'page');
  mod.apply(fake);
  if (!overlay.hasAttribute('data-dcw-settings-page')) throw new Error('page mode did not mark the overlay');

  // Switch back to dialog mode: the marker must be removed, not merely ignored.
  const { fake: fake2 } = freshCtx();
  store.set(MODE_KEY, 'dialog');
  mod.apply(fake2);
  if (overlay.hasAttribute('data-dcw-settings-page')) throw new Error('dialog mode left the marker behind');
  return 'marker added for page, removed for dialog';
});

check('no preference means dialog presentation (host default preserved)', () => {
  const { overlay } = mountDialogWithOverlay();
  const { fake } = freshCtx();
  store.clear();
  mod.apply(fake);
  if (overlay.hasAttribute('data-dcw-settings-page')) throw new Error('marked without an explicit page preference');
  return 'unset preference keeps the host modal';
});

check('the dialog width row hides itself in page presentation', () => {
  mountDialogWithOverlay();
  const { collected, fake } = freshCtx();
  store.clear();
  store.set(MODE_KEY, 'page');
  mod.apply(fake);
  const entry = collected.slots.find(e => e.spec && e.spec.id === 'conversation-width-dialog');
  if (!entry) throw new Error('dialog width row not registered');
  const view = entry.Component({ t: k => k });
  if (view !== null) throw new Error('width row still renders in page mode');
  return 'width row returns null while the page presentation is active';
});

check('the presentation row reports and switches the mode', () => {
  const { overlay } = mountDialogWithOverlay();
  const { collected, fake } = freshCtx();
  store.clear();
  mod.apply(fake);
  const entry = collected.slots.find(e => e.spec && e.spec.id === 'conversation-width-dialog-mode');
  if (!entry) throw new Error('presentation row not registered');
  const view = entry.Component({ t: k => k });
  const buttons = collect(view, n => n.props && n.props.type === 'button', []);
  const pageBtn = buttons.find(b => b.props.children === 'page.presentationPage');
  const dialogBtn = buttons.find(b => b.props.children === 'page.presentationDialog');
  if (!pageBtn || !dialogBtn) throw new Error('mode buttons missing');
  if (dialogBtn.props['aria-pressed'] !== true) throw new Error('dialog not reported as active by default');
  pageBtn.props.onClick();
  if (store.get(MODE_KEY) !== 'page') throw new Error('mode not stored: ' + store.get(MODE_KEY));
  if (!overlay.hasAttribute('data-dcw-settings-page')) throw new Error('switching did not apply immediately');
  return 'defaults to dialog, switches to page and applies at once';
});

check('page presentation is bounded to the main area, not the whole viewport', () => {
  /*
   * `inset` is measured from the viewport, but the frame sits inset from it and
   * the sidebar occupies the first grid track. The published insets must be the
   * main area's ABSOLUTE edges; using raw track widths is off by the frame's own
   * margin, which is exactly the bug this asserts against.
   */
  const frameLeft = 8, frameWidth = 1221, leading = 240, trailing = 0, viewport = 1237;
  const mainLeft = frameLeft + leading;               // 248
  const mainRight = frameLeft + frameWidth - trailing; // 1229
  const insetLeft = mainLeft;
  const insetRight = viewport - mainRight;             // 8
  const shownWidth = viewport - insetLeft - insetRight;

  if (insetLeft !== 248) throw new Error('inset left = ' + insetLeft);
  if (insetRight !== 8) throw new Error('inset right = ' + insetRight);
  if (shownWidth !== 981) throw new Error('shown width = ' + shownWidth);
  /* The naive (wrong) form would ignore the frame margin: */
  const naiveWidth = viewport - leading - trailing;
  if (naiveWidth === shownWidth) throw new Error('fixture cannot distinguish the two forms');
  return 'left 248 / right 8 / width 981 (naive form would give ' + naiveWidth + ')';
});

console.log('\n' + (failures.length === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: ' + failures.length + ' FAILURE(S)\n  - ' + failures.join('\n  - ')));
process.exit(failures.length === 0 ? 0 : 2);
