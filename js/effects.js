/* ═══════════════════════════════════════════════
   Cowboy Healthcare — Scroll & 3D Effects
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── 1. HERO PARALLAX ── */
  const heroBgImg = document.querySelector('.hero-bg img');
  if (heroBgImg) {
    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          const scrolled = window.scrollY;
          heroBgImg.style.transform = 'translateY(' + (scrolled * 0.3) + 'px)';
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ── 2. SCROLL REVEAL ── */
  const revealTargets = [
    '.service-card',
    '.testi-card',
    '.stat-card',
    '.step',
    '.value-card',
    '.ins-card',
    '.team-card',
    '.pillar',
    '.why-card',
    '.tl-card',
    '.class-card',
    '.gallery-img',
    '.about-img',
    '.intro-img',
    '.intro-text',
    '.process-grid > *',
    '.process-img',
    '.split > *',
    '.split-img',
    '.split-text',
    'h2.display',
    '.eyebrow',
    '.lead',
    '.loc-info',
    '.hero-eyebrow',
    '.hero-h1',
    '.hero-sub',
    '.hero-actions',
    '.page-hero h1',
    '.page-hero p',
  ].join(',');

  function initReveal() {
    document.querySelectorAll(revealTargets).forEach(function (el, i) {
      if (!el.classList.contains('sr-init')) {
        el.classList.add('sr-init');
        // stagger siblings in a grid
        const parent = el.parentElement;
        const siblings = Array.from(parent.children).filter(c => c.classList.contains(el.className.split(' ')[0]));
        const idx = siblings.indexOf(el);
        el.style.transitionDelay = Math.min(idx * 0.07, 0.42) + 's';
      }
    });

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('sr-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

    document.querySelectorAll('.sr-init').forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ── 3. 3D CARD TILT ── */
  const tiltSelectors = [
    '.service-card',
    '.testi-card',
    '.stat-card',
    '.team-card',
    '.value-card',
    '.why-card',
    '.class-card',
    '.card',
  ].join(',');

  function initTilt() {
    document.querySelectorAll(tiltSelectors).forEach(function (card) {
      card.style.willChange = 'transform';
      card.style.transition = 'transform 0.08s ease, background 0.3s';

      card.addEventListener('mousemove', function (e) {
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        const rotX = -dy * 6;
        const rotY = dx * 6;
        card.style.transform = 'perspective(700px) rotateX(' + rotX + 'deg) rotateY(' + rotY + 'deg) translateZ(8px)';
      });

      card.addEventListener('mouseleave', function () {
        card.style.transition = 'transform 0.45s cubic-bezier(.23,1,.32,1), background 0.3s';
        card.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
      });

      card.addEventListener('mouseenter', function () {
        card.style.transition = 'transform 0.08s ease, background 0.3s';
      });
    });
  }

  /* ── 4. STAT COUNTER ── */
  function initCounters() {
    const statNums = document.querySelectorAll('.stat-num');
    if (!statNums.length) return;

    const counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        counterObserver.unobserve(el);

        // extract number and suffix
        const text = el.textContent.trim();
        const num = parseFloat(text.replace(/[^0-9.]/g, ''));
        const suffix = text.replace(/[0-9.]/g, '').trim();
        const duration = 1600;
        const start = performance.now();

        function tick(now) {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          // ease out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(num * eased);
          // rebuild with italic em for suffix
          el.innerHTML = current + '<em>' + suffix + '</em>';
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });

    statNums.forEach(function (el) {
      counterObserver.observe(el);
    });
  }

  /* ── 5. SMOOTH SECTION SLIDE ── */
  function initSectionSlide() {
    const sections = document.querySelectorAll('.section, .section-full, .stats-band, .insurance-band, .quote-band, .cta-band, .values-band, .timeline-band, .why-band, .page-hero');
    const sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('section-visible');
          sectionObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06 });

    sections.forEach(function (s) {
      s.classList.add('section-hidden');
      sectionObserver.observe(s);
    });
  }

  /* ── 6. NAV SCROLL SHADOW ── */
  function initNavShadow() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    window.addEventListener('scroll', function () {
      if (window.scrollY > 40) {
        nav.style.boxShadow = '0 4px 32px rgba(28,25,23,.09)';
      } else {
        nav.style.boxShadow = 'none';
      }
    }, { passive: true });
  }

  /* ── INIT ── */
  function init() {
    initReveal();
    initTilt();
    initCounters();
    initSectionSlide();
    initNavShadow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
