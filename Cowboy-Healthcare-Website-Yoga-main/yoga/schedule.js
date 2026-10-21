/* ═══════════════════════════════════════════════════════════════════
   Cowboy Yoga — live class schedule
   ───────────────────────────────────────────────────────────────────
   Pulls the real upcoming classes straight from the booking system
   (the same data the "Book a Class" widget shows) so this schedule is
   always current and never hand-typed. Whatever the studio adds in the
   booking system appears here automatically.

   Public, read-only: it calls fn_yoga_public_sessions with the site's
   publishable key — the same key already used elsewhere on the site —
   which can only read what the booking system already shows publicly.

   To change the studio or how far ahead it looks, edit CONFIG below.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CONFIG = {
    supabaseUrl: 'https://tdctzlbiuuvubnscmqho.supabase.co',
    publishableKey: 'sb_publishable_AGegsoetVdHK7wzDks3g8A_TzUiMbMS',
    studioId: 'bb3248ff-6910-4fce-93ea-0db7cb9fd7c0',
    bookingUrl: 'https://ehr.cowboy-systems.com/?widget=a965fe66-6990-43f4-a627-4668ad6c89a4',
    timeZone: 'America/New_York',
    days: 14,          // how far ahead to show
    maxDays: 7         // how many day-columns to render at most
  };

  var root = document.getElementById('schedule-body');
  if (!root) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function partsInZone(iso) {
    var d = new Date(iso);
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: CONFIG.timeZone, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, year: 'numeric'
    });
    var p = {};
    fmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }

  // A stable YYYY-MM-DD key in the studio's timezone, for grouping by day.
  function dayKey(iso) {
    var d = new Date(iso);
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }

  function timeLabel(iso) {
    var p = partsInZone(iso);
    return (p.hour + ':' + p.minute + ' ' + p.dayPeriod).toLowerCase();
  }

  function spotsLabel(s) {
    var cap = s.capacity || 0, taken = s.attendee_count || 0;
    if (!cap) return '';
    var left = cap - taken;
    if (left <= 0) return 'Waitlist';
    if (left <= 3) return left + ' spot' + (left === 1 ? '' : 's') + ' left';
    return 'Open';
  }

  function render(sessions) {
    if (!sessions.length) {
      root.innerHTML =
        '<div class="sched-empty">' +
          '<p>New classes are being added to the calendar. Check back soon, or see the full, live schedule and reserve your spot in the booking portal.</p>' +
          '<a class="btn-primary" href="' + esc(CONFIG.bookingUrl) + '" target="_blank" rel="noopener">Open booking &amp; schedule</a>' +
        '</div>';
      return;
    }

    // group by day, keep chronological order
    var byDay = {}, order = [];
    sessions.forEach(function (s) {
      var k = dayKey(s.starts_at);
      if (!byDay[k]) { byDay[k] = []; order.push(k); }
      byDay[k].push(s);
    });
    order = order.slice(0, CONFIG.maxDays);

    var cols = order.map(function (k) {
      var first = byDay[k][0];
      var p = partsInZone(first.starts_at);
      var rows = byDay[k].map(function (s) {
        var spots = spotsLabel(s);
        var full = /Waitlist/.test(spots);
        return '<a class="sched-class" href="' + esc(CONFIG.bookingUrl) + '" target="_blank" rel="noopener"' +
          ' style="--accent:' + esc(s.class_color || '#C09A72') + '">' +
          '<span class="sc-time">' + esc(timeLabel(s.starts_at)) + '</span>' +
          '<span class="sc-name">' + esc(s.class_name || 'Class') + '</span>' +
          '<span class="sc-meta">' +
            (s.instructor_name ? esc(titleCase(s.instructor_name)) : '') +
            (s.class_duration ? ' · ' + s.class_duration + ' min' : '') +
          '</span>' +
          (spots ? '<span class="sc-spots' + (full ? ' is-full' : '') + '">' + esc(spots) + '</span>' : '') +
        '</a>';
      }).join('');
      return '<div class="sched-day">' +
        '<div class="sched-dayhead"><span class="sd-dow">' + esc(p.weekday) + '</span>' +
          '<span class="sd-date">' + esc(p.month + ' ' + p.day) + '</span></div>' +
        '<div class="sched-classes">' + rows + '</div>' +
      '</div>';
    }).join('');

    root.innerHTML = '<div class="sched-week">' + cols + '</div>';
  }

  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function showError() {
    root.innerHTML =
      '<div class="sched-empty">' +
        '<p>We couldn\'t load the live schedule just now. You can always see current classes and book in the portal.</p>' +
        '<a class="btn-primary" href="' + esc(CONFIG.bookingUrl) + '" target="_blank" rel="noopener">Open booking &amp; schedule</a>' +
      '</div>';
  }

  function load() {
    var today = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/fn_yoga_public_sessions', {
      method: 'POST',
      headers: {
        'apikey': CONFIG.publishableKey,
        'Authorization': 'Bearer ' + CONFIG.publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_studio_id: CONFIG.studioId, p_from: today, p_days: CONFIG.days })
    })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data && Array.isArray(data.sessions) ? data.sessions : []);
        list = list.filter(function (s) { return s && s.starts_at && (s.status || 'scheduled') !== 'cancelled'; });
        list.sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
        render(list);
      })
      .catch(function () { showError(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
