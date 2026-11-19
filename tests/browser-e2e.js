// Real-browser E2E via Chrome DevTools Protocol: actual viewport emulation + trusted touch events.
// Usage: node tests/browser-e2e.js  (BASE=http://localhost:3010 by default; CHROME=path to override)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const BASE = process.env.BASE || 'http://localhost:3010';
const userDir = path.join(os.tmpdir(), 'nexus-cdp-profile');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? ' -> ' + JSON.stringify(extra).slice(0, 200) : '')); console.log('FAIL ' + name, extra || ''); }
}

(async () => {
  fs.rmSync(userDir, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions',
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 80; i++) {
    try { version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()); break; } catch { await sleep(150); }
  }
  if (!version) throw new Error('Chrome debug port did not open');
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.method + ' ' + msg.error.message)) : res(msg.result);
    } else if (msg.method === 'Page.javascriptDialogOpening') {
      console.log('  [dialog] ' + msg.params.type + ': ' + msg.params.message);
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
  function send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++seq; pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 20000);
    });
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
  async function goto(url) {
    await send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) {
      await sleep(100);
      const st = await evaluate('({href:location.href,ready:document.readyState})').catch(() => null);
      if (st && st.href === url && st.ready === 'complete') break;
    }
    // wait until app shell is actually mounted
    for (let i = 0; i < 60; i++) {
      const ok = await evaluate(`!!document.querySelector('.sidebar') || location.pathname.indexOf('login')>=0 || location.pathname==='/'`).catch(() => false);
      if (ok) break;
      await sleep(100);
    }
    await sleep(400);
  }
  async function setDevice(width, mobile) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 800, deviceScaleFactor: mobile ? 3 : 1, mobile,
      screenWidth: width, screenHeight: 800,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
  }
  async function tapSelector(sel) {
    const p = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()`);
    if (!p || !p.w) throw new Error('not tappable: ' + sel);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    await sleep(70);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(380);
  }
  async function tapPoint(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    await sleep(70);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(380);
  }
  async function escape() {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(200);
  }
  const state = () => evaluate(`({open:document.querySelector('.sidebar').classList.contains('open'),active:(document.querySelector('.page-section.active')||{}).id||'',overflow:document.documentElement.scrollWidth>window.innerWidth+1,toggle:getComputedStyle(document.querySelector('.sidebar-toggle')).display,sidebarW:Math.round(document.querySelector('.sidebar').getBoundingClientRect().width),errs:window.__errs||[]})`);
  async function login(email, password) {
    await goto(BASE + '/login.html');
    const isStatic = await evaluate('!!window.NEXUS_STATIC').catch(() => false);
    if (isStatic) {
      await evaluate('localStorage.clear()'); // الديمو الثابت: جلسة/بيانات المتصفح فقط
    } else {
      await evaluate(`fetch('/api/auth/logout',{method:'POST'})`).catch(() => {});
    }
    await goto(BASE + '/login.html');
    await evaluate(`(()=>{document.getElementById('loginEmail').value=${JSON.stringify(email)};document.getElementById('loginPassword').value=${JSON.stringify(password)};document.getElementById('loginBtn').click();return true;})()`);
    for (let i = 0; i < 100; i++) {
      await sleep(150);
      const st = await evaluate('({href:location.href,side:!!document.querySelector(".sidebar")})').catch(() => null);
      if (st && st.side && !st.href.includes('login.html')) return;
    }
    const dbg = await evaluate('({href:location.href,title:document.title,body:document.body.innerText.slice(0,180)})').catch(() => null);
    throw new Error('login failed ' + email + ': ' + JSON.stringify(dbg));
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errs=[];addEventListener('error',e=>window.__errs.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__errs.push('promise:'+String(e.reason&&e.reason.message||e.reason)));`,
  });

  const roles = [
    { key: 'student', email: 'student@nexus.edu', pass: 'student123', links: ['dashboard', 'new', 'mine', 'academics', 'lostfound', 'ai', 'notifs'] },
    { key: 'staff', email: 'staff@nexus.edu', pass: 'staff123', links: ['dashboard', 'complaints', 'attendance', 'lostfound', 'notifs'] },
    { key: 'admin', email: 'admin@nexus.edu', pass: 'admin123', links: ['dashboard', 'staff', 'departments', 'complaints', 'insights', 'satisfaction', 'announcements', 'lostfound', 'reports', 'notifs'] },
  ];

  if (!process.env.SKIP_TOUCH) {
  console.log('== TRUSTED TOUCH TESTS (390x800, real mobile emulation) ==');
  for (const role of roles) {
    await login(role.email, role.pass);
    await setDevice(390, true);
    await goto(`${BASE}/${role.key}.html`);
    let s = await state();
    check(`${role.key}: sidebar initially closed`, !s.open, s);
    for (const name of role.links) {
      await tapSelector('.sidebar-toggle');
      let st = await state();
      if (!st.open) { check(`${role.key}: hamburger opens (${name})`, false, st); break; }
      await tapSelector(`.side-link[data-section="${name}"]`);
      st = await state();
      check(`${role.key}: nav ${name} closes + activates`, !st.open && st.active === 'section-' + name, st);
    }
    await tapSelector('.sidebar-toggle');
    await escape();
    s = await state();
    check(`${role.key}: Escape closes`, !s.open, s);
    await tapSelector('.sidebar-toggle');
    await tapSelector('.sidebar-close');
    s = await state();
    check(`${role.key}: close button closes (same corner)`, !s.open, s);
    await tapSelector('.sidebar-toggle');
    await tapPoint(24, 420);
    s = await state();
    check(`${role.key}: outside tap closes`, !s.open, s);
    await tapSelector('.sidebar-toggle');
    await evaluate(`location.hash='#real-nav-${Date.now()}'`);
    await sleep(300);
    s = await state();
    check(`${role.key}: route change closes`, !s.open, s);
    check(`${role.key}: no JS errors (touch pass)`, s.errs.length === 0, s.errs);
  }
  } else {
    console.log('== TRUSTED TOUCH TESTS skipped (SKIP_TOUCH=1) ==');
  }

  console.log('== FULL LAYOUT SWEEP (all portals, all widths) ==');
  const widths = [320, 360, 390, 430, 768, 1024, 1440];
  for (const role of roles) {
    await login(role.email, role.pass);
    for (const w of widths) {
      await setDevice(w, w <= 900);
      await goto(`${BASE}/${role.key}.html`);
      const bad = [];
      for (const name of role.links) {
        await evaluate(`document.querySelector('.side-link[data-section="${name}"]').click()`);
        await sleep(220);
        const st = await state();
        if (st.active !== 'section-' + name) bad.push(name + ':active=' + st.active);
        if (st.overflow) bad.push(name + ':overflow');
        if (st.errs.length) bad.push(name + ':err');
      }
      const last = await state();
      check(`${role.key} @${w}px — ${role.links.length} sections, no overflow/errors`, bad.length === 0, bad);
      if (w <= 900) check(`${role.key} @${w}px — touch toggle visible`, last.toggle !== 'none' && last.sidebarW > 200, last);
      else check(`${role.key} @${w}px — desktop toggle hidden + sidebar`, last.toggle === 'none' && last.sidebarW > 200, last);
    }
  }

  // Desktop behavior: sidebar remains visible, navigation works, no overflow
  await login('student@nexus.edu', 'student123');
  await setDevice(1440, false);
  await goto(BASE + '/student.html');
  const d = await state();
  check('desktop: sidebar visible without toggle', d.toggle === 'none' && d.sidebarW > 200 && !d.open, d);
  check('desktop: no overflow dashboard', !d.overflow, d);

  console.log(`\n===== REAL-BROWSER RESULT: ${pass} passed, ${fail} failed =====`);
  if (fail) failures.forEach(f => console.log(' - ' + f));
  try { await send('Browser.close'); } catch {}
  try { ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(500);
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(async e => {
  console.error('FATAL', e);
  process.exit(2);
});
