/* Team 3314 — About page "Proven outcomes" animations.
   Sweeps the radial rings, grows the salary columns, and counts up every
   figure when its group scrolls into view. Pure progressive enhancement:
   without this script the numbers and captions still render (rings empty,
   bars flat). Respects prefers-reduced-motion. */
(function () {
  'use strict';
  var section = document.querySelector('[data-outcomes]');
  if (!section) return;

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(.22,.61,.36,1)';

  function easeOutCubic(p){ return 1 - Math.pow(1 - p, 3); }

  function fmtNum(val, dec, comma){
    if (comma) return Number(val.toFixed(dec)).toLocaleString('en-US', { minimumFractionDigits: dec });
    return val.toFixed(dec);
  }

  function countUp(el){
    var target = parseFloat(el.dataset.countup);
    var pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
    var dec = parseInt(el.dataset.decimals || '0', 10);
    var comma = !!el.dataset.comma;
    if (reduced){ el.textContent = pre + fmtNum(target, dec, comma) + suf; return; }
    var dur = 1500, t0 = performance.now();
    (function tick(now){
      var p = Math.min(1, ((now || performance.now()) - t0) / dur);
      el.textContent = pre + fmtNum(target * easeOutCubic(p), dec, comma) + suf;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = pre + fmtNum(target, dec, comma) + suf;
    })(t0);
  }

  function sweepRing(circle){
    var C = 2 * Math.PI * 52;
    var pct = parseFloat(circle.dataset.pct);
    var target = C * (1 - pct / 100);
    circle.style.strokeDasharray = C;
    if (reduced){ circle.style.strokeDashoffset = target; return; }
    circle.style.strokeDashoffset = C;
    circle.style.transition = 'stroke-dashoffset 1.5s ' + EASE;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      circle.style.strokeDashoffset = target;
    }); });
  }

  function growColumns(plot){
    var bars = [].slice.call(plot.querySelectorAll('.js-salbar'));
    var baseline = +plot.dataset.baseline;
    var max = Math.max.apply(null, bars.map(function(b){ return +b.dataset.value; }));
    var line = plot.querySelector('.js-salbase');
    if (line) line.style.bottom = (baseline / max * 100) + '%';
    bars.forEach(function(b){
      var val = +b.dataset.value;
      var hNum = val / max * 100;
      var label = b.parentElement.querySelector('.salcol__val');
      var labelBottom = 'calc(' + hNum + '% + 10px)';
      var adv = b.querySelector('.salbar__adv');
      if (adv) adv.style.height = (Math.max(0, val - baseline) / val * 100) + '%';
      if (reduced){ b.style.height = hNum + '%'; if (label) label.style.bottom = labelBottom; return; }
      b.style.height = '0%';
      b.style.transition = 'height 1.3s ' + EASE;
      if (label){ label.style.bottom = '10px'; label.style.transition = 'bottom 1.3s ' + EASE; }
      requestAnimationFrame(function(){ requestAnimationFrame(function(){
        b.style.height = hNum + '%';
        if (label) label.style.bottom = labelBottom;
      }); });
    });
  }

  // Each group animates when IT enters view — not the whole tall section.
  function playGroup(el){
    el.querySelectorAll('.js-count').forEach(countUp);
    el.querySelectorAll('.js-ring').forEach(sweepRing);
    if (el.classList.contains('js-salplot')) growColumns(el);
  }

  var groups = [].slice.call(section.querySelectorAll('.ring, .scholarship, .js-salplot'));
  if ('IntersectionObserver' in window && !reduced){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        playGroup(e.target);
      });
    }, { threshold: 0.4 });
    groups.forEach(function(g){ io.observe(g); });
  } else {
    groups.forEach(playGroup);
  }
})();
