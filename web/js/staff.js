// NEXUS AI — Staff dashboard logic
let currentUser = null;
let currentComplaintId = null;
let searchTimer = null;

(async function init() {
  currentUser = await requireRolePage('staff');
  if (!currentUser) return;

  $('#userName').textContent = currentUser.name;
  $('#userAvatar').textContent = (currentUser.name || 'م').trim()[0];
  $('#userRole').textContent = 'موظف · ' + (currentUser.department_name || '');
  $('#deptSub').textContent = (currentUser.department_name || 'القسم') + ' — NEXUS AI';

  initShell({ active: 'dashboard', onOpenComplaint: openComplaint });
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => $(`.side-link[data-section="${b.dataset.goto}"]`)?.click()));
  window.addEventListener('nexus:section-shown', e => {
    const s = e.detail.section;
    if (s === 'complaints') loadComplaints();
    if (s === 'notifs') loadNotifications();
    if (s === 'dashboard') loadStats();
    if (s === 'attendance') loadSessions();
    if (s === 'lostfound') loadStaffLostFound();
  });

  await Promise.all([loadStats(), loadUrgent(), loadTransferDepartments()]);
})();

// ---------- الرئيسية ----------
async function loadStats() {
  const r = await api('/api/stats');
  if (!r.ok) return;
  $('#stAssigned').textContent = r.data.assigned_to_me;
  $('#stOpen').textContent = r.data.open;
  $('#stResolvedWeek').textContent = r.data.resolved_week;
  $('#stResolvedTotal').textContent = r.data.resolved_total;
  $('#stAvgHours').textContent = r.data.avg_resolution_hours;
  $('#stSatisfaction').textContent = r.data.satisfaction !== null ? r.data.satisfaction + '%' : 'لسه مفيش تقييمات';
  const badge = $('#openBadge');
  badge.textContent = r.data.open; badge.style.display = r.data.open > 0 ? 'grid' : 'none';
}

async function loadUrgent() {
  const box = $('#urgentList');
  const r = await api('/api/complaints?status=new');
  const r2 = await api('/api/complaints?priority=urgent&status=in_progress');
  const urgent = [...(r.ok ? r.data : []).filter(c => c.priority === 'urgent' || c.priority === 'high'),
                  ...(r2.ok ? r2.data : [])].slice(0, 6);
  if (!urgent.length) { box.innerHTML = '<p style="color:var(--muted);font-size:.85rem;text-align:center;padding:.8rem">مفيش شكاوى عاجلة دلوقتي 🙌</p>'; return; }
  box.innerHTML = urgent.map(c => `
    <button class="complaint-item" style="width:100%;text-align:start;border-color:#FECACA" data-open="${c.id}">
      <span style="min-width:0"><span class="ticket-no">${escapeHtml(c.ticket_no)}</span><br><b>${escapeHtml(c.title)}</b><br><span style="font-size:.72rem;color:var(--muted)">${escapeHtml(c.student_name)} · ${fmtDay(c.created_at)}</span></span>
      ${priorityBadge(c.priority)}
    </button>`).join('');
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openComplaint(Number(b.dataset.open))));
}

