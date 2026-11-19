// NEXUS AI — Backend server (Node.js + built-in SQLite, zero external deps)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initDb, getDb, q, one, run, hashPassword, verifyPassword } = require('./db');
const { classifyComplaint, answerQuestion, buildInsights, generateSummary, adminAsk } = require('./ai');

initDb();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'web');
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// ---------- helpers ----------
function send(res, status, obj, headers = {}) {
  const body = obj === null || obj === undefined ? '' : (Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));
  res.writeHead(status, {
    'Content-Type': Buffer.isBuffer(obj) ? (headers['Content-Type'] || 'application/octet-stream') : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    ...headers,
  });
  res.end(body);
}
const ok = (res, data, status = 200) => send(res, status, { ok: true, data });
const fail = (res, status, error) => send(res, status, { ok: false, error });

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('الملف أكبر من الحد المسموح (12MB)')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function parseJson(req) { const raw = await readBody(req); try { return raw ? JSON.parse(raw) : {}; } catch { const e = new Error('JSON غير صالح'); e.statusCode = 400; throw e; } }
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function publicUser(u) {
  if (!u) return null;
  const dept = u.department_id ? one('SELECT name FROM departments WHERE id = ?', [u.department_id]) : null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, department_id: u.department_id, department_name: dept ? dept.name : null, student_code: u.student_code, phone: u.phone, active: !!u.active, last_login: u.last_login, created_at: u.created_at };
}
function getSessionUser(req) {
  const token = parseCookies(req)['nexus_session'];
  if (!token) return null;
  const s = one('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!s) return null;
  if (new Date(String(s.expires_at).replace(' ', 'T') + 'Z') < new Date()) { run('DELETE FROM sessions WHERE token = ?', [token]); return null; }
  const u = one('SELECT * FROM users WHERE id = ? AND active = 1', [s.user_id]);
  return u ? { user: u, token } : null;
}
function requireAuth(req, res) {
  const session = getSessionUser(req);
  if (!session) { fail(res, 401, 'سجل الدخول أولًا'); return null; }
  return session;
}
function requireRole(req, res, roles) {
  const session = requireAuth(req, res); if (!session) return null;
  if (!roles.includes(session.user.role)) { fail(res, 403, 'ليس لديك صلاحية لهذا الإجراء'); return null; }
  return session;
}
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,datetime(\'now\',\'+7 days\'))', [token, userId]);
  return `nexus_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 3600}`;
}
function notify(userId, title, body, refType, refId) {
  // دفاع: لو اتمرر صف object بدل id، نأخذ id منه بدل ما الاستعلام يفشل
  if (userId && typeof userId === 'object') userId = userId.id;
  if (refId && typeof refId === 'object') refId = refId.id;
  try { run('INSERT INTO notifications(user_id, title, body, ref_type, ref_id) VALUES (?,?,?,?,?)', [userId, title, body || null, refType || null, refId || null]); } catch (e) { console.error('notify failed', e.message); }
}
function logUpdate(complaintId, userId, action, details) {
  run('INSERT INTO complaint_updates(complaint_id, user_id, action, details) VALUES (?,?,?,?)', [complaintId, userId, action, details || null]);
}
function canSeeComplaint(user, c) {
  if (!c) return false;
  if (user.role === 'student') return c.student_id === user.id;
  // المدير وكل الموظفين يشوفوا كل الشكاوى — المسؤولية تُحدد بالإسناد لا بالقسم
  return user.role === 'admin' || user.role === 'staff';
}
function loadTransfers(complaintId) {
  return q(`SELECT t.*, fu.name AS from_name, tu.name AS to_name, pu.name AS previous_name, d.name AS department_name
            FROM complaint_transfers t
            LEFT JOIN users fu ON fu.id = t.from_user_id
            LEFT JOIN users tu ON tu.id = t.to_user_id
            LEFT JOIN users pu ON pu.id = t.previous_assigned_to
            LEFT JOIN departments d ON d.id = t.department_id
            WHERE t.complaint_id = ? ORDER BY t.created_at ASC, t.id ASC`, [complaintId]);
}
function loadComplaint(id) {
  return one(`SELECT c.*, ct.name AS type_name, d.name AS department_name,
              s.name AS student_name, s.student_code, s.email AS student_email,
              a.name AS assigned_name FROM complaints c
              LEFT JOIN complaint_types ct ON ct.id = c.type_id
              JOIN departments d ON d.id = c.department_id
              JOIN users s ON s.id = c.student_id
              LEFT JOIN users a ON a.id = c.assigned_to WHERE c.id = ?`, [id]);
}
const STATUS_LABEL = { new: 'جديدة', in_progress: 'قيد المراجعة', resolved: 'تم الحل', rejected: 'مرفوضة' };
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent', 'critical'];

// rate limit بسيط لمحاولات الدخول
const loginAttempts = new Map();
function loginRateLimited(ip) {
  const now = Date.now(); const rec = loginAttempts.get(ip) || [];
  const recent = rec.filter(t => now - t < 60_000); loginAttempts.set(ip, recent);
  return recent.length >= 8;
}
function noteLoginAttempt(ip) { const rec = loginAttempts.get(ip) || []; rec.push(Date.now()); loginAttempts.set(ip, rec); }

// ---------- router ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, regex, keys, handler });
};

// ===== Auth =====
route('POST', '/api/auth/register', async (req, res) => {
  const { name, email, password, phone, student_code } = await parseJson(req);
  if (!name || !email || !password) return fail(res, 400, 'الاسم والبريد وكلمة المرور مطلوبة');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'صيغة البريد غير صحيحة');
  if (String(password).length < 6) return fail(res, 400, 'كلمة المرور 6 أحرف على الأقل');
  if (one('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase()])) return fail(res, 409, 'البريد مستخدم بالفعل');
  const { salt, hash } = hashPassword(password);
  const info = run('INSERT INTO users(name, email, password_hash, salt, role, student_code, phone) VALUES (?,?,?,?,\'student\',?,?)',
    [name.trim(), String(email).toLowerCase().trim(), hash, salt, student_code || null, phone || null]);
  const cookie = createSession(res, info.lastInsertRowid);
  send(res, 201, { ok: true, data: { user: publicUser(one('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid])) } }, { 'Set-Cookie': cookie });
});

route('POST', '/api/auth/login', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  if (loginRateLimited(ip)) return fail(res, 429, 'محاولات كثيرة. انتظر دقيقة وحاول تاني.');
  const { email, password } = await parseJson(req);
  if (!email || !password) { noteLoginAttempt(ip); return fail(res, 400, 'البريد وكلمة المرور مطلوبان'); }
  const u = one('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase().trim()]);
  if (!u || !verifyPassword(password, u.salt, u.password_hash)) { noteLoginAttempt(ip); return fail(res, 401, 'البريد أو كلمة المرور غير صحيحة'); }
  if (!u.active) return fail(res, 403, 'الحساب موقوف. تواصل مع الإدارة.');
  run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [u.id]);
  loginAttempts.delete(ip);
  const cookie = createSession(res, u.id);
  send(res, 200, { ok: true, data: { user: publicUser(u) } }, { 'Set-Cookie': cookie });
});

route('POST', '/api/auth/logout', async (req, res) => {
  const session = getSessionUser(req);
  if (session) run('DELETE FROM sessions WHERE token = ?', [session.token]);
  send(res, 200, { ok: true, data: null }, { 'Set-Cookie': 'nexus_session=; HttpOnly; Path=/; Max-Age=0' });
});

route('GET', '/api/auth/me', async (req, res) => {
  const session = requireAuth(req, res); if (!session) return;
  ok(res, { user: publicUser(session.user) });
});

// ===== Public-ish lookups (authed) =====
route('GET', '/api/departments', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  ok(res, q(`SELECT d.*, (SELECT COUNT(*) FROM complaints c WHERE c.department_id = d.id) AS complaints_count FROM departments d ORDER BY d.id`));
});
route('GET', '/api/complaint-types', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  ok(res, q('SELECT ct.*, d.name AS department_name FROM complaint_types ct JOIN departments d ON d.id = ct.department_id ORDER BY d.id, ct.id'));
});

// ===== Uploads (attachments) =====
route('POST', '/api/upload', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const { filename, dataBase64 } = await parseJson(req);
  if (!filename || !dataBase64) return fail(res, 400, 'الملف غير مكتمل');
  const ext = path.extname(String(filename)).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx'];
  if (!allowed.includes(ext)) return fail(res, 400, 'نوع الملف غير مسموح (صور أو PDF فقط)');
  const buf = Buffer.from(String(dataBase64).split(',').pop(), 'base64');
  if (buf.length > 8 * 1024 * 1024) return fail(res, 400, 'الحد الأقصى لحجم الملف 8MB');
  const safe = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, safe), buf);
  ok(res, { url: `/uploads/${safe}`, name: path.basename(String(filename)) });
});

