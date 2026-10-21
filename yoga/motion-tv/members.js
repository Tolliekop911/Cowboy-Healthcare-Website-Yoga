/* ═══════════════════════════════════════════════════════════════════
   Motion TV — member accounts
   ───────────────────────────────────────────────────────────────────
   Sign in / create account / password reset against the Cowboy EHR's
   Supabase project — the same accounts as online booking and the
   Cowboy Yoga app. It mirrors the booking widget exactly:

     • sign-up sends the same profile details + widget token
     • after sign-in, fn_widget_link_account(token) connects the
       account to the studio (creates the studio member record)
     • fn_yoga_move_tv() returns the studio's class library, with each
       video marked locked/unlocked by the DATABASE based on the
       member's active paid plan; locked videos come back without a
       file path, so there is nothing to play
     • playable videos stream from a short-lived signed storage link

   Buying a membership happens in the booking widget (Stripe checkout).

   This file publishes its state as a `motiontv:members` event that
   motion-tv.js renders. No tracking, nothing logged.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var cfg = (window.MOTION_TV && window.MOTION_TV.members) || {};
  var BUCKET = 'yoga-videos';
  var VIDEO_LINK_SECONDS = 4 * 60 * 60;   // long enough for a long class
  var THUMB_LINK_SECONDS = 60 * 60;

  var state = { status: 'loading' };
  var sb = null;
  var linkedFor = null;        // user id we've already linked this session
  var lastFocus = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function emit(next) {
    state = next;
    renderAccountSlots();
    document.dispatchEvent(new CustomEvent('motiontv:members', { detail: state }));
  }

  /* ── Supabase ─────────────────────────────────────────────────── */

  function client() {
    if (sb) return sb;
    if (!window.supabase || !cfg.supabaseUrl || !cfg.publishableKey) return null;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'cowboy-motiontv-auth' }
    });
    return sb;
  }

  function pageUrl() { return location.origin + location.pathname; }

  function firstName(user) {
    var m = (user && user.user_metadata) || {};
    return m.first_name || (user && user.email ? user.email.split('@')[0] : '');
  }

  // Connect the account to the studio behind the Cowboy Yoga widget. Safe to repeat.
  function linkAccount(user) {
    if (!cfg.widgetToken || linkedFor === user.id) return Promise.resolve(null);
    return client().rpc('fn_widget_link_account', { p_widget_token: cfg.widgetToken })
      .then(function (res) {
        var d = res.data || {};
        if (!res.error && d.ok) linkedFor = user.id;
        return res.error ? 'request_failed' : (d.ok ? (d.linked ? null : d.reason || null) : d.error || null);
      })
      .catch(function () { return 'request_failed'; });
  }

  var LINK_NOTICES = {
    email_not_confirmed: 'Please confirm your email address to finish connecting your account. Open the confirmation link we sent you.',
    multiple_matches: 'We found more than one record with your email, so we couldn\'t connect your account automatically. Please contact the studio.',
    invalid_token: 'Online membership is temporarily unavailable. Please contact the studio.'
  };

  function signThumbnails(videos) {
    var paths = videos.map(function (v) { return v.thumbnail_path; }).filter(Boolean);
    if (!paths.length) return Promise.resolve(videos);
    return client().storage.from(BUCKET).createSignedUrls(paths, THUMB_LINK_SECONDS)
      .then(function (res) {
        var signed = {};
        (res.data || []).forEach(function (u) { if (u && u.path && u.signedUrl) signed[u.path] = u.signedUrl; });
        return videos.map(function (v) { var c = {}; for (var k in v) c[k] = v[k]; c.thumbnail_url = signed[v.thumbnail_path] || null; return c; });
      })
      .catch(function () { return videos; });
  }

  var refreshSeq = 0;
  function refresh(session) {
    var seq = ++refreshSeq;
    var user = session && session.user;
    if (!user) { emit({ status: 'signed_out' }); return; }
    emit({ status: 'loading', user: user, name: firstName(user) });

    linkAccount(user).then(function (linkIssue) {
      return client().rpc('fn_yoga_move_tv', { p_studio_id: null }).then(function (res) {
        if (seq !== refreshSeq) return;
        if (res.error) {
          var setup = /fn_yoga_move_tv|does not exist/i.test(res.error.message || '');
          emit({ status: 'error', user: user, name: firstName(user),
            error: setup ? 'The class library isn\'t set up yet.' : 'We couldn\'t load your classes. Please try again.' });
          return;
        }
        var d = res.data || {};
        if (d.error === 'not_signed_in') { emit({ status: 'signed_out' }); return; }
        if (!d.member) {
          emit({ status: 'no_member', user: user, name: firstName(user), notice: LINK_NOTICES[linkIssue] || null });
          return;
        }
        var videos = Array.isArray(d.videos) ? d.videos : [];
        return signThumbnails(videos).then(function (signed) {
          if (seq !== refreshSeq) return;
          emit({ status: 'ready', user: user, name: firstName(user), paid: !!d.paid, videos: signed });
        });
      });
    }).catch(function () {
      if (seq === refreshSeq) emit({ status: 'error', user: user, name: firstName(user), error: 'We couldn\'t reach the studio. Check your connection and try again.' });
    });
  }

  /* ── Public API used by motion-tv.js ──────────────────────────── */

  function playableUrl(video) {
    if (!video || video.locked || !video.storage_path || !client()) return Promise.resolve(null);
    return client().storage.from(BUCKET).createSignedUrl(video.storage_path, VIDEO_LINK_SECONDS)
      .then(function (res) { return res.error || !res.data ? null : res.data.signedUrl; })
      .catch(function () { return null; });
  }

  function signOut() {
    closeMenu();
    if (!client()) return;
    client().auth.signOut().catch(function () {}).then(function () { linkedFor = null; emit({ status: 'signed_out' }); });
  }

  /* ── Account button (nav) ─────────────────────────────────────── */

  function renderAccountSlots() {
    var slots = document.querySelectorAll('[data-member-slot]');
    Array.prototype.forEach.call(slots, function (slot) {
      var mobile = slot.hasAttribute('data-mobile');
      if (state.user) {
        var initial = (state.name || state.user.email || '?').charAt(0).toUpperCase();
        slot.innerHTML = mobile
          ? '<a href="#library" class="m-link">My classes</a><button type="button" class="m-link" data-member-signout>Sign out</button>'
          : '<button type="button" class="acct-btn" data-member-menu aria-haspopup="true" aria-expanded="false" aria-label="Your account">' +
              '<span class="acct-initial">' + esc(initial) + '</span></button>';
      } else if (state.status === 'loading' && !state.user) {
        slot.innerHTML = '';
      } else {
        slot.innerHTML = '<button type="button" class="' + (mobile ? 'm-link' : 'signin-btn') + '" data-member-open="login">Sign in</button>';
      }
    });
  }

  var menuEl = null;
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null;
    var b = $('[data-member-menu]');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function openMenu(btn) {
    if (menuEl) { closeMenu(); return; }
    var r = btn.getBoundingClientRect();
    menuEl = document.createElement('div');
    menuEl.className = 'acct-menu';
    menuEl.setAttribute('role', 'menu');
    var status = state.status === 'ready' ? (state.paid ? 'Member · full library' : 'Free previews') : state.status === 'no_member' ? 'Not linked to a membership' : '';
    menuEl.innerHTML =
      '<div class="acct-head"><strong>' + esc(state.name || 'Your account') + '</strong><span>' + esc(state.user.email) + '</span>' +
        (status ? '<em>' + esc(status) + '</em>' : '') + '</div>' +
      '<a role="menuitem" href="#library">My classes</a>' +
      '<a role="menuitem" href="' + esc(cfg.joinUrl) + '" target="_blank" rel="noopener">Membership &amp; billing &#8599;</a>' +
      '<button role="menuitem" type="button" data-member-signout>Sign out</button>';
    menuEl.style.top = (r.bottom + 10) + 'px';
    menuEl.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    document.body.appendChild(menuEl);
    btn.setAttribute('aria-expanded', 'true');
    var first = menuEl.querySelector('a, button');
    if (first) first.focus();
  }

  /* ── Auth dialog ──────────────────────────────────────────────── */

  var dialog, view = 'login', pendingEmail = '';

  var TITLES = {
    login: ['Welcome back', 'Sign in to watch your classes.'],
    signup: ['Join Motion TV', 'One account for Motion TV, online booking, and the Cowboy Yoga app.'],
    forgot: ['Reset your password', 'We\'ll email you a link to choose a new one.'],
    confirm: ['Check your email', ''],
    newpassword: ['Choose a new password', 'At least 8 characters, with a letter and a number.']
  };

  function field(name, label, type, extra) {
    return '<label class="auth-field"><span>' + label + '</span>' +
      '<input name="' + name + '" type="' + type + '" ' + (extra || '') + ' /></label>';
  }

  function renderDialog() {
    var t = TITLES[view];
    var body = '';
    if (view === 'login') {
      body = field('email', 'Email', 'email', 'autocomplete="email" required') +
        field('password', 'Password', 'password', 'autocomplete="current-password" required') +
        '<button type="submit" class="btn-accent auth-submit">Sign in</button>' +
        '<div class="auth-links"><button type="button" data-view="forgot">Forgot password?</button>' +
        '<button type="button" data-view="signup">Create an account</button></div>';
    } else if (view === 'signup') {
      body = '<div class="auth-row">' + field('firstName', 'First name', 'text', 'autocomplete="given-name" required') +
        field('lastName', 'Last name', 'text', 'autocomplete="family-name" required') + '</div>' +
        field('email', 'Email', 'email', 'autocomplete="email" required') +
        field('phone', 'Phone <em>(optional)</em>', 'tel', 'autocomplete="tel"') +
        field('password', 'Password', 'password', 'autocomplete="new-password" minlength="8" required') +
        field('confirm', 'Confirm password', 'password', 'autocomplete="new-password" required') +
        '<p class="auth-fine">At least 8 characters, with a letter and a number.</p>' +
        '<button type="submit" class="btn-accent auth-submit">Create account</button>' +
        '<div class="auth-links"><button type="button" data-view="login">I already have an account</button></div>';
    } else if (view === 'forgot') {
      body = field('email', 'Email', 'email', 'autocomplete="email" required') +
        '<button type="submit" class="btn-accent auth-submit">Send reset link</button>' +
        '<div class="auth-links"><button type="button" data-view="login">Back to sign in</button></div>';
    } else if (view === 'confirm') {
      body = '<p class="auth-lead">We sent a confirmation link to <strong>' + esc(pendingEmail) + '</strong>. Open it on this device to finish setting up your account, then you\'ll come right back here.</p>' +
        '<button type="button" class="btn-ghost auth-submit" data-resend>Send it again</button>' +
        '<div class="auth-links"><button type="button" data-view="login">Back to sign in</button></div>';
    } else if (view === 'newpassword') {
      body = field('password', 'New password', 'password', 'autocomplete="new-password" minlength="8" required') +
        field('confirm', 'Confirm new password', 'password', 'autocomplete="new-password" required') +
        '<button type="submit" class="btn-accent auth-submit">Save new password</button>';
    }
    dialog.querySelector('.auth-card').innerHTML =
      '<button type="button" class="auth-close" aria-label="Close">&times;</button>' +
      '<span class="auth-eyebrow">Motion TV · Cowboy Yoga</span>' +
      '<h2 id="auth-title">' + t[0] + '</h2>' + (t[1] ? '<p class="auth-sub">' + t[1] + '</p>' : '') +
      '<form novalidate>' + body + '</form>' +
      '<p class="auth-msg" role="alert" aria-live="assertive"></p>';
    var first = dialog.querySelector('input, .auth-submit');
    if (first) first.focus();
  }

  function say(text, ok) {
    var m = dialog.querySelector('.auth-msg');
    m.textContent = text || '';
    m.className = 'auth-msg' + (ok ? ' is-ok' : '');
  }
  function busy(on) {
    var b = dialog.querySelector('.auth-submit');
    if (b) { b.disabled = on; b.classList.toggle('is-busy', on); }
  }

  function openAuth(mode) {
    if (!client()) { window.open(cfg.joinUrl, '_blank', 'noopener'); return; }
    closeMenu();
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.className = 'auth-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'auth-title');
      dialog.innerHTML = '<div class="auth-card"></div>';
      document.body.appendChild(dialog);
      dialog.addEventListener('click', onDialogClick);
      dialog.addEventListener('submit', onSubmit);
      dialog.addEventListener('keydown', onDialogKey);
    }
    lastFocus = lastFocus || document.activeElement;
    view = mode || 'login';
    dialog.hidden = false;
    document.documentElement.classList.add('auth-open');
    renderDialog();
  }

  function closeAuth() {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.documentElement.classList.remove('auth-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  function onDialogClick(e) {
    if (e.target === dialog || e.target.closest('.auth-close')) { closeAuth(); return; }
    var v = e.target.closest('[data-view]');
    if (v) { view = v.dataset.view; renderDialog(); return; }
    if (e.target.closest('[data-resend]')) resend();
  }

  function onDialogKey(e) {
    if (e.key === 'Escape') { closeAuth(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.slice.call(dialog.querySelectorAll('button:not([disabled]), input'));
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  function passwordProblem(pw, confirm) {
    if (!pw || pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include at least one letter and one number.';
    if (pw !== confirm) return 'Passwords do not match.';
    return '';
  }

  function friendly(error) {
    var m = String((error && error.message) || error || '');
    if (/invalid login credentials/i.test(m)) return 'That email and password don\'t match. Try again, or reset your password.';
    if (/already registered|already exists/i.test(m)) return 'There\'s already an account with this email. Sign in instead — it\'s the same account you use for booking.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/network|fetch/i.test(m)) return 'We couldn\'t connect. Check your internet connection and try again.';
    return m || 'Something went wrong. Please try again.';
  }

  function onSubmit(e) {
    e.preventDefault();
    var f = e.target.elements;
    var val = function (n) { return f[n] ? String(f[n].value).trim() : ''; };
    say('');

    if (view === 'login') {
      if (!val('email') || !f.password.value) { say('Please enter your email and password.'); return; }
      busy(true);
      client().auth.signInWithPassword({ email: val('email'), password: f.password.value }).then(function (res) {
        busy(false);
        if (res.error) {
          if (/email not confirmed/i.test(res.error.message || '')) { pendingEmail = val('email'); view = 'confirm'; renderDialog(); return; }
          say(friendly(res.error)); return;
        }
        closeAuth();
      });
    } else if (view === 'signup') {
      if (!val('firstName') || !val('lastName') || !val('email')) { say('Please fill in your name and email.'); return; }
      var problem = passwordProblem(f.password.value, f.confirm.value);
      if (problem) { say(problem); return; }
      busy(true);
      client().auth.signUp({
        email: val('email'), password: f.password.value,
        options: {
          emailRedirectTo: pageUrl(),
          // The same details the booking widget sends; the server builds the
          // member record from them once the email is confirmed.
          data: { first_name: val('firstName'), last_name: val('lastName'), phone: val('phone') || null, dob: null,
                  widget_type: 'wellness', widget_token: cfg.widgetToken || null }
        }
      }).then(function (res) {
        busy(false);
        if (res.error) { say(friendly(res.error)); return; }
        if (res.data && res.data.session) { closeAuth(); return; }   // email confirmation is off
        pendingEmail = val('email'); view = 'confirm'; renderDialog();
      });
    } else if (view === 'forgot') {
      if (!val('email')) { say('Please enter your email.'); return; }
      busy(true);
      client().auth.resetPasswordForEmail(val('email'), { redirectTo: pageUrl() }).then(function (res) {
        busy(false);
        if (res.error) { say(friendly(res.error)); return; }
        say('If there\'s an account for that email, a reset link is on its way. Check your inbox.', true);
      });
    } else if (view === 'newpassword') {
      var p2 = passwordProblem(f.password.value, f.confirm.value);
      if (p2) { say(p2); return; }
      busy(true);
      client().auth.updateUser({ password: f.password.value }).then(function (res) {
        busy(false);
        if (res.error) { say(friendly(res.error)); return; }
        closeAuth();
      });
    }
  }

  function resend() {
    if (!pendingEmail) { view = 'login'; renderDialog(); return; }
    client().auth.resend({ type: 'signup', email: pendingEmail, options: { emailRedirectTo: pageUrl() } }).then(function (res) {
      say(res.error ? friendly(res.error) : 'We sent the confirmation email again.', !res.error);
    });
  }

  /* ── Wiring ───────────────────────────────────────────────────── */

  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-member-open]');
    if (open) { e.preventDefault(); document.querySelector('.mobile-nav') && document.querySelector('.mobile-nav').classList.remove('open'); openAuth(open.getAttribute('data-member-open')); return; }
    var menuBtn = e.target.closest('[data-member-menu]');
    if (menuBtn) { openMenu(menuBtn); return; }
    if (e.target.closest('[data-member-signout]')) { signOut(); return; }
    if (menuEl && !e.target.closest('.acct-menu')) closeMenu();
    if (menuEl && e.target.closest('.acct-menu a')) closeMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  function start() {
    if (!client()) {
      // Supabase library failed to load (offline, blocked): keep the page usable.
      emit({ status: 'unavailable' });
      return;
    }
    client().auth.onAuthStateChange(function (event, session) {
      // Supabase warns against awaiting its own calls inside this callback.
      setTimeout(function () {
        if (event === 'PASSWORD_RECOVERY') { openAuth('newpassword'); return; }
        if (event === 'TOKEN_REFRESHED') return;
        refresh(session);
      }, 0);
    });
  }

  window.MotionTVMembers = {
    get state() { return state; },
    openAuth: openAuth,
    signOut: signOut,
    playableUrl: playableUrl,
    joinUrl: cfg.joinUrl
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
