// NEXUS AI — Landing interactions + عربي/English toggle
const nav = document.getElementById('topNav');
window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
nav.classList.toggle('scrolled', window.scrollY > 40);

const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
burger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('open')));

// ---------- عربي / English (landing only) ----------
const EN = {
  nav_features: 'Features', nav_ai: 'AI Engine', nav_how: 'How it works', nav_depts: 'Departments', nav_contact: 'Contact', nav_login: 'Sign in',
  hero_chip: 'Powered by AI — RAG over institute regulations',
  hero_title: 'Every campus problem, <span class="grad">solved smart & tracked end-to-end</span>',
  hero_lead: 'NEXUS AI is the unified smart-campus platform: ask about regulations in Arabic or English, file your complaint, track the fix — while admins manage, forecast and decide on real data.',
  hero_cta1: 'Start free with your account', hero_cta2: 'See how it works',
  stat1: 'Requests resolved', stat2: 'Student satisfaction', stat3: 'Departments connected', stat4: 'Avg. response time',
};
const AR = {};
document.querySelectorAll('[data-i18n]').forEach(el => { AR[el.dataset.i18n] = el.innerHTML; });
let lang = localStorage.getItem('nexus-lang') || 'ar';
const toggle = document.getElementById('langToggle');
function applyLang(l) {
  lang = l;
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'en' ? 'ltr' : 'rtl';
  document.documentElement.classList.toggle('rtl', l === 'ar');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = l === 'en' ? (EN[el.dataset.i18n] || AR[el.dataset.i18n]) : AR[el.dataset.i18n]; });
  toggle.textContent = l === 'en' ? 'AR' : 'EN';
  localStorage.setItem('nexus-lang', l);
}
toggle.addEventListener('click', () => applyLang(lang === 'ar' ? 'en' : 'ar'));
if (lang === 'en') applyLang('en');