// ===== Complaints =====
route('POST', '/api/complaints', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const { title, details, type_id, department_id, priority, attachment } = await parseJson(req);
  // الطالب حر في كتابة الشكوى — المطلوب فقط ألا تكون فارغة
  if (!String(title || '').trim() || !String(details || '').trim())
    return fail(res, 400, 'اكتب عنوان الشكوى وتفاصيلها');

  const cls = classifyComplaint(`${title} ${details}`);
  let deptId = Number(department_id) || cls.department_id;
  if (!one('SELECT id FROM departments WHERE id = ?', [deptId])) deptId = cls.department_id;
  let typeId = Number(type_id) || null;
  if (typeId && !one('SELECT id FROM complaint_types WHERE id = ?', [typeId])) typeId = null;
  const finalPriority = PRIORITY_VALUES.includes(priority) ? priority : cls.priority;

  const year = new Date().getFullYear();
  const seq = String((one('SELECT COUNT(*) AS c FROM complaints') || { c: 0 }).c + 1).padStart(4, '0');
  const ticketNo = `NX-${year}-${seq}`;

  const info = run(`INSERT INTO complaints(ticket_no, student_id, type_id, department_id, title, details, attachment, status, priority, ai_category, ai_confidence)
                    VALUES (?,?,?,?,?,?,?,'new',?,?,?)`,
    [ticketNo, s.user.id, typeId, deptId, String(title).trim(), String(details).trim(), attachment || null, finalPriority, cls.category, cls.confidence]);
  const cid = info.lastInsertRowid;
  logUpdate(cid, s.user.id, 'created', 'تم إنشاء الشكوى وتصنيفها تلقائيًا بواسطة NEXUS AI');

  // كل شكوى جديدة تظهر في لوحة المدير ولكل الموظفين — إشعار فوري للجميع
  const deptName = one('SELECT name FROM departments WHERE id = ?', [deptId])?.name || '';
  const staffList = q("SELECT id FROM users WHERE role IN ('staff','admin') AND active = 1");
  for (const st of staffList) notify(st.id, 'شكوى جديدة وصلت', `${ticketNo} — ${String(title).trim()} · ${deptName}`, 'complaint', cid);

  ok(res, { complaint: loadComplaint(cid), ai: cls }, 201);
});

route('GET', '/api/complaints', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const url = new URL(req.url, 'http://x');
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const dept = url.searchParams.get('department');
  const qstr = (url.searchParams.get('q') || '').trim();
  const from = url.searchParams.get('from'); const to = url.searchParams.get('to');

  let sql = `SELECT c.*, ct.name AS type_name, d.name AS department_name, st.name AS student_name, st.student_code, a.name AS assigned_name
             FROM complaints c JOIN departments d ON d.id = c.department_id JOIN users st ON st.id = c.student_id
             LEFT JOIN complaint_types ct ON ct.id = c.type_id LEFT JOIN users a ON a.id = c.assigned_to WHERE 1=1`;
  const params = [];
  if (s.user.role === 'student') { sql += ' AND c.student_id = ?'; params.push(s.user.id); }
  // المدير والموظفون يرون كل الشكاوى
  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  if (priority) { sql += ' AND c.priority = ?'; params.push(priority); }
  if (dept && s.user.role === 'admin') { sql += ' AND c.department_id = ?'; params.push(Number(dept)); }
  if (qstr) { sql += ' AND (c.title LIKE ? OR c.details LIKE ? OR c.ticket_no LIKE ? OR st.name LIKE ?)'; const like = `%${qstr}%`; params.push(like, like, like, like); }
  if (from) { sql += " AND c.created_at >= ?"; params.push(`${from} 00:00:00`); }
  if (to) { sql += " AND c.created_at <= ?"; params.push(`${to} 23:59:59`); }
  sql += ' ORDER BY CASE c.priority WHEN \'critical\' THEN 0 WHEN \'urgent\' THEN 1 WHEN \'high\' THEN 2 WHEN \'medium\' THEN 3 ELSE 4 END, c.created_at DESC LIMIT 500';
  ok(res, q(sql, params));
});

route('GET', '/api/complaints/:id', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  const c = loadComplaint(Number(p.id));
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'لا تملك صلاحية مشاهدة هذه الشكوى');
  const internalAllowed = s.user.role !== 'student';
  const messages = q(`SELECT m.*, u.name AS sender_name, u.role AS sender_role FROM messages m JOIN users u ON u.id = m.sender_id
                      WHERE m.complaint_id = ? ${internalAllowed ? '' : 'AND m.is_internal = 0'} ORDER BY m.created_at ASC`, [c.id]);
  const updates = q(`SELECT u2.*, u.name AS user_name, u.role AS user_role FROM complaint_updates u2 LEFT JOIN users u ON u.id = u2.user_id
                     WHERE u2.complaint_id = ? ORDER BY u2.created_at ASC`, [c.id]);
  ok(res, { complaint: c, messages, updates, transfers: loadTransfers(c.id) });
});

route('GET', '/api/complaints/:id/transfers', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  const c = one('SELECT id FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'لا تملك صلاحية مشاهدة هذه الشكوى');
  ok(res, loadTransfers(Number(p.id)));
});

route('POST', '/api/complaints/:id/status', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const { status } = await parseJson(req);
  if (!['new', 'in_progress', 'resolved', 'rejected'].includes(status)) return fail(res, 400, 'حالة غير صالحة');
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');
  const resolvedAt = status === 'resolved' ? 'datetime(\'now\')' : 'NULL';
  run(`UPDATE complaints SET status = ?, updated_at = datetime('now'), resolved_at = ${resolvedAt}, closure_status = ? WHERE id = ?`,
    [status, status === 'resolved' ? 'awaiting' : null, c.id]);
  logUpdate(c.id, s.user.id, 'status', `تم تغيير الحالة إلى: ${STATUS_LABEL[status]}${status === 'resolved' ? ' — بانتظار تأكيد الطالب' : ''}`);
  notify(c.student_id, status === 'resolved' ? 'الموظف لخّص مشكلتك — هل اتحلت؟ 🎉' : 'تحديث على شكواك', `${c.ticket_no} — ${status === 'resolved' ? 'بانتظار تأكيدك وتقييمك من داخل شكواك' : 'الحالة أصبحت: ' + STATUS_LABEL[status]}`, 'complaint', c.id);
  ok(res, { complaint: loadComplaint(c.id) });
});

