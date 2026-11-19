/* ============================================================
   NEXUS AI V2 — SidebarController
   A SINGLE centralized controller for Student / Staff / Admin.
   Guarantees:
   - One hamburger control (click only — a single reliable gesture on touch and mouse)
   - Auto-close on any nav item, route change, outside tap, Escape
   - Works on mobile touch (iOS/Android) AND desktop mouse
   - Desktop layout completely untouched (no JS styles on desktop)
   ============================================================ */
(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 900px)';
  const mq = window.matchMedia(MOBILE_QUERY);

  class SidebarController {
    constructor() {
      this.sidebar = document.querySelector('.sidebar');
      this.toggle = document.querySelector('.sidebar-toggle');
      this.backdrop = null;
      this.isOpen = false;
      if (!this.sidebar || !this.toggle) return;

      this._createBackdrop();
      this._bind();
      window.NexusSidebar = this;
    }

    _createBackdrop() {
      this.backdrop = document.querySelector('.sidebar-backdrop');
      if (!this.backdrop) {
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'sidebar-backdrop';
        this.backdrop.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.backdrop);
      }
    }

    _isMobile() { return mq.matches; }

    open() {
      if (!this._isMobile()) return;
      this.isOpen = true;
      this.sidebar.classList.add('open');
      this.backdrop.classList.add('show');
      this.toggle.setAttribute('aria-expanded', 'true');
    }

    close() {
      this.isOpen = false;
      this.sidebar.classList.remove('open');
      this.backdrop.classList.remove('show');
      this.toggle.setAttribute('aria-expanded', 'false');
    }

    toggleSidebar() {
      this.isOpen ? this.close() : this.open();
    }

    _bind() {
      // ---------- HAMBURGER: click only ----------
      // A single click is the most reliable cross-browser gesture. Opening on pointerdown
      // caused the synthetic click after touchend to land on whatever the sliding drawer
      // had moved under the finger (the logo), navigating away. Click-only avoids that.
      this.toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSidebar();
      });

      // ---------- CLOSE BUTTON inside the drawer (mobile) ----------
      const closeBtn = this.sidebar.querySelector('.sidebar-close');
      if (closeBtn) closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });

      // ---------- NAV ITEMS: close on selection ----------
      this.sidebar.addEventListener('click', (e) => {
        if (e.target.closest('.side-link, a, button')) this.close();
      }, true); // capture — run before page-specific handlers

      // ---------- BACKDROP: close on tap ----------
      this.backdrop.addEventListener('pointerdown', () => this.close());
      this.backdrop.addEventListener('click', () => this.close());

      // ---------- OUTSIDE: close on any pointer/click outside sidebar ----------
      const outside = (e) => {
        if (!this.isOpen) return;
        const t = e.target;
        if (t.closest('.sidebar') || t.closest('.sidebar-toggle') || t.closest('.sidebar-backdrop')) return;
        this.close();
      };
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('click', outside);

      // ---------- KEYBOARD: Escape ----------
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });

      // ---------- ROUTING / NAVIGATION: close on any route change ----------
      window.addEventListener('hashchange', () => this.close());
      window.addEventListener('popstate', () => this.close());
      document.addEventListener('nexus:navigate', () => this.close());
      // MutationObserver: if the active page-section changes by any script, close the sidebar
      const sections = document.querySelector('.content');
      if (sections) {
        new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'attributes' && m.attributeName === 'class' &&
                m.target.classList.contains('active') && this.isOpen) {
              this.close();
              return;
            }
          }
        }).observe(sections, { attributes: true, subtree: true, attributeFilter: ['class'] });
      }

      // ---------- VIEWPORT: reset when crossing desktop/mobile boundary ----------
      const onMQ = () => { if (!this._isMobile()) this.close(); };
      if (mq.addEventListener) mq.addEventListener('change', onMQ);
      else mq.addListener(onMQ);

      // ---------- BFCACHE: fresh state on restore ----------
      window.addEventListener('pageshow', (e) => { if (e.persisted) { this.close(); location.reload(); } });
    }
  }

  function init() { new SidebarController(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
