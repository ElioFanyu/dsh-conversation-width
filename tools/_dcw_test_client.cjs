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
const documentShim = {
  querySelectorAll: sel => {
    if (sel === 'style[data-plugin-css]') return styleTags;
    if (sel === '[data-conversation-content]') return conversationBodies;
    return [];
  },
  querySelector: sel => {
    const m = SEL_RE.exec(sel);
    if (m === null) {
      throw new SyntaxError("Failed to execute 'querySelector' on 'Document': '" + sel + "' is not a valid selector.");
    }
    const tag = m[1], attr = m[2], want = m[4] !== undefined ? m[4] : m[5];
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
check('dictionaries registered for both languages', () => { if (regs.locale.length !== 1 || regs.locale[0].zh !== 6 || regs.locale[0].en !== 6) throw new Error(JSON.stringify(regs.locale)); return JSON.stringify(regs.locale[0]); });
check('slot injected', () => { if (JSON.stringify(regs.inject) !== '["settings.general.item"]') throw new Error(JSON.stringify(regs.inject)); return JSON.stringify(regs.inject); });
check('slot registered correctly', () => {
  const r = regs.slots[0];
  if (!r) throw new Error('nothing registered');
  if (r.spec.name !== 'settings.general.item') throw new Error('name=' + r.spec.name);
  if (r.spec.id !== 'conversation-width') throw new Error('id=' + r.spec.id);
  if (r.spec.locale !== 'conversation-width') throw new Error('locale=' + r.spec.locale);
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

console.log('\n' + (failures.length === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: ' + failures.length + ' FAILURE(S)\n  - ' + failures.join('\n  - ')));
process.exit(failures.length === 0 ? 0 : 2);