route('POST', '/api/complaints/:id/assign', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const { assigned_to } = await parseJson(req);
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');
  let targetId = Number(assigned_to) || s.user.id;
  // المدير والموظفون يستطيعون إسناد الشكوى لأي موظف مؤهل
  const target = one('SELECT * FROM users WHERE id = ? AND role IN (\'staff\',\'admin\') AND active = 1', [targetId]);
  if (!target) return fail(res, 400, 'الموظف غير موجود');
  run('UPDATE complaints SET assigned_to = ?, department_id = COALESCE(?, department_id), updated_at = datetime(\'now\') WHERE id = ?', [targetId, target.department_id, c.id]);
  logUpdate(c.id, s.user.id, 'assigned', `تم إسناد الشكوى إلى ${target.name}`);
  if (targetId !== s.user.id) notify(targetId, 'شكوى أُسندت إليك', `${c.ticket_no} — ${c.title}`, 'complaint', c.id);
  ok(res, { complaint: loadComplaint(c.id) });
});

route('POST', '/api/complaints/:id/transfer', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const { department_id, assigned_to, reason } = await parseJson(req);
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');

  const newAssignee = Number(assigned_to);
  if (!newAssignee) return fail(res, 400, 'اختر الموظف المسؤول عن حل المشكلة');
  const target = one("SELECT * FROM users WHERE id = ? AND role IN ('staff','admin') AND active = 1", [newAssignee]);
  if (!target) return fail(res, 400, 'الموظف غير موجود أو موقوف');

  // القسم يتبع الموظف المختار تلقائيًا، أو يُحدَّد صراحةً من النموذج
  const newDept = Number(department_id) || target.department_id;
  if (!newDept || !one('SELECT id FROM departments WHERE id = ?', [newDept])) return fail(res, 400, 'القسم غير صحيح');
  const cleanReason = String(reason || '').trim().slice(0, 1000);
  const previousId = c.assigned_to || null;

  run('UPDATE complaints SET department_id = ?, assigned_to = ?, updated_at = datetime(\'now\') WHERE id = ?', [newDept, newAssignee, c.id]);
  const rec = run(`INSERT INTO complaint_transfers(complaint_id, from_user_id, to_user_id, previous_assigned_to, department_id, reason)
                   VALUES (?,?,?,?,?,?)`, [c.id, s.user.id, newAssignee, previousId, newDept, cleanReason || null]);

  const dept = one('SELECT name FROM departments WHERE id = ?', [newDept]);
  const prevName = previousId ? (one('SELECT name FROM users WHERE id = ?', [previousId]) || {}).name : null;
  // السبب ملاحظة داخلية → تُحفظ في سجل التحويلات ولا تظهر للطالب
  logUpdate(c.id, s.user.id, 'transfer', `تم التحويل من ${prevName || 'غير مسندة'} إلى ${target.name} — قسم ${dept.name}`);

  notify(newAssignee, 'تم تحويل شكوى إليك 🫵', `${c.ticket_no} — ${c.title}${cleanReason ? ' — ملاحظة: ' + cleanReason : ''}`, 'complaint', c.id);
  if (previousId && previousId !== newAssignee) notify(previousId, 'تم تحويل شكوى كانت مسندة إليك', `${c.ticket_no} — أصبحت لدى ${target.name}`, 'complaint', c.id);
  notify(c.student_id, 'تم تحويل شكواك للموظف المختص', `${c.ticket_no} — أصبحت لدى ${target.name} في قسم ${dept.name}`, 'complaint', c.id);
  ok(res, { complaint: loadComplaint(c.id), transfer: one('SELECT * FROM complaint_transfers WHERE id = ?', [rec.lastInsertRowid]) });
});

route('POST', '/api/complaints/:id/accept', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');
  const status = c.status === 'new' ? 'in_progress' : c.status;
  run("UPDATE complaints SET assigned_to = ?, status = ?, updated_at = datetime('now') WHERE id = ?", [s.user.id, status, c.id]);
  if (status !== c.status) logUpdate(c.id, s.user.id, 'status', `تم تغيير الحالة إلى: ${STATUS_LABEL[status]} (استلام الموظف)`);
  logUpdate(c.id, s.user.id, 'accepted', `استلم الشكوى وأصبح المسؤول عنها: ${s.user.name}`);
  notify(c.student_id, 'موظف استلم شكواك', `${c.ticket_no} — ${s.user.name} بقى المسؤول عنها الآن`, 'complaint', c.id);
  ok(res, { complaint: loadComplaint(c.id) });
});

route('POST', '/api/complaints/:id/messages', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  const { body, is_internal } = await parseJson(req);
  if (!body || String(body).trim().length < 2) return fail(res, 400, 'الرسالة قصيرة جدًا');
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'لا تملك صلاحية');
  const internal = !!is_internal;
  if (internal && s.user.role === 'student') return fail(res, 403, 'الطالب لا يضيف ملاحظات داخلية');
  run('INSERT INTO messages(complaint_id, sender_id, body, is_internal) VALUES (?,?,?,?)', [c.id, s.user.id, String(body).trim(), internal ? 1 : 0]);
  run('UPDATE complaints SET updated_at = datetime(\'now\') WHERE id = ?', [c.id]);
  if (!internal) {
    if (s.user.role === 'student') {
      const targets = c.assigned_to ? [c.assigned_to] : q('SELECT id FROM users WHERE role=\'staff\' AND department_id = ? AND active = 1', [c.department_id]).map(r => r.id);
      for (const t of targets) notify(t, 'رسالة جديدة من الطالب', `${c.ticket_no} — ${String(body).trim().slice(0, 80)}`, 'complaint', c.id);
    } else {
      notify(c.student_id, 'رد جديد على شكواك', `${c.ticket_no} — ${String(body).trim().slice(0, 80)}`, 'complaint', c.id);
    }
  }
  ok(res, { ok: true });
});

route('POST', '/api/complaints/:id/request-info', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const { message } = await parseJson(req);
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');
  const body = String(message || 'برجاء تزويدنا بمعلومات إضافية عن الطلب').trim();
  run('INSERT INTO messages(complaint_id, sender_id, body, is_internal) VALUES (?,?,?,0)', [c.id, s.user.id, `📌 طلب معلومات إضافية: ${body}`]);
  logUpdate(c.id, s.user.id, 'request_info', body);
  notify(c.student_id, 'الإدارة طلبت معلومات إضافية', `${c.ticket_no} — ${body.slice(0, 100)}`, 'complaint', c.id);
  ok(res, { ok: true });
});

route('POST', '/api/complaints/:id/rate', async (req, res, p) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const { rating, comment } = await parseJson(req);
  const r = Number(rating);
  if (!(r >= 1 && r <= 5)) return fail(res, 400, 'التقييم من 1 إلى 5');
  const c = one('SELECT * FROM complaints WHERE id = ? AND student_id = ?', [p.id, s.user.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (c.status !== 'resolved') return fail(res, 400, 'لا يمكن التقييم قبل الحل');
  if (c.rating) return fail(res, 409, 'تم تقييم هذه الشكوى من قبل — أي تصحيح يتم عبر الإدارة');
  run('UPDATE complaints SET rating = ?, rating_comment = ? WHERE id = ?', [r, String(comment || '').trim().slice(0, 1000) || null, c.id]);
  ok(res, { complaint: loadComplaint(c.id) });
});

// فحص "اقتراب موعد انتهاء مدة الحل" — يُستدعى مع تحميل الإشعارات
function slaReminderScan() {
  try {
    const open = q(`SELECT c.*, d.sla_hours FROM complaints c JOIN departments d ON d.id = c.department_id WHERE c.status IN ('new','in_progress')`);
    const now = Date.now();
    for (const c of open) {
      const created = new Date(String(c.created_at).replace(' ', 'T') + 'Z').getTime();
      if (isNaN(created)) continue;
      const deadline = created + c.sla_hours * 3600 * 1000;
      const hoursLeft = (deadline - now) / 3600000;
      if (hoursLeft < 12) {
        const already = one(`SELECT id FROM notifications WHERE ref_id = ? AND ref_type = 'complaint' AND title LIKE 'اقتراب موعد%' LIMIT 1`, [c.id]);
        if (already) continue;
        notify(c.student_id, 'اقتراب موعد انتهاء مدة الحل ⏳', `${c.ticket_no} — تبقى أقل من 12 ساعة على موعد الـ SLA لحل شكواك`, 'complaint', c.id);
        const targets = c.assigned_to ? [c.assigned_to] : q('SELECT id FROM users WHERE role = \'staff\' AND department_id = ? AND active = 1', [c.department_id]).map(r => r.id);
        for (const t of targets) notify(t, 'اقتراب موعد انتهاء الـ SLA ⏳', `${c.ticket_no} — سارع بالرد على الطالب`, 'complaint', c.id);
      }
    }
  } catch (e) { console.error('[sla-scan]', e.message); }
}

// ===== Notifications =====
route('GET', '/api/notifications', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  slaReminderScan();
  const url = new URL(req.url, 'http://x');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);
  const unreadOnly = url.searchParams.get('unread') === '1';
  ok(res, q(`SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND read = 0' : ''} ORDER BY created_at DESC LIMIT ?`, [s.user.id, limit]));
});
route('GET', '/api/notifications/count', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  ok(res, { count: one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0', [s.user.id]).c });
});
route('POST', '/api/notifications/:id/read', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [p.id, s.user.id]);
  ok(res, { ok: true });
});
route('POST', '/api/notifications/read-all', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', [s.user.id]);
  ok(res, { ok: true });
});

