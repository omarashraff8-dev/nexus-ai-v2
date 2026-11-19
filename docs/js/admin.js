// NEXUS AI — Admin dashboard logic
let currentUser = null;
const DEPT_COLORS = ['#2563EB', '#38BDF8', '#7C3AED', '#F59E0B', '#16A34A', '#DC2626', '#0EA5E9'];

(async function init() {
  currentUser = await requireRolePage('admin');
  if (!currentUser) return;

  $('#userName').textContent = currentUser.name;
  $('#userAvatar').textContent = (currentUser.name || 'م').trim()[0];
  $('#userRole').textContent = 'مدير النظام';

  initShell({ active: 'dashboard' });
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => $(`.side-link[data-section="${b.dataset.goto}"]`)?.click()));
  window.addEventListener('nexus:section-shown', e => {
    const s = e.detail.section;
    if (s === 'dashboard') { loadInsights(); loadDeptRanking(); }
    if (s === 'staff') loadUsers();
    if (s === 'departments') { loadDepartmentsTable(); loadTypesTable(); }
    if (s === 'complaints') loadAllComplaints();
    if (s === 'reports') loadSavedReports();
    if (s === 'notifs') loadNotifications();
  });

  await Promise.all([loadInsights(), loadDepartmentSelects(), loadDeptRanking()]);
  buildInlineForms();
})();

// =====================================================
// 1) لوحة التحكم: تحليلات + رسوم بيانية
// =====================================================
async function loadInsights() {
  const r = await api('/api/admin/insights');
  if (!r.ok) return;
  const d = r.data;

  $('#aTotal').textContent = d.total;
  $('#aOpen').textContent = d.open;
  $('#aResolved').textContent = d.resolved;
  $('#aSatisfaction').textContent = d.satisfaction !== null ? d.satisfaction + '%' : '—';
  $('#aAvgHours').textContent = d.avgResolutionHours;
  $('#aPrediction').textContent = d.prediction;
  const delta = d.series.length >= 2 ? d.series[d.series.length - 1].count - d.series[d.series.length - 2].count : 0;
  $('#aPredictionNote').textContent = `انحدار خطي على آخر ${d.series.length} أسابيع — هذا الأسبوع: ${d.currentWeek} شكوى (${delta >= 0 ? '+' : ''}${delta} عن السابق).`;

  const banner = $('#urgentBanner');
  if (d.urgentOpen > 0) { banner.style.display = 'block'; banner.textContent = `⚠️ يوجد ${d.urgentOpen} شكوى عاجلة / عالية الأولوية مفتوحة الآن — تدخّل سريع مطلوب.`; }
  else banner.style.display = 'none';

  // أكثر المشكلات تكرارًا
  const top = $('#topTypesList');
  if (!d.topTypes.length) top.innerHTML = '<p style="color:var(--muted);font-size:.85rem">لا توجد بيانات كافية.</p>';
  else {
    const max = d.topTypes[0].count;
    top.innerHTML = d.topTypes.map(t => `
      <div style="display:grid;grid-template-columns:1fr auto;gap:.2rem .6rem;align-items:center">
        <span style="font-size:.84rem;font-weight:800;color:var(--navy-800)">${escapeHtml(t.name)}</span>
        <span style="font-size:.8rem;font-weight:900;color:var(--blue)">${t.count}</span>
        <div class="progress" style="grid-column:1/-1"><div style="width:${Math.round(t.count / max * 100)}%"></div></div>
      </div>`).join('');
  }

  drawBarChart($('#deptChart'), d.perDepartment.map(p => ({ label: p.name, value: p.total, extra: `${p.open} مفتوحة` })));
  drawLineChart($('#trendChart'), d.series.map(s => ({ label: s.week.replace(/-W/, ' · أ'), value: s.count })));
}

// رسم شريطي
function drawBarChart(canvas, items) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth * 2; const H = canvas.height = 460;
  ctx.scale(2, 2);
  const w = W / 2, h = H / 2;
  ctx.clearRect(0, 0, w, h);
  if (!items.length) { ctx.fillStyle = '#8AA3C4'; ctx.font = '13px Cairo, sans-serif'; ctx.fillText('لا توجد بيانات', 20, 30); return; }
  const max = Math.max(...items.map(i => i.value), 1);
  const padB = 42, padT = 18, padX = 10;
  const barW = Math.min(54, (w - padX * 2) / items.length - 12);
  items.forEach((item, i) => {
    const x = padX + i * ((w - padX * 2) / items.length) + (((w - padX * 2) / items.length) - barW) / 2;
    const barH = (h - padB - padT) * (item.value / max);
    const y = h - padB - barH;
    const grad = ctx.createLinearGradient(0, y, 0, h - padB);
    grad.addColorStop(0, DEPT_COLORS[i % DEPT_COLORS.length]); grad.addColorStop(1, '#0F2744');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(x, y, barW, barH, [6, 6, 0, 0]); ctx.fill();
    ctx.fillStyle = '#0F2744'; ctx.font = 'bold 12px Cairo, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(item.value), x + barW / 2, y - 5);
    ctx.fillStyle = '#5B7290'; ctx.font = '10px Cairo, sans-serif';
    const label = item.label.length > 12 ? item.label.slice(0, 11) + '…' : item.label;
    ctx.fillText(label, x + barW / 2, h - padB + 14);
    ctx.fillStyle = '#9DB4D4'; ctx.font = '9px Cairo, sans-serif';
    ctx.fillText(item.extra, x + barW / 2, h - padB + 28);
  });
}

