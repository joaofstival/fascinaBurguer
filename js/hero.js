/* ==========================================================================
   Fascina Burguer — hero.js
   Seção A: texto do hero (abertura e saída com a rolagem).

   O hambúrguer 3D NÃO mora aqui: ele vive no palco fixo #stage (js/3d/),
   que acompanha a página inteira. Este módulo cuida de:
     - reveal das linhas do título (máscara), subtítulo e botões;
     - saída suave do texto conforme a rolagem começa (scrub);
     - modo sem 3D (sem WebGL / CDN fora): foto do lanche com entrada suave.
   ========================================================================== */
(function () {
  'use strict';

  var FB = window.FB;
  if (!FB || !FB.register) return;

  FB.register('hero', function init(ctx) {
    var gsap = ctx.gsap;
    var hero = FB.qs('.hero');
    if (!hero) return;

    // Movimento reduzido: tudo estático e visível
    if (ctx.reducedMotion || !gsap) {
      hero.classList.add('is-ready');
      return;
    }

    var has3d = document.documentElement.classList.contains('has-3d');
    var content = FB.qs('.hero__content', hero);
    var lines = FB.qsa('.hero__line', hero);
    var eyebrow = FB.qs('.eyebrow', hero);
    var sub = FB.qs('.hero__sub', hero);
    var actions = FB.qs('.hero__actions', hero);
    var hint = FB.qs('.hero__scroll-hint', hero);
    var fallback = FB.qs('.hero__fallback', hero);

    /* ---------- 1. Abertura ---------- */
    // Envolve o texto de cada linha para o efeito de máscara
    lines.forEach(function (line) {
      var wrap = document.createElement('span');
      wrap.className = 'hero__line-inner';
      while (line.firstChild) wrap.appendChild(line.firstChild);
      line.appendChild(wrap);
    });
    var lineInners = FB.qsa('.hero__line-inner', hero);

    hero.classList.add('is-ready');
    var intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
    intro
      .from(eyebrow, { opacity: 0, y: 16, duration: 0.9 }, 0.15)
      .from(lineInners, { yPercent: 110, rotation: 2, duration: 1.2, stagger: 0.12 }, 0.2)
      .from([sub, actions], { opacity: 0, y: 26, duration: 1, stagger: 0.12, clearProps: 'transform' }, 0.6)
      .from(hint, { opacity: 0, duration: 0.8, ease: 'power1.out' }, 1.2);

    // Sem 3D: a foto entra girando de leve (o CSS a mantinha oculta)
    if (!has3d && fallback) {
      intro.fromTo(fallback,
        { opacity: 0, scale: 0.92, rotation: -6 },
        { opacity: 1, scale: 1, rotation: -2.5, duration: 1.2, ease: 'back.out(1.6)' }, 0.4);
    }

    /* ---------- 2. Saída com a rolagem (sem pin) ----------
       O texto sobe e esmaece enquanto o hero sai; o lanche 3D segue o
       trilho de poses (js/3d/track.js) independentemente. */
    var out = gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom 35%',
        scrub: 0.6,
        invalidateOnRefresh: true
      }
    });
    out
      .to(hint, { opacity: 0, y: 14, duration: 0.15, ease: 'power1.out' }, 0)
      .to(content, { y: function () { return -window.innerHeight * 0.12; }, opacity: 0, duration: 1, ease: 'power1.in' }, 0);

    FB.hero = { intro: intro, out: out };

    return function destroy() {
      intro.kill();
      out.scrollTrigger && out.scrollTrigger.kill();
      out.kill();
    };
  });
})();
