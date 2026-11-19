// NEXUS AI — Student dashboard logic
let currentUser = null;
let currentComplaintId = null;
let attachmentPayload = null; // { name, dataBase64 }
let mineFilter = '';

(async function init() {
  currentUser = await requireRolePage('student');
  if (!currentUser) return;

  $('#userName').textContent = currentUser.name;
  $('#userAvatar').textContent = (currentUser.name || 'ط').trim()[0];
  $('#userRole').textContent = 'طالب' + (currentUser.student_code ? ' · ' + currentUser.student_code : '');

  initShell({ active: 'dashboard', onOpenComplaint: openComplaint });
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => switchSection(b.dataset.goto)));
  window.addEventListener('nexus:section-shown', e => {
    const s = e.detail.section;
    if (s === 'mine') loadMine();
    if (s === 'notifs') loadNotifications();
    if (s === 'dashboard') { loadStats(); loadWidgets(); }
  });

  await Promise.all([loadTypes(), loadStats(), loadRecent(), loadWidgets(), loadAnnouncementBanner()]);
  renderAiHistory();

  // أزرار الاختصارات تفتح الأتاب المناسب داخل الخدمات الأكاديمية
  $('#qaAttendance').addEventListener('click', () => setTimeout(() => activateAcademicTab('tabAttendance'), 60));
  $('#qaDocuments').addEventListener('click', () => setTimeout(() => activateAcademicTab('tabDocuments'), 60));
  window.addEventListener('nexus:section-shown', e => {
    if (e.detail.section === 'academics') loadAcademics();
    if (e.detail.section === 'lostfound') loadLostFound();
  });

  // استقبال حدث فتح شكوى من الإشعار (من الجرس في أي صفحة)
  // تم تمريره عبر initShell onOpenComplaint
})();

function switchSection(name) {
  $(`.side-link[data-section="${name}"]`)?.click();
}

// ---------- الرئيسية ----------
async function loadStats() {
  const r = await api('/api/stats');
  if (!r.ok) return;
  $('#stTotal').textContent = r.data.total;
  $('#stProgress').textContent = (r.data.in_progress || 0) + (r.data.new || 0);
  $('#stResolved').textContent = r.data.resolved;
  $('#stRejected').textContent = r.data.rejected;
}
async function loadRecent() {
  const r = await api('/api/stats');
  const box = $('#recentList');
  if (!r.ok || !r.data.recent?.length) { box.innerHTML = '<p style="color:var(--muted);font-size:.85rem;text-align:center;padding:.6rem">لسه معندكش طلبات — قدّم أول شكوى من «شكوى جديدة» 🚀</p>'; return; }
  box.innerHTML = r.data.recent.map(c => `
    <button class="complaint-item" style="width:100%;text-align:start" data-open="${c.id}">
      <span><span class="ticket-no">${escapeHtml(c.ticket_no)}</span><br><b>${escapeHtml(c.title)}</b></span>
      <span style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap">${priorityBadge(c.priority)} ${statusBadge(c.status)} ${closureTag(c)}</span>
    </button>`).join('');
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openComplaint(Number(b.dataset.open))));
}

// ---------- شكوى جديدة ----------
async function loadTypes() {
  const r = await api('/api/complaint-types');
  if (!r.ok) return;
  const sel = $('#fType');
  for (const t of r.data) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = `${t.name} — ${t.department_name}`; o.dataset.dept = t.department_id;
    sel.appendChild(o);
  }
}

$('#fAttachment').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('الملف أكبر من 8MB', 'err'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    attachmentPayload = { name: file.name, dataBase64: reader.result };
    $('#fileName').textContent = file.name;
  };
  reader.readAsDataURL(file);
});
$('#pickFileBtn').addEventListener('click', () => $('#fAttachment').click());

$('#aiAnalyzeBtn').addEventListener('click', runAiAnalysis);
async function runAiAnalysis() {
  const text = `${$('#fTitle').value} ${$('#fDetails').value}`.trim();
  const box = $('#aiSuggestionBody');
  if (text.length < 15) { toast('اكتب عنوان وتفاصيل كافية للتحليل', 'err'); return; }
  box.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  const r = await api('/api/ai/classify', { method: 'POST', body: { text } });
  if (!r.ok) { box.textContent = r.error; return; }
  const ai = r.data;
  const confPct = Math.round(ai.confidence * 100);
  $('#fPriority').value = ai.priority;
  // اختار نوع الشكوى المطابق إن وجد
  const opt = [...$('#fType').options].find(o => o.textContent.startsWith(ai.category));
  if (opt) $('#fType').value = opt.value;
  box.innerHTML = `
    <div style="display:grid;gap:.45rem;font-size:.84rem">
      <div style="display:flex;justify-content:space-between;gap:.5rem"><span style="color:var(--muted)">النوع المتوقع:</span><b>${escapeHtml(ai.category)}</b></div>
      <div style="display:flex;justify-content:space-between;gap:.5rem"><span style="color:var(--muted)">القسم المسؤول:</span><b>${escapeHtml(ai.department_name || '—')}</b></div>
      <div style="display:flex;justify-content:space-between;gap:.5rem"><span style="color:var(--muted)">الأولوية:</span>${priorityBadge(ai.priority)}</div>
      <div class="ai-analysis" style="margin-top:.2rem"><b>دقة التوقع: ${confPct}%</b><div class="conf"><div class="progress"><div style="width:${confPct}%"></div></div></div>
        ${ai.matched_keywords?.length ? `<div style="margin-top:.35rem;font-size:.72rem;color:var(--muted)">بناءً على كلمات: ${ai.matched_keywords.map(k => `<span class="src-chip">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
        <div style="margin-top:.3rem;font-size:.7rem;color:var(--muted)">تم تعبئة الأولوية ونوع الشكوى تلقائيًا — تقدر تعدلها.</div>
      </div>
    </div>`;
}

$('#complaintForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#submitComplaintBtn'); btn.disabled = true; btn.textContent = 'جارِ الإرسال...';
  let attachmentUrl = attachmentPayload?.name ? null : null;
  if (attachmentPayload) {
    const up = await api('/api/upload', { method: 'POST', body: { filename: attachmentPayload.name, dataBase64: attachmentPayload.dataBase64 } });
    if (up.ok) attachmentUrl = up.data.url; else { toast(up.error || 'فشل رفع المرفق', 'err'); btn.disabled = false; btn.textContent = 'إرسال الشكوى الآن'; return; }
  }
  const selectedType = $('#fType').selectedOptions[0];
  const r = await api('/api/complaints', { method: 'POST', body: {
    title: $('#fTitle').value.trim(), details: $('#fDetails').value.trim(),
    type_id: $('#fType').value || null,
    department_id: selectedType?.dataset.dept || null,
    priority: $('#fPriority').value, attachment: attachmentUrl,
  }});
  if (!r.ok) { toast(r.error || 'تعذر إرسال الشكوى', 'err'); btn.disabled = false; btn.textContent = 'إرسال الشكوى الآن'; return; }
  toast(`تم استلام شكواك — رقم الطلب: ${r.data.complaint.ticket_no} ✓`);
  e.target.reset(); attachmentPayload = null; $('#fileName').textContent = 'لم يتم اختيار ملف';
  $('#aiSuggestionBody').textContent = 'تم إرسال الشكوى! الذكاء الاصطناعي حولها للقسم المختص وهنوافيك بأي تحديث على إشعار.';
  btn.disabled = false; btn.textContent = 'إرسال الشكوى الآن';
  switchSection('mine'); loadMine();
});