// خط بياني للاتجاه
function drawLineChart(canvas, points) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth * 2; const H = canvas.height = 460;
  ctx.scale(2, 2);
  const w = W / 2, h = H / 2;
  ctx.clearRect(0, 0, w, h);
  if (points.length < 2) { ctx.fillStyle = '#8AA3C4'; ctx.font = '13px Cairo, sans-serif'; ctx.fillText('لا توجد بيانات كافية', 20, 30); return; }
  const max = Math.max(...points.map(p => p.value), 1);
  const padX = 30, padT = 20, padB = 32;
  const stepX = (w - padX * 2) / (points.length - 1);
  const yOf = v => h - padB - (h - padB - padT) * (v / max);
  // خط وتعبئة
  ctx.beginPath();
  points.forEach((p, i) => { const x = padX + i * stepX; const y = yOf(p.value); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.lineTo(padX + (points.length - 1) * stepX, h - padB); ctx.lineTo(padX, h - padB); ctx.closePath();
  const fill = ctx.createLinearGradient(0, padT, 0, h - padB);
  fill.addColorStop(0, 'rgba(56,189,248,.4)'); fill.addColorStop(1, 'rgba(56,189,248,.02)');
  ctx.fillStyle = fill; ctx.fill();
  ctx.beginPath();
  points.forEach((p, i) => { const x = padX + i * stepX; const y = yOf(p.value); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 2.5; ctx.stroke();
  points.forEach((p, i) => {
    const x = padX + i * stepX, y = yOf(p.value);
    ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fillStyle = '#38BDF8'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#0F2744'; ctx.stroke();
    ctx.fillStyle = '#0F2744'; ctx.font = 'bold 10px Cairo, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(p.value), x, y - 8);
    ctx.fillStyle = '#5B7290'; ctx.font = '8.5px Cairo, sans-serif';
    ctx.fillText(p.label, x, h - padB + 12);
  });
}

// =====================================================
// 2) الموظفون والصلاحيات
// =====================================================
async function loadUsers() {
  const role = $('#usersRoleFilter').value;
  const r = await api('/api/admin/users' + (role ? `?role=${role}` : ''));
  const tbody = $('#usersTableBody');
  if (!r.ok) { tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger)">${escapeHtml(r.error)}</td></tr>`; return; }
  tbody.innerHTML = r.data.map(u => `
    <tr>
      <td><b style="font-size:.83rem">${escapeHtml(u.name)}</b></td>
      <td style="font-size:.78rem" dir="ltr">${escapeHtml(u.email)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'new' : u.role === 'staff' ? 'in_progress' : 'resolved'}">${roleName(u.role)}</span></td>
      <td style="font-size:.78rem">${escapeHtml(u.department_name || '—')}</td>
      <td style="font-size:.74rem;white-space:nowrap">${u.last_login ? fmtDate(u.last_login) : 'لم يدخل بعد'}</td>
      <td>${u.active ? '<span class="badge resolved">نشط</span>' : '<span class="badge rejected">موقوف</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" data-edit="${u.id}">تعديل</button>
        <button class="btn btn-outline btn-sm" data-toggle="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? 'إيقاف' : 'تفعيل'}</button>
        <button class="btn btn-danger btn-sm" data-delete="${u.id}" data-name="${escapeHtml(u.name)}">حذف</button>
      </td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openUserModal(Number(b.dataset.edit), r.data)));
  tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
    const r2 = await api(`/api/admin/users/${b.dataset.toggle}`, { method: 'PUT', body: { active: b.dataset.active !== '1' } });
    if (!r2.ok) return toast(r2.error, 'err');
    toast(r2.data.active ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب'); loadUsers();
  }));
  tbody.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`حذف حساب "${b.dataset.name}" نهائيًا؟ لا يمكن التراجع.`)) return;
    const r2 = await api(`/api/admin/users/${b.dataset.delete}`, { method: 'DELETE' });
    if (!r2.ok) return toast(r2.error, 'err');
    toast('تم حذف الحساب'); loadUsers();
  }));
}
$('#usersRoleFilter').addEventListener('change', loadUsers);

const userModal = $('#userModal');
function openUserModal(id, users) {
  const u = id && users ? users.find(x => x.id === id) : null;
  $('#userModalTitle').textContent = u ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد';
  $('#userId').value = u ? u.id : '';
  $('#uName').value = u?.name || '';
  $('#uEmail').value = u?.email || '';
  $('#uRole').value = u?.role || 'staff';
  $('#uDept').value = u?.department_id || '';
  $('#uPassword').value = '';
  $('#uPhone').value = u?.phone || '';
  userModal.classList.add('open');
}
$('#addUserBtn').addEventListener('click', () => openUserModal(null));
$('#closeUserModal').addEventListener('click', () => userModal.classList.remove('open'));
$('#cancelUserModal').addEventListener('click', () => userModal.classList.remove('open'));
userModal.addEventListener('click', e => { if (e.target === userModal) userModal.classList.remove('open'); });
$('#userForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('#userId').value;
  const body = { name: $('#uName').value.trim(), email: $('#uEmail').value.trim(), role: $('#uRole').value, department_id: $('#uDept').value ? Number($('#uDept').value) : null, phone: $('#uPhone').value.trim() };
  if ($('#uPassword').value) body.password = $('#uPassword').value;
  const r = id
    ? await api(`/api/admin/users/${id}`, { method: 'PUT', body })
    : await api('/api/admin/users', { method: 'POST', body: { ...body, password: $('#uPassword').value || 'staff123' } });
  if (!r.ok) return toast(r.error, 'err');
  userModal.classList.remove('open');
  toast(id ? 'تم حفظ التعديلات ✓' : 'تم إنشاء الحساب ✓');
  loadUsers();
});

// =====================================================
// 3) الأقسام وأنواع الشكاوى
// =====================================================
async function loadDepartmentSelects() {
  const r = await api('/api/departments');
  if (!r.ok) return;
  const opts = '<option value="">— بدون —</option>' + r.data.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  $('#uDept').innerHTML = opts;
  $('#aDept').innerHTML = '<option value="">كل الأقسام</option>' + r.data.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
}
function buildInlineForms() {
  // نموذج إضافة قسم
  const deptCard = $('#deptTableBody').closest('.card');
  const deptForm = document.createElement('form');
  deptForm.className = 'filters';
  deptForm.innerHTML = `<input id="newDeptName" required placeholder="اسم القسم الجديد" style="flex:1;min-width:140px" aria-label="اسم القسم"><input id="newDeptSla" type="number" min="1" value="48" style="width:80px" aria-label="SLA بالساعات" title="SLA بالساعات"><button type="submit" class="btn btn-cyan btn-sm">+ إضافة</button>`;
  deptCard.insertBefore(deptForm, deptCard.querySelector('.table-wrap'));
  deptForm.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/admin/departments', { method: 'POST', body: { name: deptForm.querySelector('#newDeptName').value.trim(), sla_hours: Number(deptForm.querySelector('#newDeptSla').value) || 48 } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تمت إضافة القسم ✓'); deptForm.reset(); loadDepartmentsTable(); loadDepartmentSelects();
  });
  // نموذج إضافة نوع شكوى
  const typeCard = $('#typeTableBody').closest('.card');
  const typeForm = document.createElement('form');
  typeForm.className = 'filters';
  typeForm.innerHTML = `<input id="newTypeName" required placeholder="نوع شكوى جديد" style="flex:1;min-width:150px" aria-label="نوع الشكوى"><select id="newTypeDept" required aria-label="القسم"></select><button type="submit" class="btn btn-cyan btn-sm">+ إضافة</button>`;
  typeCard.insertBefore(typeForm, typeCard.querySelector('.table-wrap'));
  api('/api/departments').then(r => { if (r.ok) typeForm.querySelector('#newTypeDept').innerHTML = r.data.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join(''); });
  typeForm.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/admin/complaint-types', { method: 'POST', body: { name: typeForm.querySelector('#newTypeName').value.trim(), department_id: Number(typeForm.querySelector('#newTypeDept').value) } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تمت إضافة النوع ✓'); typeForm.querySelector('#newTypeName').value = ''; loadTypesTable();
  });
  $('#addDeptBtn').style.display = 'none';
  $('#addTypeBtn').style.display = 'none';
}
async function loadDepartmentsTable() {
  const r = await api('/api/departments');
  const tbody = $('#deptTableBody');
  if (!r.ok) return;
  tbody.innerHTML = r.data.map(d => `
    <tr><td><b style="font-size:.83rem">${escapeHtml(d.name)}</b><br><span style="font-size:.68rem;color:var(--muted)">${escapeHtml(d.description || '')}</span></td>
      <td>${d.sla_hours}h</td><td>${d.complaints_count}</td>
      <td><button class="btn btn-danger btn-sm" data-del-dept="${d.id}" data-name="${escapeHtml(d.name)}">حذف</button></td></tr>`).join('');
  tbody.querySelectorAll('[data-del-dept]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`حذف قسم "${b.dataset.name}"؟ (لا يمكن حذف قسم عليه شكاوى)`)) return;
    const r2 = await api(`/api/admin/departments/${b.dataset.delDept}`, { method: 'DELETE' });
    if (!r2.ok) return toast(r2.error, 'err');
    toast('تم حذف القسم'); loadDepartmentsTable(); loadDepartmentSelects();
  }));
}
async function loadTypesTable() {
  const r = await api('/api/complaint-types');
  const tbody = $('#typeTableBody');
  if (!r.ok) return;
  tbody.innerHTML = r.data.map(t => `
    <tr><td><b style="font-size:.83rem">${escapeHtml(t.name)}</b></td><td style="font-size:.78rem">${escapeHtml(t.department_name)}</td>
      <td><button class="btn btn-danger btn-sm" data-del-type="${t.id}">حذف</button></td></tr>`).join('');
  tbody.querySelectorAll('[data-del-type]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('حذف نوع الشكوى؟')) return;
    const r2 = await api(`/api/admin/complaint-types/${b.dataset.delType}`, { method: 'DELETE' });
    if (!r2.ok) return toast(r2.error, 'err');
    toast('تم الحذف'); loadTypesTable();
  }));
}

// =====================================================
// 4) كل الشكاوى + الإسناد
// =====================================================
let adminSearchTimer = null;
async function loadAllComplaints() {
  const tbody = $('#allComplaintsBody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">جارِ التحميل...</td></tr>';
  const params = new URLSearchParams();
  if ($('#aSearch').value.trim()) params.set('q', $('#aSearch').value.trim());
  if ($('#aDept').value) params.set('department', $('#aDept').value);
  if ($('#aStatus').value) params.set('status', $('#aStatus').value);
  if ($('#aPriority').value) params.set('priority', $('#aPriority').value);
  if ($('#aFrom').value) params.set('from', $('#aFrom').value);
  if ($('#aTo').value) params.set('to', $('#aTo').value);
  const r = await api('/api/complaints' + (params.toString() ? '?' + params : ''));
  if (!r.ok) return;
  $('#adminResultCount').textContent = `${r.data.length} شكوى`;
  if (!r.data.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:1.4rem">لا توجد نتائج.</td></tr>'; return; }
  tbody.innerHTML = r.data.map(c => `
    <tr>
      <td><span class="ticket-no">${escapeHtml(c.ticket_no)}</span></td>
      <td style="font-size:.8rem">${escapeHtml(c.student_name)}</td>
      <td style="max-width:230px;font-size:.8rem"><b>${escapeHtml(c.title.slice(0, 55))}${c.title.length > 55 ? '…' : ''}</b><br><span style="font-size:.68rem;color:var(--muted)">${escapeHtml(c.department_name)}</span></td>
      <td>${priorityBadge(c.priority)}</td><td>${statusBadge(c.status)} ${closureTag(c)}</td>
      <td style="font-size:.78rem">${escapeHtml(c.assigned_name || 'غير مسندة')}</td>
      <td style="font-size:.74rem;white-space:nowrap">${fmtDay(c.created_at)}</td>
      <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-view="${c.id}">عرض</button> <button class="btn btn-primary btn-sm" data-assign="${c.id}" data-title="${escapeHtml(c.ticket_no)}">إسناد</button></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => openViewComplaint(Number(b.dataset.view))));
  tbody.querySelectorAll('[data-assign]').forEach(b => b.addEventListener('click', () => openAssignModal(Number(b.dataset.assign), b.dataset.title)));
}
$('#aSearch').addEventListener('input', () => { clearTimeout(adminSearchTimer); adminSearchTimer = setTimeout(loadAllComplaints, 300); });
['aDept', 'aStatus', 'aPriority', 'aFrom', 'aTo'].forEach(id => $('#' + id).addEventListener('change', loadAllComplaints));
$('#aClearFilters').addEventListener('click', () => { ['aSearch', 'aFrom', 'aTo'].forEach(id => $('#' + id).value = ''); ['aDept', 'aStatus', 'aPriority'].forEach(id => $('#' + id).selectedIndex = 0); loadAllComplaints(); });

// ===== بانر اسأل الموظف: طلب تأكيد الحل =====
function renderAdminConfirmBanner(c) {
  const banner = $('#adminConfirmBanner');
  const title = $('#adminConfirmTitle'), text = $('#adminConfirmText'), state = $('#adminConfirmState'), note = $('#adminConfirmNote');
  const requestBtn = $('#adminRequestConfirmBtn');
  banner.style.display = 'flex';
  const assigneeMention = c.assigned_name ? `الموظف ${c.assigned_name}` : 'الموظف المسؤول';
  if (c.internal_resolution === 'requested') {
    requestBtn.disabled = true; requestBtn.textContent = '⏳ بانتظار رد الموظف';
    state.style.display = 'inline-block'; state.style.color = '#FCD34D';
    state.textContent = 'الشؤون طلبت التأكيد — لم يرد الموظف بعد';
    text.textContent = `بانتظار رد ${assigneeMention}${c.department_name ? ' في قسم ' + c.department_name : ''}.`;
    note.style.display = 'none';
  } else if (c.internal_resolution === 'confirmed') {
    requestBtn.disabled = false; requestBtn.textContent = '📤 طلب تأكيد مرة أخرى';
    state.style.display = 'inline-block'; state.style.color = '#7EE0A0';
    state.textContent = 'الموظف أكّد الحل ✓';
    text.textContent = 'تم تسجيل تأكيد الموظف — الشكوى محلولة بشهادة المختص.';
    note.style.display = c.internal_resolution_note ? 'block' : 'none';
    note.textContent = c.internal_resolution_note ? `ملاحظة الموظف: ${c.internal_resolution_note}` : '';
  } else if (c.internal_resolution === 'not_confirmed') {
    requestBtn.disabled = false; requestBtn.textContent = '📤 اطلب تأكيد مرة أخرى';
    state.style.display = 'inline-block'; state.style.color = '#FCA5A5';
    state.textContent = 'الموظف بيقول: لسه ❗';
    text.textContent = 'الموظف بيقول المشكلة لسه موجودة — راجعي معه التفاصيل أو أعد الإسناد.';
    note.style.display = c.internal_resolution_note ? 'block' : 'none';
    note.textContent = c.internal_resolution_note ? `ملاحظة الموظف: ${c.internal_resolution_note}` : '';
  } else {
    requestBtn.disabled = false; requestBtn.textContent = '📤 طلب تأكيد الحل';
    state.style.display = 'none';
    text.textContent = `اسأل ${assigneeMention}: هل المشكلة اتحلت فعلًا؟ (يرد من لوحته)`;
    note.style.display = 'none';
  }
}
$('#adminRequestConfirmBtn').addEventListener('click', async () => {
  if (!viewComplaintId) return;
  const btn = $('#adminRequestConfirmBtn'); btn.disabled = true; btn.textContent = 'جاري الطلب...';
  const r = await api(`/api/complaints/${viewComplaintId}/request-confirmation`, { method: 'POST' });
  if (!r.ok) { toast(r.error, 'err'); btn.disabled = false; btn.textContent = '📤 طلب تأكيد الحل'; return; }
  toast('تم إرسال الطلب للموظف — هيوصله إشعار 🔔');
  const reload = await api(`/api/complaints/${viewComplaintId}`);
  if (reload.ok) { const d = reload.data; renderAdminConfirmBanner(d.complaint); }
  loadAllComplaints();
});

// مودال العرض (قراءة فقط)
const viewModal = $('#viewModal');
$('#closeViewModal').addEventListener('click', () => viewModal.classList.remove('open'));
viewModal.addEventListener('click', e => { if (e.target === viewModal) viewModal.classList.remove('open'); });
let viewComplaintId = null;
async function openViewComplaint(id) {
  viewComplaintId = id;
  viewModal.classList.add('open');
  $('#viewDetails').textContent = 'جارِ التحميل...';
  const r = await api(`/api/complaints/${id}`);
  if (!r.ok) { toast(r.error, 'err'); viewModal.classList.remove('open'); return; }
  const { complaint: c, messages, updates } = r.data;
  $('#viewModalTitle').textContent = `${c.ticket_no} — ${c.title}`;
  $('#viewPriority').value = c.priority || 'medium';
  const resetBtn = $('#viewResetRatingBtn');
  resetBtn.style.display = c.rating ? 'inline-flex' : 'none';
  $('#viewHeadInfo').innerHTML = `<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">${statusBadge(c.status)} ${priorityBadge(c.priority)}${closureTag(c)}<span style="font-size:.75rem;color:var(--muted)">الطالب: <b>${escapeHtml(c.student_name)}</b> (${escapeHtml(c.student_code || '—')}) · القسم: <b>${escapeHtml(c.department_name)}</b> · ${fmtDate(c.created_at)}</span></div>`;
  renderAdminConfirmBanner(c);
  $('#viewDetails').textContent = c.details;
  const aiBox = $('#viewAiBox');
  if (c.ai_category) { aiBox.style.display = 'block'; aiBox.innerHTML = `<b>✨ تحليل NEXUS AI:</b> «${escapeHtml(c.ai_category)}» · ثقة ${Math.round((c.ai_confidence || 0) * 100)}%`; } else aiBox.style.display = 'none';
  $('#viewAttachment').innerHTML = c.attachment ? `<a class="link" href="${escapeHtml(c.attachment)}" target="_blank" rel="noopener">📎 عرض المرفق</a>` : '';
  $('#viewChat').innerHTML = messages.length ? messages.map(m => `<div class="msg ${m.is_internal ? 'internal' : m.sender_role === 'student' ? 'them' : 'me'}"><div class="meta"><span>${m.is_internal ? '🔒 ' : ''}${escapeHtml(m.sender_name)}</span><span>${fmtDate(m.created_at)}</span></div>${escapeHtml(m.body)}</div>`).join('') : '<p style="color:var(--muted);font-size:.82rem;text-align:center">لا توجد رسائل.</p>';
  $('#viewTimeline').innerHTML = updates.map(u => `<li><div class="t-body"><b>${escapeHtml(u.action)}</b>${u.details ? `<span>${escapeHtml(u.details)}</span>` : ''}</div><time>${fmtDay(u.created_at)}</time></li>`).join('');
}
$('#viewAssignBtn').addEventListener('click', () => { viewModal.classList.remove('open'); if (viewComplaintId) openAssignModal(viewComplaintId, 'NX-...'); });
$('#viewResetRatingBtn').addEventListener('click', async () => {
  if (!viewComplaintId) return;
  if (!confirm('مسح تقييم الطالب نهائيًا؟ (تصحيح إداري — الطالب يقدر يقيّم تاني)')) return;
  const r = await api(`/api/admin/complaints/${viewComplaintId}/reset-rating`, { method: 'POST' });
  if (!r.ok) return toast(r.error, 'err');
  toast('تم مسح التقييم — الطالب يقدر يقيّم تاني');
  $('#viewResetRatingBtn').style.display = 'none';
});

// مودال الإسناد
const assignModal = $('#assignModal');
let assignComplaintId = null;
async function openAssignModal(id, title) {
  assignComplaintId = id;
  $('#assignComplaintInfo').textContent = `الشكوى ${title || ''} — اختر الموظف المسؤول:`;
  const r = await api('/api/admin/users?role=staff');
  if (!r.ok) return toast(r.error, 'err');
  const sel = $('#assignStaffSelect');
  sel.innerHTML = r.data.filter(u => u.active).map(u => `<option value="${u.id}">${escapeHtml(u.name)} — ${escapeHtml(u.department_name || 'بدون قسم')}</option>`).join('') || '<option value="">لا يوجد موظفون — أضف موظفين أولًا</option>';
  assignModal.classList.add('open');
}
$('#closeAssignModal').addEventListener('click', () => assignModal.classList.remove('open'));
$('#cancelAssignModal').addEventListener('click', () => assignModal.classList.remove('open'));
assignModal.addEventListener('click', e => { if (e.target === assignModal) assignModal.classList.remove('open'); });
$('#confirmAssignBtn').addEventListener('click', async () => {
  const staffId = $('#assignStaffSelect').value;
  if (!staffId) return toast('اختر موظفًا', 'err');
  const r = await api(`/api/complaints/${assignComplaintId}/assign`, { method: 'POST', body: { assigned_to: Number(staffId) } });
  if (!r.ok) return toast(r.error, 'err');
  assignModal.classList.remove('open');
  toast('تم إسناد الشكوى ✓');
  loadAllComplaints();
});

// =====================================================
// 5) التقارير الذكية
// =====================================================
$('#generateSummaryBtn').addEventListener('click', async () => {
  const btn = $('#generateSummaryBtn'); btn.disabled = true; btn.textContent = 'جارِ التحليل...';
  const r = await api('/api/admin/summary', { method: 'POST' });
  btn.disabled = false; btn.textContent = '✨ توليد الملخص الذكي الآن';
  if (!r.ok) return toast(r.error, 'err');
  const out = $('#summaryOutput');
  out.style.display = 'block';
  out.textContent = r.data.summary;
  $('#printReportBody').textContent = r.data.summary;
  toast('تم توليد الملخص وحفظه في التقارير ✓');
  loadSavedReports();
});
async function loadSavedReports() {
  const box = $('#savedReportsList');
  const r = await api('/api/admin/reports');
  if (!r.ok) { box.innerHTML = ''; return; }
  if (!r.data.length) { box.innerHTML = '<p style="color:var(--muted);font-size:.85rem">لسه مفيش تقارير محفوظة — ولّد أول ملخص ذكي ✨</p>'; return; }
  box.innerHTML = r.data.map(rep => `
    <div class="complaint-item" style="cursor:default">
      <span><b style="font-size:.85rem">${escapeHtml(rep.title)}</b><br><span style="font-size:.72rem;color:var(--muted)">بواسطة ${escapeHtml(rep.admin_name || 'الإدارة')} · ${fmtDate(rep.created_at)}</span></span>
      <button class="link" data-view-report="${rep.id}">عرض</button>
    </div>`).join('');
  box.querySelectorAll('[data-view-report]').forEach(b => b.addEventListener('click', () => {
    const rep = r.data.find(x => x.id === Number(b.dataset.viewReport));
    const out = $('#summaryOutput'); out.style.display = 'block'; out.textContent = rep.summary;
    $('#printReportBody').textContent = rep.summary;
    out.scrollIntoView({ behavior: 'smooth' });
  }));
}
$('#exportCsvBtn').addEventListener('click', async e => {
  const params = new URLSearchParams();
  if ($('#csvFrom').value) params.set('from', $('#csvFrom').value);
  if ($('#csvTo').value) params.set('to', $('#csvTo').value);
  const qs = params.toString() ? '?' + params : '';
  if (window.NEXUS_STATIC) {
    e.preventDefault();
    const r = await api('/api/admin/reports.csv' + qs);
    if (!r.ok) return toast(r.error || 'تعذر التصدير', 'err');
    const blob = new Blob([r.data.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.data.filename || 'nexus-ai-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  e.target.href = '/api/admin/reports.csv' + qs;
});
$('#printReportBtn').addEventListener('click', () => {
  if (!$('#printReportBody').textContent.trim()) {
    $('#printReportBody').textContent = 'NEXUS AI — تقرير النظام\n\nقم بتوليد الملخص الذكي أولًا ثم اضغط طباعة.';
  }
  window.print();
});

// =====================================================
// 6) الإشعارات
// =====================================================
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
    if (item.dataset.complaint) { $('.side-link[data-section="complaints"]').click(); openViewComplaint(Number(item.dataset.complaint)); }
  }));
}
$('#markAllBtn').addEventListener('click', async () => { await api('/api/notifications/read-all', { method: 'POST' }); loadNotifications(); refreshNotifBadge(); toast('تم تعليم الكل كمقروء'); });


// ============================================================
//  الميزات المتقدمة: اسأل الإدارة (AI) + رضا الطلاب + الإعلانات + المفقودات
// ============================================================

// ---------- التحليلات الذكية — اسأل ----------
const askForm = $('#askForm'), askInput = $('#askInput'), askResultCard = $('#askResultCard');
async function askAdmin(question) {
  const q = String(question || '').trim();
  if (q.length < 3) return toast('اكتب السؤال أولًا', 'err');
  const btn = $('#askSubmitBtn'); btn.disabled = true; btn.textContent = 'يحسب...';
  askResultCard.style.display = 'block';
  $('#askAnswer').textContent = 'المساعد الذكي يقرأ بياناتك...';
  $('#askStats').innerHTML = ''; $('#askSuggestions').innerHTML = ''; $('#askChart').style.display = 'none';
  const r = await api('/api/admin/ask', { method: 'POST', body: { question: q } });
  btn.disabled = false; btn.textContent = 'اسأل ✨';
  if (!r.ok) { $('#askAnswer').textContent = r.error || 'تعذرت الإجابة'; return; }
  const d = r.data;
  $('#askAnswer').textContent = d.answer;
  $('#askStats').innerHTML = (d.stats || []).map(s => `<span class="ask-stat">${escapeHtml(s.label)}: <b>${escapeHtml(String(s.value))}</b></span>`).join('');
  $('#askSuggestions').innerHTML = (d.suggestions || []).map(s => `<button class="ask-chip" data-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
  $('#askSuggestions').querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => askAdmin(b.dataset.q)));
  if (d.chart && d.chart.labels && d.chart.labels.length) {
    const canvas = $('#askChart');
    canvas.style.display = 'block';
    if (d.chart.type === 'line') drawLineChart(canvas, d.chart.labels.map((l, i) => ({ label: l, value: d.chart.values[i] })));
    else drawBarChart(canvas, d.chart.labels.map((l, i) => ({ label: l, value: d.chart.values[i], extra: '' })));
  }
}
askForm.addEventListener('submit', e => { e.preventDefault(); askAdmin(askInput.value); });
$('#askChips').addEventListener('click', e => {
  const b = e.target.closest('[data-q]'); if (b) { askInput.value = b.dataset.q; askAdmin(b.dataset.q); }
});

// ---------- رضا الطلاب ----------
async function loadSatisfaction() {
  const r = await api('/api/admin/satisfaction');
  if (!r.ok) return;
  const d = r.data;
  $('#satAvg').textContent = d.avg.toFixed(1);
  $('#satPct').textContent = d.satisfactionPct + '%';
  $('#satTotal').textContent = d.total;
  $('#satBest').textContent = d.best ? d.best.name.slice(0, 18) : '—';
  $('#satWorst').textContent = d.worst ? d.worst.name.slice(0, 18) : '—';
  drawBarChart($('#satDeptChart'), (d.perDepartment || []).map(x => ({ label: x.name, value: x.pct, extra: `${x.count} تقييم` })));
  drawLineChart($('#satMonthlyChart'), (d.monthly || []).map(m => ({ label: m.month.slice(5), value: m.avg })));
  const box = $('#satComments');
  const comments = d.recentComments || [];
  if (!comments.length) { box.innerHTML = '<p style="color:var(--muted);font-size:.85rem;text-align:center;padding:.8rem">لا توجد تعليقات بعد — أول تقييم بعد حل شكوى هيظهر هنا.</p>'; return; }
  box.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div>${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)} <span style="color:var(--warn);font-weight:800">${c.rating}/5</span></div>
      <p style="margin:.2rem 0">${escapeHtml(c.rating_comment)}</p>
      <div class="meta"><span>${escapeHtml(c.student_name)}</span><span>${escapeHtml(c.dept)}</span></div>
    </div>`).join('');
}

// ---------- الإعلانات الجامعية ----------
$('#announcementForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#annSubmitBtn'); btn.disabled = true;
  const r = await api('/api/admin/announcements', { method: 'POST', body: { title: $('#annTitle').value.trim(), body: $('#annBody').value.trim() } });
  btn.disabled = false;
  if (!r.ok) return toast(r.error, 'err');
  toast('تم نشر الإعلان وإشعار الجميع ✓');
  e.target.reset();
  loadAnnouncements();
});
async function loadAnnouncements() {
  const box = $('#announcementsList');
  const r = await api('/api/announcements');
  if (!r.ok) { box.innerHTML = `<p style="color:var(--danger)">${escapeHtml(r.error)}</p>`; return; }
  if (!r.data.length) { box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">لسه مفيش إعلانات — انشر أول إعلان</p>'; return; }
  box.innerHTML = r.data.map(a => `
    <div class="complaint-item" style="align-items:flex-start">
      <span style="min-width:0"><b>${escapeHtml(a.title)}</b><br><span style="font-size:.79rem;color:var(--muted)">${escapeHtml(a.body)}</span><br><span style="font-size:.67rem;color:var(--muted)">بواسطة ${escapeHtml(a.admin_name || 'الإدارة')} · ${fmtDate(a.created_at)}</span></span>
      <button class="btn btn-danger btn-sm" data-ann-delete="${a.id}">حذف</button>
    </div>`).join('');
  box.querySelectorAll('[data-ann-delete]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('حذف الإعلان؟')) return;
    const r2 = await api(`/api/admin/announcements/${btn.dataset.annDelete}`, { method: 'DELETE' });
    if (!r2.ok) return toast(r2.error, 'err');
    toast('تم حذف الإعلان'); loadAnnouncements();
  }));
}