// ===== AI =====
route('POST', '/api/ai/classify', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const { text } = await parseJson(req);
  if (!text || String(text).trim().length < 5) return fail(res, 400, 'اكتب تفاصيل أكثر للتحليل');
  ok(res, classifyComplaint(text));
});

route('POST', '/api/ai/chat', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const { message, complaint_id } = await parseJson(req);
  const msg = String(message || '').trim();
  if (msg.length < 3) return fail(res, 400, 'اكتب سؤالك');
  run('INSERT INTO ai_conversations(user_id, complaint_id, role, message) VALUES (?,?,\'user\',?)', [s.user.id, complaint_id || null, msg]);
  const { answer, sources, grounded } = answerQuestion(msg);
  run('INSERT INTO ai_conversations(user_id, complaint_id, role, message) VALUES (?,?,\'assistant\',?)', [s.user.id, complaint_id || null, answer]);
  ok(res, { answer, sources, grounded });
});

route('GET', '/api/ai/conversations', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  ok(res, q('SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40', [s.user.id]).reverse());
});

// ===== Stats (role-aware) =====
route('GET', '/api/stats', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const u = s.user;
  if (u.role === 'student') {
    const rows = q('SELECT status, COUNT(*) c FROM complaints WHERE student_id = ? GROUP BY status', [u.id]);
    const by = Object.fromEntries(rows.map(r => [r.status, r.c]));
    const recent = q('SELECT id, ticket_no, title, status, priority, created_at FROM complaints WHERE student_id = ? ORDER BY created_at DESC LIMIT 5', [u.id]);
    ok(res, { total: rows.reduce((a, r) => a + r.c, 0), new: by.new || 0, in_progress: by.in_progress || 0, resolved: by.resolved || 0, rejected: by.rejected || 0, recent });
  } else if (u.role === 'staff') {
    // إحصاءات اللوحة تشمل كل الشكاوى (الكل يراها) + عدد الشكاوى المسندة للموظف شخصيًا
    const mine = one("SELECT COUNT(*) c FROM complaints WHERE assigned_to = ? AND status IN ('new','in_progress')", [u.id]).c;
    const open = one("SELECT COUNT(*) c FROM complaints WHERE status IN ('new','in_progress')").c;
    const resolvedWeek = one("SELECT COUNT(*) c FROM complaints WHERE status='resolved' AND resolved_at >= datetime('now','-7 days')").c;
    const resolvedTotal = one("SELECT COUNT(*) c FROM complaints WHERE status='resolved'").c;
    const avg = one("SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) h FROM complaints WHERE status='resolved' AND resolved_at IS NOT NULL");
    const ratings = one('SELECT AVG(rating) r FROM complaints WHERE rating IS NOT NULL');
    ok(res, { assigned_to_me: mine, open, resolved_week: resolvedWeek, resolved_total: resolvedTotal, avg_resolution_hours: avg && avg.h ? Math.round(avg.h) : 0, satisfaction: ratings && ratings.r ? Math.round(ratings.r * 20) : null });
  } else {
    ok(res, buildInsights());
  }
});

// ===== قائمة الموظفين المتاحين للإسناد/التحويل (مدير وموظفون) =====
route('GET', '/api/users/employees', async (req, res) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const rows = q(`SELECT u.*, d.name AS department_name FROM users u
                  LEFT JOIN departments d ON d.id = u.department_id
                  WHERE u.role IN ('staff','admin') AND u.active = 1
                  ORDER BY u.department_id IS NULL, u.department_id, u.name`);
  ok(res, rows.map(publicUser));
});