// ---------- جدول الشكاوى ----------
function currentFilters() {
  const params = new URLSearchParams();
  if ($('#fSearch').value.trim()) params.set('q', $('#fSearch').value.trim());
  if ($('#fStatus').value) params.set('status', $('#fStatus').value);
  if ($('#fPriority').value) params.set('priority', $('#fPriority').value);
  return params.toString();
}
async function loadComplaints() {
  const tbody = $('#complaintsTableBody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">جارِ التحميل...</td></tr>';
  const qs = currentFilters();
  const r = await api('/api/complaints' + (qs ? '?' + qs : ''));
  if (!r.ok) { tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger)">${escapeHtml(r.error)}</td></tr>`; return; }
  $('#resultCount').textContent = `${r.data.length} شكوى`;
  if (!r.data.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem">لا توجد شكاوى بهذه الفلاتر.</td></tr>'; return; }
  tbody.innerHTML = r.data.map(c => `
    <tr>
      <td><span class="ticket-no">${escapeHtml(c.ticket_no)}</span></td>
      <td><b style="font-size:.82rem">${escapeHtml(c.student_name)}</b><br><span style="font-size:.68rem;color:var(--muted)" dir="ltr">${escapeHtml(c.student_code || '')}</span></td>
      <td style="max-width:280px"><b style="font-size:.83rem">${escapeHtml(c.title.slice(0, 70))}${c.title.length > 70 ? '…' : ''}</b><br><span style="font-size:.68rem;color:var(--muted)">${escapeHtml(c.type_name || '—')}</span></td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${statusBadge(c.status)} ${closureTag(c)}</td>
      <td style="white-space:nowrap;font-size:.76rem">${fmtDay(c.created_at)}</td>
      <td><button class="btn btn-primary btn-sm" data-open="${c.id}">فتح</button></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openComplaint(Number(b.dataset.open))));
}
$('#fSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadComplaints, 300); });
$('#fStatus').addEventListener('change', loadComplaints);
$('#fPriority').addEventListener('change', loadComplaints);
$('#clearFilters').addEventListener('click', () => { $('#fSearch').value = ''; $('#fStatus').value = ''; $('#fPriority').value = ''; loadComplaints(); });

// ---------- المودال ----------
const modal = $('#complaintModal');
$('#closeModalBtn').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function closeModal() { modal.classList.remove('open'); currentComplaintId = null; }

async function openComplaint(id) {
  currentComplaintId = id;
  modal.classList.add('open');
  $('#modalHeadInfo').innerHTML = '<p style="color:var(--muted);font-size:.85rem">جارِ التحميل...</p>';
  const r = await api(`/api/complaints/${id}`);
  if (!r.ok) { toast(r.error, 'err'); closeModal(); return; }
  renderModal(r.data);
}

function renderModal({ complaint: c, messages, updates }) {
  $('#modalTitle').textContent = `${c.ticket_no} — ${c.title}`;
  $('#modalHeadInfo').innerHTML = `<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">${statusBadge(c.status)} ${priorityBadge(c.priority)}${closureTag(c)}<span style="font-size:.75rem;color:var(--muted)">القسم: <b>${escapeHtml(c.department_name)}</b>${c.assigned_name ? ' · مسندة إلى: <b>' + escapeHtml(c.assigned_name) + '</b>' : ' · غير مسندة'} · أُنشئت ${fmtDate(c.created_at)}</span></div>`;
  renderStepper($('#modalStepper'), c, updates);
  renderEmployeeBanner(c);
  $('#mdStudent').textContent = c.student_name;
  $('#mdCode').textContent = c.student_code || '—';
  $('#mdEmail').textContent = c.student_email || '—';
  $('#mdType').textContent = c.type_name || '—';
  $('#modalPriority').value = c.priority || 'medium';
  const mdRating = $('#mdRating');
  if (c.rating) {
    mdRating.style.display = 'flex';
    $('#mdRatingValue').textContent = '★'.repeat(c.rating) + '☆'.repeat(5 - c.rating) + ` (${c.rating}/5)`;
    $('#mdRatingComment').style.display = c.rating_comment ? 'block' : 'none';
    if (c.rating_comment) $('#mdRatingComment').textContent = `💬 ${c.rating_comment}`;
  } else { mdRating.style.display = 'none'; $('#mdRatingComment').style.display = 'none'; }
  $('#modalDetails').textContent = c.details;
  $('#modalAttachment').innerHTML = c.attachment ? `<a class="link" href="${escapeHtml(c.attachment)}" target="_blank" rel="noopener">📎 عرض المرفق</a>` : '';

  const aiBox = $('#modalAiBox');
  if (c.ai_category) {
    aiBox.style.display = 'block';
    aiBox.innerHTML = `<b>✨ تحليل NEXUS AI:</b> «${escapeHtml(c.ai_category)}» · ثقة ${Math.round((c.ai_confidence || 0) * 100)}% · الأولوية المقترحة ${PRIORITY[c.priority] || c.priority}`;
  } else aiBox.style.display = 'none';

  $('#modalTimeline').innerHTML = updates.map(u => `
    <li><div class="t-body"><b>${escapeHtml(actionLabel(u.action))}${u.user_name ? ' — ' + escapeHtml(u.user_name) : ''}</b>${u.details ? `<span>${escapeHtml(u.details)}</span>` : ''}</div><time>${fmtDay(u.created_at)}</time></li>`).join('');

  const chat = $('#modalChat');
  chat.innerHTML = messages.length ? messages.map(m => {
    const mine = m.sender_role !== 'student';
    const internal = m.is_internal;
    return `<div class="msg ${internal ? 'internal' : mine ? 'me' : 'them'}"><div class="meta"><span>${internal ? '🔒 ملاحظة داخلية — ' : ''}${escapeHtml(m.sender_name)}</span><span>${fmtDate(m.created_at)}</span></div>${escapeHtml(m.body)}</div>`;
  }).join('') : '<p style="color:var(--muted);font-size:.82rem;text-align:center;padding:1rem">لا توجد رسائل بعد.</p>';
  chat.scrollTop = chat.scrollHeight;
}
// ===== بانر تأكيد الحل — رد الموظف على «الشؤون طلبت تأكيد» =====
function renderEmployeeBanner(c) {
  const banner = $('#employeeConfirmBanner');
  const stateEl = $('#employeeConfirmState');
  const titleEl = $('#employeeBannerText');
  const yesBtn = $('#employeeConfirmYes'), noBtn = $('#employeeConfirmNo'), noteInput = $('#employeeConfirmNote');
  if (c.internal_resolution === 'requested') {
    banner.style.display = 'flex';
    stateEl.style.display = 'none';
    titleEl.textContent = 'الشؤون طلبت تأكيد الحل — المشكلة اتحلت فعلًا؟';
    noteInput.value = c.internal_resolution_note || '';
    noteInput.style.display = 'inline-block';
    yesBtn.style.display = 'inline-flex'; noBtn.style.display = 'inline-flex';
    const respond = async (decision) => {
      const r = await api(`/api/complaints/${c.id}/employee-confirm`, { method: 'POST', body: { decision, note: noteInput.value.trim() } });
      if (!r.ok) return toast(r.error, 'err');
      toast(decision === 'confirmed' ? 'أكيد كحل ✓' : 'تم إرسال إن المشكلة لسه موجودة');
      const reload = await api(`/api/complaints/${c.id}`);
      if (reload.ok) renderModal(reload.data);
      if (typeof loadComplaints === 'function') loadComplaints();
    };
    yesBtn.onclick = () => respond('confirmed');
    noBtn.onclick = () => respond('not_confirmed');
  } else if (c.internal_resolution === 'confirmed' || c.internal_resolution === 'not_confirmed') {
    banner.style.display = 'flex';
    yesBtn.style.display = 'none'; noBtn.style.display = 'none';
    noteInput.style.display = 'none';
    stateEl.style.display = 'block';
    stateEl.style.color = c.internal_resolution === 'confirmed' ? '#7EE0A0' : '#FCA5A5';
    stateEl.textContent = c.internal_resolution === 'confirmed' ? `✓ أكّدت الحل${c.internal_resolution_note ? ' — ملاحظتك: ' + c.internal_resolution_note : ''}` : `✗ لسه مش محلولة${c.internal_resolution_note ? ' — ملاحظتك: ' + c.internal_resolution_note : ''}`;
    titleEl.textContent = c.internal_resolution === 'confirmed' ? 'تم تسجيل تأكيد الحل لدى الشؤون' : 'تم تسجيل إن المشكلة لسه موجودة';
  } else {
    banner.style.display = 'none';
  }
}

function actionLabel(a) { return { created: 'تم إنشاء الشكوى', status: 'تغيير الحالة', assigned: 'إسناد', transfer: 'تحويل لقسم', request_info: 'طلب معلومات', priority: 'تعديل الأولوية يدويًا', closure_confirmed: 'الطالب أكّد الحل', reopened: 'الشكوى اُعيد فتحها', request_confirmation: 'الشؤون طلبت تأكيد الحل', employee_confirmed: 'الموظف أكّد الحل', employee_not_confirmed: 'الموظف: لسه مش محلولة', rating_reset: 'تم مسح التقييم بمعرفة الإدارة' }[a] || a; }

async function reloadModal() {
  if (!currentComplaintId) return;
  const r = await api(`/api/complaints/${currentComplaintId}`);
  if (r.ok) renderModal(r.data);
  loadComplaints(); loadStats(); loadUrgent();
}

// تغيير الحالة
document.querySelectorAll('.status-actions [data-status]').forEach(btn => btn.addEventListener('click', async () => {
  if (!currentComplaintId) return;
  const status = btn.dataset.status;
  if (status === 'rejected' && !confirm('تأكيد رفض الشكوى؟')) return;
  const r = await api(`/api/complaints/${currentComplaintId}/status`, { method: 'POST', body: { status } });
  if (!r.ok) return toast(r.error, 'err');
  toast('تم تحديث حالة الشكوى ✓'); reloadModal();
}));

// تولّي الشكوى
$('#assignToMeBtn').addEventListener('click', async () => {
  if (!currentComplaintId) return;
  const r = await api(`/api/complaints/${currentComplaintId}/assign`, { method: 'POST', body: {} });
  if (!r.ok) return toast(r.error, 'err');
  toast('تم إسناد الشكوى إليك ✓'); reloadModal();
});

// طلب معلومات إضافية
$('#requestInfoBtn').addEventListener('click', async () => {
  if (!currentComplaintId) return;
  const msg = prompt('ما المعلومات المطلوبة من الطالب؟', 'برجاء رفع صورة من الإيصال أو توضيح الرقم الجامعي');
  if (msg === null) return;
  const r = await api(`/api/complaints/${currentComplaintId}/request-info`, { method: 'POST', body: { message: msg } });
  if (!r.ok) return toast(r.error, 'err');
  toast('تم إرسال طلب المعلومات للطالب ✓'); reloadModal();
});

// التحويل لقسم آخر
function loadTransferDepartments() {
  api('/api/departments').then(r => {
    if (!r.ok) return;
    $('#transferDept').innerHTML = '<option value="">تحويل إلى قسم...</option>' + r.data.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  });
}
$('#transferBtn').addEventListener('click', async () => {
  const deptId = $('#transferDept').value;
  if (!deptId) return toast('اختر القسم المستهدف', 'err');
  if (!currentComplaintId) return;
  const reason = prompt('سبب التحويل (اختياري):', '') || '';
  const r = await api(`/api/complaints/${currentComplaintId}/transfer`, { method: 'POST', body: { department_id: Number(deptId), reason } });
  if (!r.ok) return toast(r.error, 'err');
  toast('تم تحويل الشكوى للقسم المختص ✓'); reloadModal();
});

// إرسال رد / ملاحظة داخلية
$('#modalMessageForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#modalMessageInput');
  const body = input.value.trim(); if (!body || !currentComplaintId) return;
  const isInternal = $('#internalNoteToggle').checked;
  const r = await api(`/api/complaints/${currentComplaintId}/messages`, { method: 'POST', body: { body, is_internal: isInternal } });
  if (!r.ok) return toast(r.error, 'err');
  input.value = ''; $('#internalNoteToggle').checked = false;
  toast(isInternal ? 'تم حفظ الملاحظة الداخلية 🔒' : 'تم إرسال ردك للطالب ✓');
  reloadModal();
});

// ---------- الإشعارات ----------
async function loadNotifications() {
  const list = $('#notifList');
  list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">جارِ التحميل...</p>';
  const r = await api('/api/notifications');
  if (!r.ok) { list.innerHTML = `<p style="color:var(--danger)">${escapeHtml(r.error)}</p>`; return; }
  if (!r.data.length) { list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1.2rem">لا توجد إشعارات بعد 🔔</p>'; return; }
  list.innerHTML = r.data.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}" ${n.ref_id ? `data-complaint="${n.ref_id}" style="cursor:pointer"` : ''}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${n.read ? '#8AA3C4' : '#2563EB'}" stroke-width="2" stroke-linecap="round" style="flex:0 0 auto;margin-top:.15rem"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
      <div><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.body || '')}</p></div>
      <time>${fmtDay(n.created_at)}</time>
    </div>`).join('');
  list.querySelectorAll('[data-id]').forEach(item => item.addEventListener('click', async () => {
    await api(`/api/notifications/${item.dataset.id}/read`, { method: 'POST' });
    item.classList.remove('unread');
    refreshNotifBadge();
    if (item.dataset.complaint) openComplaint(Number(item.dataset.complaint));
  }));
}
$('#markAllBtn').addEventListener('click', async () => { await api('/api/notifications/read-all', { method: 'POST' }); loadNotifications(); refreshNotifBadge(); toast('تم تعليم الكل كمقروء'); });


// ============================================================
//  الميزات المتقدمة: QR الحضور + الأولوية اليدوية + المفقودات
// ============================================================

// الأولوية يدويًا من داخل المودال
$('#modalPriority').addEventListener('change', async () => {
  if (!currentComplaintId) return;
  const r = await api(`/api/complaints/${currentComplaintId}/priority`, { method: 'POST', body: { priority: $('#modalPriority').value } });
  if (!r.ok) return toast(r.error, 'err');
  toast('تم تعديل الأولوية ✓');
  reloadModal();
});

// ---------- حضور بـ QR ----------
let currentQrSession = null, qrPollTimer = null, qrCountdownTimer = null;
$('#createSessionForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#createSessionBtn'); btn.disabled = true;
  const r = await api('/api/attendance/sessions', { method: 'POST', body: { lecture_name: $('#sessionLecture').value.trim(), duration_minutes: Number($('#sessionDuration').value) } });
  btn.disabled = false;
  if (!r.ok) return toast(r.error, 'err');
  currentQrSession = r.data;
  showQrSession(r.data);
  loadSessions();
  toast('تم إنشاء جلسة الحضور ✓');
});
function showQrSession(session) {
  const wrap = $('#qrActiveWrap');
  wrap.style.display = 'grid';
  $('#qrCodeText').textContent = session.code;
  // توليد QR عبر CDN مع fallback لعرض الكود النصي فقط
  const box = $('#qrCanvas');
  box.innerHTML = '';
  if (window.QRCode) {
    new QRCode(box, { text: `NEXUS-ATTEND:${session.code}`, width: 208, height: 208, colorDark: '#0A1B33', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } else {
    box.innerHTML = '<p style="font-size:.72rem;color:var(--muted);padding:.5rem">مكتبة QR غير متاحة — الكود مكتوب أسفل</p>';
  }
  const exp = new Date(String(session.expires_at).replace(' ', 'T') + 'Z');
  clearInterval(qrCountdownTimer);
  const tick = () => {
    const ms = exp - Date.now();
    if (ms <= 0) { $('#qrExpiry').textContent = 'انتهت صلاحية الكود — أنشئ جلسة جديدة'; clearInterval(qrCountdownTimer); clearInterval(qrPollTimer); return; }
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    $('#qrExpiry').textContent = `تنتهي الصلاحية خلال ${m}:${String(s).padStart(2, '0')}`;
  };
  tick(); qrCountdownTimer = setInterval(tick, 1000);
  clearInterval(qrPollTimer);
  qrPollTimer = setInterval(async () => {
    const r = await api('/api/attendance/sessions');
    const mine = r.ok ? r.data.find(x => x.id === session.id) : null;
    if (mine) $('#qrLiveCount').textContent = `${mine.attended} طالب سجل حضورًا`;
  }, 4000);
}
async function loadSessions() {
  const r = await api('/api/attendance/sessions');
  const tbody = $('#sessionsTableBody');
  if (!r.ok) return;
  if (!r.data.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted)">لسه مفيش جلسات — أنشئ أول جلسة</td></tr>'; return; }
  tbody.innerHTML = r.data.map(s => `
    <tr><td style="font-size:.82rem"><b>${escapeHtml(s.lecture_name)}</b></td>
      <td dir="ltr" style="font-family:Consolas,monospace;font-weight:800">${escapeHtml(s.code)}</td>
      <td>${s.attended} طالب</td>
      <td>${s.active ? '<span class="badge resolved">نشطة</span>' : '<span class="priority low">منتهية</span>'}</td></tr>`).join('');
}
$('#refreshSessions').addEventListener('click', loadSessions);

// ---------- المفقودات والموجودات (إدارة) ----------
let staffLostTimer = null;
['staffLfStatus', 'staffLfType'].forEach(id => document.getElementById(id).addEventListener('change', loadStaffLostFound));
$('#staffLfSearch').addEventListener('input', () => { clearTimeout(staffLostTimer); staffLostTimer = setTimeout(loadStaffLostFound, 300); });
async function loadStaffLostFound() {
  const box = $('#staffLostList');
  box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:.8rem">جارِ التحميل...</p>';
  const params = new URLSearchParams();
  if ($('#staffLfStatus').value) params.set('status', $('#staffLfStatus').value);
  if ($('#staffLfType').value) params.set('type', $('#staffLfType').value);
  if ($('#staffLfSearch').value.trim()) params.set('q', $('#staffLfSearch').value.trim());
  const r = await api('/api/lost-found' + (params.toString() ? '?' + params : ''));
  if (!r.ok) { box.innerHTML = `<p style="color:var(--danger)">${escapeHtml(r.error)}</p>`; return; }
  $('#staffLostCount').textContent = `${r.data.length} إعلان`;
  if (!r.data.length) { box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1.2rem">لا توجد إعلانات بهذه الفلاتر.</p>'; return; }
  const LF_STATUS = { open: 'مفتوح', found: 'تم العثور عليه', returned: 'تم التسليم' };
  box.innerHTML = r.data.map(item => `
    <div class="complaint-item" style="align-items:flex-start;gap:.8rem">
      <div style="flex:1;min-width:0">
        <span class="lost-type ${item.type}">${item.type === 'lost' ? '🔴 مفقود' : '🟢 موجود'}</span>
        <b style="display:block;margin:.25rem 0 .15rem">${escapeHtml(item.title)}</b>
        <span style="font-size:.73rem;color:var(--muted)">${escapeHtml(item.description || '')}</span><br>
        <span style="font-size:.7rem;color:var(--muted)">📍 ${escapeHtml(item.location || '—')} · 📅 ${escapeHtml(item.item_date || '')} · بواسطة ${escapeHtml(item.owner_name)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:.35rem;align-items:flex-end">
        <select class="staff-lf-status" data-id="${item.id}" style="border:1.5px solid var(--line);border-radius:8px;padding:.3rem .5rem;font-size:.74rem">
          <option value="open" ${item.status === 'open' ? 'selected' : ''}>مفتوح</option>
          <option value="found" ${item.status === 'found' ? 'selected' : ''}>تم العثور عليه</option>
          <option value="returned" ${item.status === 'returned' ? 'selected' : ''}>تم التسليم</option>
        </select>
        <button class="btn btn-outline btn-sm" data-staff-lf-contact="${item.id}">💬 تواصل</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.staff-lf-status').forEach(sel => sel.addEventListener('change', async () => {
    const r = await api(`/api/lost-found/${sel.dataset.id}/status`, { method: 'PATCH', body: { status: sel.value } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم تحديث الحالة'); loadStaffLostFound();
  }));
  box.querySelectorAll('[data-staff-lf-contact]').forEach(btn => btn.addEventListener('click', async () => {
    const msg = prompt('اكتب رسالتك لصاحب الإعلان:');
    if (!msg) return;
    const r = await api(`/api/lost-found/${btn.dataset.staffLfContact}/contact`, { method: 'POST', body: { message: msg } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم إرسال رسالتك — سيصله إشعار ✓');
  }));
}
