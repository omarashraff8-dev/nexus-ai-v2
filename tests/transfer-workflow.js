// اختبار كامل workflow التحويل على السيرفر الحقيقي (3010)
const BASE = process.env.BASE || 'http://localhost:3010';
let cookie = '';
let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  OK  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
};
async function req(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, ...(j || {}) };
}
async function login(email, password) {
  cookie = '';
  const r = await req('/api/auth/login', 'POST', { email, password });
  check('login ' + email, r.ok, r.error);
  return r;
}
(async () => {
  console.log('== 1) Student creates a complaint (type 1 -> dept 2) ==');
  await login('student@nexus.edu', 'student123');
  const cr = await req('/api/complaints', 'POST', {
    title: 'اختبار تحويل شكوى إلى موظف مختص',
    details: 'هذه شكوى اختبار للتأكد من أن المدير وكل الموظفين يرون الشكوى، ويمكن لأي موظف تحويلها لموظف آخر مع ملاحظة داخلية.',
    type_id: 1, department_id: 2, priority: 'high',
  });
  check('complaint created', cr.ok, cr.error);
  const id = cr.data.complaint.id, ticket = cr.data.complaint.ticket_no;
  console.log('  ticket:', ticket, 'id:', id);

  console.log('== 2) All staff see the complaint ==');
  for (const [email, passw] of [['staff@nexus.edu','staff123'], ['staff-reg@nexus.edu','staff123'], ['staff-it@nexus.edu','staff123'], ['staff-exams@nexus.edu','staff123'], ['admin@nexus.edu','admin123']]) {
    await login(email, passw);
    const list = await req('/api/complaints');
    check(email + ' sees new complaint', list.ok && list.data.some(c => c.id === id), list.error);
  }

  console.log('== 3) Employees list available to staff ==');
  await login('staff@nexus.edu', 'staff123');
  const emps = await req('/api/users/employees');
  check('employee list ok', emps.ok && emps.data.length >= 5, emps.error);
  check('list includes IT staff', emps.ok && emps.data.some(u => u.email === 'staff-it@nexus.edu'));
  const staffNexus = emps.data.find(u => u.email === 'staff@nexus.edu');
  const staffIt = emps.data.find(u => u.email === 'staff-it@nexus.edu');
  const staffExams = emps.data.find(u => u.email === 'staff-exams@nexus.edu');

  console.log('== 4) Staff transfers complaint to IT with internal reason ==');
  const tr = await req(`/api/complaints/${id}/transfer`, 'POST', {
    department_id: staffIt.department_id, assigned_to: staffIt.id, reason: 'المشكلة تقنية في المنصة — يرجى فتح تذكرة دعم وإبلاغ الطالب',
  });
  check('transfer ok', tr.ok, tr.error);
  check('transfer record structured', tr.ok && tr.data.transfer.from_user_id === staffNexus.id && tr.data.transfer.to_user_id === staffIt.id && tr.data.transfer.previous_assigned_to === null && !!tr.data.transfer.reason, tr.data && tr.data.transfer);
  check('complaint assigned to IT', tr.ok && tr.data.complaint.assigned_to === staffIt.id);
  const detail = await req(`/api/complaints/${id}`);
  check('transfer in detail history', detail.ok && detail.data.transfers.length === 1, detail.data && detail.data.transfers);
  check('reason NOT in public updates', detail.ok && !detail.data.updates.some(u => String(u.details || '').includes('تذكرة دعم')));

  console.log('== 5) Receiving employee notified ==');
  await login('staff-it@nexus.edu', 'staff123');
  const notifs = await req('/api/notifications?limit=100');
  check('IT employee got transfer notification', notifs.ok && notifs.data.some(n => n.ref_id === id && n.title.includes('تحويل شكوى إليك')), notifs.data && notifs.data.slice(0,3));

  console.log('== 6) Employee accepts, replies, resolves ==');
  const acc = await req(`/api/complaints/${id}/accept`, 'POST', {});
  check('accept ok + status in_progress', acc.ok && acc.data.complaint.status === 'in_progress' && acc.data.complaint.assigned_to === staffIt.id, acc.error || acc.data);
  const msg = await req(`/api/complaints/${id}/messages`, 'POST', { body: 'تم فتح تذكرة الدعم رقم 458 وسنرد عليك خلال ساعتين.', is_internal: false });
  check('reply ok', msg.ok, msg.error);
  const st = await req(`/api/complaints/${id}/status`, 'POST', { status: 'resolved' });
  check('resolve ok', st.ok && st.data.complaint.status === 'resolved', st.error);

  console.log('== 7) Re-transfer to exams ==');
  const tr2 = await req(`/api/complaints/${id}/transfer`, 'POST', {
    department_id: staffExams.department_id, assigned_to: staffExams.id, reason: 'بعد المراجعة تبين أنها مسألة رصد درجات — حولت للامتحانات',
  });
  check('second transfer ok', tr2.ok, tr2.error);
  const detail2 = await req(`/api/complaints/${id}`);
  check('history has 2 transfers with previous assignee', detail2.ok && detail2.data.transfers.length === 2 && detail2.data.transfers[1].previous_assigned_to === staffIt.id, detail2.data && detail2.data.transfers);

  console.log('== 8) Admin monitors everything ==');
  await login('admin@nexus.edu', 'admin123');
  const aList = await req('/api/complaints');
  check('admin sees complaint', aList.ok && aList.data.some(c => c.id === id));
  const aDetail = await req(`/api/complaints/${id}`);
  check('admin sees full transfer history + messages + updates', aDetail.ok && aDetail.data.transfers.length === 2 && aDetail.data.messages.length >= 1 && aDetail.data.updates.length >= 4, aDetail.data && { t: aDetail.data.transfers.length, m: aDetail.data.messages.length, u: aDetail.data.updates.length });

  console.log('== 9) Student tracks and sees final response ==');
  await login('student@nexus.edu', 'student123');
  const sDetail = await req(`/api/complaints/${id}`);
  check('student sees complaint + messages', sDetail.ok && sDetail.data.messages.some(m => m.body.includes('تذكرة الدعم')));
  check('student sees transfer events but not internal reason', sDetail.ok && sDetail.data.updates.some(u => u.action === 'transfer') && !sDetail.data.updates.some(u => String(u.details || '').includes('رصد درجات')), sDetail.data && sDetail.data.updates);
  check('student sees current responsible', sDetail.ok && sDetail.data.complaint.assigned_name === staffExams.name, sDetail.data && sDetail.data.complaint.assigned_name);

  console.log('== 10) Cleanup test data ==');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('data/nexus.db');
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('DELETE FROM notifications WHERE ref_type = ? AND ref_id = ?').run('complaint', id);
  db.prepare('DELETE FROM complaints WHERE id = ?').run(id);
  const left = db.prepare('SELECT COUNT(*) c FROM complaints WHERE id = ?').get(id).c;
  db.close();
  check('test complaint removed', left === 0, left);

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
