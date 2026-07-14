/* Team 3314 — Team Info page: live calendar + documents.
   Renders the public team Google Calendar (list ⇄ month toggle) and the
   public team Drive folder (subfolders become sections) using the official
   Google APIs with a referrer-restricted browser key. See docs/adr/0001 for
   why this page fetches live instead of committing data to the repo.
   If either fetch fails (or the key below is unset), the section degrades
   to a direct link to Google. */
(function () {
  'use strict';

  /* ===== CONFIG ==========================================================
     API_KEY: create at console.cloud.google.com (Calendar API + Drive API
     enabled, restricted to frc3314.com referrers). Steps in README.md. */
  var API_KEY = 'AIzaSyCcE8R1yTaVXxZUoTLAczU2910CbeSnWbM';
  var CALENDAR_ID = 'c_c959a4578dd5c16bbe9eeee35486f91e59a4325a9f30b016bdf8f5dfa5079e3f@group.calendar.google.com';
  var FOLDER_ID = '1W_8LpI5kH1tUo1uloYdfw5_pGWILaQnc';
  /* PROTECTED_DOCS: shows the password-gated "Team-only documents" section,
     served by the Netlify function at /api/docs (netlify/functions/docs.mjs).
     The private folder and password live in Netlify environment variables —
     nothing about them ships to the browser. Setup steps in README.md;
     set to false to hide the section. */
  var PROTECTED_DOCS = true;
  var TIME_ZONE = 'America/New_York';
  /* ======================================================================= */

  var calRoot = document.getElementById('ti-calendar');
  var docsRoot = document.getElementById('ti-docs');
  var protRoot = document.getElementById('ti-docs-protected');
  if (!calRoot && !docsRoot && !protRoot) return;

  // Initialized here, not in the protected-docs block below: the init call
  // runs mid-file, before that block's var assignments would execute.
  var UNLOCK_KEY = 'ti-docs-unlocked';
  var DOCS_API = '/api/docs';

  var CAL_URL = 'https://calendar.google.com/calendar/embed?src=' +
    encodeURIComponent(CALENDAR_ID) + '&ctz=' + encodeURIComponent(TIME_ZONE);
  var FOLDER_URL = 'https://drive.google.com/drive/folders/' + FOLDER_ID;
  var configured = API_KEY && API_KEY.indexOf('PASTE_') !== 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fallback(root, msg, linkText, linkHref) {
    var box = el('div', 'ti-fallback');
    box.appendChild(el('p', null, msg));
    var a = el('a', 'btn', linkText + ' →');
    a.href = linkHref;
    a.target = '_blank';
    a.rel = 'noopener';
    box.appendChild(a);
    root.innerHTML = '';
    root.appendChild(box);
  }

  /* ---------- date helpers ----------
     Every event is reduced to a calendar-date key ("2026-07-15") in the
     team's timezone at parse time; all later grouping and display works on
     keys, so visitors in other timezones see the dates the team means. */
  var keyFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  var timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit'
  });

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parseKey(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function fmtKey(key, opts) {
    return parseKey(key).toLocaleDateString('en-US', opts);
  }
  var todayKey = keyFmt.format(new Date());

  function parseEvent(item) {
    var allDay = !!(item.start && item.start.date);
    var ev = {
      title: item.summary || '(untitled event)',
      location: item.location || '',
      desc: plainText(item.description || ''),
      allDay: allDay
    };
    if (allDay) {
      ev.key = item.start.date;
      // end.date is exclusive; walk back one day for the real last day.
      var e = parseKey(item.end.date);
      e = new Date(e.getFullYear(), e.getMonth(), e.getDate() - 1);
      ev.endKey = keyOf(e.getFullYear(), e.getMonth(), e.getDate());
      ev.time = 'ALL DAY';
    } else {
      var start = new Date(item.start.dateTime);
      var end = new Date(item.end.dateTime);
      ev.key = keyFmt.format(start);
      ev.endKey = keyFmt.format(end);
      ev.time = timeFmt.format(start) + ' – ' + timeFmt.format(end);
    }
    if (ev.endKey !== ev.key) {
      ev.time += '  → ' + fmtKey(ev.endKey, { month: 'short', day: 'numeric' }).toUpperCase();
    }
    return ev;
  }

  function plainText(html) {
    if (!html) return '';
    return new DOMParser().parseFromString(html, 'text/html').body.textContent.trim();
  }

  function fetchEvents(timeMin, timeMax, maxResults) {
    var url = 'https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(CALENDAR_ID) + '/events' +
      '?key=' + API_KEY +
      '&singleEvents=true&orderBy=startTime' +
      '&maxResults=' + (maxResults || 250) +
      '&timeMin=' + encodeURIComponent(timeMin.toISOString()) +
      '&timeMax=' + encodeURIComponent(timeMax.toISOString());
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('calendar API ' + r.status);
      return r.json();
    }).then(function (data) {
      return (data.items || []).map(parseEvent);
    });
  }

  /* ---------- calendar section ---------- */
  if (calRoot) initCalendar();

  function initCalendar() {
    var listBtn = document.getElementById('ti-view-list');
    var monthBtn = document.getElementById('ti-view-month');
    var view = matchMedia('(max-width: 700px)').matches ? 'list' : 'month';
    var listCache = null;
    var monthCache = {};
    var now = parseKey(todayKey);
    var curY = now.getFullYear();
    var curM = now.getMonth();

    if (!configured) {
      fallback(calRoot, 'The live calendar view isn’t connected yet.',
        'OPEN THE TEAM CALENDAR', CAL_URL);
      return;
    }

    function calFail() {
      fallback(calRoot, 'The calendar couldn’t load here just now.',
        'OPEN THE TEAM CALENDAR', CAL_URL);
    }

    function setView(v) {
      view = v;
      listBtn.setAttribute('aria-pressed', String(v === 'list'));
      monthBtn.setAttribute('aria-pressed', String(v === 'month'));
      render();
    }
    listBtn.addEventListener('click', function () { setView('list'); });
    monthBtn.addEventListener('click', function () { setView('month'); });

    function loading(msg) {
      calRoot.innerHTML = '';
      calRoot.appendChild(el('p', 'ti-status', msg));
    }

    function render() { view === 'list' ? renderList() : renderMonth(); }

    /* ----- list view ----- */
    function renderList() {
      if (listCache) return paintList(listCache);
      loading('LOADING EVENTS…');
      var from = new Date();
      var to = new Date(from.getFullYear(), from.getMonth() + 7, 1);
      fetchEvents(from, to, 50).then(function (evs) {
        listCache = evs;
        if (view === 'list') paintList(evs);
      }).catch(calFail);
    }

    /* Long horizons fill the page, so the list starts at ~LIST_CHUNK events
       and grows by the same amount per "show more" click. New chunks append
       in place (no re-render), so expanded events stay expanded. */
    var LIST_CHUNK = 10;

    function paintList(evs) {
      calRoot.innerHTML = '';
      if (!evs.length) {
        calRoot.appendChild(el('p', 'ti-status', 'NOTHING ON THE CALENDAR YET — CHECK BACK SOON.'));
        return;
      }
      var list = el('div', 'ti-list');
      calRoot.appendChild(list);
      var idx = 0, lastKey = null, dayWrap = null;
      var more = el('button', 'ti-more');
      more.type = 'button';
      more.addEventListener('click', addChunk);

      function addChunk() {
        var target = idx + LIST_CHUNK;
        while (idx < evs.length) {
          var ev = evs[idx];
          if (ev.key !== lastKey) {
            // Only cut between days, so a day's events never get split.
            if (idx >= target) break;
            lastKey = ev.key;
            dayWrap = el('div', 'ti-day');
            var label = fmtKey(ev.key, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
            if (ev.key === todayKey) label += ' · TODAY';
            dayWrap.appendChild(el('p', 'ti-day__head', label));
            list.appendChild(dayWrap);
          }
          dayWrap.appendChild(eventRow(ev));
          idx++;
        }
        var remaining = evs.length - idx;
        if (remaining > 0) {
          more.textContent = 'SHOW MORE — ' + remaining + ' UPCOMING ' +
            (remaining === 1 ? 'EVENT' : 'EVENTS') + ' HIDDEN';
          calRoot.appendChild(more);
        } else if (more.parentNode) {
          more.parentNode.removeChild(more);
        }
      }
      addChunk();
    }

    function eventRow(ev) {
      var row = el('article', 'ti-event');
      var head = el('button', 'ti-event__head');
      head.type = 'button';
      head.setAttribute('aria-expanded', 'false');
      head.appendChild(el('span', 'ti-event__time', ev.time));
      head.appendChild(el('span', 'ti-event__title', ev.title));
      var details = el('div', 'ti-event__details');
      details.hidden = true;
      if (ev.location) details.appendChild(el('span', 'ti-event__meta', ev.location.toUpperCase()));
      if (ev.desc) details.appendChild(el('p', 'ti-event__desc', ev.desc));
      if (!ev.location && !ev.desc) details.appendChild(el('span', 'ti-event__meta', 'NO EXTRA DETAILS'));
      head.addEventListener('click', function () {
        var open = details.hidden;
        details.hidden = !open;
        head.setAttribute('aria-expanded', String(open));
      });
      row.appendChild(head);
      row.appendChild(details);
      return row;
    }

    /* ----- month view ----- */
    function renderMonth() {
      var k = curY + '-' + curM;
      if (monthCache[k]) return paintMonth(monthCache[k]);
      loading('LOADING ' + new Date(curY, curM, 1)
        .toLocaleDateString('en-US', { month: 'long' }).toUpperCase() + '…');
      // Padded a day each side so timezone edges don't drop boundary events.
      fetchEvents(new Date(curY, curM, 0), new Date(curY, curM + 1, 2)).then(function (evs) {
        var byDay = {};
        evs.forEach(function (ev) {
          (byDay[ev.key] = byDay[ev.key] || []).push(ev);
        });
        monthCache[k] = byDay;
        if (view === 'month' && k === curY + '-' + curM) paintMonth(byDay);
      }).catch(calFail);
    }

    function paintMonth(byDay) {
      calRoot.innerHTML = '';

      var bar = el('div', 'ti-monthbar');
      var prev = el('button', null, '←');
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Previous month');
      var label = el('span', 'ti-monthbar__label',
        new Date(curY, curM, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
      var next = el('button', null, '→');
      next.type = 'button';
      next.setAttribute('aria-label', 'Next month');
      prev.addEventListener('click', function () { step(-1); });
      next.addEventListener('click', function () { step(1); });
      bar.appendChild(prev); bar.appendChild(label); bar.appendChild(next);
      calRoot.appendChild(bar);

      var week = el('div', 'ti-weekdays');
      ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach(function (d) {
        week.appendChild(el('span', null, d));
      });
      calRoot.appendChild(week);

      var grid = el('div', 'ti-grid');
      var firstDow = new Date(curY, curM, 1).getDay();
      var daysIn = new Date(curY, curM + 1, 0).getDate();
      var daysInPrev = new Date(curY, curM, 0).getDate();
      var total = Math.ceil((firstDow + daysIn) / 7) * 7;

      for (var i = 0; i < total; i++) {
        var dayNum = i - firstDow + 1;
        if (dayNum < 1) {
          grid.appendChild(dimCell(daysInPrev + dayNum));
        } else if (dayNum > daysIn) {
          grid.appendChild(dimCell(dayNum - daysIn));
        } else {
          grid.appendChild(dayCell(dayNum, byDay[keyOf(curY, curM, dayNum)] || []));
        }
      }
      calRoot.appendChild(grid);

      var panel = el('div', 'ti-panel');
      panel.id = 'ti-panel';
      panel.hidden = true;
      calRoot.appendChild(panel);
    }

    function step(dir) {
      curM += dir;
      if (curM < 0) { curM = 11; curY--; }
      if (curM > 11) { curM = 0; curY++; }
      renderMonth();
    }

    function dimCell(num) {
      var c = el('div', 'ti-cell ti-cell--dim');
      c.appendChild(el('span', 'ti-cell__num', String(num)));
      return c;
    }

    function dayCell(num, evs) {
      var key = keyOf(curY, curM, num);
      var cls = 'ti-cell' + (key === todayKey ? ' ti-cell--today' : '');
      var c;
      if (evs.length) {
        c = el('button', cls);
        c.type = 'button';
        c.setAttribute('aria-label',
          fmtKey(key, { weekday: 'long', month: 'long', day: 'numeric' }) +
          ' — ' + evs.length + (evs.length === 1 ? ' event' : ' events'));
        c.addEventListener('click', function () { openPanel(key, evs); });
      } else {
        c = el('div', cls);
      }
      c.appendChild(el('span', 'ti-cell__num', String(num)));
      evs.slice(0, 2).forEach(function (ev) {
        c.appendChild(el('span', 'ti-pill', ev.title));
      });
      if (evs.length > 2) {
        c.appendChild(el('span', 'ti-pill ti-pill--more', '+' + (evs.length - 2) + ' MORE'));
      }
      if (evs.length) {
        var dots = el('span', 'ti-cell__dots');
        evs.slice(0, 4).forEach(function () { dots.appendChild(el('span', 'ti-dot')); });
        c.appendChild(dots);
      }
      return c;
    }

    function openPanel(key, evs) {
      var panel = document.getElementById('ti-panel');
      panel.innerHTML = '';
      panel.hidden = false;

      var head = el('div', 'ti-panel__head');
      head.appendChild(el('span', 'ti-panel__date',
        fmtKey(key, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()));
      var close = el('button', 'ti-panel__close', 'CLOSE ×');
      close.type = 'button';
      close.addEventListener('click', function () { panel.hidden = true; });
      head.appendChild(close);
      panel.appendChild(head);

      evs.forEach(function (ev) {
        var item = el('div', 'ti-panel__event');
        item.appendChild(el('h3', 'ti-panel__title', ev.title));
        item.appendChild(el('span', 'ti-event__time', ev.time));
        if (ev.location) item.appendChild(el('span', 'ti-event__meta', ev.location.toUpperCase()));
        if (ev.desc) item.appendChild(el('p', 'ti-event__desc', ev.desc));
        panel.appendChild(item);
      });
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    setView(view);
  }

  /* ---------- documents section ---------- */
  if (docsRoot) initDocs();
  if (protRoot) initProtectedDocs();

  function isFolder(f) { return f.mimeType === 'application/vnd.google-apps.folder'; }

  function driveList(q) {
    var url = 'https://www.googleapis.com/drive/v3/files' +
      '?key=' + API_KEY +
      '&q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent('files(id,name,mimeType,webViewLink,modifiedTime)') +
      '&orderBy=name&pageSize=100' +
      // The team folder lives in a Shared Drive; without these flags the
      // API pretends it doesn't exist.
      '&supportsAllDrives=true&includeItemsFromAllDrives=true';
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('drive API ' + r.status);
      return r.json();
    }).then(function (data) { return data.files || []; });
  }

  function loadDocs(folderId, root, onFail) {
    root.innerHTML = '';
    root.appendChild(el('p', 'ti-status', 'LOADING DOCUMENTS…'));

    driveList("'" + folderId + "' in parents and trashed = false").then(function (items) {
      var folders = items.filter(isFolder);
      var rootFiles = items.filter(function (f) { return !isFolder(f); });
      return Promise.all(folders.map(function (f) {
        return driveList("'" + f.id + "' in parents and trashed = false").then(function (kids) {
          return { name: f.name, files: kids.filter(function (k) { return !isFolder(k); }) };
        });
      })).then(function (sections) { paintDocs(root, sections, rootFiles); });
    }).catch(onFail);
  }

  function initDocs() {
    if (!configured) {
      fallback(docsRoot, 'The live document list isn’t connected yet.',
        'BROWSE THE TEAM FOLDER', FOLDER_URL);
      return;
    }
    loadDocs(FOLDER_ID, docsRoot, function () {
      fallback(docsRoot, 'The document list couldn’t load here just now.',
        'BROWSE THE TEAM FOLDER', FOLDER_URL);
    });
  }

  function paintDocs(root, sections, rootFiles) {
    root.innerHTML = '';
    sections = sections.filter(function (s) { return s.files.length; });

    if (!sections.length && !rootFiles.length) {
      root.appendChild(el('p', 'ti-status', 'NO DOCUMENTS HAVE BEEN POSTED YET.'));
      return;
    }
    sections.forEach(function (s) { root.appendChild(docSection(s.name, s.files)); });
    if (rootFiles.length) {
      root.appendChild(docSection(sections.length ? 'Other documents' : null, rootFiles));
    }
  }

  function docSection(title, files) {
    var sec = el('div', 'ti-docsec');
    if (title) sec.appendChild(el('h3', 'ti-docsec__head', title));
    files.forEach(function (f) { sec.appendChild(docRow(f)); });
    return sec;
  }

  var MIME_CHIPS = [
    ['application/pdf', 'PDF'],
    ['vnd.google-apps.document', 'DOC'],
    ['vnd.google-apps.spreadsheet', 'SHEET'],
    ['vnd.google-apps.presentation', 'SLIDES'],
    ['vnd.google-apps.form', 'FORM'],
    ['wordprocessingml', 'DOC'],
    ['spreadsheetml', 'SHEET'],
    ['presentationml', 'SLIDES'],
    ['image/', 'IMAGE'],
    ['video/', 'VIDEO']
  ];

  function docRow(f) {
    var a = el('a', 'ti-doc');
    a.href = f.webViewLink;
    a.target = '_blank';
    a.rel = 'noopener';
    a.appendChild(el('span', 'ti-doc__name', f.name));

    var mod = new Date(f.modifiedTime);
    var opts = { month: 'short', day: 'numeric' };
    if (mod.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    a.appendChild(el('span', 'ti-doc__meta',
      'UPDATED ' + mod.toLocaleDateString('en-US', opts).toUpperCase()));

    var chip = 'FILE';
    for (var i = 0; i < MIME_CHIPS.length; i++) {
      if (f.mimeType.indexOf(MIME_CHIPS[i][0]) !== -1) { chip = MIME_CHIPS[i][1]; break; }
    }
    a.appendChild(el('span', 'ti-doc__chip', chip));
    return a;
  }

  /* ---------- protected documents ----------
     Backed by the Netlify function at /api/docs (netlify/functions/docs.mjs).
     The password check, the private folder's identity, and every file fetch
     happen server-side; the unlocked session rides an HttpOnly cookie this
     script can't even read. The private folder is NOT link-shared — a
     Google service account is the only outside identity with access — so a
     forwarded file URL is useless without the cookie. The sessionStorage
     flag below is just UI state ("try the listing before showing the
     gate"); holding it proves nothing without the cookie. */

  function initProtectedDocs() {
    if (!PROTECTED_DOCS) return;
    var section = document.getElementById('ti-protected');
    if (section) section.hidden = false;

    var flag = null;
    try { flag = sessionStorage.getItem(UNLOCK_KEY); } catch (e) { /* blocked storage */ }
    if (flag) fetchListing();
    else paintGate();
  }

  function fetchListing() {
    protRoot.innerHTML = '';
    protRoot.appendChild(el('p', 'ti-status', 'LOADING DOCUMENTS…'));
    fetch(DOCS_API).then(function (r) {
      if (r.status === 401) { relock(); return null; }
      if (!r.ok) throw new Error('docs API ' + r.status);
      return r.json();
    }).then(function (listing) {
      if (listing) paintProtected(listing);
    }).catch(function () {
      relock('THE DOCUMENTS COULDN’T LOAD — TRY UNLOCKING AGAIN.');
    });
  }

  function paintGate(msg) {
    protRoot.innerHTML = '';
    var box = el('div', 'ti-gate');
    box.appendChild(el('p', 'ti-gate__lede',
      'These documents are for team members and families. Enter the team password to view them — ask a mentor or coach if you need it.'));

    var form = el('form', 'ti-gate__form');
    var field = el('div', 'ti-gate__field');
    var input = el('input', 'ti-gate__input');
    input.type = 'password';
    input.name = 'team-password';
    input.placeholder = 'TEAM PASSWORD';
    input.setAttribute('aria-label', 'Team password');
    input.autocomplete = 'off';
    var peek = el('button', 'ti-gate__peek', 'SHOW');
    peek.type = 'button';
    peek.setAttribute('aria-label', 'Show password');
    peek.setAttribute('aria-pressed', 'false');
    peek.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      peek.textContent = show ? 'HIDE' : 'SHOW';
      peek.setAttribute('aria-pressed', String(show));
      input.focus();
    });
    field.appendChild(input);
    field.appendChild(peek);
    var btn = el('button', 'btn', 'UNLOCK →');
    btn.type = 'submit';
    form.appendChild(field);
    form.appendChild(btn);
    box.appendChild(form);

    var err = el('p', 'ti-gate__err', msg || '');
    err.hidden = !msg;
    box.appendChild(err);
    protRoot.appendChild(box);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value || btn.disabled) return;
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = 'CHECKING…';
      fetch(DOCS_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: input.value })
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).then(function (listing) {
        try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch (e2) { /* fine */ }
        paintProtected(listing);
      }).catch(function (failure) {
        btn.disabled = false;
        btn.textContent = 'UNLOCK →';
        err.textContent = failure.message === '401'
          ? 'THAT PASSWORD DIDN’T WORK — TRY AGAIN.'
          : 'THE UNLOCK SERVICE COULDN’T BE REACHED — TRY AGAIN IN A MOMENT.';
        err.hidden = false;
        input.select();
      });
    });
  }

  function relock(msg) {
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch (e) { /* fine */ }
    paintGate(msg);
  }

  function paintProtected(listing) {
    protRoot.innerHTML = '';
    var docs = el('div');
    protRoot.appendChild(docs);

    // Reuse the public renderer: point each row at the proxy instead of a
    // Drive link (these files have no shareable Drive links).
    function withLinks(files) {
      return files.map(function (f) {
        return {
          name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime,
          webViewLink: DOCS_API + '?file=' + encodeURIComponent(f.id)
        };
      });
    }
    paintDocs(docs,
      (listing.sections || []).map(function (s) { return { name: s.name, files: withLinks(s.files) }; }),
      withLinks(listing.rootFiles || []));

    var note = el('p', 'ti-note');
    note.appendChild(document.createTextNode('Unlocked for this visit.  ·  '));
    var lock = el('button', 'mono-link ti-lock', 'LOCK AGAIN');
    lock.type = 'button';
    lock.addEventListener('click', function () {
      fetch(DOCS_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lock: true })
      }).catch(function () { /* the cookie’s own expiry still applies */ });
      relock();
    });
    note.appendChild(lock);
    protRoot.appendChild(note);
  }

})();