// ---------- شكوايّ ----------
$('#mineFilterSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-status]'); if (!b) return;
  mineFilter = b.dataset.status;
  $('#mineFilterSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  loadMine();
});

async function loadMine() {
  const box = $('#mineList');
  box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">جارِ التحميل...</p>';
  const r = await api(`/api/complaints${mineFilter ? '?status=' + mineFilter : ''}`);
  if (!r.ok) { box.innerHTML = `<p style="color:var(--danger)">${escapeHtml(r.error)}</p>`; return; }
  if (!r.data.length) { box.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1.2rem">لا توجد شكاوى في هذه الحالة.</p>'; return; }
  box.innerHTML = r.data.map(c => `
    <button class="complaint-item" style="width:100%;text-align:start" data-open="${c.id}">
      <span style="min-width:0"><span class="ticket-no">${escapeHtml(c.ticket_no)} · ${fmtDay(c.created_at)}</span><br><b>${escapeHtml(c.title)}</b><br><span style="font-size:.72rem;color:var(--muted)">${escapeHtml(c.department_name)}${c.assigned_name ? ' · ' + escapeHtml(c.assigned_name) : ''}</span></span>
      <span style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-end">${statusBadge(c.status)} ${priorityBadge(c.priority)} ${closureTag(c)}</span>
    </button>`).join('');
  box.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openComplaint(Number(b.dataset.open))));
}

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
  $('#modalHeadInfo').innerHTML = `<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">${statusBadge(c.status)} ${priorityBadge(c.priority)}${closureTag(c)}<span style="font-size:.75rem;color:var(--muted)">القسم: <b>${escapeHtml(c.department_name)}</b>${c.assigned_name ? ' · الموظف: <b>' + escapeHtml(c.assigned_name) + '</b>' : ''} · أُنشئت ${fmtDate(c.created_at)}</span></div>`;
  renderStepper($('#modalStepper'), c, updates);
  renderConfirmBanner(c);
  $('#modalDetails').textContent = c.details;

  // صندوق تحليل الذكاء الاصطناعي
  const aiBox = $('#modalAiBox');
  if (c.ai_category) {
    aiBox.style.display = 'block';
    aiBox.innerHTML = `<b>✨ تحليل NEXUS AI:</b> صُنفت كـ«${escapeHtml(c.ai_category)}» بثقة ${Math.round((c.ai_confidence || 0) * 100)}% وحُوّلت تلقائيًا للقسم المختص.`;
  } else aiBox.style.display = 'none';

  $('#modalAttachment').innerHTML = c.attachment ? `<a class="link" href="${escapeHtml(c.attachment)}" target="_blank" rel="noopener">📎 عرض المرفق</a>` : '';

  $('#modalTimeline').innerHTML = updates.map(u => `
    <li><div class="t-body"><b>${escapeHtml(actionLabel(u.action))}</b>${u.details ? `<span>${escapeHtml(u.details)}</span>` : ''}</div><time>${fmtDay(u.created_at)}</time></li>`).join('') || '<li><div class="t-body"><span>لا توجد تحديثات بعد</span></div></li>';

  // محادثة
  const chat = $('#modalChat');
  chat.innerHTML = messages.length ? messages.map(m => {
    const mine = m.sender_role === 'student';
    return `<div class="msg ${mine ? 'me' : 'them'}"><div class="meta"><span>${escapeHtml(m.sender_name)}</span><span>${fmtDate(m.created_at)}</span></div>${escapeHtml(m.body)}</div>`;
  }).join('') : '<p style="color:var(--muted);font-size:.82rem;text-align:center;padding:1rem">لسه مفيش رسائل — ابدأ المحادثة مع الموظف المختص.</p>';
  chat.scrollTop = chat.scrollHeight;

  // تقييم بعد الحل — نجوم + تعليق للإدارة
  const ratingBox = $('#ratingBox');
  const commentBox = $('#ratingComment'), submitRatingBtn = $('#submitRatingBtn');
  if (c.status === 'resolved') {
    ratingBox.style.display = 'block';
    let pendingRating = c.rating || 0;
    renderStars(pendingRating, $('#ratingStars'));
    $('#ratingThanks').style.display = c.rating ? 'block' : 'none';
    commentBox.value = c.rating_comment || '';
    if (c.rating) {
      $('#ratingStars').querySelectorAll('.star-btn').forEach(b => b.disabled = true);
      commentBox.disabled = true; submitRatingBtn.style.display = 'none';
    } else {
      commentBox.disabled = false;
      $('#ratingStars').querySelectorAll('.star-btn').forEach(btn => btn.addEventListener('click', () => {
        pendingRating = Number(btn.dataset.star);
        renderStars(pendingRating, $('#ratingStars'));
        submitRatingBtn.style.display = 'inline-flex';
      }));
      submitRatingBtn.onclick = async () => {
        if (!pendingRating) return toast('اختار عدد النجوم أولًا', 'err');
        const r2 = await api(`/api/complaints/${c.id}/rate`, { method: 'POST', body: { rating: pendingRating, comment: commentBox.value.trim() } });
        if (!r2.ok) return toast(r2.error, 'err');
        $('#ratingStars').querySelectorAll('.star-btn').forEach(b => b.disabled = true);
        commentBox.disabled = true; submitRatingBtn.style.display = 'none';
        $('#ratingThanks').style.display = 'block';
        toast('شكرًا لتقييمك! 🌟');
      };
    }
  } else ratingBox.style.display = 'none';
}
// ===== بانر تأكيد الحل — تُغلق الشكوى رسميًا بعد إجابة الطالب =====
function renderConfirmBanner(c) {
  const banner = $('#confirmBanner');
  const yesBtn = $('#confirmYesBtn'), noBtn = $('#confirmNoBtn'), reasonBox = $('#confirmRejectReason'), rejectSubmit = $('#confirmRejectSubmit');
  const isAwaiting = c.status === 'resolved' && c.closure_status !== 'confirmed';
  banner.style.display = isAwaiting ? 'flex' : 'none';
  if (!isAwaiting) { reasonBox.style.display = 'none'; rejectSubmit.style.display = 'none'; reasonBox.value = ''; return; }
  reasonBox.style.display = 'none'; rejectSubmit.style.display = 'none'; reasonBox.value = '';
  yesBtn.onclick = async () => {
    const r = await api(`/api/complaints/${c.id}/confirm`, { method: 'POST', body: { decision: 'confirmed' } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم إغلاق شكواك رسميًا — شكرًا لثقتك 🌟');
    const reload = await api(`/api/complaints/${c.id}`);
    if (reload.ok) renderModal(reload.data);
  };
  noBtn.onclick = () => { reasonBox.style.display = 'block'; rejectSubmit.style.display = 'inline-flex'; reasonBox.focus(); };
  rejectSubmit.onclick = async () => {
    const reason = reasonBox.value.trim();
    if (reason.length < 5) return toast('اكتب سبب عدم الحل (٥ أحرف+)', 'err');
    const r = await api(`/api/complaints/${c.id}/confirm`, { method: 'POST', body: { decision: 'rejected', reason } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم إبلاغ الموظف المختص — شكرًا لتوضيحك');
    const reload = await api(`/api/complaints/${c.id}`);
    if (reload.ok) renderModal(reload.data);
  };
}

function actionLabel(a) { return { created: 'تم إنشاء الشكوى', status: 'تغيير الحالة', assigned: 'إسناد', transfer: 'تحويل لقسم', request_info: 'طلب معلومات', priority: 'تعديل الأولوية يدويًا', closure_confirmed: 'الطالب أكّد الحل', reopened: 'الشكوى اُعيد فتحها', request_confirmation: 'الشؤون طلبت تأكيد الحل', employee_confirmed: 'الموظف أكّد الحل', employee_not_confirmed: 'الموظف: لسه مش محلولة', rating_reset: 'تم مسح التقييم بمعرفة الإدارة' }[a] || a; }

$('#modalMessageForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#modalMessageInput');
  const body = input.value.trim(); if (!body || !currentComplaintId) return;
  const r = await api(`/api/complaints/${currentComplaintId}/messages`, { method: 'POST', body: { body } });
  if (!r.ok) { toast(r.error, 'err'); return; }
  input.value = '';
  const reload = await api(`/api/complaints/${currentComplaintId}`);
  if (reload.ok) renderModal(reload.data);
  toast('تم إرسال رسالتك للموظف ✓');
});

// ---------- المساعد الذكي ----------
const aiBox = $('#aiChatBox');
function addAiBubble(text, cls) {
  const div = document.createElement('div');
  div.className = `ai-msg ${cls}`;
  div.textContent = text;
  aiBox.appendChild(div);
  aiBox.scrollTop = aiBox.scrollHeight;
  return div;
}
function addBotAnswer(answer, sources) {
  const div = document.createElement('div');
  div.className = 'ai-msg bot';
  div.innerHTML = `${escapeHtml(answer)}${sources && sources.length ? `<div class="sources"><b>المصادر:</b><br>${sources.map(s => `<span class="src-chip">📄 ${escapeHtml(s.title)} · ص${s.page ?? '—'}</span>`).join(' ')}</div>` : ''}`;
  aiBox.appendChild(div);
  aiBox.scrollTop = aiBox.scrollHeight;
}
function suggestionsForAnswer(sources) {
  const cat = sources && sources[0] && sources[0].category;
  const map = {
    'التسجيل': ['الأوراق المطلوبة للتقديم وكيف أستخرج شهادة قيد؟', 'ما نسبة الغياب المسموح بها؟', 'إزاي أقدم طلب إعفاء من المصروفات؟'],
    'الامتحانات': ['إزاي أقدم تظلم على الدرجات وإيه الرسوم؟', 'ما نسبة الغياب المسموح بها في الامتحانات؟', 'ما هي شروط التحويل من معهد آخر؟'],
    'المالية': ['إزاي أقدم طلب إعفاء من المصروفات؟', 'ما مواعيد سداد القسط التاني؟'],
    'تكنولوجيا المعلومات': ['نسيت كلمة مرور المنصة أعمل إيه؟', 'إزاي أرسل شكوى للدعم الفني؟'],
    'شؤون الطلاب': ['ما هي شروط التحويل من معهد آخر؟', 'إزاي أستخرج شهادة قيد؟'],
    'المكتبة': ['كم كتاب أقدر أستعير ومدة إيه؟'],
  };
  return map[cat] || ['ما هي شروط التحويل من معهد آخر؟', 'إزاي أقدم تظلم على الدرجات وإيه الرسوم؟', 'ما نسبة الغياب المسموح بها؟'];
}
function addFollowUpSuggestions(sources) {
  const box = document.createElement('div');
  box.className = 'quick-questions';
  box.style.marginTop = '.2rem';
  box.innerHTML = suggestionsForAnswer(sources).map(s => `<button class="qq">${escapeHtml(s)}</button>`).join('');
  aiBox.appendChild(box);
  aiBox.scrollTop = aiBox.scrollHeight;
  box.querySelectorAll('.qq').forEach(b => b.addEventListener('click', () => { box.remove(); askAssistant(b.textContent.trim()); }));
}
async function askAssistant(text) {
  addAiBubble(text, 'user');
  const typing = document.createElement('div');
  typing.className = 'ai-msg bot'; typing.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  aiBox.appendChild(typing); aiBox.scrollTop = aiBox.scrollHeight;
  const r = await api('/api/ai/chat', { method: 'POST', body: { message: text } });
  typing.remove();
  if (!r.ok) { addBotAnswer(r.error || 'حصل خطأ، حاول تاني.', []); return; }
  addBotAnswer(r.data.answer, r.data.sources);
  if (r.data.grounded && r.data.sources && r.data.sources.length) addFollowUpSuggestions(r.data.sources);
}
async function renderAiHistory() {
  const r = await api('/api/ai/conversations');
  if (!r.ok || !r.data.length) {
    addBotAnswer('أهلًا بيك! أنا المساعد الذكي بتاع المعهد 🎓 اسألني عن اللوائح، التسجيل، الامتحانات، المصروفات، أو الخدمات — والإجابة هتجيلك بالمصدر والصفحة.', []);
    return;
  }
  for (const row of r.data) {
    if (row.role === 'user') addAiBubble(row.message, 'user'); else addAiBubble(row.message, 'bot');
  }
}
$('#aiChatForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#aiChatInput'); const v = input.value.trim(); if (v.length < 3) return;
  input.value = ''; askAssistant(v);
});
$('#quickQuestions').addEventListener('click', e => {
  const btn = e.target.closest('.qq'); if (!btn) return;
  askAssistant(btn.textContent.trim());
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
//  الميزات المتقدمة: الـ Widgets + الخدمات الأكاديمية + المفقودات + الصوت
// ============================================================

// ---------- Widgets لوحة الطالب ----------
async function loadWidgets() {
  const [gradesR, attR, examsR, complaintsR] = await Promise.all([
    api('/api/academic/grades'), api('/api/academic/attendance'), api('/api/academic/exams'), api('/api/complaints'),
  ]);
  if (gradesR.ok) { $('#wgGpa').innerHTML = `${gradesR.data.gpa.toFixed(2)} <small style="font-size:.4em;color:#C4B5FD">GPA</small>`; $('#wgGpaSub').textContent = `متوسط ${gradesR.data.mean}% من 100 · ${gradesR.data.totalCredits} ساعة معتمدة`; }
  if (attR.ok) { $('#wgAttendance').textContent = attR.data.overallPct; $('#wgAttendanceSub').textContent = `${attR.data.totalAbsences} يوم غياب من ${attR.data.totalLectures} محاضرة`; }
  if (examsR.ok && examsR.data.length) {
    const next = examsR.data[0];
    const d = Math.floor(next.seconds_until / 86400);
    $('#wgNextExam').textContent = `${d} يوم`;
    $('#wgNextExamSub').textContent = `${next.course} · ${new Date(String(next.exam_date).replace(' ', 'T') + 'Z').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}`;
  } else { $('#wgNextExam').textContent = '—'; $('#wgNextExamSub').textContent = 'لا توجد امتحانات قادمة'; }
  if (complaintsR.ok) {
    const urgent = complaintsR.data.filter(c => (c.status === 'new' || c.status === 'in_progress') && ['urgent', 'critical'].includes(c.priority)).length;
    $('#wgUrgent').textContent = urgent;
    $('#wgUrgentSub').textContent = urgent ? 'عاجلة/حرجة — تُحل أولًا' : 'مفيش طلبات عاجلة 🎉';
  }
}

// ---------- بانر الإعلان الجامعي ----------
async function loadAnnouncementBanner() {
  const r = await api('/api/announcements');
  if (!r.ok || !r.data.length) return;
  const latest = r.data[0];
  if (sessionStorage.getItem('announce_dismissed_' + latest.id)) return;
  $('#announceTitle').textContent = latest.title;
  $('#announceBody').textContent = latest.body;
  const banner = $('#announceBanner');
  banner.style.display = 'flex';
  $('#announceDismiss').addEventListener('click', () => { banner.style.display = 'none'; sessionStorage.setItem('announce_dismissed_' + latest.id, '1'); }, { once: true });
}

// ---------- الخدمات الأكاديمية: التابات ----------
function activateAcademicTab(tabId) {
  document.querySelectorAll('.academic-tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.academic-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
}
document.querySelector('#section-academics .academic-tabs')?.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (b) activateAcademicTab(b.dataset.tab);
});
let academicsLoaded = false;
async function loadAcademics() {
  if (academicsLoaded) return;
  academicsLoaded = true;
  await Promise.all([loadTimetable(), loadExams(), loadGrades(), loadFees(), loadAttendance(), loadMyDocuments()]);
}

// الجدول
async function loadTimetable() {
  const r = await api('/api/academic/timetable');
  const wrap = $('#timetableWrap');
  if (!r.ok) { wrap.innerHTML = '<p style="color:var(--danger)">تعذر تحميل الجدول</p>'; return; }
  const days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  wrap.innerHTML = days.map(day => {
    const rows = r.data.filter(x => x.day === day);
    if (!rows.length) return '';
    return `<div class="tt-day"><div class="tt-day-head"><span>${escapeHtml(day)}</span><span>${rows.length} محاضرة</span></div>${rows.map(x => `
      <div class="tt-row"><span class="tt-time" dir="ltr">${escapeHtml(x.start_time)}–${escapeHtml(x.end_time)}</span><div><div class="tt-course">${escapeHtml(x.course)}</div><div class="tt-doctor">${escapeHtml(x.doctor)}</div></div><span class="tt-room">${escapeHtml(x.room)}</span></div>`).join('')}</div>`;
  }).join('');
}

// الامتحانات + العد التنازلي
let examCountdownTimer = null;
async function loadExams() {
  const r = await api('/api/academic/exams');
  const wrap = $('#examsWrap');
  if (!r.ok) { wrap.innerHTML = '<p style="color:var(--danger)">تعذر تحميل الامتحانات</p>'; return; }
  if (!r.data.length) { wrap.innerHTML = '<p style="color:var(--muted);text-align:center;padding:1rem">لا توجد امتحانات قادمة 🎉</p>'; return; }
  wrap.innerHTML = r.data.map(e => {
    const d = new Date(String(e.exam_date).replace(' ', 'T') + 'Z');
    return `<div class="exam-card"><div><b>${escapeHtml(e.course)}</b><br><span style="font-size:.78rem;color:var(--muted)">${d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })} · ${escapeHtml(e.room)} · ${e.duration_minutes} دقيقة</span></div>
      <div class="countdown" data-exam-ts="${d.getTime()}"><b class="cd-days">—</b><span>متبقي</span></div></div>`;
  }).join('');
  const tick = () => {
    document.querySelectorAll('.countdown[data-exam-ts]').forEach(el => {
      const ms = Number(el.dataset.examTs) - Date.now();
      if (ms <= 0) { el.querySelector('.cd-days').textContent = 'انتهى'; return; }
      const days = Math.floor(ms / 86400000), hours = Math.floor((ms % 86400000) / 3600000);
      el.querySelector('.cd-days').textContent = days >= 1 ? `${days} يوم` : `${hours} ساعة`;
    });
  };
  tick(); clearInterval(examCountdownTimer); examCountdownTimer = setInterval(tick, 60000);
}

// النتائج والمعدل
async function loadGrades() {
  const r = await api('/api/academic/grades');
  if (!r.ok) return;
  $('#gpaValue').textContent = r.data.gpa.toFixed(2);
  $('#meanValue').textContent = r.data.mean + '%';
  $('#creditsValue').textContent = r.data.totalCredits;
  $('#gradesTableBody').innerHTML = r.data.grades.map(g => `
    <tr><td><b>${escapeHtml(g.course)}</b></td><td>${g.credit_hours}</td><td>${g.score}</td><td><span class="grade-chip ${escapeHtml(g.grade)}">${escapeHtml(g.grade)}</span></td></tr>`).join('');
}

// المصروفات
async function loadFees() {
  const r = await api('/api/academic/fees');
  if (!r.ok) return;
  $('#feeTotal').textContent = r.data.total.toLocaleString('ar-EG') + ' ج';
  $('#feePaid').textContent = r.data.paid.toLocaleString('ar-EG') + ' ج';
  $('#feeRemaining').textContent = r.data.remaining.toLocaleString('ar-EG') + ' ج';
  $('#feeProgress').style.width = r.data.percentPaid + '%';
  $('#feesTableBody').innerHTML = r.data.fees.map(f => {
    const paid = f.paid >= f.amount;
    return `<tr><td>${escapeHtml(f.label)}</td><td style="font-size:.76rem">${escapeHtml(f.term)}</td><td>${f.amount.toLocaleString('ar-EG')}</td><td>${f.paid.toLocaleString('ar-EG')}</td><td>${(f.amount - f.paid).toLocaleString('ar-EG')}</td><td style="white-space:nowrap">${escapeHtml(f.due_date)}</td><td>${paid ? '<span class="badge resolved">مسدد</span>' : '<span class="badge in_progress">متبقي</span>'}</td></tr>`;
  }).join('');
}

// الحضور + سجل الجلسات
async function loadAttendance() {
  const [r, rec] = await Promise.all([api('/api/academic/attendance'), api('/api/academic/attendance/records')]);
  if (!r.ok) return;
  $('#attOverall').textContent = r.data.overallPct + '%';
  $('#attAbsences').textContent = r.data.totalAbsences;
  $('#attLectures').textContent = r.data.totalLectures;
  $('#attendanceCourses').innerHTML = r.data.courses.map(c => `
    <div class="attend-course"><div><b style="font-size:.84rem;color:var(--navy-800)">${escapeHtml(c.course)}</b><div style="font-size:.68rem;color:var(--muted)">${c.attended} حضور · ${c.absences} غياب</div></div>
    <div style="min-width:150px"><div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--muted);margin-bottom:.15rem"><span>${c.pct}%</span><span>${c.attended}/${c.total}</span></div><div class="progress"><div style="width:${c.pct}%"></div></div></div></div>`).join('');
  const box = $('#myAttendanceRecords');
  if (!rec.ok || !rec.data.length) box.innerHTML = '<p style="color:var(--muted);font-size:.82rem;text-align:center;padding:.6rem">لسه ماسجلتش حضور في جلسات QR</p>';
  else box.innerHTML = rec.data.map(x => `<div class="notif-item"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto"><path d="M20 6L9 17l-5-5"/></svg><div><b style="font-size:.8rem">${escapeHtml(x.lecture_name)}</b><p>${escapeHtml(x.doctor_name || '')} · ${fmtDate(x.attended_at)}</p></div></div>`).join('');
}

// QR scanner + كود يدوي
let html5QrCode = null;
async function markAttendance(code) {
  const r = await api('/api/attendance/mark', { method: 'POST', body: { code } });
  if (!r.ok) { toast(r.error, 'err'); return false; }
  toast(`تم تسجيل حضورك في «${r.data.lecture_name}» ✓`);
  loadAttendance();
  return true;
}
$('#manualCodeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#manualCode');
  const okMark = await markAttendance(input.value.trim().toUpperCase());
  if (okMark) input.value = '';
});
$('#startScannerBtn').addEventListener('click', async function () {
  if (!window.Html5Qrcode) { toast('مكتبة المسح مش متاحة (تأكد من الإنترنت) — استخدم الكود اليدوي', 'err'); return; }
  const container = $('#qrScanner');
  if (html5QrCode) { await stopQrScanner(); return; }
  container.innerHTML = '<div id="qrReader" style="width:100%;height:100%"></div>';
  html5QrCode = new Html5Qrcode('qrReader', { verbose: false });
  try {
    await html5QrCode.start({ facingMode: 'environment' }, { fps: 10, qrbox: 200 }, async code => {
      await stopQrScanner();
      await markAttendance(String(code).trim().toUpperCase());
    }, () => {});
    this.textContent = 'إيقاف الكاميرا';
  } catch (err) {
    html5QrCode = null;
    container.innerHTML = '<div style="text-align:center;padding:1rem"><p style="color:#FCA5A5;font-size:.8rem">لا يمكن الوصول للكاميرا — استخدم الكود اليدوي</p></div>';
  }
});
async function stopQrScanner() {
  try { if (html5QrCode) await html5QrCode.stop(); } catch (e) { /* بالفعل متوقف */ }
  html5QrCode = null;
  const btn = document.getElementById('startScannerBtn');
  if (btn) btn.textContent = 'تشغيل الكاميرا';
}

