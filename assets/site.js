/*
 * Interactive parts of the site in plain JS (replaces the Nuxt/Vue runtime):
 * image loading, home slider, menu overlay, accordions, industries list, cycling galleries, contact form.
 * Behaviour and timings follow the original components.
 */
(function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var nextFrame = function (fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); };
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // true while el is (partly) on screen; calls back on every change
  var onScreen = function (el, cb) {
    var state = { visible: true };
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; if (cb) cb(state.visible); }).observe(el);
    return state;
  };

  // ---- images: data-src / data-srcset -> src / srcset --------------------------------------------
  function loadImages(root) {
    (root.matches && root.matches('source, img') ? [root] : $$('source, img', root)).forEach(function (el) {
      if (el.dataset.srcset) { el.srcset = el.dataset.srcset; el.removeAttribute('data-srcset'); }
      if (el.dataset.src) { el.src = el.dataset.src; el.removeAttribute('data-src'); }
    });
  }

  // The hero (the one image with real src + fetchpriority=high) loads on its own first. Then the images
  // near the screen load in page order, CONCURRENT at a time, each fading in once decoded; when those
  // are done the rest of the page follows one by one in the background (not on Save-Data / 2G).
  var CONCURRENT = 2;
  function images() {
    // cards whose image already has a real src (the Work page's first card is its hero): show them once loaded
    $$('.project-card__preview img[src]').forEach(function (img) {
      var card = img.closest('.project-card__preview');
      var done = function () { card.classList.add('project-card__preview--loaded'); };
      if (img.complete) done(); else { img.addEventListener('load', done); img.addEventListener('error', done); }
    });
    var pending = $$('img[data-src], img[data-srcset]').filter(function (img) { return !img.closest('.slick-slide, .toggle-menu'); });
    if (!pending.length) return;
    var conn = navigator.connection, frugal = conn && (conn.saveData || /2g/.test(conn.effectiveType || ''));
    var active = 0, started = false, loaded = document.readyState === 'complete';
    var box = function (img) { return img.closest('.lazy-load, picture') || img; };
    var reveal = function (img) {
      var card = img.closest('.project-card__preview');
      if (card) card.classList.add('project-card__preview--loaded'); else img.classList.add('lz-in');
    };
    var load = function (img) {
      active++;
      if (!img.closest('.project-card__preview')) img.classList.add('lz');
      var done = function () {
        img.removeEventListener('load', done); img.removeEventListener('error', done);
        // decoded before it fades in; decode() can wait forever in a hidden tab, so not longer than 400 ms
        var decoded = img.decode ? img.decode().catch(function () {}) : null;
        Promise.race([decoded, new Promise(function (r) { setTimeout(r, 400); })]).then(function () { reveal(img); active--; pump(); });
      };
      img.addEventListener('load', done); img.addEventListener('error', done);
      loadImages(img.parentNode.tagName === 'PICTURE' ? img.parentNode : img);
    };
    var pump = function () {
      if (!started) return;
      while (active < CONCURRENT && pending.length) {
        var i = 0;
        while (i < pending.length && !pending[i].__near) i++;
        if (i === pending.length) {
          // nothing near the screen is waiting: fetch the rest in the background, one at a time
          if (!loaded || frugal || active) return;
          i = 0;
        }
        load(pending.splice(i, 1)[0]);
      }
    };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          pending.forEach(function (img) { if (box(img) === e.target) img.__near = true; });
        });
        pump();
      }, { rootMargin: '0px 0px 100% 0px' });           // the screen and one more screen below it
      pending.forEach(function (img) { io.observe(box(img)); });
    } else pending.forEach(function (img) { img.__near = true; });
    window.addEventListener('load', function () { loaded = true; pump(); });
    var go = function () { if (!started) { started = true; pump(); } };
    var hero = $('img[fetchpriority="high"], iframe[data-hero]');   // an iframe hero has no .complete: wait for its load
    if (!hero || (hero.complete && hero.naturalWidth)) go();
    else { hero.addEventListener('load', go); hero.addEventListener('error', go); setTimeout(go, 2500); }
  }

  // ---- home slider: fade, autoplay every 5s (not with reduced motion, paused on hover / focus /
  // off screen), previous / next buttons ---------------------------------------------------------------
  function slider() {
    var root = $('.project-slider');
    if (!root) return;
    var slides = $$('.slick-slide', root);
    if (slides.length < 2) return;
    var current = 0, timer = null, held = false;
    var view = onScreen(root);
    var prep = function (i) { loadImages(slides[(i + slides.length) % slides.length]); };
    var show = function (i) {
      i = (i + slides.length) % slides.length;
      prep(i); prep(i + 1);
      slides.forEach(function (s, k) {
        var on = k === i;
        s.classList.toggle('slick-active', on); s.classList.toggle('slick-current', on);
        if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
      });
      current = i;
      play();
    };
    var play = function () {
      clearTimeout(timer);
      if (still) return;
      timer = setTimeout(function () { if (document.hidden || held || !view.visible) play(); else show(current + 1); }, 5000);
    };
    var area = root.closest('.page-intro') || root;
    area.addEventListener('mouseenter', function () { held = true; });
    area.addEventListener('mouseleave', function () { held = false; });
    area.addEventListener('focusin', function () { held = true; });
    area.addEventListener('focusout', function () { held = false; });
    var prev = $('.page-intro__btn--prev'), next = $('.page-intro__btn--next');
    if (prev) prev.addEventListener('click', function () { show(current - 1); });
    if (next) next.addEventListener('click', function () { show(current + 1); });
    // the next slide's image only after the page has loaded, so it never competes with the first one
    var later = function () { setTimeout(function () { prep(1); }, 1500); };
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
    play();
  }

  // ---- menu overlay -------------------------------------------------------------------------------
  function menu() {
    var el = $('.toggle-menu');
    if (!el) return;
    var open = false, t = null, back = null;
    var toggles = $$('.app-header__toggle');
    var clear = function () { el.classList.remove('toggle-transition-enter', 'toggle-transition-enter-active', 'toggle-transition-enter-to', 'toggle-transition-leave', 'toggle-transition-leave-active', 'toggle-transition-leave-to'); };
    var set = function (on) {
      if (on === open) return;
      open = on; clearTimeout(t); clear();
      toggles.forEach(function (b) { b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
      if (on) {
        back = document.activeElement;
        loadImages(el);
        el.style.display = '';
        document.body.classList.add('lock-scroll');
        el.classList.add('toggle-transition-enter', 'toggle-transition-enter-active');
        nextFrame(function () { el.classList.remove('toggle-transition-enter'); el.classList.add('toggle-transition-enter-to'); });
        t = setTimeout(clear, 250);
        var close = $('.toggle-menu__close', el);
        if (close) close.focus();
      } else {
        document.body.classList.remove('lock-scroll');
        el.classList.add('toggle-transition-leave', 'toggle-transition-leave-active');
        nextFrame(function () { el.classList.remove('toggle-transition-leave'); el.classList.add('toggle-transition-leave-to'); });
        t = setTimeout(function () { clear(); el.style.display = 'none'; }, 250);
        (back && back !== document.body && back.focus ? back : toggles[0]).focus();
      }
    };
    toggles.forEach(function (b) { b.addEventListener('click', function () { set(!open); }); });
    $$('.toggle-menu__close', el).forEach(function (b) { b.addEventListener('click', function () { set(false); }); });
    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { set(false); return; }
      if (e.key !== 'Tab') return;
      // keep keyboard focus inside the open menu
      var f = $$('a[href], button', el).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    // the menu's "latest work" card is a block with links inside: the whole card opens the project
    var card = $('.toggle-menu__case', el);
    if (card && card.getAttribute('to')) { card.style.cursor = 'pointer'; card.addEventListener('click', function (e) { if (!e.target.closest('a')) location.href = card.getAttribute('to'); }); }
  }

  // ---- accordions: each item opens and closes on its own, height animates ------------------------
  function accordions() {
    $$('.accordion-item').forEach(function (item, n) {
      var btn = $('.accordion-item__container', item), body = $('.accordion-item__details', item);
      if (!btn || !body) return;
      var t = null;
      body.id = body.id || 'accordion-' + n;
      btn.setAttribute('aria-controls', body.id);
      btn.setAttribute('aria-expanded', item.classList.contains('accordion-item--open') ? 'true' : 'false');
      var clear = function () { body.classList.remove('accordion-item-enter', 'accordion-item-enter-active', 'accordion-item-leave-active', 'accordion-item-leave-to'); body.style.height = ''; };
      btn.addEventListener('click', function () {
        clearTimeout(t); clear();
        var opening = !item.classList.contains('accordion-item--open');
        item.classList.toggle('accordion-item--open', opening);
        btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (opening) {
          body.style.display = '';
          var h = body.scrollHeight;
          body.classList.add('accordion-item-enter', 'accordion-item-enter-active');
          nextFrame(function () { body.classList.remove('accordion-item-enter'); body.style.height = h + 'px'; });
        } else {
          body.style.height = body.scrollHeight + 'px';
          body.classList.add('accordion-item-leave-active');
          nextFrame(function () { body.classList.add('accordion-item-leave-to'); });
        }
        t = setTimeout(function () { clear(); if (!opening) body.style.display = 'none'; }, 250);
      });
    });
  }

  // ---- Services: industries list (hover on desktop, centre of the screen on mobile) -------------
  function industries() {
    var sec = $('.industries-section');
    if (!sec) return;
    var body = $('.industries-section__body', sec), list = $('.industries-section__list', sec);
    var items = $$('.industries-section__item', sec), caps = $$('.industries-section__cap', sec);
    var descs = $$('.industries-section__industry-description [data-industry]', sec);
    var desc = $('.industries-section__industry-description', sec), arrow = $('.industries-section__arrow', sec);
    var logos = $('.industries-section__logos', sec), logoSets = logos ? $$('.industry-logos', logos) : [];
    var mq = window.matchMedia('(min-width: 992px)'), active = null, io = null;
    var top = function (i) { var b = body.getBoundingClientRect().top; return (caps[i] ? caps[i].getBoundingClientRect().top : b) - b; };
    var measure = function () {
      body.style.setProperty('--list-width', list.offsetWidth + 'px');
      var last = caps[caps.length - 1];
      if (logos) {
        if (mq.matches && last) logos.style.setProperty('--logos-height', (last.getBoundingClientRect().bottom - body.getBoundingClientRect().top) + 'px');
        else logos.style.removeProperty('--logos-height');
      }
    };
    var render = function () {
      body.classList.toggle('industries-section__body--active', active !== null);
      items.forEach(function (li, k) { li.classList.toggle('industries-section__item--active', k === active); });
      descs.forEach(function (d) { d.hidden = +d.dataset.industry !== active; });
      logoSets.forEach(function (l, k) { l.style.display = k === active ? '' : 'none'; });
    };
    var activate = function (i) {
      active = i;
      var l = Math.floor(top(0)), c = Math.floor(top(i)), cs = getComputedStyle(sec);
      var v = body.offsetHeight + parseFloat(cs.paddingBottom) - (parseFloat(cs.getPropertyValue('--grid-gutter-x')) || 0) - (logos ? logos.offsetHeight : 0);
      if (logos) logos.style.setProperty('--logos-top', Math.max(l, Math.min(c, v)) + 'px');
      if (arrow) arrow.style.setProperty('--arrow-top', c + 'px');
      if (desc) desc.style.setProperty('--description-top', top(i) + 'px');
      render();
    };
    var mode = function () {
      active = null; render(); measure();
      if (io) { io.disconnect(); io = null; }
      if (!mq.matches && 'IntersectionObserver' in window) {
        io = new IntersectionObserver(function (entries) {
          entries.filter(function (e) { return !e.isIntersecting; }).concat(entries.filter(function (e) { return e.isIntersecting; })).forEach(function (e) {
            var k = items.indexOf(e.target);
            if (e.isIntersecting) activate(k); else if (k === active) { active = null; render(); }
          });
        }, { rootMargin: '-50% 0px -50% 0px' });
        items.forEach(function (li) { io.observe(li); });
      }
    };
    items.forEach(function (li, k) { li.addEventListener('mouseenter', function () { if (mq.matches) activate(k); }); });
    list.addEventListener('mouseleave', function () { if (mq.matches) { active = null; render(); } });
    if (mq.addEventListener) mq.addEventListener('change', mode); else mq.addListener(mode);
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(list); else window.addEventListener('resize', measure);
    mode();
  }

  // ---- Services: galleries that cycle through their images every 2s (only while on screen; with
  // reduced motion the first image stays) ------------------------------------------------------------
  function cycling() {
    if (still) return;
    $$('.file-gallery-animated').forEach(function (g) {
      var items = $$('.file-gallery-animated__item', g), i = 0;
      if (items.length < 2) return;
      var view = onScreen(g);
      setInterval(function () {
        if (!view.visible || document.hidden) return;
        loadImages(items[(i + 2) % items.length]);   // the one after next, so it is ready when shown
        items[i].classList.remove('file-gallery-animated__item--visible');
        i = (i + 1) % items.length;
        items[i].classList.add('file-gallery-animated__item--visible');
      }, 2000);
    });
  }

  // ---- Contact form: validation, growing message box, email app via the sum check (email-guard.js) --
  function contact() {
    var form = $('.contact-form');
    if (!form) return;
    var scope = 'data-v-85115788';
    var fields = [
      { el: $('input[type="text"]', form), rules: ['required'] },
      { el: $('input[type="email"]', form), rules: ['required', 'email'] },
      { el: $('textarea', form), rules: ['required'] },
    ].filter(function (f) { return f.el; });
    var check = function (f) {
      var v = f.el.value.trim(), msg = '';
      if (f.rules.indexOf('required') > -1 && !v) msg = 'Required *';
      else if (f.rules.indexOf('email') > -1 && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Must be a valid email';
      var group = f.el.closest('.form-group'), err = $('.form-group__error', group);
      f.el.classList.toggle('form-control--error', !!msg); f.el.classList.toggle('form-control--margin', !!msg);
      if (msg) {
        if (!err) { err = document.createElement('div'); err.className = 'form-group__error form-group__error--left-placement'; group.appendChild(err); }
        err.textContent = msg;
      } else if (err) err.remove();
      return !msg;
    };
    fields.forEach(function (f) { f.el.addEventListener('input', function () { if (f.el.classList.contains('form-control--error')) check(f); }); });
    var ta = $('textarea', form);
    var grow = function () { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.overflow = 'hidden'; };
    if (ta) { ta.addEventListener('input', grow); grow(); }
    var original = form.innerHTML, busy = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var ok = fields.map(check).every(Boolean);
      if (!ok || !window.emailGuard) return;
      busy = true;
      var btn = $('.contact-form__submit', form);
      if (btn) { btn.classList.add('btn--loading'); btn.disabled = true; }
      window.emailGuard.compose({ name: fields[0].el.value, email: fields[1].el.value, message: fields[2].el.value }).then(function () {
        form.innerHTML = '<div ' + scope + '="" class="contact-form__success success-message"><p ' + scope + '="" class="lead-text success-message__text">Your email app should now be open with your message.<br>Send it from there and I’ll get back to you.</p> <button ' + scope + '="" type="button" class="btn">Got it</button></div>';
        $('.btn', form).addEventListener('click', function () { form.innerHTML = original; busy = false; contactReset(); });
      }, function (err) {
        if (err && err.message) alert(err.message);
      }).then(function () { busy = false; if (btn) { btn.classList.remove('btn--loading'); btn.disabled = false; } });
    });
    var contactReset = function () { form.replaceWith(form.cloneNode(true)); contact(); };
  }

  // ---- header: hides while scrolling down, comes back as soon as you scroll up ----------------------
  function header() {
    var h = $('.app-header'); if (!h) return;
    var last = window.scrollY, ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY, d = y - last;
        if (document.body.classList.contains('lock-scroll')) h.classList.remove('app-header--hidden');   // menu open
        else if (y < 80 || d < -4) h.classList.remove('app-header--hidden');
        else if (d > 4) h.classList.add('app-header--hidden');
        if (Math.abs(d) > 4 || y < 80) last = y;
        ticking = false;
      });
    }, { passive: true });
  }

  function start() { images(); slider(); menu(); accordions(); industries(); cycling(); contact(); header(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
