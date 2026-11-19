const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, 'web');
const DEST = path.join(__dirname, 'docs');
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(ROOT, DEST, { recursive: true });
let injected = 0;
for (const f of fs.readdirSync(DEST, { recursive: true })) {
  const full = path.join(DEST, f.toString());
  if (!full.endsWith('.html')) continue;
  let s = fs.readFileSync(full, 'utf8');
  const MARK = '<script>window.NEXUS_STATIC = true;</script>';
  if (!s.includes(MARK)) { s = s.replace('<head>', '<head>\n' + MARK); fs.writeFileSync(full, s); }
  injected++;
}
console.log(`[build] docs/ ready — ${injected} pages (static demo mode)`);