// ---------- المستندات الذكية (OCR + تحليل محلي) ----------
const DOC_TYPES = [
  { type: 'إيصال سداد', keywords: ['ايصال', 'إيصال', 'سداد', 'مصروفات', 'قسط', 'مبلغ'], fields: ['رقم الإيصال', 'المبلغ', 'التاريخ', 'اسم الجهة'] },
  { type: 'شهادة قيد', keywords: ['شهادة قيد', 'قيد بالمعهد', 'مقيد', 'الفرقة'], fields: ['اسم الطالب', 'الرقم الجامعي', 'الفرقة', 'تاريخ الإصدار'] },
  { type: 'كارنيه / بطاقة طالب', keywords: ['كارنيه', 'بطاقة', 'طالب'], fields: ['الاسم', 'الرقم الجامعي', 'الصورة'] },
  { type: 'تقرير طبي', keywords: ['تقرير طبي', 'مستشفى', 'تشخيص', 'طبيب', 'علاج'], fields: ['اسم الطبيب', 'التاريخ', 'الختم أو التوقيع'] },
  { type: 'استمارة / نموذج', keywords: ['استمارة', 'نموذج', 'طلب'], fields: ['الاسم', 'التوقيع', 'التاريخ'] },
];
function normalizeDocText(t) { return String(t || '').toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/ـ/g, '').replace(/[أإآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه'); }
function classifyDocument(text) {
  const norm = normalizeDocText(text);
  let best = { type: 'مستند عام', score: 0, fields: ['الاسم', 'التاريخ'] };
  for (const t of DOC_TYPES) {
    let score = 0;
    for (const kw of t.keywords) if (norm.includes(normalizeDocText(kw))) score += 1;
    if (score > best.score) best = { type: t.type, score, fields: t.fields };
  }
  return best;
}
function fieldPresent(field, text) {
  const norm = normalizeDocText(text);
  const patterns = {
    'رقم الإيصال': ['ايصال', 'رقم السداد', 'رقم القسط', 'no'],
    'المبلغ': ['مبلغ', 'جنيه', 'ج.م', 'egp', 'total', 'قيمة'],
    'التاريخ': ['تاريخ', 'date', '/'],
    'اسم الجهة': ['معهد', 'كلية', 'الجهة', 'فرع'],
    'اسم الطالب': ['الطالب', 'اسم', 'name'],
    'الرقم الجامعي': ['جامعي', 'رقم القيد', 'code', '2023'],
    'الفرقة': ['فرقة', 'level'],
    'تاريخ الإصدار': ['تاريخ', 'date'],
    'الاسم': ['اسم', 'name'],
    'الصورة': ['صورة'],
    'اسم الطبيب': ['طبيب', 'دكتور', 'د/'],
    'الختم أو التوقيع': ['ختم', 'توقيع', 'استامب', 'stamp'],
    'التوقيع': ['توقيع', 'sign'],
  };
  return (patterns[field] || [normalizeDocText(field)]).some(p => norm.includes(normalizeDocText(p)));
}
const docDropZone = $('#docDropZone'), docFileInput = $('#docFileInput'), docResult = $('#docAnalysisResult');
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
docDropZone.addEventListener('click', () => docFileInput.click());
docDropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') docFileInput.click(); });
docDropZone.addEventListener('dragover', e => { e.preventDefault(); docDropZone.classList.add('dragover'); });
docDropZone.addEventListener('dragleave', () => docDropZone.classList.remove('dragover'));
docDropZone.addEventListener('drop', e => { e.preventDefault(); docDropZone.classList.remove('dragover'); if (e.dataTransfer.files[0]) analyzeDocument(e.dataTransfer.files[0]); });
docFileInput.addEventListener('change', e => { if (e.target.files[0]) analyzeDocument(e.target.files[0]); });

async function analyzeDocument(file) {
  if (file.size > 8 * 1024 * 1024) return toast('الملف أكبر من 8MB', 'err');
  docResult.style.display = 'block';
  docResult.innerHTML = '<div class="doc-result"><div class="typing"><span></span><span></span><span></span></div><p style="font-size:.8rem;color:var(--muted);margin-top:.4rem">جارِ قراءة المستند واستخراج بياناته...</p></div>';
  try {
    let extracted = '';
    if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
      if (!window.pdfjsLib) throw new Error('محرك PDF غير متاح — تأكد من الاتصال بالإنترنت');
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      for (let p = 1; p <= Math.min(pdf.numPages, 6); p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        extracted += tc.items.map(i => i.str).join(' ') + '\n';
      }
    } else {
      if (!window.Tesseract) throw new Error('محرك OCR غير متاح — تأكد من الاتصال بالإنترنت');
      const { data } = await Tesseract.recognize(file, 'ara+eng', { logger: () => {} });
      extracted = data.text || '';
    }
    extracted = extracted.trim();
    if (extracted.length < 15) throw new Error('لم أستطع قراءة نص كافٍ من المستند — جرّب صورة أوضح');
    const cls = classifyDocument(extracted);
    const results = cls.fields.map(f => ({ field: f, present: fieldPresent(f, extracted) }));
    const missing = results.filter(r => !r.present).map(r => r.field);
    const status = missing.length === 0 ? 'complete' : 'incomplete';
    renderDocumentResult(file.name, cls.type, results, missing, status, extracted);
    const save = await api('/api/documents/save', { method: 'POST', body: { filename: file.name, doc_type: cls.type, extracted: extracted.slice(0, 4000), missing, status } });
    if (save.ok) loadMyDocuments();
  } catch (err) {
    docResult.innerHTML = `<div class="doc-result" style="border-color:#FECACA"><b style="color:var(--danger)">تعذر تحليل المستند</b><p style="font-size:.82rem;color:var(--muted)">${escapeHtml(err.message)}</p></div>`;
  }
}
function renderDocumentResult(filename, docType, results, missing, status, extracted) {
  const complete = status === 'complete';
  docResult.innerHTML = `
    <div class="doc-result" style="border-inline-start:4px solid ${complete ? 'var(--ok)' : 'var(--warn)'}">
      <div style="display:flex;justify-content:space-between;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:.4rem">
        <div><b style="color:var(--navy-800);font-size:.9rem">نتيجة التحليل</b><br><span style="font-size:.75rem;color:var(--muted)">${escapeHtml(filename)}</span></div>
        <span class="doc-type-badge">📄 ${escapeHtml(docType)}</span>
      </div>
      ${results.map(r => `<div class="doc-field"><span class="${r.present ? 'ok' : 'miss'}">${r.present ? '✓' : '✗'}</span> ${escapeHtml(r.field)}</div>`).join('')}
      <div style="margin-top:.5rem;font-size:.8rem">${complete ? '<b style="color:var(--ok)">المستند مكتمل — كل الحقول موجودة ✓</b>' : `<b style="color:var(--warn)">حقول ناقصة: ${escapeHtml(missing.join('، '))}</b>`}</div>
      <details style="margin-top:.4rem;font-size:.76rem;color:var(--muted)"><summary style="cursor:pointer;font-weight:800">النص المستخرج</summary><p style="white-space:pre-line;max-height:120px;overflow-y:auto;background:#F8FBFF;border-radius:8px;padding:.4rem;margin-top:.3rem">${escapeHtml(extracted.slice(0, 1500))}${extracted.length > 1500 ? '…' : ''}</p></details>
    </div>`;
}
async function loadMyDocuments() {
  const box = $('#myDocuments');
  const r = await api('/api/documents/my');
  if (!r.ok) { box.innerHTML = ''; return; }
  if (!r.data.length) { box.innerHTML = '<p style="color:var(--muted);font-size:.82rem;text-align:center;padding:.5rem">لسه ماحلّلتش مستندات</p>'; return; }
  box.innerHTML = r.data.map(d => `
    <div class="notif-item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${d.status === 'complete' ? '#16A34A' : '#D97706'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>
      <div style="min-width:0"><b>${escapeHtml(d.filename)}</b><p>${escapeHtml(d.doc_type)}${d.missing ? ' · ناقص: ' + escapeHtml(d.missing) : ' · مكتمل'}</p></div>
      <time>${fmtDay(d.created_at)}</time></div>`).join('');
}

// ---------- المفقودات والموجودات ----------
let lostFoundImage = null, lostFoundType = 'lost';
const lfTypeButtons = document.querySelectorAll('[data-lf-type]');
lfTypeButtons.forEach(b => b.addEventListener('click', () => {
  lostFoundType = b.dataset.lfType;
  lfTypeButtons.forEach(x => x.classList.toggle('active', x === b));
}));
$('#lfPickImage').addEventListener('click', () => $('#lfImage').click());
$('#lfImage').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 2.5 * 1024 * 1024) return toast('الصورة أكبر من 2.5MB', 'err');
  const reader = new FileReader();
  reader.onload = () => { lostFoundImage = reader.result; $('#lfImageName').textContent = file.name; };
  reader.readAsDataURL(file);
});
$('#lostFoundForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#lfSubmitBtn'); btn.disabled = true;
  const r = await api('/api/lost-found', { method: 'POST', body: {
    type: lostFoundType, title: $('#lfTitle').value.trim(), description: $('#lfDesc').value.trim(),
    category: $('#lfCategory').value, location: $('#lfLocation').value.trim(), item_date: $('#lfDate').value || null, image: lostFoundImage,
  }});
  btn.disabled = false;
  if (!r.ok) return toast(r.error, 'err');
  toast('تم نشر إعلانك ✓');
  e.target.reset(); lostFoundImage = null; $('#lfImageName').textContent = 'لا توجد صورة';
  loadLostFound();
});
let lfSearchTimer = null;
document.getElementById('lfTypeSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-type]'); if (!b) return;
  document.getElementById('lfTypeSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  loadLostFound();
});
$('#lfCategoryFilter').addEventListener('change', () => loadLostFound());
$('#lfSearch').addEventListener('input', () => { clearTimeout(lfSearchTimer); lfSearchTimer = setTimeout(loadLostFound, 300); });
const LF_STATUS = { open: 'مفتوح', found: 'تم العثور عليه', returned: 'تم التسليم' };
async function loadLostFound() {
  const grid = $('#lostFoundGrid');
  grid.innerHTML = '<p style="color:var(--muted)">جارِ التحميل...</p>';
  const params = new URLSearchParams();
  const activeType = document.querySelector('#lfTypeSeg button.active')?.dataset.type;
  if (activeType) params.set('type', activeType);
  if ($('#lfCategoryFilter').value) params.set('category', $('#lfCategoryFilter').value);
  if ($('#lfSearch').value.trim()) params.set('q', $('#lfSearch').value.trim());
  const r = await api('/api/lost-found' + (params.toString() ? '?' + params : ''));
  if (!r.ok) { grid.innerHTML = `<p style="color:var(--danger)">${escapeHtml(r.error)}</p>`; return; }
  if (!r.data.length) { grid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:1.5rem">لا توجد إعلانات بهذه الفلاتر.</p>'; return; }
  grid.innerHTML = r.data.map(item => `
    <div class="lost-card">
      <div class="lost-img">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">` : '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#7E97BC" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'}</div>
      <div class="lost-body">
        <span class="lost-type ${item.type}">${item.type === 'lost' ? '🔴 مفقود' : '🟢 موجود'}</span>
        <b style="font-size:.86rem;color:var(--navy-800)">${escapeHtml(item.title)}</b>
        <span style="font-size:.72rem;color:var(--muted)">${escapeHtml(item.description || '')}</span>
        <span class="lost-status">📍 ${escapeHtml(item.location || 'غير محدد')} · 📅 ${escapeHtml(item.item_date || '')}</span>
        <span class="lost-status">بواسطة ${escapeHtml(item.owner_name)} · <b>${LF_STATUS[item.status]}</b></span>
      </div>
      <div class="lost-actions">
        ${item.can_edit ? `
          <select class="lf-status-select" data-id="${item.id}" style="border:1.5px solid var(--line);border-radius:8px;padding:.3rem .5rem;font-size:.72rem">
            <option value="open" ${item.status === 'open' ? 'selected' : ''}>مفتوح</option>
            <option value="found" ${item.status === 'found' ? 'selected' : ''}>تم العثور عليه</option>
            <option value="returned" ${item.status === 'returned' ? 'selected' : ''}>تم التسليم</option>
          </select>
          <button class="btn btn-danger btn-sm" data-lf-delete="${item.id}">حذف</button>` : ''}
        <button class="btn btn-outline btn-sm" data-lf-contact="${item.id}">💬 تواصل</button>
      </div>
      <div class="lf-contact-box" data-for="${item.id}" style="display:none;padding:0 .75rem .6rem">
        <form class="lf-contact-form" data-id="${item.id}" style="display:flex;gap:.4rem"><input required minlength="3" placeholder="رسالتك لصاحب الإعلان..." style="flex:1;border:1.5px solid var(--line);border-radius:8px;padding:.4rem .6rem;font-size:.8rem"><button type="submit" class="send-btn" style="width:38px;height:38px" aria-label="إرسال"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>
      </div>
    </div>`).join('');
  grid.querySelectorAll('.lf-status-select').forEach(sel => sel.addEventListener('change', async () => {
    const r = await api(`/api/lost-found/${sel.dataset.id}/status`, { method: 'PATCH', body: { status: sel.value } });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم تحديث حالة الإعلان'); loadLostFound();
  }));
  grid.querySelectorAll('[data-lf-delete]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('حذف الإعلان؟')) return;
    const r = await api(`/api/lost-found/${btn.dataset.lfDelete}`, { method: 'DELETE' });
    if (!r.ok) return toast(r.error, 'err');
    toast('تم حذف الإعلان'); loadLostFound();
  }));
  grid.querySelectorAll('[data-lf-contact]').forEach(btn => btn.addEventListener('click', () => {
    const box = grid.querySelector(`.lf-contact-box[data-for="${btn.dataset.lfContact}"]`);
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  }));
  grid.querySelectorAll('.lf-contact-form').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const input = form.querySelector('input');
    const r = await api(`/api/lost-found/${form.dataset.id}/contact`, { method: 'POST', body: { message: input.value.trim() } });
    if (!r.ok) return toast(r.error, 'err');
    input.value = ''; toast('تم إرسال رسالتك — سيصله إشعار ✓');
  }));
}

// ---------- المساعد الصوتي ----------
const voiceMicBtn = $('#voiceMicBtn'), voiceSpeakerBtn = $('#voiceSpeakerBtn'), voiceStatus = $('#voiceStatus'), aiChatInput = $('#aiChatInput');
let speakerOn = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  voiceMicBtn.disabled = true; voiceMicBtn.title = 'المتصفح لا يدعم التعرف على الصوت — استخدم Chrome';
  voiceMicBtn.style.opacity = '.4';
}
voiceSpeakerBtn.addEventListener('click', () => {
  speakerOn = !speakerOn;
  voiceSpeakerBtn.setAttribute('aria-pressed', String(speakerOn));
  voiceSpeakerBtn.style.background = speakerOn ? 'var(--info-bg)' : 'var(--bg)';
  if (!speakerOn && window.speechSynthesis) window.speechSynthesis.cancel();
  toast(speakerOn ? 'سيقرأ المساعد الإجابات بصوت' : 'تم إيقاف القراءة الصوتية');
});
let recognizing = false, activeRecognition = null;
voiceMicBtn.addEventListener('click', () => {
  if (!SpeechRecognition) return;
  if (recognizing) { activeRecognition?.stop(); return; }
  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  recognition.lang = 'ar-EG';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognizing = true;
  voiceStatus.style.display = 'block'; voiceStatus.textContent = '🎤 يستمع...';
  voiceMicBtn.style.background = 'var(--warn-bg)';
  recognition.onresult = e => {
    const transcript = e.results[0][0].transcript;
    voiceStatus.textContent = `سمعت: «${transcript}»`;
    aiChatInput.value = transcript;
    setTimeout(() => $('#aiChatForm').requestSubmit(), 300);
  };
  recognition.onerror = e => { voiceStatus.textContent = e.error === 'not-allowed' ? '⚠️ الميكروفون محظور — اسمح بالوصول من إعدادات المتصفح' : '⚠️ تعذر التعرف على الصوت'; setTimeout(() => voiceStatus.style.display = 'none', 2500); };
  recognition.onend = () => { recognizing = false; voiceMicBtn.style.background = 'var(--bg)'; if (voiceStatus.textContent.startsWith('🎤')) voiceStatus.style.display = 'none'; };
  recognition.start();
});
if (typeof addBotAnswer === 'function') {
  const originalAddBotAnswer = addBotAnswer;
  addBotAnswer = function (answer, sources) {
    originalAddBotAnswer(answer, sources);
    if (speakerOn && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(String(answer).slice(0, 500));
      utterance.lang = 'ar-EG'; utterance.rate = 1;
      speechSynthesis.speak(utterance);
    }
  };
}
