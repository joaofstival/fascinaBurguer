/* ==========================================================================
   Fascina Burguer — menu.js
   Seção C · "Escolha a sua Perdição" — cardápio horizontal em palco.

   Modos:
   - PINADO (desktop ≥768px + mouse + movimento liberado): a seção é pinada e
     o scroll vertical vira movimento horizontal do trilho (scrub).
   - NATIVO (toque / mobile / movimento reduzido): carrossel com scroll-snap
     nativo — não sequestramos o gesto, só lemos o scroll para a barra.

   Extras: tilt 3D com glare (mouse), card "aceso" no centro do palco,
   navegação por setas do teclado e foco por Tab sempre visível.
   ========================================================================== */
(function () {
  'use strict';

  var FB = window.FB;

  FB.register('menu', function (ctx) {
    var gsap = ctx.gsap;
    var ScrollTrigger = ctx.ScrollTrigger;

    var section = FB.qs('#cardapio');
    if (!section) return;
    var pin = FB.qs('[data-menu-pin]', section);
    var viewport = FB.qs('[data-menu-viewport]', section);
    var track = FB.qs('[data-menu-track]', section);
    var bar = FB.qs('[data-menu-progress]', section);
    var cards = FB.qsa('.menu-card', track);
    if (!pin || !viewport || !track || !cards.length) return;

    /* ---------------- Estado compartilhado ---------------- */
    var state = {
      pinned: false,     // modo pinado ativo?
      st: null,          // ScrollTrigger do pin
      tween: null,       // tween horizontal do trilho
      distance: 0,       // quanto o trilho anda (px)
      centers: [],       // centro de cada card relativo ao trilho (cache)
      lefts: [],         // offsetLeft de cada card (cache)
      lit: -1            // índice do card "aceso"
    };

    section.classList.add('is-staged');

    /* ---------------- Medições (fora do loop de scroll) ---------------- */
    function measure() {
      state.lefts = cards.map(function (c) { return c.offsetLeft; });
      state.centers = cards.map(function (c, i) { return state.lefts[i] + c.offsetWidth / 2; });
      // offsetWidth ignora transforms (reveal/escala) — scrollWidth não
      state.distance = Math.max(0, track.offsetWidth - viewport.clientWidth);
      state.pad = parseFloat(getComputedStyle(viewport).scrollPaddingLeft) || 0;
      if (typeof alignCenter !== 'undefined') alignCenter = snapAlignIsCenter();
    }

    /* Índice do card cujo centro está mais perto do centro visível */
    function nearestIndex(visibleCenter) {
      var best = 0, bestD = Infinity;
      for (var i = 0; i < state.centers.length; i++) {
        var d = Math.abs(state.centers[i] - visibleCenter);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    /* Acende o card do centro (classe → transição CSS barata) */
    /* Card "atual" no modo nativo, coerente com o alinhamento do snap:
       - center (mobile): o mais próximo do centro visível
       - start (≥768px): o primeiro card cujo início está visível */
    function snapAlignIsCenter() {
      return (getComputedStyle(cards[0]).scrollSnapAlign || '').indexOf('center') > -1;
    }
    var alignCenter = snapAlignIsCenter();
    function nativeIndex(x) {
      if (alignCenter) return nearestIndex(x + viewport.clientWidth / 2);
      var pad = state.pad;
      for (var i = 0; i < state.lefts.length; i++) {
        if (state.lefts[i] - pad >= x - 4) return i;
      }
      return state.lefts.length - 1;
    }

    function setLit(i) {
      if (i === state.lit) return;
      if (cards[state.lit]) cards[state.lit].classList.remove('is-lit');
      cards[i].classList.add('is-lit');
      state.lit = i;
    }

    function setProgress(p) {
      if (bar) bar.style.transform = 'scaleX(' + FB.clamp(p, 0, 1).toFixed(4) + ')';
    }

    measure();

    /* ======================================================================
       MODO NATIVO — progresso e card aceso a partir do scroll do viewport
       (listener passivo + rAF; ignorado quando o modo pinado está ativo)
       ====================================================================== */
    var nativeTicking = false;
    function onNativeScroll() {
      if (state.pinned) {
        // Em modo pinado o viewport não deve rolar (o foco por Tab pode
        // tentar rolá-lo para revelar um botão): força de volta a 0.
        if (viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
        return;
      }
      if (nativeTicking) return;
      nativeTicking = true;
      requestAnimationFrame(function () {
        nativeTicking = false;
        var max = viewport.scrollWidth - viewport.clientWidth;
        var x = viewport.scrollLeft;
        setProgress(max > 0 ? x / max : 0);
        setLit(nativeIndex(x));
      });
    }
    viewport.addEventListener('scroll', onNativeScroll, { passive: true });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!state.pinned) { measure(); onNativeScroll(); }
      }, 150);
    }, { passive: true });

    /* ======================================================================
       MODO PINADO — scroll vertical → horizontal (gsap.matchMedia)
       ====================================================================== */
    var mm = gsap.matchMedia();

    mm.add('(min-width: 768px) and (pointer: fine) and (prefers-reduced-motion: no-preference)', function () {
      state.pinned = true;
      section.classList.add('is-pinned-mode'); // muda layout ANTES de medir
      viewport.scrollLeft = 0;
      measure();

      function getDistance() {
        measure();
        return state.distance;
      }

      // Atualiza barra + card aceso com base na posição REAL do trilho
      // (progresso do tween, que já inclui a suavização do scrub)
      function onTrackUpdate() {
        var p = state.tween ? state.tween.progress() : 0;
        setProgress(p);
        // Mapeamento linear progresso → card: no início o 1º card está aceso,
        // no fim o último (e cada card fica 100% visível no seu ponto).
        setLit(Math.round(p * (cards.length - 1)));
      }

      state.tween = gsap.to(track, {
        x: function () { return -getDistance(); },
        ease: 'none',
        onUpdate: onTrackUpdate,
        scrollTrigger: {
          trigger: pin,
          start: 'top top',
          end: function () { return '+=' + getDistance(); },
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: onTrackUpdate
        }
      });
      state.st = state.tween.scrollTrigger;
      onTrackUpdate();

      // Limpeza ao sair do breakpoint (gsap.matchMedia reverte tween/pin)
      return function () {
        state.pinned = false;
        state.st = null;
        state.tween = null;
        section.classList.remove('is-pinned-mode');
        gsap.set(track, { clearProps: 'transform' });
        // volta ao modo nativo: remede e sincroniza
        requestAnimationFrame(function () { measure(); onNativeScroll(); });
      };
    });

    /* Estado inicial no modo nativo */
    if (!state.pinned) onNativeScroll();

    /* ======================================================================
       NAVEGAÇÃO — índice do card → posição de scroll
       ====================================================================== */
    var behavior = ctx.reducedMotion ? 'auto' : 'smooth';

    /* Posição de scroll da PÁGINA que centraliza o card i no modo pinado */
    function pinnedScrollYFor(i) {
      var st = state.st;
      if (!st) return null;
      var p = cards.length > 1 ? i / (cards.length - 1) : 0;
      return st.start + p * (st.end - st.start);
    }

    /* Posição scrollLeft do viewport para o card i no modo nativo,
       respeitando o alinhamento de snap em uso (center no mobile, start ≥768) */
    function nativeScrollLeftFor(i) {
      if (alignCenter) return state.centers[i] - viewport.clientWidth / 2;
      return state.lefts[i] - state.pad;
    }

    function goTo(i, opts) {
      i = FB.clamp(i, 0, cards.length - 1);
      var how = (opts && opts.behavior) || behavior;
      if (state.pinned) {
        var y = pinnedScrollYFor(i);
        if (y != null) window.scrollTo({ top: Math.round(y), behavior: how });
      } else {
        measure();
        viewport.scrollTo({ left: Math.max(0, nativeScrollLeftFor(i)), behavior: how });
      }
      setLit(i);
    }

    /* Setas ←/→ quando o foco está no viewport ou num CTA dentro dele */
    viewport.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      var current = state.lit < 0 ? 0 : state.lit;
      // se o foco está num card, parte dele (mais previsível)
      var owner = e.target.closest && e.target.closest('.menu-card');
      if (owner) current = cards.indexOf(owner);
      var next = current + (e.key === 'ArrowRight' ? 1 : -1);
      goTo(next);
      // mantém o foco acompanhando o card quando se navega pelos CTAs
      if (owner && cards[next]) {
        var cta = FB.qs('.menu-card__cta', cards[next]);
        if (cta) cta.focus({ preventScroll: true });
      }
    });

    /* Tab num CTA em modo pinado: rola a página até o card ficar visível.
       Essencial para acessibilidade — sem isso o botão focado ficaria fora
       da tela (o trilho é movido por transform, não por scroll). */
    viewport.addEventListener('focusin', function (e) {
      if (!state.pinned) return;
      var owner = e.target.closest && e.target.closest('.menu-card');
      if (!owner) return;
      viewport.scrollLeft = 0;
      requestAnimationFrame(function () { viewport.scrollLeft = 0; });
      goTo(cards.indexOf(owner));
    });

    /* Mantém caches sincronizados em cada refresh global do ScrollTrigger */
    ScrollTrigger.addEventListener('refresh', function () {
      measure();
      if (!state.pinned) onNativeScroll();
    });

    /* ======================================================================
       REVEAL — cards entram voando da direita (uma vez)
       ====================================================================== */
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      gsap.from(cards, {
        x: function (i) { return 140 + i * 24; },
        rotationY: -18,
        opacity: 0,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.08,
        clearProps: 'transform,opacity',
        scrollTrigger: {
          trigger: section,
          start: 'top 70%',
          once: true
        }
      });
    });

    /* ======================================================================
       TILT 3D + GLARE — só com mouse e movimento liberado
       ====================================================================== */
    mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', function () {
      section.classList.add('has-tilt');
      var MAX = 10;     // graus máximos de rotação
      var DEPTH = 14;   // px de parallax da foto (sentido oposto)
      var cleanups = [];

      // Ao rolar (o trilho anda no modo pinado) o retângulo em cache fica velho
      var scrollEpoch = 0;
      function bumpEpoch() { scrollEpoch++; }
      window.addEventListener('scroll', bumpEpoch, { passive: true });
      cleanups.push(function () { window.removeEventListener('scroll', bumpEpoch); });

      cards.forEach(function (li) {
        var inner = FB.qs('.menu-card__inner', li);
        var img = FB.qs('.menu-card__media img', li);
        if (!inner) return;

        // Perspectiva vem do CSS (perspective: 900px no li) — evitamos
        // duplicar com transformPerspective aqui.
        var rx = gsap.quickTo(inner, 'rotationX', { duration: 0.5, ease: 'power3.out' });
        var ry = gsap.quickTo(inner, 'rotationY', { duration: 0.5, ease: 'power3.out' });
        var ix = img ? gsap.quickTo(img, 'x', { duration: 0.7, ease: 'power3.out' }) : null;
        var iy = img ? gsap.quickTo(img, 'y', { duration: 0.7, ease: 'power3.out' }) : null;

        var rect = null, w = 0, h = 0, epoch = -1;
        var px = 0, py = 0, raf = 0;

        function readRect() {
          // único ponto com leitura de layout: no enter ou após scroll (no rAF)
          rect = li.getBoundingClientRect();
          w = inner.offsetWidth;
          h = inner.offsetHeight;
          epoch = scrollEpoch;
        }

        function frame() {
          raf = 0;
          if (!rect || epoch !== scrollEpoch) readRect();
          // posição relativa ao article (topo do li = topo do article)
          var nx = FB.clamp((px - rect.left) / w, 0, 1);
          var ny = FB.clamp((py - rect.top) / h, 0, 1);
          ry((nx - 0.5) * 2 * MAX);
          rx(-(ny - 0.5) * 2 * MAX);
          if (ix) { ix(-(nx - 0.5) * DEPTH); iy(-(ny - 0.5) * DEPTH); }
          li.style.setProperty('--mx', (nx * 100).toFixed(1) + '%');
          li.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
        }

        function onEnter(e) {
          readRect();
          px = e.clientX; py = e.clientY;
          if (!raf) raf = requestAnimationFrame(frame);
        }
        function onMove(e) {
          if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
          px = e.clientX; py = e.clientY;
          if (!raf) raf = requestAnimationFrame(frame);
        }
        function onLeave() {
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
          rect = null;
          rx(0); ry(0);
          if (ix) { ix(0); iy(0); }
          // --mx/--my ficam onde estavam: a explosão "recolhe" para o ponto de saída
        }

        li.addEventListener('pointerenter', onEnter);
        li.addEventListener('pointermove', onMove);
        li.addEventListener('pointerleave', onLeave);
        cleanups.push(function () {
          li.removeEventListener('pointerenter', onEnter);
          li.removeEventListener('pointermove', onMove);
          li.removeEventListener('pointerleave', onLeave);
          if (raf) cancelAnimationFrame(raf);
          gsap.set(inner, { clearProps: 'transform' });
          if (img) gsap.set(img, { clearProps: 'transform' });
          li.style.removeProperty('--mx');
          li.style.removeProperty('--my');
        });
      });

      return function () {
        section.classList.remove('has-tilt');
        cleanups.forEach(function (fn) { fn(); });
      };
    });
  });
})();
