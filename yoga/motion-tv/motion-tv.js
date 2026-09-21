/* ═══════════════════════════════════════════════════════════════════
   Motion TV — player & library
   Reads window.MOTION_TV (content.js). No tracking; viewing progress is
   kept only in the visitor's own browser (localStorage).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var TV = window.MOTION_TV;
  if (!TV) return;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PREVIEW = new URLSearchParams(location.search).has('preview');
  var HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';

  var store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem('motiontv:' + key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem('motiontv:' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatMinutes(m) {
    if (m == null) return '';
    if (m < 1) return Math.round(m * 60) + ' sec';
    if (m % 1 === 0.5) return (m === 0.5 ? '' : Math.floor(m)) + '½ min';
    if (m >= 60) { var h = Math.floor(m / 60), r = Math.round(m % 60); return h + ' hr' + (r ? ' ' + r + ' min' : ''); }
    return Math.round(m) + ' min';
  }

  // Breathwork offers several lengths, so show the range ("3–10 min").
  function lengthLabel(item) {
    var d = item.durations;
    if (item.type === 'breath' && d && d.length > 1) {
      var lo = Math.min.apply(null, d), hi = Math.max.apply(null, d);
      return formatMinutes(lo).replace(' min', '') + '–' + formatMinutes(hi);
    }
    return formatMinutes(item.minutes);
  }

  var KIND_LABEL ={ breath: 'Guided breath', audio: 'Audio session', youtube: 'Class', vimeo: 'Class', mp4: 'Class', hls: 'Class' };

  var programs = TV.programs || [];
  var programById = {};
  programs.forEach(function (p) { programById[p.id] = p; });

  var items = (TV.items || []).map(function (item) {
    var copy = {};
    for (var k in item) copy[k] = item[k];
    if (copy.minutes == null && copy.type === 'breath') copy.minutes = copy.defaultDuration;
    copy.hasMedia = hasMediaReference(copy);
    // local files are confirmed by verifyLocalMedia() before they're shown
    copy.ready = copy.hasMedia && !isLocal(copy.src);
    return copy;
  });
  var itemById = {};
  items.forEach(function (i) { itemById[i.id] = i; });

  function hasMediaReference(item) {
    switch (item.type) {
      case 'breath': return Array.isArray(item.pattern) && item.pattern.length > 0;
      case 'youtube': case 'vimeo': return !!item.videoId;
      case 'mp4': case 'hls': case 'audio': return !!item.src;
      default: return false;
    }
  }

  function isLocal(src) { return !!src && !/^(https?:)?\/\//i.test(src); }

  // Local media only counts as ready once it exists. Generated audio is listed in
  // audio/manifest.json (kept up to date by tools/elevenlabs-voiceovers.mjs);
  // any other local file (e.g. an MP4 dropped in by hand) is checked directly.
  var AUDIO_DIR = 'motion-tv/audio/';
  var manifest = null;

  function loadManifest() {
    if (!manifest) {
      manifest = fetch(AUDIO_DIR + 'manifest.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : { files: [] }; })
        .then(function (m) { return new Set((m && m.files) || []); })
        .catch(function () { return new Set(); });
    }
    return manifest;
  }

  function fileExists(src) {
    if (src.indexOf(AUDIO_DIR) === 0) {
      return loadManifest().then(function (files) { return files.has(src); });
    }
    return fetch(src, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  function verifyLocalMedia() {
    var checks = items
      .filter(function (i) { return i.hasMedia && isLocal(i.src); })
      .map(function (i) { return fileExists(i.src).then(function (ok) { i.ready = ok; }); });
    return Promise.all(checks);
  }

  function visibleItems() {
    return items.filter(function (i) { return i.ready || PREVIEW; });
  }

  /* ═══════════ LIVE CHANNEL ═══════════ */

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WEEK = 7 * 24 * 60;

  function studioNow() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TV.live.timeZone || 'America/New_York',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    var get = function (type) { return (parts.find(function (p) { return p.type === type; }) || {}).value; };
    return DAYS.indexOf(get('weekday')) * 1440 + parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
  }

  function slotStart(slot) {
    var day = DAYS.indexOf(String(slot.day).slice(0, 3));
    var hm = String(slot.start).split(':');
    if (day < 0 || hm.length < 2) return null;
    return day * 1440 + parseInt(hm[0], 10) * 60 + parseInt(hm[1], 10);
  }

  function formatClock(weekMinute) {
    var mins = weekMinute % 1440, h = Math.floor(mins / 60), m = mins % 60;
    var suffix = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + suffix;
  }

  function formatIn(minutes) {
    if (minutes < 60) return 'in ' + minutes + ' min';
    var hrs = Math.floor(minutes / 60);
    if (hrs < 24) return 'in ' + hrs + ' hr' + (hrs > 1 ? 's' : '') + (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '');
    var days = Math.round(hrs / 24);
    return 'in ' + days + ' day' + (days > 1 ? 's' : '');
  }

  function liveStatus() {
    var live = TV.live || {};
    var configured = !!(live.youtubeChannelId || live.youtubeVideoId || live.hlsUrl);
    var now = studioNow();
    var preRoll = live.preRollMinutes == null ? 10 : live.preRollMinutes;
    var next = null, current = null;
    (live.schedule || []).forEach(function (slot) {
      var start = slotStart(slot);
      if (start == null) return;
      var sinceStart = (now - start + WEEK) % WEEK;
      if (sinceStart < (slot.minutes || 60) || (WEEK - sinceStart) <= preRoll) {
        current = { slot: slot, start: start, startsIn: sinceStart < (slot.minutes || 60) ? 0 : WEEK - sinceStart };
      }
      var until = (start - now + WEEK) % WEEK;
      if (until > 0 && (!next || until < next.until)) next = { slot: slot, start: start, until: until };
    });
    if (configured && (live.forceLive || current)) return { state: 'live', current: current, next: next };
    if (next) return { state: 'upcoming', next: next, configured: configured };
    return { state: 'none', configured: configured };
  }

  function liveEmbedHtml() {
    var live = TV.live;
    if (live.youtubeVideoId) {
      return '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(live.youtubeVideoId) +
        '?autoplay=1&rel=0&playsinline=1" title="Motion TV live class" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    }
    if (live.youtubeChannelId) {
      return '<iframe src="https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(live.youtubeChannelId) +
        '&autoplay=1&playsinline=1" title="Motion TV live class" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    }
    return null; // HLS handled with a <video> element
  }

  function renderLive() {
    var status = liveStatus();
    var pill = $('#live-pill');
    var panel = $('#live-panel');
    if (!panel) return;
    var zone = ' ET';

    if (status.state === 'live') {
      var slot = status.current && status.current.slot;
      var soon = status.current && status.current.startsIn > 0;
      pill.className = 'live-pill is-live';
      pill.innerHTML = '<span class="dot"></span>' + (soon ? 'Live class starting ' + formatIn(status.current.startsIn) : 'Live now');
      if (panel.dataset.state === 'live') return; // don't rebuild an open player
      panel.dataset.state = 'live';
      panel.innerHTML =
        '<div class="live-stage" id="live-stage">' +
          '<div class="live-poster">' +
            '<span class="live-badge"><span class="dot"></span> Live' + (soon ? ' soon' : '') + '</span>' +
            '<h3>' + esc(slot ? slot.title : 'Live from the studio') + '</h3>' +
            (slot && slot.instructor ? '<p>with ' + esc(slot.instructor) + '</p>' : '') +
            '<button class="btn-accent" id="join-live" type="button">Join the live class</button>' +
          '</div>' +
        '</div>';
      $('#join-live').addEventListener('click', function () {
        var stage = $('#live-stage');
        var html = liveEmbedHtml();
        if (html) { stage.innerHTML = html; return; }
        stage.innerHTML = '<video controls autoplay playsinline></video>';
        attachHls($('video', stage), TV.live.hlsUrl);
      });
      return;
    }

    panel.dataset.state = status.state;
    if (status.state === 'upcoming') {
      var n = status.next;
      pill.className = 'live-pill';
      pill.innerHTML = '<span class="dot"></span>Next live: ' + esc(n.slot.title) + ' · ' + DAYS[Math.floor(n.start / 1440)] + ' ' + formatClock(n.start) + zone;
      panel.innerHTML =
        '<div class="live-card">' +
          '<span class="live-eyebrow">Next live class</span>' +
          '<h3>' + esc(n.slot.title) + '</h3>' +
          '<p class="live-when">' + DAYS[Math.floor(n.start / 1440)] + ' · ' + formatClock(n.start) + zone + ' · <strong>' + formatIn(n.until) + '</strong></p>' +
          (n.slot.instructor ? '<p class="live-with">with ' + esc(n.slot.instructor) + '</p>' : '') +
          '<p class="live-note">This page switches to the live player automatically when class begins. Keep it open, or come back a few minutes before.</p>' +
          '<div class="live-sched">' + (TV.live.schedule || []).map(function (s) {
            var st = slotStart(s);
            return st == null ? '' : '<div><span>' + DAYS[Math.floor(st / 1440)] + ' ' + formatClock(st) + '</span>' + esc(s.title) + '</div>';
          }).join('') + '</div>' +
        '</div>';
      return;
    }

    pill.className = 'live-pill is-quiet';
    pill.innerHTML = '<span class="dot"></span>Streaming on demand';
    panel.innerHTML =
      '<div class="live-card">' +
        '<span class="live-eyebrow">Live from the studio</span>' +
        '<h3>Live classes are on the way</h3>' +
        '<p class="live-note">We\'re setting up cameras in the Ravenna studio so you can take class with us from anywhere. Live times will be posted here. Until then, start with the on-demand library, or join us in person.</p>' +
        '<div class="live-actions">' +
          '<a class="btn-accent" href="#library">Browse the library</a>' +
          '<a class="btn-ghost" href="https://ehr.cowboy-systems.com/?widget=a965fe66-6990-43f4-a627-4668ad6c89a4" target="_blank" rel="noopener">Book an in-studio class</a>' +
        '</div>' +
      '</div>';
  }

  /* ═══════════ LIBRARY ═══════════ */

  var filter = { program: 'all', length: 'any', query: '' };

  // Breathwork thumbnails plot the session's actual breathing pattern.
  function breathArt(item, pal) {
    var pattern = item.pattern, cycle = 0;
    pattern.forEach(function (p) { cycle += p.seconds; });
    var low = 64, high = 26, pts = [], samples = 90, level = 0;
    for (var s = 0; s <= samples; s++) {
      var t = (s / samples) * cycle * 2 % cycle, acc = 0;
      for (var i = 0; i < pattern.length; i++) {
        var seg = pattern[i];
        if (t <= acc + seg.seconds) {
          var p = (t - acc) / seg.seconds, e = 0.5 - Math.cos(Math.PI * p) / 2;
          if (seg.phase === 'inhale') level = e;
          else if (seg.phase === 'exhale') level = 1 - e;
          else level = i > 0 && pattern[i - 1].phase === 'inhale' ? 1 : 0;
          break;
        }
        acc += seg.seconds;
      }
      pts.push((8 + (s / samples) * 144).toFixed(1) + ',' + (low - (low - high) * level).toFixed(1));
    }
    var id = 'b-' + esc(item.id);
    return '<svg class="gen-art" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><radialGradient id="' + id + '" cx="30%" cy="30%" r="90%"><stop offset="0" stop-color="' + pal[1] + '" stop-opacity=".55"/>' +
      '<stop offset="1" stop-color="' + pal[0] + '" stop-opacity=".12"/></radialGradient>' +
      '<filter id="' + id + '-glow"><feGaussianBlur stdDeviation="1.6"/></filter></defs>' +
      '<rect width="160" height="90" fill="#1f1b18"/><rect width="160" height="90" fill="url(#' + id + ')"/>' +
      '<line x1="8" x2="152" y1="' + low + '" y2="' + low + '" stroke="#F8F4EF" stroke-opacity=".08" stroke-width=".4"/>' +
      '<line x1="8" x2="152" y1="' + high + '" y2="' + high + '" stroke="#F8F4EF" stroke-opacity=".08" stroke-width=".4"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + pal[1] + '" stroke-width="2.4" stroke-opacity=".7" filter="url(#' + id + '-glow)"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#F8F4EF" stroke-opacity=".85" stroke-width=".9" stroke-linejoin="round"/>' +
      '</svg>';
  }

  function artHtml(item, program) {
    var img = item.thumbnail || item.poster || (item.type !== 'breath' && item.type !== 'audio' && program && program.image);
    if (img) return '<img src="' + esc(img) + '" alt="" loading="lazy" />';
    var pal = (program && program.palette) || ['#7C8B6F', '#C09A72'];
    if (item.type === 'breath') return breathArt(item, pal);
    // generated artwork: concentric "breath" rings, varied per item
    var seed = 0;
    for (var i = 0; i < item.id.length; i++) seed = (seed * 31 + item.id.charCodeAt(i)) % 997;
    var cx = 30 + (seed % 40), cy = 38 + (seed % 25);
    var rings = '';
    for (var r = 1; r <= 5; r++) rings += '<circle cx="' + cx + '%" cy="' + cy + '%" r="' + (r * 11 + (seed % 7)) + '%" />';
    return '<svg class="gen-art" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><radialGradient id="g-' + esc(item.id) + '" cx="' + cx + '%" cy="' + cy + '%" r="80%">' +
      '<stop offset="0" stop-color="' + pal[1] + '" stop-opacity=".9"/><stop offset="1" stop-color="' + pal[0] + '" stop-opacity=".15"/></radialGradient></defs>' +
      '<rect width="160" height="90" fill="#221e1a"/><rect width="160" height="90" fill="url(#g-' + esc(item.id) + ')"/>' +
      '<g fill="none" stroke="#F8F4EF" stroke-opacity=".22" stroke-width=".5" transform="scale(1.6 0.9)">' + rings + '</g></svg>';
  }

  function progressFor(item) {
    var p = store.get('progress', {})[item.id];
    if (!p || !p.duration) return 0;
    var pct = p.time / p.duration;
    return pct > 0.02 && pct < 0.95 ? pct : 0;
  }

  function tileHtml(item) {
    var program = programById[item.program];
    var pct = progressFor(item);
    var pending = !item.ready;
    return '<button class="tile' + (pending ? ' is-pending' : '') + '" type="button" data-id="' + esc(item.id) + '"' +
      ' aria-label="' + esc(item.title + (pending ? ' (not yet published)' : '')) + '">' +
      '<div class="tile-art">' + artHtml(item, program) +
        '<span class="tile-kind">' + esc(KIND_LABEL[item.type] || 'Session') + '</span>' +
        (item.minutes ? '<span class="tile-dur">' + lengthLabel(item) + '</span>' : '') +
        '<span class="tile-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>' +
        (pending ? '<span class="tile-pending">Pending media</span>' : '') +
        (pct ? '<span class="tile-progress"><span style="width:' + (pct * 100).toFixed(1) + '%"></span></span>' : '') +
      '</div>' +
      '<div class="tile-body">' +
        '<h4>' + esc(item.title) + '</h4>' +
        '<p>' + esc([item.subtitle || (program && program.title), item.instructor].filter(Boolean).join(' · ')) + '</p>' +
      '</div>' +
    '</button>';
  }

  function filmingTileHtml(program) {
    return '<div class="tile tile-filming">' +
      '<div class="tile-art">' + (program.image ? '<img src="' + esc(program.image) + '" alt="" loading="lazy" />' : '') +
        '<div class="filming-veil"><span class="rec"><span class="dot"></span> Filming at the studio</span></div>' +
      '</div>' +
      '<div class="tile-body"><h4>' + esc(program.title) + '</h4>' +
        '<p>' + (program.page ? '<a href="' + esc(program.page) + '">About ' + esc(program.title) + '</a> · ' : '') +
        '<a href="https://ehr.cowboy-systems.com/?widget=a965fe66-6990-43f4-a627-4668ad6c89a4" target="_blank" rel="noopener">Take it in person</a></p>' +
      '</div>' +
    '</div>';
  }

  function matchesFilter(item) {
    if (filter.program !== 'all' && item.program !== filter.program) return false;
    var m = item.minutes || 0;
    if (filter.length === 'short' && !(m > 0 && m <= 10)) return false;
    if (filter.length === 'mid' && !(m > 10 && m <= 30)) return false;
    if (filter.length === 'long' && !(m > 30)) return false;
    if (filter.query) {
      var program = programById[item.program] || {};
      var hay = [item.title, item.subtitle, item.description, item.instructor, item.level, program.title].join(' ').toLowerCase();
      if (hay.indexOf(filter.query) === -1) return false;
    }
    return true;
  }

  function rowHtml(title, subtitle, tilesHtml, extraClass) {
    return '<section class="row' + (extraClass ? ' ' + extraClass : '') + '">' +
      '<div class="row-head"><h3>' + title + '</h3>' + (subtitle ? '<p>' + subtitle + '</p>' : '') + '</div>' +
      '<div class="row-track">' + tilesHtml + '</div>' +
    '</section>';
  }

  function renderLibrary() {
    var root = $('#library-rows');
    var list = visibleItems();
    var filtering = filter.program !== 'all' || filter.length !== 'any' || filter.query;
    var html = '';

    if (filtering) {
      var results = list.filter(matchesFilter);
      html = results.length
        ? '<div class="grid">' + results.map(tileHtml).join('') + '</div>'
        : '<div class="empty"><p>Nothing matches that yet.</p><button type="button" class="btn-ghost" id="clear-filters">Clear filters</button></div>';
      if (filter.program !== 'all' && !results.length) {
        var prog = programById[filter.program];
        if (prog && prog.image) html = '<div class="grid">' + filmingTileHtml(prog) + '</div>';
      }
    } else {
      var history = store.get('history', []).map(function (id) { return itemById[id]; })
        .filter(function (i) { return i && (i.ready || PREVIEW); }).slice(0, 8);
      if (history.length) html += rowHtml('Pick up where you left off', '', history.map(tileHtml).join(''), 'row-history');

      // Programs with videos get their own row; studio programs still being
      // filmed share a single "Studio classes" row.
      var filming = [];
      programs.forEach(function (program) {
        var inProgram = list.filter(function (i) { return i.program === program.id; });
        if (inProgram.length) html += rowHtml(esc(program.title), esc(program.tagline), inProgram.map(tileHtml).join(''));
        else if (program.image) filming.push(program);
      });
      if (filming.length) {
        html += rowHtml('Studio classes', 'Filming now at the Ravenna studio. Full classes premiere here.', filming.map(filmingTileHtml).join(''));
      }
    }

    root.innerHTML = html;
    var clear = $('#clear-filters');
    if (clear) clear.addEventListener('click', resetFilters);
    var n = list.filter(matchesFilter).length;
    $('#result-count').textContent = filtering ? n + (n === 1 ? ' result' : ' results') : '';
  }

  function renderChips() {
    var list = visibleItems();
    var chips = [{ id: 'all', title: 'All' }].concat(programs.filter(function (p) {
      return p.image || list.some(function (i) { return i.program === p.id; });
    }));
    $('#program-chips').innerHTML = chips.map(function (p) {
      return '<button type="button" class="chip' + (filter.program === p.id ? ' is-on' : '') + '" data-program="' + esc(p.id) + '" aria-pressed="' + (filter.program === p.id) + '">' + esc(p.title) + '</button>';
    }).join('');
  }

  function resetFilters() {
    filter = { program: 'all', length: 'any', query: '' };
    $('#search').value = '';
    $('#length').value = 'any';
    renderChips();
    renderLibrary();
  }

  function bindLibrary() {
    $('#program-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      filter.program = chip.dataset.program;
      renderChips();
      renderLibrary();
    });
    $('#search').addEventListener('input', function (e) {
      filter.query = e.target.value.trim().toLowerCase();
      renderLibrary();
    });
    $('#length').addEventListener('change', function (e) {
      filter.length = e.target.value;
      renderLibrary();
    });
    $('#library-rows').addEventListener('click', function (e) {
      var tile = e.target.closest('.tile[data-id]');
      if (tile) openItem(tile.dataset.id);
    });
  }

  /* ═══════════ THEATER (player overlay) ═══════════ */

  var theater, stage, cleanup = null, lastFocus = null, currentId = null;

  function openItem(id, fromHash) {
    var item = itemById[id];
    if (!item) return;
    if (!item.ready && !PREVIEW) return;
    if (!fromHash && location.hash !== '#watch=' + id) history.pushState(null, '', '#watch=' + encodeURIComponent(id));
    show(item);
  }

  function show(item) {
    teardown();
    currentId = item.id;
    var program = programById[item.program] || {};
    lastFocus = lastFocus || document.activeElement;

    $('#th-eyebrow').textContent = [program.title, KIND_LABEL[item.type]].filter(Boolean).join(' · ');
    $('#th-title').textContent = item.title;
    $('#th-meta').innerHTML = [item.minutes && lengthLabel(item), item.level, item.instructor && 'with ' + item.instructor]
      .filter(Boolean).map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('');
    $('#th-desc').textContent = item.description || '';
    renderTranscript(item);
    renderUpNext(item);

    stage.className = 'stage stage-' + item.type;
    if (!item.ready) {
      stage.innerHTML = '<div class="stage-msg"><h3>Media not published yet</h3><p>' +
        (item.type === 'audio' ? 'Generate this narration with <code>node tools/elevenlabs-voiceovers.mjs</code>.' : 'Add a video ID or file for this item in content.js.') +
        '</p></div>';
    } else if (item.type === 'breath') {
      cleanup = BreathSession(stage, item);
    } else if (item.type === 'audio') {
      cleanup = audioPlayer(stage, item);
    } else {
      cleanup = videoPlayer(stage, item);
    }

    rememberHistory(item.id);
    document.title = item.title + ' | Motion TV | Cowboy Yoga';
    theater.hidden = false;
    document.documentElement.classList.add('theater-open');
    requestAnimationFrame(function () { theater.classList.add('is-open'); });
    $('#th-close').focus({ preventScroll: true });
  }

  function teardown() {
    if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } }
    cleanup = null;
    if (stage) stage.innerHTML = '';
  }

  function close(fromHash) {
    if (theater.hidden) return;
    teardown();
    currentId = null;
    theater.classList.remove('is-open');
    theater.hidden = true;
    document.documentElement.classList.remove('theater-open');
    document.title = 'Motion TV | Cowboy Yoga';
    if (!fromHash && location.hash.indexOf('#watch=') === 0) history.pushState(null, '', location.pathname + location.search);
    renderLibrary(); // refresh progress bars & history
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function renderTranscript(item) {
    var wrap = $('#th-transcript');
    if (item.type !== 'audio' || !item.script) { wrap.hidden = true; return; }
    var text = item.script.replace(/<break[^>]*\/>/g, ' ').replace(/[ \t]+/g, ' ').trim();
    $('#th-transcript-body').innerHTML = text.split(/\n+/).map(function (p) { return '<p>' + esc(p.trim()) + '</p>'; }).join('');
    wrap.hidden = false;
    wrap.open = false;
  }

  function renderUpNext(item) {
    var pool = visibleItems().filter(function (i) { return i.id !== item.id && i.ready; });
    var same = pool.filter(function (i) { return i.program === item.program; });
    var others = pool.filter(function (i) { return i.program !== item.program; });
    var next = same.concat(others).slice(0, 4);
    $('#th-upnext').innerHTML = next.length
      ? '<h4>Up next</h4>' + next.map(function (i) {
          return '<button type="button" class="upnext-item" data-id="' + esc(i.id) + '">' +
            '<span class="upnext-art">' + artHtml(i, programById[i.program]) + '</span>' +
            '<span><strong>' + esc(i.title) + '</strong><em>' + esc(lengthLabel(i)) + '</em></span></button>';
        }).join('')
      : '';
  }

  function rememberHistory(id) {
    var h = store.get('history', []).filter(function (x) { return x !== id; });
    h.unshift(id);
    store.set('history', h.slice(0, 12));
  }

  function trackProgress(media, id) {
    var progress = store.get('progress', {});
    var saved = progress[id];
    media.addEventListener('loadedmetadata', function () {
      if (saved && saved.time && saved.duration && saved.time / saved.duration < 0.95) media.currentTime = saved.time;
    }, { once: true });
    var lastSave = 0;
    function save(force) {
      if (!media.duration || !isFinite(media.duration)) return;
      var now = Date.now();
      if (!force && now - lastSave < 4000) return;
      lastSave = now;
      var all = store.get('progress', {});
      all[id] = { time: media.currentTime, duration: media.duration, at: now };
      store.set('progress', all);
    }
    media.addEventListener('timeupdate', function () { save(false); });
    media.addEventListener('pause', function () { save(true); });
    media.addEventListener('ended', function () {
      var all = store.get('progress', {});
      delete all[id];
      store.set('progress', all);
    });
    return function () { save(true); };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { existing.addEventListener('load', resolve); if (window.Hls) resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function attachHls(video, url) {
    var hls = null;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      loadScript(HLS_JS).then(function () {
        if (!window.Hls || !window.Hls.isSupported()) { video.src = url; return; }
        hls = new window.Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
      }).catch(function () { video.src = url; });
    }
    return function () { if (hls) hls.destroy(); };
  }

  function videoPlayer(el, item) {
    if (item.type === 'youtube') {
      el.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(item.videoId) +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="' + esc(item.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      return null;
    }
    if (item.type === 'vimeo') {
      el.innerHTML = '<iframe src="https://player.vimeo.com/video/' + encodeURIComponent(item.videoId) +
        '?autoplay=1&dnt=1&title=0&byline=0&portrait=0" title="' + esc(item.title) + '" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
      return null;
    }
    el.innerHTML = '<video controls autoplay playsinline preload="metadata"' + (item.poster ? ' poster="' + esc(item.poster) + '"' : '') + '></video>';
    var video = $('video', el);
    var stopHls = null;
    if (item.type === 'hls') stopHls = attachHls(video, item.src); else video.src = item.src;
    var flush = trackProgress(video, item.id);
    return function () { flush(); video.pause(); if (stopHls) stopHls(); video.removeAttribute('src'); video.load(); };
  }

  function audioPlayer(el, item) {
    el.innerHTML =
      '<div class="audio-stage">' +
        '<div class="audio-orb" aria-hidden="true"><span></span><span></span><span></span></div>' +
        '<div class="audio-ui">' +
          '<button type="button" class="audio-toggle" aria-label="Play"><svg viewBox="0 0 24 24" class="i-play"><path d="M8 5.5v13l11-6.5z"/></svg><svg viewBox="0 0 24 24" class="i-pause"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg></button>' +
          '<div class="audio-track">' +
            '<input type="range" class="audio-seek" min="0" max="1000" value="0" aria-label="Seek" />' +
            '<div class="audio-times"><span class="t-cur">0:00</span><span class="t-dur">' + formatMinutes(item.minutes) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<audio preload="metadata"></audio>' +
      '</div>';
    var audio = $('audio', el), toggle = $('.audio-toggle', el), seek = $('.audio-seek', el);
    var stageEl = $('.audio-stage', el);
    var fmt = function (s) {
      if (!isFinite(s)) return '';
      s = Math.max(0, Math.floor(s || 0));
      return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    };
    var known = function () { return audio.duration && isFinite(audio.duration); };
    audio.src = item.src;
    var flush = trackProgress(audio, item.id);
    var seeking = false;

    toggle.addEventListener('click', function () { if (audio.paused) audio.play(); else audio.pause(); });
    audio.addEventListener('play', function () { stageEl.classList.add('is-playing'); toggle.setAttribute('aria-label', 'Pause'); });
    audio.addEventListener('pause', function () { stageEl.classList.remove('is-playing'); toggle.setAttribute('aria-label', 'Play'); });
    audio.addEventListener('ended', function () { stageEl.classList.remove('is-playing'); stageEl.classList.add('is-done'); });
    audio.addEventListener('durationchange', function () {
      if (known()) $('.t-dur', el).textContent = fmt(audio.duration);
      seek.disabled = !known();
    });
    audio.addEventListener('timeupdate', function () {
      $('.t-cur', el).textContent = fmt(audio.currentTime);
      if (!seeking && known()) seek.value = Math.round(audio.currentTime / audio.duration * 1000);
    });
    seek.addEventListener('input', function () { seeking = true; });
    seek.addEventListener('change', function () {
      if (known()) audio.currentTime = seek.value / 1000 * audio.duration;
      seeking = false;
    });
    audio.play().catch(function () { /* autoplay blocked — user presses play */ });
    return function () { flush(); audio.pause(); audio.removeAttribute('src'); audio.load(); };
  }

  /* ═══════════ BREATHWORK ENGINE ═══════════ */

  var cueAudio = {};   // phase -> HTMLAudioElement, only for cues that exist
  var cuesChecked = null;

  function loadVoiceCues() {
    if (cuesChecked) return cuesChecked;
    var cues = TV.voiceCues || {};
    cuesChecked = Promise.all(Object.keys(cues).map(function (phase) {
      var src = cues[phase].src;
      return fileExists(src).then(function (ok) {
        if (ok) { var a = new Audio(src); a.preload = 'auto'; cueAudio[phase] = a; }
      });
    }));
    return cuesChecked;
  }

  var PHASE_WORDS = { inhale: 'Breathe in', exhale: 'Breathe out', hold: 'Hold' };
  var audioCtx = null;

  function chime(phase) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (phase === 'unlock') return;
      var base = phase === 'inhale' ? 392 : phase === 'exhale' ? 293.66 : 329.63;
      var now = audioCtx.currentTime;
      var out = audioCtx.createGain();
      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      out.connect(audioCtx.destination);
      // soft singing-bowl-like partials
      [[1, 1], [2.01, 0.35], [3.02, 0.12]].forEach(function (p) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = base * p[0];
        g.gain.value = p[1];
        o.connect(g); g.connect(out);
        o.start(now); o.stop(now + 2.5);
      });
    } catch (e) { /* audio unavailable */ }
  }

  function BreathSession(el, item) {
    var pattern = item.pattern;
    var cycle = pattern.reduce(function (s, p) { return s + p.seconds; }, 0);
    var prefs = store.get('breathPrefs', { sound: true, voice: true });
    var duration = item.defaultDuration || item.durations[0];
    var total = 0, elapsed = 0, running = false, done = false;
    var raf = 0, lastTick = 0, phaseIndex = -1, wakeLock = null;

    el.innerHTML =
      '<div class="breath" data-state="intro">' +
        '<div class="breath-field" aria-hidden="true">' +
          '<div class="breath-halo"></div>' +
          '<svg class="breath-ring" viewBox="0 0 200 200"><circle class="ring-bg" cx="100" cy="100" r="96"/><circle class="ring-fg" cx="100" cy="100" r="96" pathLength="1"/></svg>' +
          '<div class="breath-orb"></div>' +
        '</div>' +
        '<div class="breath-readout" aria-live="polite">' +
          '<span class="breath-phase">Ready</span>' +
          '<span class="breath-count"></span>' +
        '</div>' +
        '<div class="breath-intro">' +
          '<p class="breath-lead">Sit comfortably and let your shoulders drop. Follow the light: it grows as you breathe in and softens as you breathe out.</p>' +
          '<div class="breath-lengths" role="radiogroup" aria-label="Session length">' +
            item.durations.map(function (d) {
              return '<button type="button" role="radio" data-min="' + d + '" aria-checked="' + (d === duration) + '" class="' + (d === duration ? 'is-on' : '') + '">' + formatMinutes(d) + '</button>';
            }).join('') +
          '</div>' +
          '<button type="button" class="btn-accent breath-begin">Begin</button>' +
          '<p class="breath-safety">Breathe gently and never strain. If you feel dizzy or lightheaded, return to your normal breath.</p>' +
        '</div>' +
        '<div class="breath-controls">' +
          '<button type="button" class="bc-pause">Pause</button>' +
          '<span class="bc-left"></span>' +
          '<button type="button" class="bc-sound" aria-pressed="' + prefs.sound + '">Sound</button>' +
          '<button type="button" class="bc-voice" aria-pressed="' + prefs.voice + '" hidden>Voice</button>' +
          '<button type="button" class="bc-end">End</button>' +
        '</div>' +
        '<div class="breath-done">' +
          '<h3>Nicely done.</h3>' +
          '<p>Take a moment before you move on. Notice how you feel now.</p>' +
          '<div class="live-actions"><button type="button" class="btn-ghost bd-again">Go again</button>' +
          '<a class="btn-accent" href="https://ehr.cowboy-systems.com/?widget=a965fe66-6990-43f4-a627-4668ad6c89a4" target="_blank" rel="noopener">Book a class</a></div>' +
        '</div>' +
      '</div>';

    var root = $('.breath', el);
    var orb = $('.breath-orb', el), halo = $('.breath-halo', el);
    var ring = $('.ring-fg', el);
    var phaseEl = $('.breath-phase', el), countEl = $('.breath-count', el), leftEl = $('.bc-left', el);
    var MIN = 0.42, MAX = 1;

    loadVoiceCues().then(function () {
      if (Object.keys(cueAudio).length) $('.bc-voice', el).hidden = false;
    });

    function ease(p) { return 0.5 - Math.cos(Math.PI * p) / 2; }

    function levelAt(t) {
      var acc = 0, level = MIN;
      for (var i = 0; i < pattern.length; i++) {
        var seg = pattern[i];
        if (t < acc + seg.seconds) {
          var p = (t - acc) / seg.seconds;
          if (seg.phase === 'inhale') level = MIN + (MAX - MIN) * ease(p);
          else if (seg.phase === 'exhale') level = MAX - (MAX - MIN) * ease(p);
          return { index: i, seg: seg, level: level, remaining: acc + seg.seconds - t };
        }
        acc += seg.seconds;
        level = seg.phase === 'inhale' ? MAX : seg.phase === 'exhale' ? MIN : level;
      }
      return { index: pattern.length - 1, seg: pattern[pattern.length - 1], level: level, remaining: 0 };
    }

    function holdLevel(index) {
      for (var i = index - 1; i >= 0; i--) {
        if (pattern[i].phase === 'inhale') return MAX;
        if (pattern[i].phase === 'exhale') return MIN;
      }
      return MIN;
    }

    function paint() {
      var t = elapsed % cycle;
      var s = levelAt(t);
      var level = s.seg.phase === 'hold' ? holdLevel(s.index) : s.level;
      orb.style.transform = 'scale(' + level.toFixed(4) + ')';
      halo.style.transform = 'scale(' + (0.7 + level * 0.55).toFixed(4) + ')';
      halo.style.opacity = (0.25 + level * 0.55).toFixed(3);
      ring.style.strokeDashoffset = (1 - Math.min(1, elapsed / total)).toFixed(4);
      countEl.textContent = Math.max(1, Math.ceil(s.remaining - 0.0001));
      var left = Math.max(0, Math.ceil(total - elapsed));
      leftEl.textContent = Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) + ' left';
      if (s.index !== phaseIndex) {
        phaseIndex = s.index;
        phaseEl.textContent = PHASE_WORDS[s.seg.phase];
        root.dataset.phase = s.seg.phase;
        cue(s.seg);
      }
    }

    function cue(seg) {
      if (prefs.voice && cueAudio[seg.phase] && !(seg.phase === 'hold' && seg.seconds < 3)) {
        var a = cueAudio[seg.phase];
        a.currentTime = 0;
        a.play().catch(function () {});
        return;
      }
      if (prefs.sound) chime(seg.phase);
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      var dt = Math.min(0.25, (now - lastTick) / 1000);
      lastTick = now;
      elapsed += dt;
      if (elapsed >= total) { finish(); return; }
      paint();
    }

    function requestWake() {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
      }
    }
    function releaseWake() { if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }

    function start() {
      var rounds = Math.max(1, Math.round((duration * 60) / cycle));
      total = rounds * cycle;
      elapsed = 0; phaseIndex = -1; done = false;
      root.dataset.state = 'running';
      resume();
    }
    function resume() {
      if (running || done) return;
      running = true;
      root.dataset.state = 'running';
      $('.bc-pause', el).textContent = 'Pause';
      lastTick = performance.now();
      phaseIndex = -1; // re-announce the current phase
      requestWake();
      raf = requestAnimationFrame(tick);
    }
    function pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      root.dataset.state = 'paused';
      phaseEl.textContent = 'Paused';
      $('.bc-pause', el).textContent = 'Resume';
      releaseWake();
    }
    function finish() {
      cancelAnimationFrame(raf);
      running = false; done = true;
      releaseWake();
      orb.style.transform = 'scale(' + MIN + ')';
      ring.style.strokeDashoffset = '0';
      root.dataset.state = 'done';
      root.dataset.phase = '';
      phaseEl.textContent = 'Complete';
      countEl.textContent = '';
      if (prefs.sound) chime('exhale');
    }

    $('.breath-lengths', el).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-min]');
      if (!b) return;
      duration = parseFloat(b.dataset.min);
      $$('.breath-lengths button', el).forEach(function (x) {
        var on = x === b;
        x.classList.toggle('is-on', on);
        x.setAttribute('aria-checked', on);
      });
    });
    $('.breath-begin', el).addEventListener('click', function () {
      if (prefs.sound) chime('unlock'); // browsers only allow audio after a user gesture
      start();
    });
    $('.bc-pause', el).addEventListener('click', function () { if (running) pause(); else resume(); });
    $('.bc-end', el).addEventListener('click', finish);
    $('.bd-again', el).addEventListener('click', function () { root.dataset.state = 'intro'; phaseEl.textContent = 'Ready'; });
    $('.bc-sound', el).addEventListener('click', function (e) {
      prefs.sound = !prefs.sound;
      e.currentTarget.setAttribute('aria-pressed', prefs.sound);
      store.set('breathPrefs', prefs);
    });
    $('.bc-voice', el).addEventListener('click', function (e) {
      prefs.voice = !prefs.voice;
      e.currentTarget.setAttribute('aria-pressed', prefs.voice);
      store.set('breathPrefs', prefs);
    });

    function onVisibility() { if (document.hidden) pause(); }
    function onKey(e) {
      if (e.code !== 'Space' || e.target.closest('button, input, select, a')) return;
      if (root.dataset.state === 'running') { e.preventDefault(); pause(); }
      else if (root.dataset.state === 'paused') { e.preventDefault(); resume(); }
    }
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('keydown', onKey);

    // idle preview: the orb breathes slowly on the intro screen
    orb.style.transform = 'scale(' + MIN + ')';

    return function () {
      cancelAnimationFrame(raf);
      running = false;
      releaseWake();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('keydown', onKey);
    };
  }

  /* ═══════════ HERO FEATURE ═══════════ */

  function renderFeature() {
    var featured = itemById[TV.featured] || visibleItems().filter(function (i) { return i.ready; })[0];
    var btn = $('#hero-play');
    if (!featured || !btn) return;
    btn.dataset.id = featured.id;
    $('#hero-play-label').textContent = 'Start: ' + featured.title;
    btn.hidden = false;
  }

  /* ═══════════ BOOT ═══════════ */

  function routeFromHash() {
    var m = location.hash.match(/^#watch=(.+)$/);
    if (m) openItem(decodeURIComponent(m[1]), true);
    else close(true);
  }

  function init() {
    theater = $('#theater');
    stage = $('#stage');

    bindLibrary();
    renderLive();
    setInterval(renderLive, 30000);

    $('#th-close').addEventListener('click', function () { close(false); });
    theater.addEventListener('click', function (e) {
      if (e.target === theater) close(false);
      var next = e.target.closest('.upnext-item');
      if (next) openItem(next.dataset.id);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !theater.hidden) close(false);
    });
    // keep keyboard focus inside the open theater
    theater.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('button:not([hidden]), a[href], input, select, iframe, video[controls], summary', theater)
        .filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });
    window.addEventListener('popstate', routeFromHash);
    $('#hero-play').addEventListener('click', function (e) { openItem(e.currentTarget.dataset.id); });

    if (PREVIEW) document.documentElement.classList.add('is-preview');

    // First paint immediately, then again once local media has been verified.
    renderChips();
    renderLibrary();
    verifyLocalMedia().then(function () {
      renderChips();
      renderLibrary();
      renderFeature();
      routeFromHash();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // exposed for debugging from the console
  window.MotionTV = { open: openItem, close: function () { close(false); }, liveStatus: liveStatus };
})();
