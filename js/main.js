/* ==========================================================================
   Fascina Burguer — main.js
   Orquestrador: detecta capacidades, configura GSAP e inicia os módulos.
   ========================================================================== */
(function () {
  'use strict';

  var FB = window.FB;
  var root = document.documentElement;

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ctx = {
    gsap: window.gsap,
    ScrollTrigger: window.ScrollTrigger,
    reducedMotion: mqReduce.matches,
    isTouch: window.matchMedia('(hover: none), (pointer: coarse)').matches,
    isMobile: window.matchMedia('(max-width: 767px)').matches,
    config: FB.config
  };

  if (ctx.reducedMotion) document.body.classList.add('reduced-motion');
  if (ctx.isTouch) root.classList.add('is-touch');

  /* -------- Links de pedido / redes -------- */
  FB.qsa('[data-order]').forEach(function (a) {
    a.href = FB.config.orderUrl;
    a.target = '_blank';
    a.rel = 'noopener';
  });
  FB.qsa('[data-instagram]').forEach(function (a) {
    a.href = FB.config.instagramUrl;
    a.target = '_blank';
    a.rel = 'noopener';
  });
  FB.qsa('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* -------- Header: fundo ao rolar, esconde ao descer -------- */
  var header = FB.qs('[data-header]');
  var lastY = window.scrollY;
  var ticking = false;
  function onScroll() {
    if (ticking || !header) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      // só esconde depois do hero e se o foco não estiver no header
      var hide = y > lastY && y > window.innerHeight && !header.contains(document.activeElement);
      header.classList.toggle('is-hidden', hide);
      lastY = y;
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* -------- Pôsteres dos vídeos: só baixam perto da tela -------- */
  // (no HTML ficam em data-poster; um poster="" normal baixaria ~150 KB
  // de fotos logo na abertura, para uma seção lá embaixo)
  var posters = FB.qsa('video[data-poster]');
  function setPoster(v) { v.poster = v.getAttribute('data-poster'); v.removeAttribute('data-poster'); }
  if (!('IntersectionObserver' in window)) posters.forEach(setPoster);
  else {
    var posterIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        setPoster(e.target);
        posterIO.unobserve(e.target);
      });
    }, { rootMargin: '800px 0px' });
    posters.forEach(function (v) { posterIO.observe(v); });
  }

  /* -------- GSAP -------- */
  if (!ctx.gsap || !ctx.ScrollTrigger) {
    // CDN falhou: tudo continua legível (estado estático)
    document.body.classList.add('reduced-motion', 'no-gsap');
    console.warn('[Fascina] GSAP indisponível — animações desativadas.');
    return;
  }
  ctx.gsap.registerPlugin(ctx.ScrollTrigger);
  ctx.gsap.config({ nullTargetWarn: false });
  // Evita "pulos" quando a barra de endereço do mobile aparece/some
  ctx.ScrollTrigger.config({ ignoreMobileResize: true });

  /* -------- Inicia os módulos na ordem da página -------- */
  FB.config.order.forEach(function (name) {
    var init = FB.modules[name];
    if (typeof init !== 'function') return;
    try {
      init(ctx);
    } catch (err) {
      console.error('[Fascina] Falha ao iniciar módulo "' + name + '":', err);
    }
  });

  // Recalcula posições após fontes e imagens carregarem
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ctx.ScrollTrigger.refresh(); });
  }
  window.addEventListener('load', function () { ctx.ScrollTrigger.refresh(); });

  // Se o usuário mudar a preferência de movimento, recarrega para respeitar
  if (mqReduce.addEventListener) {
    mqReduce.addEventListener('change', function () { window.location.reload(); });
  }
})();
