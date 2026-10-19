/*
 * Animated tile-grid hero (built by .build/hero_grid.py, AVIF tiles listed in grid/grid.json).
 *
 * The hero image is the grid's first frame. After the page has loaded, matching tiles are laid over
 * it and, one at a time at staggered moments, a tile fades out and a different slide pops in.
 * Respects prefers-reduced-motion and pauses while the hero is off screen.
 */
(function () {
  var MARK = '/00-hero-grid-';
  var STEP = 1300;          // ms between swaps (each swap affects one tile)
  var OUT = 450, GAP = 250; // fade-out, empty pause before the new slide pops in

  function setup(img) {
    var host = (img.closest('picture') || img).parentNode;
    if (!host || host.querySelector('.hero-grid')) return;
    var src = img.currentSrc || img.src;
    var url = src.slice(0, src.indexOf(MARK)) + '/grid/grid.json';
    fetch(url).then(function (r) { return r.json(); }).then(function (g) {
      // tile paths in grid.json are relative to it
      g.tiles.forEach(function (t) {
        t.srcset = t.avif.split(',').map(function (c) { var p = c.trim().split(/\s+/); return new URL(p[0], url).href + ' ' + p[1]; }).join(', ');
      });
      build(host, g);
    }).catch(function () {});
  }

  function tileEl(t, cell, radius) {
    var p = document.createElement('picture');
    var i = document.createElement('img');
    i.sizes = (cell.w * 100).toFixed(1) + 'vw'; i.srcset = t.srcset; i.alt = ''; i.decoding = 'async';
    p.appendChild(i);
    p.className = 'hero-grid__tile';
    p.style.cssText = 'left:' + cell.x * 100 + '%;top:' + cell.y * 100 + '%;width:' + cell.w * 100 + '%;height:' + cell.h * 100 + '%;border-radius:' + radius + 'vw';
    return p;
  }

  function build(host, g) {
    host.style.position = 'relative';
    var layer = document.createElement('div');
    layer.className = 'hero-grid';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
    var shown = g.start.slice();
    var tiles = g.cells.map(function (cell, k) { var el = tileEl(g.tiles[shown[k]], cell, g.radius * 100); layer.appendChild(el); return el; });
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var visible = true, last = -1;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(host);
    // preload the slides that are not on screen yet (the same size the tiles will pick), one at a time,
    // so a pop-in never shows a half-loaded tile and the downloads never crowd the rest of the page
    var sizes = (g.cells[0].w * 100).toFixed(1) + 'vw';
    var spare = g.tiles.filter(function (t, i) { return shown.indexOf(i) < 0; });
    (function next() {
      var t = spare.shift();
      if (!t) return;
      var im = new Image();
      im.onload = im.onerror = next;
      im.sizes = sizes; im.srcset = t.srcset;
    })();

    // the fully visible tiles in the middle change first (nearest the centre first), then any tile
    var first = g.cells.map(function (c, i) { return i; })
      .filter(function (i) { var c = g.cells[i]; return c.x >= 0 && c.y >= 0 && c.x + c.w <= 1 && c.y + c.h <= 1; })
      .sort(function (a, b) {
        var d = function (i) { var c = g.cells[i]; return Math.pow(c.x + c.w / 2 - 0.5, 2) + Math.pow(c.y + c.h / 2 - 0.5, 2); };
        return d(a) - d(b);
      }).slice(0, 4);

    function swap() {
      setTimeout(swap, STEP + Math.random() * 600);
      if (!visible || document.hidden) return;
      var k;
      if (first.length) k = first.shift();
      else do { k = Math.floor(Math.random() * tiles.length); } while (k === last && tiles.length > 1);
      last = k;
      var pool = []; for (var i = 0; i < g.tiles.length; i++) if (shown.indexOf(i) < 0) pool.push(i);
      if (!pool.length) return;
      var next = pool[Math.floor(Math.random() * pool.length)];
      var old = tiles[k];
      old.classList.add('hero-grid__tile--out');
      setTimeout(function () {
        var el = tileEl(g.tiles[next], g.cells[k], g.radius * 100);
        el.classList.add('hero-grid__tile--in');
        layer.replaceChild(el, old);
        tiles[k] = el; shown[k] = next;
        requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove('hero-grid__tile--in'); }); });
      }, OUT + GAP);
    }
    setTimeout(swap, 1600);
  }

  function start() {
    var imgs = document.querySelectorAll('.project-intro__preview img');
    for (var i = 0; i < imgs.length; i++) {
      if ((imgs[i].getAttribute('srcset') || imgs[i].getAttribute('src') || '').indexOf(MARK) > -1) setup(imgs[i]);
    }
  }
  if (document.readyState === 'complete') setTimeout(start, 300); else window.addEventListener('load', function () { setTimeout(start, 300); });
})();
