/* Team 3314 site effects — production version of the prototype's site-fx.js.
   Behaviors kept: scroll fade-ins, stat count-ups, mobile hamburger nav
   (incl. the homepage overlay nav), and the mailto composers behind the
   Contact and Join forms. Hover lifts are pure CSS; page transitions are
   native cross-document view transitions (see global.css).
   The prototype's DOM heuristics are replaced with explicit hooks:
   .reveal, [data-count], .nav__toggle, .nav-panel, #contact-form, #join-form. */
(function () {
  'use strict';
  if (window.__siteFx) return;
  window.__siteFx = true;

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  /* ---------- scroll fade-ins ---------- */
  var reveals = document.querySelectorAll('.reveal');
  var io = null;
  if (!reduced && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        if (entry.target.__count) runCount(entry.target);
        else entry.target.classList.add('is-visible');
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  }
  if (io) {
    reveals.forEach(function (el) {
      io.observe(el);
      // Safety valve from the prototype: never leave in-viewport content hidden.
      setTimeout(function () {
        if (!el.classList.contains('is-visible') &&
            el.getBoundingClientRect().top < innerHeight) {
          el.classList.add('is-visible');
        }
      }, 3000);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- stat count-ups ---------- */
  var numRe = /^\s*([~$]?)(\d[\d,]*(?:\.\d+)?)([%KMs+]*)\s*$/;
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var m = (el.textContent || '').match(numRe);
    if (!m || reduced || !io) return;
    el.__count = {
      prefix: m[1],
      target: parseFloat(m[2].replace(/,/g, '')),
      suffix: m[3],
      decimals: (m[2].split('.')[1] || '').length,
      comma: m[2].indexOf(',') >= 0
    };
    io.observe(el);
  });

  function fmt(n, c) {
    var s = c.comma
      ? Number(n.toFixed(c.decimals)).toLocaleString('en-US', { minimumFractionDigits: c.decimals })
      : n.toFixed(c.decimals);
    return c.prefix + s + c.suffix;
  }

  function runCount(el) {
    var c = el.__count;
    var dur = 1400;
    var t0 = performance.now();
    el.style.minWidth = el.offsetWidth + 'px';
    (function tick(now) {
      var p = Math.min(1, ((now || performance.now()) - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(c.target * eased, c);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(c.target, c);
    })(t0);
  }

  /* ---------- mobile hamburger nav ---------- */
  var toggle = document.querySelector('.nav__toggle');
  var panel = document.querySelector('.nav-panel');
  var nav = document.querySelector('.nav');
  if (toggle && panel && nav) {
    var overlay = nav.classList.contains('nav--overlay');
    var open = false;
    var closeTimer;

    function place() {
      if (overlay) panel.style.top = (nav.offsetTop + nav.offsetHeight) + 'px';
    }

    function setOpen(o) {
      open = o;
      toggle.setAttribute('aria-expanded', String(o));
      clearTimeout(closeTimer);
      if (o) {
        nav.classList.add('is-open');
        if (overlay) nav.style.background = '#4A0808';
        place();
        panel.hidden = false;
        requestAnimationFrame(function () { panel.classList.add('is-open'); });
      } else {
        nav.classList.remove('is-open');
        if (overlay) nav.style.background = '';
        panel.classList.remove('is-open');
        closeTimer = setTimeout(function () { if (!open) panel.hidden = true; }, 280);
      }
    }

    toggle.addEventListener('click', function () { setOpen(!open); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) { setOpen(false); toggle.focus(); }
    });
    window.addEventListener('resize', function () { if (open) place(); });

    var mq = matchMedia('(max-width: 940px)');
    function apply() { if (!mq.matches && open) setOpen(false); }
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
  }

  /* ---------- mailto form composers ---------- */
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function setStatus(id, msg) { var el = document.getElementById(id); if (el) el.textContent = msg; }

  var contactBtn = document.getElementById('contact-send');
  if (contactBtn) {
    contactBtn.addEventListener('click', function () {
      var name = val('ct-name').trim();
      var email = val('ct-email').trim();
      var topic = val('ct-topic');
      var msg = val('ct-msg').trim();
      if (!name || !msg) {
        setStatus('contact-status', 'Please add your name and a message.');
        return;
      }
      var subject = '[' + topic + '] Message from ' + name + ' — via frc3314.com';
      var body = msg + '\n\n— ' + name + (email ? ' (' + email + ')' : '');
      window.location.href = 'mailto:admin@frc3314.com?subject=' +
        encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      setStatus('contact-status', 'Opening your email app…');
    });
  }

  var joinBtn = document.getElementById('join-send');
  if (joinBtn) {
    joinBtn.addEventListener('click', function () {
      var name = val('jn-name').trim();
      if (!name) {
        setStatus('join-status', 'Please add your name.');
        return;
      }
      var subject = '[Joining] ' + name + ' wants to join Team 3314';
      var msg = val('jn-msg').trim();
      var body = 'Name: ' + name + '\nGrade: ' + val('jn-grade') +
        '\nMost interested in: ' + val('jn-team') + (msg ? '\n\n' + msg : '');
      window.location.href = 'mailto:admin@frc3314.com?subject=' +
        encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      setStatus('join-status', 'Opening your email app…');
    });
  }

  /* ---------- homepage hero video: nudge autoplay past mobile blockers ----------
     iOS Safari refuses autoplay in Low Power Mode / Data Saver and after
     bfcache restores, leaving a play-button glyph over the video. Call
     play() explicitly, retry on first touch and page restore, and hide
     the video (revealing the static photo) if playback stays blocked. */
  var heroVideo = document.querySelector('.hero__video');
  if (heroVideo) {
    if (reduced) {
      heroVideo.removeAttribute('autoplay');
      heroVideo.style.display = 'none';
    } else {
      heroVideo.muted = true; // some WebKit builds ignore the HTML attr for autoplay policy
      var tryPlay = function () {
        var p = heroVideo.play();
        if (p && p.then) {
          p.then(function () { heroVideo.style.visibility = ''; })
           .catch(function () { heroVideo.style.visibility = 'hidden'; });
        }
      };
      tryPlay();
      window.addEventListener('touchend', tryPlay, { once: true, passive: true });
      window.addEventListener('pointerdown', tryPlay, { once: true });
      window.addEventListener('pageshow', function () { if (heroVideo.paused) tryPlay(); });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && heroVideo.paused) tryPlay();
      });
    }
  }

})();
