// Rebuild the PREVIOUS announce() (a window "resize" dispatch that
// ui-conversation never listens for) into a scratch copy, so the client
// harness can be shown to actually catch "width never applies".
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'lib', 'client.js');
const OUT = path.join(ROOT, '.scratch', 'buggy-announce', 'lib', 'client.js');

const src = fs.readFileSync(SRC, 'utf8');
const start = src.indexOf('\t\tfunction announce() {');
const endMarker = '\n\t\t}\n\t\t//#endregion';
const end = src.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  console.error('markers not found', { start, end });
  process.exit(1);
}

const buggy = '\t\tfunction announce() {\n\t\t\twindow.dispatchEvent(new Event("resize"));\n\t\t}';
const out = src.slice(0, start) + buggy + src.slice(end + '\n\t\t}'.length);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('wrote buggy copy:', OUT, out.length, 'bytes');
