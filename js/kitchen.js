/* ==========================================================================
   Fascina Burguer — kitchen.js
   Seção D "A Mágica Acontece":
     1. Vídeos lazy (só baixam perto da tela, tocam com ≥ 35% visível,
        pausam ao sair / aba oculta). Sem arquivo → pôster com Ken Burns.
     2. Revelação dos clipes (clip-path), do texto e dos depoimentos.
     3. "Tsssss." chiando (jitter leve nas letras, só enquanto visível).
   ========================================================================== */
(function () {
  'use strict';

  var FB = window.FB;
  if (!FB) return;

  var PLAY_RATIO = 0.35;

  FB.register('kitchen', function (ctx) {
    var section = FB.qs('[data-section="kitchen"]');
    if (!section) return;

    var gsap = ctx.gsap;
    var ST = ctx.ScrollTrigger;
    var reduce = ctx.reducedMotion;
    var cleanups = [];

    cleanups.push(setupVideos(FB.qsa('video[data-lazy-video]', section), reduce));

    if (!reduce) {
      revealMedia(gsap, section);
      revealCopy(gsap, section);
      revealTestimonials(gsap, section);
      cleanups.push(sizzle(gsap, ST, FB.qs('.kitchen__sound', section)));
    }

    return function destroy() {
      cleanups.forEach(function (fn) { if (typeof fn === 'function') fn(); });
    };
  });

  /* ------------------------------------------------------------------
     1. Vídeos lazy
     ------------------------------------------------------------------ */
  function setupVideos(videos, reduce) {
    if (!videos.length) return null;

    function figureOf(v) { return v.closest('figure'); }
    function setPoster(v, on) {
      var fig = figureOf(v);
      if (fig) fig.classList.toggle('is-poster', on);
    }
    function fail(v) {
      v._fb.failed = true;
      try { v.pause(); } catch (e) { /* noop */ }
      setPoster(v, true);
    }

    // Estado inicial: pôster visível (com Ken Burns) até o vídeo tocar de fato.
    videos.forEach(function (v) {
      v._fb = { loaded: false, failed: false, visible: false };
      v.removeAttribute('autoplay');
      setPoster(v, true);
    });

    // Movimento reduzido ou navegador antigo: nada de autoplay, só o pôster.
    if (reduce || !('IntersectionObserver' in window)) return null;

    function load(v) {
      if (v._fb.loaded) return;
      v._fb.loaded = true;

      var sources = FB.qsa('source[data-src]', v);
      if (!sources.length) { fail(v); return; }

      // O 'error' na ÚLTIMA <source> significa que nenhuma fonte serviu
      // (ex.: arquivos ainda não existem em assets/video/).
      sources[sources.length - 1].addEventListener('error', function () { fail(v); });
      v.addEventListener('error', function () { fail(v); });
      v.addEventListener('playing', function () { setPoster(v, false); });

      sources.forEach(function (s) { s.src = s.getAttribute('data-src'); });
      v.preload = 'auto';
      v.load();
    }

    function play(v) {
      if (v._fb.failed || document.hidden) return;
      load(v);
      var p;
      try { p = v.play(); } catch (e) { setPoster(v, true); return; }
      if (p && typeof p.catch === 'function') {
        p.catch(function (err) {
          // AbortError = pause() chamado antes do play terminar (rolagem rápida): ignorar.
          if (err && err.name === 'AbortError') return;
          // NotAllowedError / NotSupportedError: mantém o pôster.
          setPoster(v, true);
        });
      }
    }

    function pause(v) {
      if (!v.paused) v.pause();
    }

    // Observer 1: começa a baixar ~200px antes de entrar na tela.
    var loadIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        load(entry.target);
        loadIO.unobserve(entry.target);
      });
    }, { rootMargin: '200px 0px' });

    // Observer 2: toca/pausa conforme a fração visível (sem rootMargin,
    // para o intersectionRatio ser real).
    var playIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var v = entry.target;
        v._fb.visible = entry.isIntersecting && entry.intersectionRatio >= PLAY_RATIO;
        if (v._fb.visible) play(v); else pause(v);
      });
    }, { threshold: [0, PLAY_RATIO, 0.6] });

    videos.forEach(function (v) {
      loadIO.observe(v);
      playIO.observe(v);
    });

    // Aba oculta → pausa tudo; voltou → retoma só os visíveis.
    function onVisibility() {
      videos.forEach(function (v) {
        if (document.hidden) pause(v);
        else if (v._fb.visible) play(v);
      });
    }
    document.addEventListener('visibilitychange', onVisibility);

    return function () {
      loadIO.disconnect();
      playIO.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      videos.forEach(pause);
    };
  }

  /* ------------------------------------------------------------------
     2. Revelações
     ------------------------------------------------------------------ */
  function revealMedia(gsap, section) {
    FB.qsa('.kitchen__clip', section).forEach(function (fig, i) {
      // Cortina de baixo para cima + leve subida
      gsap.fromTo(fig,
        { clipPath: 'inset(100% 0% 0% 0% round 28px)', y: 60 },
        {
          clipPath: 'inset(0% 0% 0% 0% round 28px)',
          y: 0,
          duration: 1.3,
          delay: i * 0.08,
          ease: 'expo.out',
          clearProps: 'clipPath,transform',
          scrollTrigger: { trigger: fig, start: 'top 85%', once: true }
        }
      );
      // Legenda entra depois da imagem
      var cap = fig.querySelector('figcaption');
      if (cap) {
        gsap.from(cap, {
          autoAlpha: 0, x: -16, duration: .6, delay: .55 + i * 0.08, ease: 'power3.out',
          scrollTrigger: { trigger: fig, start: 'top 85%', once: true }
        });
      }
    });
  }

  function revealCopy(gsap, section) {
    var copy = FB.qs('.kitchen__copy', section);
    if (!copy) return;
    var sound = FB.qs('.kitchen__sound', copy);
    var paragraphs = FB.qsa('p', copy);

    gsap.set(copy, { opacity: 1 }); // [data-reveal] começa com opacity 0 no CSS
    var tl = gsap.timeline({
      scrollTrigger: { trigger: copy, start: 'top 80%', once: true }
    });
    if (sound) {
      tl.from(sound, { y: 50, scale: .85, autoAlpha: 0, transformOrigin: '0% 100%', duration: 1, ease: 'expo.out' });
    }
    tl.from(paragraphs, { y: 36, autoAlpha: 0, duration: .9, stagger: .12, ease: 'power3.out' }, sound ? '-=.7' : 0);
  }

  function revealTestimonials(gsap, section) {
    var list = FB.qs('.testimonials__list', section);
    var cards = FB.qsa('.testimonial', section);
    var title = FB.qs('.testimonials__title', section);
    if (!list || !cards.length) return;

    if (title) {
      gsap.from(title, {
        y: 30, autoAlpha: 0, duration: .8, ease: 'power3.out',
        scrollTrigger: { trigger: title, start: 'top 85%', once: true }
      });
    }

    // Cada card "é postado" na tela: cai girado e assenta.
    gsap.fromTo(cards,
      {
        opacity: 0,
        y: 90,
        scale: .92,
        rotation: function (i) { return i % 2 ? 7 : -7; }
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        rotation: 0,
        duration: 1,
        ease: 'back.out(1.5)',
        stagger: .2,
        clearProps: 'transform',
        scrollTrigger: { trigger: list, start: 'top 82%', once: true }
      }
    );
  }

  /* ------------------------------------------------------------------
     3. "Tsssss." chiando
     ------------------------------------------------------------------ */
  function sizzle(gsap, ST, sound) {
    if (!sound) return null;
    var text = sound.textContent.trim();

    // Leitor de tela lê a palavra inteira; as letras animadas ficam ocultas.
    var sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = text;
    var wrap = document.createElement('span');
    wrap.setAttribute('aria-hidden', 'true');
    var chars = text.split('').map(function (c, i) {
      var s = document.createElement('span');
      s.className = 'kitchen__sound-char';
      s.style.setProperty('--i', i);
      s.textContent = c;
      wrap.appendChild(s);
      return s;
    });
    sound.textContent = '';
    sound.appendChild(sr);
    sound.appendChild(wrap);
    sound.classList.add('is-split');

    // Só os "s" chiam (o "T" e o "." ficam firmes) — apenas transform.
    var hiss = chars.filter(function (c) { return /s/i.test(c.textContent) && c !== chars[0]; });
    var jitter = gsap.to(hiss, {
      x: 'random(-1.2, 1.2)',
      y: 'random(-1.8, 1.8)',
      rotation: 'random(-4, 4)',
      duration: .07,
      ease: 'none',
      repeat: -1,
      repeatRefresh: true,
      paused: true
    });

    var trigger = ST.create({
      trigger: sound,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: function (self) {
        if (self.isActive) jitter.play();
        else jitter.pause();
      }
    });

    return function () { trigger.kill(); jitter.kill(); };
  }
})();
