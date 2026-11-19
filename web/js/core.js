// NEXUS AI — مشترك بين كل الصفحات
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

async function api(url, options = {}) {
  const opts = { credentials: 'same-origin', headers: {}, ...options };
  if (options.body && typeof options.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  if (window.NEXUS_STATIC) return window.nexusLocalApi(url, opts);
  const res = await fetch(url, opts);
  let json = null;
  try { json = await res.json(); } catch { json = { ok: false, error: 'استجابة غير صالحة من السيرفر' }; }
  return { status: res.status, ...json };
}

function toast(msg, type = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3600);
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(String(str).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return str;
  return d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDay(str) {
  if (!str) return '—';
  const d = new Date(String(str).replace(' ', 'T') + 'Z');
  return isNaN(d) ? str : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

const STATUS = { new: 'جديدة', in_progress: 'قيد المراجعة', resolved: 'تم الحل', rejected: 'مرفوضة' };
const PRIORITY = { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة', urgent: 'عاجلة', critical: 'حرجة' };
const statusBadge = s => `<span class="badge ${s}">${STATUS[s] || s}</span>`;
const priorityBadge = p => `<span class="priority ${p}">${PRIORITY[p] || p}</span>`;

const ROLE_HOME = { student: 'student.html', staff: 'staff.html', admin: 'admin.html' };

// ============================================================
//  تايم لاين الشكوى — 7 مراحل مشتقة من بيانات حقيقية
// ============================================================
function buildTimelineSteps(complaint, updates) {
  const byAction = (a) => (updates || []).filter(u => u.action === a);
  const firstStatus = byAction('status')[0] || null;
  const firstAssign = byAction('assigned')[0] || null;
  const firstTransfer = byAction('transfer')[0] || null;
  const now = new Date();
  const created = complaint.created_at ? new Date(String(complaint.created_at).replace(' ', 'T') + 'Z') : null;
  const assignedAt = firstAssign ? new Date(String(firstAssign.created_at).replace(' ', 'T') + 'Z') : (complaint.assigned_to ? created : null);
  const inProgressAt = firstStatus ? new Date(String(firstStatus.created_at).replace(' ', 'T') + 'Z') : null;
  const resolvedAt = complaint.resolved_at ? new Date(String(complaint.resolved_at).replace(' ', 'T') + 'Z') : null;
  const closureLog = (updates || []).find(u => u.action === 'closure_confirmed');
  const closureAt = closureLog ? new Date(String(closureLog.created_at).replace(' ', 'T') + 'Z') : (complaint.rating ? (complaint.updated_at ? new Date(String(complaint.updated_at).replace(' ', 'T') + 'Z') : resolvedAt) : null);
  const closureDone = complaint.closure_status === 'confirmed' || !!complaint.rating;
  const rejected = complaint.status === 'rejected';
  const fmt = d => d ? d.toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  return [
    { label: 'تم الإرسال', time: created, state: 'done' },
    { label: 'تم الاستلام', time: assignedAt, state: assignedAt ? 'done' : 'pending' },
    { label: 'قيد المراجعة', time: inProgressAt || (complaint.status !== 'new' ? created : null), state: complaint.status === 'new' ? 'pending' : (complaint.status === 'in_progress' ? 'current' : 'done') },
    { label: 'التحويل لقسم', time: firstTransfer ? new Date(String(firstTransfer.created_at).replace(' ', 'T') + 'Z') : null, state: firstTransfer ? 'done' : 'skipped' },
    { label: rejected ? 'تم الرفض' : 'قيد المعالجة', time: inProgressAt, state: complaint.status === 'in_progress' ? 'current' : (complaint.status === 'resolved' ? 'done' : rejected ? 'rejected' : 'pending') },
    { label: 'تم الحل', time: resolvedAt, state: complaint.status === 'resolved' ? (closureDone ? 'done' : 'current') : 'pending' },
    { label: 'الإغلاق (تأكيد)', time: closureAt, state: closureDone ? 'done' : (complaint.status === 'resolved' ? 'current' : 'pending') },
  ].map(s => ({ ...s, timeText: s.state === 'pending' ? 'لم تتم' : s.time ? fmt(s.time) : '—' }));
}

function renderStepper(container, complaint, updates) {

  if (!container) return;
  const steps = buildTimelineSteps(complaint, updates);
  container.innerHTML = steps.map(s => `
    <div class="step ${s.state}" title="${escapeHtml(s.label)} — ${escapeHtml(s.timeText)}">
      <div class="step-dot">${s.state === 'done' ? '✓' : s.state === 'current' ? '●' : s.state === 'rejected' ? '✕' : '○'}</div>
      <div class="step-label">${escapeHtml(s.label)}</div>
      <div class="step-time">${escapeHtml(s.timeText)}</div>
    </div>`).join('');
}

// شارة «بانتظار تأكيد الطالب / مُغلقة / الموظف أكّد» للقوائم
function closureTag(c) {
  if (!c) return '';
  if (c.status === 'resolved' && c.closure_status === 'confirmed') return '<span class="badge resolved" style="font-size:.64rem">مُغلقة ✓</span>';
  if (c.status === 'resolved' && c.internal_resolution === 'confirmed') return '<span class="badge resolved" style="font-size:.64rem">الموظف أكّد</span>';
  if (c.internal_resolution === 'requested') return '<span class="badge in_progress" style="font-size:.64rem">⌛ الشؤون طلبت تأكيد</span>';
  if (c.internal_resolution === 'not_confirmed') return '<span class="badge rejected" style="font-size:.64rem">الموظف: لسه</span>';
  if (c.status === 'resolved') return '<span class="badge new" style="font-size:.64rem">بانتظار تأكيد الطالب</span>';
  return '';
}

// حارس الصفحة: يتأكد من تسجيل الدخول والدور، ويرجع بيانات المستخدم
async function requireRolePage(expectedRole) {
  const r = await api('/api/auth/me');
  if (!r.ok) { window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname); return null; }
  const user = r.data.user;
  if (expectedRole && user.role !== expectedRole) { window.location.href = ROLE_HOME[user.role] || 'login.html'; return null; }
  return user;
}

// تهيئة الهيكل المشترك: الرابط النشط، عداد الإشعارات، تسجيل الخروج، زر القائمة
function initShell(opts = {}) {
  const { active, onOpenComplaint } = opts;
  if (active) $$('.side-link').forEach(a => a.classList.toggle('active', a.dataset.section === active));

  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.href = 'login.html'; });

  // Sidebar — centralized in sidebar.js (single controller for all portals)
  const closeMobileSidebar = () => window.NexusSidebar && window.NexusSidebar.close();
  // تبديل أقسام الصفحة (SPA-lite)
  $$('[data-section]').forEach(link => {
    if (!link.classList.contains('side-link')) return;
    link.addEventListener('click', () => {
      const target = link.dataset.section;
      $$('.page-section').forEach(sec => sec.classList.toggle('active', sec.id === 'section-' + target));
      $$('.side-link').forEach(a => a.classList.toggle('active', a === link));
      const title = $('#topbarTitle'); if (title && link.dataset.title) title.textContent = link.dataset.title;
      window.dispatchEvent(new CustomEvent('nexus:section-shown', { detail: { section: target } }));
    });
  });

  // الجرس + القائمة المنسدلة
  const bell = $('#bellBtn');
  const dropdown = $('#notifDropdown');
  async function refreshBadge() {
    const r = await api('/api/notifications/count');
    const badge = $('#bellBadge');
    if (badge && r.ok) { badge.textContent = r.data.count; badge.style.display = r.data.count > 0 ? 'grid' : 'none'; }
  }
  window.refreshNotifBadge = refreshBadge;
  refreshBadge();
  setInterval(refreshBadge, 30000);

  if (bell && dropdown) {
    bell.addEventListener('click', async () => {
      const opening = dropdown.style.display !== 'block';
      dropdown.style.display = opening ? 'block' : 'none';
      if (opening) {
        dropdown.innerHTML = '<div style="padding:.8rem;text-align:center;color:var(--muted);font-size:.8rem">جارِ التحميل...</div>';
        const r = await api('/api/notifications?limit=6');
        if (r.ok && r.data.length) {
          dropdown.innerHTML = r.data.map(n => `<button class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-ref="${n.ref_id || ''}" data-type="${n.ref_type || ''}" style="width:100%;text-align:start;background:none;border:none;cursor:pointer"><span style="font-size:1.05rem;flex:0 0 auto">${({ complaint: '🎫', announcement: '📢', lostfound: '🧳' }[n.ref_type] || '🔔')}</span><div><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body || '')}</p></div><time>${fmtDay(n.created_at)}</time></button>`).join('') + '<div style="display:flex;gap:.4rem;padding:.4rem"><button id="markAllRead" class="btn btn-outline btn-sm" style="flex:1">تعليم الكل كمقروء</button><button id="viewAllNotifs" class="btn btn-primary btn-sm" style="flex:1">عرض الكل ←</button></div>';
          $('#markAllRead').addEventListener('click', async () => { await api('/api/notifications/read-all', { method: 'POST' }); refreshBadge(); dropdown.style.display = 'none'; toast('تم تعليم كل الإشعارات كمقروءة'); });
          $('#viewAllNotifs').addEventListener('click', () => { dropdown.style.display = 'none'; const link = document.querySelector('.side-link[data-section="notifs"]'); if (link) link.click(); });
        } else {
          dropdown.innerHTML = '<div style="padding:.8rem;text-align:center;color:var(--muted);font-size:.8rem">لا توجد إشعارات بعد</div>';
        }
        dropdown.addEventListener('click', async e => {
          const item = e.target.closest('.notif-item'); if (!item) return;
          await api(`/api/notifications/${item.dataset.id}/read`, { method: 'POST' });
          if (item.dataset.type === 'complaint' && item.dataset.ref && onOpenComplaint) onOpenComplaint(Number(item.dataset.ref));
          dropdown.style.display = 'none'; refreshBadge();
        }, { once: true });
      }
    });
    document.addEventListener('click', e => { if (!e.target.closest('#bellBtn') && !e.target.closest('#notifDropdown')) dropdown.style.display = 'none'; });
  }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// نجوم التقييم
function renderStars(rating, container) {
  if (!container) return;
  let html = '';
  for (let i = 1; i <= 5; i++) html += `<button class="star-btn ${i <= (rating || 0) ? 'filled' : ''}" data-star="${i}" aria-label="${i} نجوم">★</button>`;
  container.innerHTML = html;
}

// شارة دور المستخدم بالعربية
function roleName(role) { return { student: 'طالب', staff: 'موظف', admin: 'إدارة المعهد' }[role] || role; }

// ============================================================
//  نافذة تحويل الشكوى — مشتركة بين المدير والموظفين
//  تختار القسم + الموظف المسؤول + ملاحظة داخلية، وتسجّل سجل تحويل كامل
// ============================================================
window.NexusTransfer = (function () {
  let overlay = null;

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'nexusTransferModal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-head"><h3 id="ntTitle">تحويل الشكوى لموظف مختص</h3><button class="icon-btn" data-x aria-label="إغلاق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
        <div class="modal-body">
          <p id="ntInfo" style="font-size:.85rem;color:var(--muted);margin-bottom:.7rem"></p>
          <label style="display:block;font-size:.78rem;font-weight:800;margin-bottom:.3rem">القسم (اختياري — يتبع الموظف تلقائيًا)</label>
          <select id="ntDept" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:.55rem .65rem;font-size:.88rem;margin-bottom:.7rem"><option value="">جارِ التحميل...</option></select>
          <label style="display:block;font-size:.78rem;font-weight:800;margin-bottom:.3rem">الموظف المسؤول عن الحل *</label>
          <select id="ntEmployee" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:.55rem .65rem;font-size:.88rem;margin-bottom:.7rem"><option value="">جارِ التحميل...</option></select>
          <label style="display:block;font-size:.78rem;font-weight:800;margin-bottom:.3rem">ملاحظة داخلية — سبب التحويل / المطلوب من الموظف</label>
          <textarea id="ntReason" rows="3" placeholder="اكتب سبب التحويل أو الإجراء المطلوب (لا يظهر للطالب)" style="width:100%;border:1.5px solid var(--line);border-radius:10px;padding:.55rem .65rem;font-size:.88rem;resize:vertical"></textarea>
          <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.9rem">
            <button class="btn btn-outline" data-cancel>إلغاء</button>
            <button class="btn btn-primary" data-confirm>↩ تحويل الشكوى</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-x],[data-cancel]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    overlay.querySelector('[data-confirm]').addEventListener('click', confirm);
    overlay.querySelector('#ntDept').addEventListener('change', fillEmployees);
    return overlay;
  }

  let state = { id: null, employees: [], onDone: null };

  function close() { if (overlay) overlay.classList.remove('open'); }

  function fillEmployees() {
    const dept = Number(overlay.querySelector('#ntDept').value) || null;
    const sel = overlay.querySelector('#ntEmployee');
    const list = state.employees.filter(u => !dept || u.department_id === dept);
    sel.innerHTML = list.length
      ? list.map(u => `<option value="${u.id}">${escapeHtml(u.name)} — ${escapeHtml(u.department_name || 'إدارة')}</option>`).join('')
      : '<option value="">لا يوجد موظفون في هذا القسم — اختر قسمًا آخر</option>';
  }

  async function confirm() {
    const emp = Number(overlay.querySelector('#ntEmployee').value);
    if (!emp) { toast('اختر الموظف المسؤول عن الحل', 'err'); return; }
    const btn = overlay.querySelector('[data-confirm]');
    btn.disabled = true; btn.textContent = 'جارِ التحويل...';
    const r = await api(`/api/complaints/${state.id}/transfer`, {
      method: 'POST',
      body: {
        department_id: Number(overlay.querySelector('#ntDept').value) || null,
        assigned_to: emp,
        reason: overlay.querySelector('#ntReason').value.trim(),
      },
    });
    btn.disabled = false; btn.textContent = '↩ تحويل الشكوى';
    if (!r.ok) { toast(r.error || 'تعذر تحويل الشكوى', 'err'); return; }
    close();
    toast('تم تحويل الشكوى وإشعار الموظف المختص ✓');
    if (typeof state.onDone === 'function') state.onDone(r.data);
  }

  return {
    async open(complaintId, ticketNo, onDone) {
      const el = ensure();
      state = { id: complaintId, employees: [], onDone };
      el.classList.add('open');
      el.querySelector('#ntInfo').textContent = ticketNo ? `الشكوى ${ticketNo} — اختر الموظف الأقدر على حل المشكلة.` : 'اختر الموظف الأقدر على حل المشكلة.';
      el.querySelector('#ntReason').value = '';
      const dept = el.querySelector('#ntDept');
      const emp = el.querySelector('#ntEmployee');
      dept.innerHTML = '<option value="">كل الأقسام</option><option value="">جارِ التحميل...</option>';
      emp.innerHTML = '<option value="">جارِ التحميل...</option>';
      const [dr, ur] = await Promise.all([api('/api/departments'), api('/api/users/employees')]);
      if (!el.classList.contains('open')) return;
      dept.innerHTML = '<option value="">كل الأقسام</option>' + (dr.ok ? dr.data.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('') : '');
      state.employees = ur.ok ? ur.data : [];
      fillEmployees();
    },
    close,
  };
})();