// ---------- المفقودات والموجودات (إدارة) ----------
let adminLostTimer = null;
['adminLfStatus', 'adminLfType'].forEach(id => document.getElementById(id).addEventListener('change', loadAdminLostFound));
$('#adminLfSearch').addEventListener('input', () => { clearTimeout(adminLostTimer); adminLostTimer = setTimeout(loadAdminLostFound, 300); });
async function loadAdminLostFound() {
  const box = $('#adminLostList');
  box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:.8rem">جارِ التحميل...</p>';
  const params = new URLSearchParams();
  if ($('#adminLfStatus').value) params.set('status', $('#adminLfStatus').value);
  if ($('#adminLfType').value) params.set('type', $('#adminLfType').value);
  if ($('#adminLfSearch').value.trim()) params.set('q', $('#adminLfSearch').value.trim());
  const r = await api('/api/lost-found' + (params.toString() ? '?' + params : ''));
  if (!r.ok) { box.innerHTML = `<p style="color:var(--danger)">${escapeHtml(r.error)}</p>`; return; }
  $('#adminLostCount').textContent = `${r.data.length} إعلان`;
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
        <select class="admin-lf-status" data-id="${item.id}" style="border:1.5px solid var(--line);border-radius:8px;padding:.3rem .5rem;font-size:.74rem">
          <option value="open" ${item.status === 'open' ? 'selected' : ''}>مفتوح</option>
          <option value="found" ${item.status === 'found' ? 'selected' : ''}>تم العثور عليه</option>
          <option value="returned" ${item.status === 'returned' ? 'selected' : ''}>تم التسليم</option>
        </select>
        <button class="btn btn-outline btn-sm" data-admin-lf-contact="${item.id}">💬 تواصل</button>
        <button class="btn btn-danger btn-sm" data-admin-lf-delete="${item.id}">حذف</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.admin-lf-status').forEach(sel => sel.addEventListener('change', async () => {
    const r = await api(`/api/lost-found/${sel.dataset.id}/status`, { method: 'PATCH', body: { status: sel.value } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم تحديث الحالة'); loadAdminLostFound();
  }));
  box.querySelectorAll('[data-admin-lf-contact]').forEach(btn => btn.addEventListener('click', async () => {
    const msg = prompt('اكتب رسالتك لصاحب الإعلان:');
    if (!msg) return;
    const r = await api(`/api/lost-found/${btn.dataset.adminLfContact}/contact`, { method: 'POST', body: { message: msg } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم إرسال رسالتك — سيصله إشعار ✓');
  }));
  box.querySelectorAll('[data-admin-lf-delete]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('حذف الإعلان؟')) return;
    const r = await api(`/api/lost-found/${btn.dataset.adminLfDelete}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم حذف الإعلان'); loadAdminLostFound();
  }));
}

// ---------- أولوية الشكوى يدويًا من مودال الإدارة ----------
$('#viewPriority').addEventListener('change', async () => {
  if (!viewComplaintId) return;
  const r = await api(`/api/complaints/${viewComplaintId}/priority`, { method: 'POST', body: { priority: $('#viewPriority').value } });
  if (!r.ok) return toast(r.error, 'err');
  toast('تم تعديل الأولوية ✓');
  openViewComplaint(viewComplaintId);
});

// ---------- تفعيل الأقسام الجديدة عند ظهورها ----------
window.addEventListener('nexus:section-shown', e => {
  const s = e.detail.section;
  if (s === 'satisfaction') loadSatisfaction();
  if (s === 'announcements') loadAnnouncements();
  if (s === 'lostfound') loadAdminLostFound();
});


// ============================================================
//  تصنيف أداء الأقسام — محسوب بالكامل من بيانات حقيقية
// ============================================================
async function loadDeptRanking() {
  const tbody = $('#deptRankTableBody');
  const [insR, satR, allR] = await Promise.all([api('/api/admin/insights'), api('/api/admin/satisfaction'), api('/api/complaints')]);
  if (!insR.ok || !satR.ok || !allR.ok) { tbody.innerHTML = '<tr><td colspan="7" style="color:var(--danger)">تعذر حساب التصنيف</td></tr>'; return; }
  const deptInfo = {};
  for (const d of insR.data.perDepartment) deptInfo[d.name] = { name: d.name, total: d.total, open: d.open, resolved: d.resolved, avgHours: null, satPct: null };
  // متوسط زمن الحل لكل قسم من بيانات الشكاوى الكاملة
  const times = {};
  for (const c of allR.data) {
    if (c.status === 'resolved' && c.resolved_at) {
      (times[c.department_name] = times[c.department_name] || []).push((new Date(String(c.resolved_at).replace(' ', 'T') + 'Z') - new Date(String(c.created_at).replace(' ', 'T') + 'Z')) / 3600000);
    }
  }
  for (const [k, arr] of Object.entries(times)) if (deptInfo[k]) deptInfo[k].avgHours = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  // رضا كل قسم من دالة الرضا (0-100)
  for (const d of satR.data.perDepartment) if (deptInfo[d.name]) deptInfo[d.name].satPct = d.pct;

  const rows = Object.values(deptInfo).map(d => {
    const pctResolved = d.total ? Math.round(d.resolved / d.total * 100) : 0;
    const sat = d.satPct ?? 50; // لا توجد تقييمات → قيمة محايدة لا تُظلم القسم
    const speed = d.avgHours === null ? 60 : Math.max(0, 100 - (d.avgHours / 72) * 100);
    const score = Math.round(pctResolved * 0.5 + sat * 0.3 + speed * 0.2);
    return { ...d, pctResolved, sat, speed: Math.round(speed), score };
  }).sort((a, b) => b.score - a.score);

  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">لا توجد بيانات كافية للتصنيف</td></tr>'; return; }
  tbody.innerHTML = rows.map((d, i) => `
    <tr class="${i === 0 ? 'rank-1' : ''}">
      <td><span class="rank-pill">${i === 0 ? '🏆 1' : i + 1}</span></td>
      <td><b>${escapeHtml(d.name)}</b>${i === 0 ? ' <span class="badge new" style="font-size:.6rem">الأفضل</span>' : ''}</td>
      <td>${d.total}</td>
      <td>${d.pctResolved}%</td>
      <td>${d.avgHours !== null ? d.avgHours + ' ساعة' : '—'}</td>
      <td>${d.satPct !== null && d.satPct !== undefined ? d.satPct + '%' : '—'}</td>
      <td><b style="color:var(--blue)">${d.score}</b>/100</td>
    </tr>`).join('');
}