// ===== Admin: users / departments / types =====
route('GET', '/api/admin/users', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const url = new URL(req.url, 'http://x');
  const role = url.searchParams.get('role');
  let sql = `SELECT u.*, d.name AS department_name FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE 1=1`;
  const params = [];
  if (role) { sql += ' AND u.role = ?'; params.push(role); }
  sql += ' ORDER BY u.role, u.name';
  ok(res, q(sql, params).map(publicUser));
});
route('POST', '/api/admin/users', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const { name, email, password, role, department_id, phone, student_code } = await parseJson(req);
  if (!name || !email || !password || !role) return fail(res, 400, 'الاسم والبريد وكلمة المرور والدور مطلوبة');
  if (!['student', 'staff', 'admin'].includes(role)) return fail(res, 400, 'دور غير صالح');
  if (String(password).length < 6) return fail(res, 400, 'كلمة المرور 6 أحرف على الأقل');
  if (role === 'staff' && !department_id) return fail(res, 400, 'الموظف لازم يكون له قسم');
  if (one('SELECT id FROM users WHERE email = ?', [String(email).toLowerCase().trim()])) return fail(res, 409, 'البريد مستخدم بالفعل');
  const { salt, hash } = hashPassword(password);
  const info = run('INSERT INTO users(name, email, password_hash, salt, role, department_id, phone, student_code) VALUES (?,?,?,?,?,?,?,?)',
    [name.trim(), String(email).toLowerCase().trim(), hash, salt, role, department_id || null, phone || null, student_code || null]);
  ok(res, publicUser(one('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid])), 201);
});
route('PUT', '/api/admin/users/:id', async (req, res, p) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const target = one('SELECT * FROM users WHERE id = ?', [p.id]);
  if (!target) return fail(res, 404, 'المستخدم غير موجود');
  const { name, email, phone, role, department_id, active, password } = await parseJson(req);
  if (Number(p.id) === s.user.id && active === false) return fail(res, 400, 'لا يمكن إيقاف حسابك الحالي');
  if (target.role === 'admin' && role && role !== 'admin' && one('SELECT COUNT(*) c FROM users WHERE role=\'admin\'').c <= 1) return fail(res, 400, 'لا يمكن إزالة آخر مدير بالنظام');
  run('UPDATE users SET name = COALESCE(?,name), email = COALESCE(?,email), phone = COALESCE(?,phone), role = COALESCE(?,role), department_id = ?, active = COALESCE(?,active) WHERE id = ?',
    [name || null, email ? String(email).toLowerCase().trim() : null, phone ?? null, role || null, department_id === undefined ? target.department_id : (department_id || null), active === undefined ? target.active : (active ? 1 : 0), target.id]);
  if (password && String(password).length >= 6) { const { salt, hash } = hashPassword(password); run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', [hash, salt, target.id]); }
  run('DELETE FROM sessions WHERE user_id = ? AND (SELECT active FROM users WHERE id = ?) = 0', [target.id, target.id]);
  ok(res, publicUser(one('SELECT * FROM users WHERE id = ?', [target.id])));
});
route('DELETE', '/api/admin/users/:id', async (req, res, p) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const target = one('SELECT * FROM users WHERE id = ?', [p.id]);
  if (!target) return fail(res, 404, 'المستخدم غير موجود');
  if (target.id === s.user.id) return fail(res, 400, 'لا يمكن حذف حسابك الحالي');
  if (target.role === 'admin' && one('SELECT COUNT(*) c FROM users WHERE role=\'admin\'').c <= 1) return fail(res, 400, 'لا يمكن حذف آخر مدير بالنظام');
  run('DELETE FROM notifications WHERE user_id = ?', [target.id]);
  run('DELETE FROM sessions WHERE user_id = ?', [target.id]);
  run('UPDATE complaints SET assigned_to = NULL WHERE assigned_to = ?', [target.id]);
  run('DELETE FROM users WHERE id = ?', [target.id]);
  ok(res, { deleted: target.id });
});
route('POST', '/api/admin/departments', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const { name, description, sla_hours } = await parseJson(req);
  if (!name) return fail(res, 400, 'اسم القسم مطلوب');
  const info = run('INSERT INTO departments(name, description, sla_hours) VALUES (?,?,?)', [String(name).trim(), description || null, Number(sla_hours) || 48]);
  ok(res, one('SELECT * FROM departments WHERE id = ?', [info.lastInsertRowid]), 201);
});
route('PUT', '/api/admin/departments/:id', async (req, res, p) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const d = one('SELECT * FROM departments WHERE id = ?', [p.id]);
  if (!d) return fail(res, 404, 'القسم غير موجود');
  const { name, description, sla_hours } = await parseJson(req);
  run('UPDATE departments SET name = COALESCE(?,name), description = COALESCE(?,description), sla_hours = COALESCE(?,sla_hours) WHERE id = ?',
    [name || null, description ?? null, sla_hours ? Number(sla_hours) : null, d.id]);
  ok(res, one('SELECT * FROM departments WHERE id = ?', [d.id]));
});
route('DELETE', '/api/admin/departments/:id', async (req, res, p) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const used = one('SELECT COUNT(*) c FROM complaints WHERE department_id = ?', [p.id]).c;
  if (used > 0) return fail(res, 400, 'لا يمكن حذف قسم عليه شكاوى — انقلها أولًا');
  run('DELETE FROM complaint_types WHERE department_id = ?', [p.id]);
  run('UPDATE users SET department_id = NULL WHERE department_id = ?', [p.id]);
  run('DELETE FROM departments WHERE id = ?', [p.id]);
  ok(res, { deleted: Number(p.id) });
});
route('POST', '/api/admin/complaint-types', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const { name, department_id, keywords } = await parseJson(req);
  if (!name || !department_id) return fail(res, 400, 'الاسم والقسم مطلوبان');
  const info = run('INSERT INTO complaint_types(name, department_id, keywords) VALUES (?,?,?)', [String(name).trim(), Number(department_id), keywords || '']);
  ok(res, one('SELECT * FROM complaint_types WHERE id = ?', [info.lastInsertRowid]), 201);
});
route('DELETE', '/api/admin/complaint-types/:id', async (req, res, p) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  run('UPDATE complaints SET type_id = NULL WHERE type_id = ?', [p.id]);
  run('DELETE FROM complaint_types WHERE id = ?', [p.id]);
  ok(res, { deleted: Number(p.id) });
});

