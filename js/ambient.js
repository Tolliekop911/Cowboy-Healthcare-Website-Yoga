/* ═══════════════════════════════════════════════
   Cowboy Healthcare — Ambient motion
   Slow, flowing "breath" lines drawn on a canvas.
   Usage: CowboyAmbient.mount(canvas, { color: [r,g,b], ... })
   Pauses when off-screen or when the tab is hidden, and
   renders a single still frame for prefers-reduced-motion.
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  var DEFAULTS = {
    color: [192, 154, 114],  // accent
    alpha: 0.22,             // peak line opacity
    count: 9,                // number of lines
    top: 0.18,               // first line, as a fraction of height
    bottom: 0.92,            // last line
    amp: 26,                 // wave height in px
    wavelength: 520,         // px
    speed: 0.16,             // radians per second
    lineWidth: 1,
    fps: 30
  };

  function mount(canvas, options) {
    if (!canvas || !canvas.getContext) return null;
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    for (var j in options || {}) o[j] = options[j];

    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var w = 0, h = 0, raf = 0, last = 0, visible = true;
    var start = performance.now();
    var freq = (Math.PI * 2) / o.wavelength;
    var rgb = o.color.join(',');

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw((performance.now() - start) / 1000);
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = o.lineWidth;
      var step = w > 900 ? 10 : 8;
      for (var i = 0; i < o.count; i++) {
        var p = o.count === 1 ? 0.5 : i / (o.count - 1);
        var baseY = h * (o.top + (o.bottom - o.top) * p);
        // each line "breathes": amplitude swells and settles slowly
        var swell = 0.55 + 0.45 * Math.sin(t * 0.22 + i * 0.8);
        var amp = o.amp * swell;
        var phase = t * o.speed + i * 0.55;
        ctx.beginPath();
        for (var x = -step; x <= w + step; x += step) {
          var y = baseY
            + Math.sin(x * freq + phase) * amp
            + Math.sin(x * freq * 2.3 - phase * 0.7 + i) * amp * 0.28;
          if (x === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        // fade lines in toward the middle of the stack
        var edge = Math.sin(Math.PI * (0.15 + 0.7 * p));
        var a = o.alpha * edge * (0.55 + 0.45 * Math.sin(t * 0.3 + i * 1.3));
        ctx.strokeStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
        ctx.stroke();
      }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / o.fps) return;
      last = now;
      draw((now - start) / 1000);
    }

    function play() {
      if (reduce || raf || !visible || document.hidden) return;
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(); else play();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) play(); else pause();
      }).observe(canvas);
    }
    play();

    return { play: play, pause: pause, resize: resize };
  }

  window.CowboyAmbient = { mount: mount };
})();