// ===== Admin: insights / AI summary / reports / export =====
route('GET', '/api/admin/insights', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  ok(res, buildInsights());
});
route('POST', '/api/admin/summary', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const { summary, insights, generatedAt } = generateSummary();
  const info = run('INSERT INTO reports(admin_id, title, summary, period) VALUES (?,?,?,?)', [s.user.id, `ملخص ذكي — ${generatedAt}`, summary, generatedAt]);
  ok(res, { id: info.lastInsertRowid, summary, insights, generatedAt });
});
route('GET', '/api/admin/reports', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  ok(res, q('SELECT r.*, u.name AS admin_name FROM reports r LEFT JOIN users u ON u.id = r.admin_id ORDER BY r.created_at DESC LIMIT 20'));
});
route('GET', '/api/admin/reports.csv', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const url = new URL(req.url, 'http://x');
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  let sql = `SELECT c.ticket_no, st.name AS student, d.name AS department, ct.name AS type, c.title, c.priority, c.status, c.created_at, c.resolved_at
             FROM complaints c JOIN departments d ON d.id = c.department_id JOIN users st ON st.id = c.student_id LEFT JOIN complaint_types ct ON ct.id = c.type_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND c.created_at >= ?'; params.push(`${from} 00:00:00`); }
  if (to) { sql += ' AND c.created_at <= ?'; params.push(`${to} 23:59:59`); }
  sql += ' ORDER BY c.created_at DESC';
  const rows = q(sql, params);
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['رقم الشكوى', 'اسم الطالب', 'القسم', 'نوع الشكوى', 'العنوان', 'الأولوية', 'الحالة', 'تاريخ الإنشاء', 'تاريخ الحل'];
  const csv = '\uFEFF' + [head.map(esc).join(',')].concat(rows.map(r => [r.ticket_no, r.student, r.department, r.type, r.title, r.priority, STATUS_LABEL[r.status] || r.status, r.created_at, r.resolved_at || ''].map(esc).join(','))).join('\r\n');
  send(res, 200, Buffer.from(csv, 'utf8'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nexus-ai-report.csv"' });
});

// =====================================================
//  الخدمات الأكاديمية + QR + أولوية يدوية + رضا الطلاب
// =====================================================

// الجدول الأسبوعي (للجميع — بيانات الدفعة)
route('GET', '/api/academic/timetable', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  ok(res, q('SELECT * FROM timetable ORDER BY CASE day WHEN \'السبت\' THEN 1 WHEN \'الأحد\' THEN 2 WHEN \'الاثنين\' THEN 3 WHEN \'الثلاثاء\' THEN 4 WHEN \'الأربعاء\' THEN 5 WHEN \'الخميس\' THEN 6 ELSE 7 END, start_time'));
});

// الامتحانات القادمة + الوقت المتبقي
route('GET', '/api/academic/exams', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const rows = q(`SELECT * FROM exams WHERE exam_date >= datetime('now', '-1 day') ORDER BY exam_date ASC LIMIT 20`);
  ok(res, rows.map(r => ({ ...r, seconds_until: Math.max(0, Math.floor((new Date(String(r.exam_date).replace(' ', 'T') + 'Z') - Date.now()) / 1000)) })));
});

// الدرجات + المعدل + GPA (ملف الطالب فقط)
route('GET', '/api/academic/grades', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const rows = q('SELECT * FROM grades WHERE student_id = ? ORDER BY score DESC', [s.user.id]);
  const totalHours = rows.reduce((a, r) => a + r.credit_hours, 0);
  const weighted = rows.reduce((a, r) => a + r.score * r.credit_hours, 0);
  const mean = rows.length ? weighted / Math.max(1e-9, totalHours) : 0;
  const gpa = rows.length ? Math.round((mean / 100 * 4) * 100) / 100 : 0;
  const gradeOf = score => score >= 85 ? 'ممتاز' : score >= 75 ? 'جيد جدًا' : score >= 65 ? 'جيد' : score >= 50 ? 'مقبول' : 'راسب';
  ok(res, { grades: rows.map(r => ({ ...r, grade: gradeOf(r.score) })), mean: Math.round(mean * 10) / 10, gpa, totalCredits: totalHours, count: rows.length });
});

// المصروفات (ملف الطالب فقط)
route('GET', '/api/academic/fees', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const rows = q('SELECT * FROM fees WHERE student_id = ? ORDER BY due_date ASC', [s.user.id]);
  const total = rows.reduce((a, r) => a + r.amount, 0), paid = rows.reduce((a, r) => a + r.paid, 0);
  ok(res, { fees: rows, total, paid, remaining: total - paid, percentPaid: total ? Math.round(paid / total * 100) : 0 });
});

// الحضور والغياب (ملف الطالب فقط)
route('GET', '/api/academic/attendance', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const courses = q('SELECT * FROM attendance_stats WHERE student_id = ?', [s.user.id]);
  const totalA = courses.reduce((a, r) => a + r.attended, 0), totalT = courses.reduce((a, r) => a + r.total, 0);
  const pct = totalT ? Math.round(totalA / totalT * 100) : 0;
  ok(res, { courses: courses.map(c => ({ ...c, pct: c.total ? Math.round(c.attended / c.total * 100) : 0, absences: c.total - c.attended })), overallPct: pct, totalAbsences: totalT - totalA, totalLectures: totalT });
});

// سجل حضور الطالب في جلسات QR
route('GET', '/api/academic/attendance/records', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  ok(res, q(`SELECT r.attended_at, sess.lecture_name, sess.doctor_name FROM attendance_records r JOIN attendance_sessions sess ON sess.id = r.session_id WHERE r.student_id = ? ORDER BY r.attended_at DESC LIMIT 50`, [s.user.id]));
});

// إنشاء جلسة QR (موظف/إدارة)
route('POST', '/api/attendance/sessions', async (req, res) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const { lecture_name, duration_minutes } = await parseJson(req);
  if (!lecture_name || String(lecture_name).trim().length < 3) return fail(res, 400, 'اكتب اسم المحاضرة');
  const dur = Math.min(Math.max(Number(duration_minutes) || 60, 5), 240);
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const info = run(`INSERT INTO attendance_sessions(lecture_name, doctor_name, code, created_by, expires_at, duration_minutes)
                    VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' minutes'), ?)`,
    [String(lecture_name).trim(), s.user.name, code, s.user.id, dur, dur]);
  ok(res, one('SELECT * FROM attendance_sessions WHERE id = ?', [info.lastInsertRowid]), 201);
});

// جلسات QR + عدد الحضور
route('GET', '/api/attendance/sessions', async (req, res) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const rows = s.user.role === 'admin'
    ? q('SELECT * FROM attendance_sessions ORDER BY id DESC LIMIT 50')
    : q('SELECT * FROM attendance_sessions WHERE created_by = ? ORDER BY id DESC LIMIT 50', [s.user.id]);
  ok(res, rows.map(r => ({ ...r, attended: one('SELECT COUNT(*) AS c FROM attendance_records WHERE session_id = ?', [r.id]).c, active: new Date(String(r.expires_at).replace(' ', 'T') + 'Z') > new Date() })));
});

// سجّل حضوري بالكود (طالب)
route('POST', '/api/attendance/mark', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const { code } = await parseJson(req);
  const clean = String(code || '').toUpperCase().trim();
  if (!clean) return fail(res, 400, 'اكتب الكود أولًا');
  const session = one('SELECT * FROM attendance_sessions WHERE code = ?', [clean]);
  if (!session) return fail(res, 404, 'الكود غير صحيح — تأكد منه مع المحاضر');
  const exp = new Date(String(session.expires_at).replace(' ', 'T') + 'Z');
  if (exp <= new Date()) return fail(400, 'انتهت صلاحية هذا الرمز — اطلب من المحاضر رمزًا جديدًا');
  const already = one('SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?', [session.id, s.user.id]);
  if (already) return fail(res, 409, 'تم تسجيل حضورك بالفعل لهذه المحاضرة');
  run('INSERT INTO attendance_records(session_id, student_id) VALUES (?, ?)', [session.id, s.user.id]);
  const total = one('SELECT COUNT(*) AS c FROM attendance_records WHERE session_id = ?', [session.id]).c;
  ok(res, { lecture_name: session.lecture_name, attended_at: new Date().toISOString(), attended_count: total });
});

// تقرير حضور مختصر (موظف/إدارة)
route('GET', '/api/attendance/report', async (req, res) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const today = new Date().toISOString().slice(0, 10);
  const sessionsToday = one(`SELECT COUNT(*) c FROM attendance_sessions WHERE created_at >= ?`, [`${today} 00:00:00`]).c;
  const recordsToday = one(`SELECT COUNT(*) c FROM attendance_records WHERE attended_at >= ?`, [`${today} 00:00:00`]).c;
  const totalRecords = one('SELECT COUNT(*) c FROM attendance_records').c;
  const top = q(`SELECT sess.lecture_name, COUNT(*) c FROM attendance_records r JOIN attendance_sessions sess ON sess.id = r.session_id GROUP BY sess.id ORDER BY c DESC LIMIT 5`);
  ok(res, { sessionsToday, recordsToday, totalRecords, top });
});

// مسح تقييم شكوى — تصحيح بصلاحية الإدارة فقط
route('POST', '/api/admin/complaints/:id/reset-rating', async (req, res, p) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!c.rating) return fail(res, 400, 'لا يوجد تقييم على هذه الشكوى أصلًا');
  run('UPDATE complaints SET rating = NULL, rating_comment = NULL, updated_at = datetime(\'now\') WHERE id = ?', [c.id]);
  logUpdate(c.id, s.user.id, 'rating_reset', `تم مسح تقييم الطالب (كان ${c.rating}/5) بمعرفة الإدارة`);
  ok(res, { complaint: loadComplaint(c.id) });
});

// الأولوية يدويًا (موظف/إدارة)
route('POST', '/api/complaints/:id/priority', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const { priority } = await parseJson(req);
  if (!PRIORITY_VALUES.includes(priority)) return fail(res, 400, 'أولوية غير صالحة');
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');
  run('UPDATE complaints SET priority = ?, updated_at = datetime(\'now\') WHERE id = ?', [priority, c.id]);
  logUpdate(c.id, s.user.id, 'priority', `تم تعديل الأولوية يدويًا إلى: ${priority}`);
  notify(c.student_id, 'تم تحديث أولوية طلبك', `${c.ticket_no} — الأولوية أصبحت ${priority}`, 'complaint', c.id);
  ok(res, { complaint: loadComplaint(c.id) });
});

// ===== تأكيد الطالب على الحل (closure handshake) =====
route('POST', '/api/complaints/:id/confirm', async (req, res, p) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const { decision, reason } = await parseJson(req);
  if (!['confirmed', 'rejected'].includes(decision)) return fail(res, 400, 'القرار غير صالح');
  const c = one('SELECT * FROM complaints WHERE id = ? AND student_id = ?', [p.id, s.user.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (c.status !== 'resolved') return fail(res, 400, 'لا يمكن تأكيد الحل قبل أن يعلّم الموظف المشكلة كمحلولة');
  if (c.closure_status === 'confirmed') return fail(res, 409, 'تم تأكيد الحل بالفعل');
  if (decision === 'confirmed') {
    run('UPDATE complaints SET closure_status = \'confirmed\', internal_resolution = \'confirmed\', updated_at = datetime(\'now\') WHERE id = ?', [c.id]);
    logUpdate(c.id, s.user.id, 'closure_confirmed', 'الطالب أكّد أن مشكلته اتحلت');
    const ids = new Set([c.assigned_to, ...q('SELECT id FROM users WHERE role = \'admin\' AND active = 1').map(r => r.id)].filter(Boolean));
    for (const t of ids) notify(t, 'الطالب أكّد إغلاق الشكوى ✓', `${c.ticket_no} — الطالب أكّد أن مشكلته اتحلت`, 'complaint', c.id);
  } else {
    const note = String(reason || '').trim();
    if (note.length < 5) return fail(res, 400, 'اكتب سبب عدم الحل (5 أحرف+)');
    run('UPDATE complaints SET status = \'in_progress\', closure_status = NULL, resolved_at = NULL, updated_at = datetime(\'now\') WHERE id = ?', [c.id]);
    logUpdate(c.id, s.user.id, 'reopened', `الطالب أكّد أن المشكلة اتحلت لا — السبب: ${note.slice(0, 300)}`);
    const ids = new Set([c.assigned_to, ...q('SELECT id FROM users WHERE role = \'admin\' AND active = 1').map(r => r.id)].filter(Boolean));
    for (const t of ids) notify(t, 'الطالب بيقول المشكلة لسه موجودة ❗', `${c.ticket_no} — السبب: ${note.slice(0, 100)}`, 'complaint', c.id);
  }
  ok(res, { complaint: loadComplaint(c.id) });
});

// ===== الشؤون تطلب تأكيد الحل من الموظف (internal ping) =====
route('POST', '/api/complaints/:id/request-confirmation', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');
  if (c.internal_resolution === 'requested') return fail(res, 409, 'تم طلب تأكيد الحل بالفعل ولم يرد الموظف بعد');
  run('UPDATE complaints SET internal_resolution = \'requested\', internal_resolution_note = NULL, updated_at = datetime(\'now\') WHERE id = ?', [c.id]);
  logUpdate(c.id, s.user.id, 'request_confirmation', 'الشؤون طلبت تأكيد الحل من الموظف المختص');
  run('INSERT INTO messages(complaint_id, sender_id, body, is_internal) VALUES (?,?,?,1)', [c.id, s.user.id, '🔔 الشؤون طلبت تأكيد: هل المشكلة اتحلت فعلًا؟ (رد من داخل الشكوى)']);
  const targets = c.assigned_to ? [c.assigned_to] : q('SELECT id FROM users WHERE role = \'staff\' AND department_id = ? AND active = 1', [c.department_id]).map(r => r.id);
  for (const t of targets) notify(t, '🔔 الشؤون طلبت تأكيد الحل منك', `${c.ticket_no} — هل المشكلة اتحلت فعلًا؟`, 'complaint', c.id);
  ok(res, { complaint: loadComplaint(c.id) });
});

// رد الموظف على طلب الشؤون (تأكيد/نفي الحل)
route('POST', '/api/complaints/:id/employee-confirm', async (req, res, p) => {
  const s = requireRole(req, res, ['staff', 'admin']); if (!s) return;
  const { decision, note } = await parseJson(req);
  if (!['confirmed', 'not_confirmed'].includes(decision)) return fail(res, 400, 'القرار غير صالح');
  const c = one('SELECT * FROM complaints WHERE id = ?', [p.id]);
  if (!c) return fail(res, 404, 'الشكوى غير موجودة');
  if (!canSeeComplaint(s.user, c)) return fail(res, 403, 'ليست ضمن نطاقك');
  const cleanNote = String(note || '').trim().slice(0, 500);
  const confirmed = decision === 'confirmed';
  run('UPDATE complaints SET internal_resolution = ?, internal_resolution_note = ?, updated_at = datetime(\'now\') WHERE id = ?', [confirmed ? 'confirmed' : 'not_confirmed', cleanNote || null, c.id]);
  logUpdate(c.id, s.user.id, confirmed ? 'employee_confirmed' : 'employee_not_confirmed', cleanNote || (confirmed ? 'الموظف أكّد الحل' : 'الموظف بيقول المشكلة لسه موجودة'));
  if (confirmed) {
    notify(c.student_id, 'الموظف أكّد أن المشكلة اتحلت ✅', `${c.ticket_no} — ${cleanNote || 'تم تأكيد الحل من الموظف المختص'}`, 'complaint', c.id);
  }
  for (const a of q('SELECT id FROM users WHERE role = \'admin\' AND active = 1')) notify(a.id, confirmed ? 'الموظف أكّد الحل ✅' : 'الموظف بيقول المشكلة لسه ❗', `${c.ticket_no} — ${cleanNote || (confirmed ? 'لا يحتاج تدخل إضافي' : 'يحتاج متابعة')}`, 'complaint', c.id);
  ok(res, { complaint: loadComplaint(c.id) });
});

// ===== رضا الطلاب (إدارة) =====
route('GET', '/api/admin/satisfaction', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const rated = q('SELECT c.rating, c.rating_comment, d.name AS dept, c.updated_at FROM complaints c JOIN departments d ON d.id = c.department_id WHERE c.rating IS NOT NULL');
  const avg5 = rated.length ? rated.reduce((a, r) => a + r.rating, 0) / rated.length : 0;
  const pct = Math.round(avg5 / 5 * 100);
  const byDeptMap = {};
  for (const r of rated) {
    const d = byDeptMap[r.dept] = byDeptMap[r.dept] || { name: r.dept, sum: 0, count: 0 };
    d.sum += r.rating; d.count++;
  }
  const perDepartment = Object.values(byDeptMap).map(d => ({ name: d.name, avg: Math.round(d.sum / d.count * 10) / 10, pct: Math.round(d.sum / d.count / 5 * 100), count: d.count })).sort((a, b) => b.avg - a.avg);
  const months = {};
  for (const r of rated) { const key = String(r.updated_at).slice(0, 7); const m = months[key] = months[key] || { count: 0, sum: 0 }; m.count++; m.sum += r.rating; }
  const monthly = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([month, v]) => ({ month, avg: Math.round(v.sum / v.count * 10) / 10, count: v.count }));
  const recentComments = q(`SELECT c.rating, c.rating_comment, d.name AS dept, u.name AS student_name FROM complaints c JOIN departments d ON d.id = c.department_id JOIN users u ON u.id = c.student_id WHERE c.rating IS NOT NULL AND c.rating_comment IS NOT NULL ORDER BY c.updated_at DESC LIMIT 8`);
  ok(res, { avg: Math.round(avg5 * 10) / 10, satisfactionPct: pct, total: rated.length, perDepartment, monthly, recentComments, best: perDepartment[0] || null, worst: perDepartment[perDepartment.length - 1] || null });
});

// ===== المستندات الذكية (طالب) =====
route('POST', '/api/documents/save', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const { filename, doc_type, extracted, missing, status } = await parseJson(req);
  if (!filename || !doc_type) return fail(res, 400, 'بيانات المستند غير مكتملة');
  const info = run('INSERT INTO document_analyses(user_id, filename, doc_type, extracted, missing, status) VALUES (?,?,?,?,?,?)',
    [s.user.id, String(filename).slice(0, 200), String(doc_type).slice(0, 80), String(extracted || '').slice(0, 6000), Array.isArray(missing) ? missing.map(m => String(m).slice(0, 80)).slice(0, 20).join('، ') : String(missing || '').slice(0, 500), status === 'complete' ? 'complete' : 'incomplete']);
  ok(res, one('SELECT * FROM document_analyses WHERE id = ?', [info.lastInsertRowid]), 201);
});
route('GET', '/api/documents/my', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  ok(res, q('SELECT * FROM document_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [s.user.id]));
});
route('DELETE', '/api/documents/:id', async (req, res, p) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  run('DELETE FROM document_analyses WHERE id = ? AND user_id = ?', [p.id, s.user.id]);
  ok(res, { deleted: Number(p.id) });
});

// ===== المفقودات والموجودات =====
route('GET', '/api/lost-found', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  const url = new URL(req.url, 'http://x');
  let sql = `SELECT lf.*, u.name AS owner_name FROM lost_found lf JOIN users u ON u.id = lf.student_id WHERE 1=1`;
  const params = [];
  if (url.searchParams.get('type')) { sql += ' AND lf.type = ?'; params.push(url.searchParams.get('type')); }
  if (url.searchParams.get('status')) { sql += ' AND lf.status = ?'; params.push(url.searchParams.get('status')); }
  if (url.searchParams.get('category')) { sql += ' AND lf.category = ?'; params.push(url.searchParams.get('category')); }
  if (url.searchParams.get('q')) { const like = `%${url.searchParams.get('q')}%`; sql += ' AND (lf.title LIKE ? OR lf.description LIKE ? OR lf.location LIKE ?)'; params.push(like, like, like); }
  sql += ` ORDER BY CASE lf.status WHEN 'open' THEN 0 ELSE 1 END, lf.created_at DESC LIMIT 100`;
  ok(res, q(sql, params).map(x => ({ ...x, can_edit: x.student_id === s.user.id || s.user.role !== 'student' })));
});
route('POST', '/api/lost-found', async (req, res) => {
  const s = requireRole(req, res, ['student']); if (!s) return;
  const { type, title, description, category, location, item_date, image } = await parseJson(req);
  if (!['lost', 'found'].includes(type)) return fail(res, 400, 'حدد نوع الإعلان');
  if (!title || String(title).trim().length < 4) return fail(res, 400, 'اكتب عنوانًا واضحًا (4 أحرف+)');
  if (image && !(String(image).startsWith('data:image/') && String(image).length < 3500000) && !String(image).startsWith('/uploads/')) return fail(res, 400, 'الصورة غير صالحة أو أكبر من 2.5MB');
  const info = run('INSERT INTO lost_found(student_id, type, title, description, category, location, item_date, image) VALUES (?,?,?,?,?,?,?,?)',
    [s.user.id, type, String(title).trim(), String(description || '').trim().slice(0, 1500) || null, category || 'أخرى', String(location || '').trim().slice(0, 200) || null, item_date || new Date().toISOString().slice(0, 10), image || null]);
  ok(res, one('SELECT * FROM lost_found WHERE id = ?', [info.lastInsertRowid]), 201);
});
route('PATCH', '/api/lost-found/:id/status', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  const { status } = await parseJson(req);
  if (!['open', 'found', 'returned'].includes(status)) return fail(res, 400, 'حالة غير صالحة');
  const item = one('SELECT * FROM lost_found WHERE id = ?', [p.id]);
  if (!item) return fail(res, 404, 'الإعلان غير موجود');
  if (item.student_id !== s.user.id && s.user.role === 'student') return fail(res, 403, 'يمكنك تعديل إعلاناتك فقط');
  run('UPDATE lost_found SET status = ? WHERE id = ?', [status, item.id]);
  ok(res, one('SELECT * FROM lost_found WHERE id = ?', [item.id]));
});
route('POST', '/api/lost-found/:id/contact', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  const { message } = await parseJson(req);
  if (!message || String(message).trim().length < 3) return fail(res, 400, 'اكتب رسالتك');
  const item = one('SELECT * FROM lost_found WHERE id = ?', [p.id]);
  if (!item) return fail(res, 404, 'الإعلان غير موجود');
  run('INSERT INTO lost_found_contacts(item_id, user_id, message) VALUES (?,?,?)', [item.id, s.user.id, String(message).trim().slice(0, 1000)]);
  if (item.student_id !== s.user.id) notify(item.student_id, `رسالة بخصوص "${item.title.slice(0, 40)}"`, `${s.user.name}: ${String(message).trim().slice(0, 100)}`, 'lostfound', item.id);
  else for (const a of q('SELECT id FROM users WHERE role IN (\'staff\',\'admin\') AND active = 1')) notify(a.id, `تواصل بخصوص إعلان "${item.title.slice(0, 40)}"`, `${s.user.name}: ${String(message).trim().slice(0, 100)}`, 'lostfound', item.id);
  ok(res, { ok: true });
});
route('GET', '/api/lost-found/:id/contacts', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  const item = one('SELECT * FROM lost_found WHERE id = ?', [p.id]);
  if (!item) return fail(res, 404, 'الإعلان غير موجود');
  if (item.student_id !== s.user.id && s.user.role === 'student') return fail(res, 403, 'لا تملك صلاحية');
  ok(res, q('SELECT c.*, u.name AS sender_name, u.role AS sender_role FROM lost_found_contacts c JOIN users u ON u.id = c.user_id WHERE c.item_id = ? ORDER BY c.created_at ASC', [item.id]));
});
route('DELETE', '/api/lost-found/:id', async (req, res, p) => {
  const s = requireAuth(req, res); if (!s) return;
  const item = one('SELECT * FROM lost_found WHERE id = ?', [p.id]);
  if (!item) return fail(res, 404, 'الإعلان غير موجود');
  if (item.student_id !== s.user.id && s.user.role === 'student') return fail(res, 403, 'يمكنك حذف إعلاناتك فقط');
  run('DELETE FROM lost_found WHERE id = ?', [item.id]);
  ok(res, { deleted: item.id });
});

// ===== الإعلانات الجامعية =====
route('GET', '/api/announcements', async (req, res) => {
  const s = requireAuth(req, res); if (!s) return;
  ok(res, q('SELECT a.*, u.name AS admin_name FROM announcements a LEFT JOIN users u ON u.id = a.admin_id ORDER BY a.created_at DESC LIMIT 10'));
});
route('POST', '/api/admin/announcements', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const { title, body } = await parseJson(req);
  if (!title || !body || String(title).trim().length < 4 || String(body).trim().length < 10) return fail(res, 400, 'اكتب عنوان (4+ أحرف) ونص (10+ أحرف)');
  const info = run('INSERT INTO announcements(admin_id, title, body) VALUES (?,?,?)', [s.user.id, String(title).trim(), String(body).trim()]);
  for (const u of q('SELECT id FROM users WHERE active = 1 AND role IN (\'student\',\'staff\')')) notify(u.id, '📢 إعلان جامعي جديد', String(title).trim().slice(0, 120), 'announcement', info.lastInsertRowid);
  ok(res, one('SELECT * FROM announcements WHERE id = ?', [info.lastInsertRowid]), 201);
});
route('DELETE', '/api/admin/announcements/:id', async (req, res, p) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  run('DELETE FROM announcements WHERE id = ?', [p.id]);
  ok(res, { deleted: Number(p.id) });
});

// ===== اسأل الإدارة (AI على بيانات حقيقية) =====
route('POST', '/api/admin/ask', async (req, res) => {
  const s = requireRole(req, res, ['admin']); if (!s) return;
  const { question } = await parseJson(req);
  const qText = String(question || '').trim();
  if (qText.length < 3) return fail(res, 400, 'اكتب السؤال');
  ok(res, adminAsk(qText));
});

// ===== Static files =====
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) return fail(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { ok: false, error: 'الصفحة غير موجودة' });
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || ext === '.css' || ext === '.js' ? 'no-cache' : 'public, max-age=3600' });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    // مرفقات الشكاوى: تتطلب تسجيل دخول + عضوية في الشكوى نفسها
    if (pathname.startsWith('/uploads/')) {
      const session = requireAuth(req, res); if (!session) return;
      const filename = path.basename(pathname);
      const c = one('SELECT * FROM complaints WHERE attachment = ?', [`/uploads/${filename}`]);
      if (!c || !canSeeComplaint(session.user, c)) return fail(res, 403, 'غير مسموح');
      const file = path.join(UPLOADS_DIR, filename);
      return fs.readFile(file, (err, data) => {
        if (err) return fail(res, 404, 'الملف غير موجود');
        send(res, 200, data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      });
    }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return await r.handler(req, res, params);
    }
    if (req.method === 'GET') return serveStatic(req, res, pathname);
    fail(res, 405, 'Method Not Allowed');
  } catch (e) {
    console.error('[error]', e);
    if (!res.headersSent) fail(res, e.statusCode || 500, e.message || 'خطأ داخلي في السيرفر');
  }
});

server.listen(PORT, () => {
  console.log(`NEXUS AI يعمل الآن على http://localhost:${PORT}`);
});
