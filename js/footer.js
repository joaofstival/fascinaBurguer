/* ==========================================================================
   Fascina Burguer — footer.js
   Seção E: o motoboy cruza a tela (esquerda → direita) deixando rastro de
   velocidade + fumaça sempre que o rodapé entra na tela, e o conteúdo
   final (logo, título, texto, CTA) aparece em sequência.
   Movimento reduzido: moto estacionada (CSS), sem rastro nem revelações.
   ========================================================================== */
(function () {
  'use strict';

  var FB = window.FB;
  if (!FB) return;

  var DURATION = 1.5;      // segundos para atravessar (-20vw → 120vw)
  var COOLDOWN = 4000;     // ms mínimos entre duas passagens
  var LINES = 4;           // linhas de velocidade
  var PUFFS = 6;           // nuvens de fumaça

  FB.register('footer', function (ctx) {
    var footer = FB.qs('[data-section="footer"]');
    if (!footer) return;

    var gsap = ctx.gsap;
    var ST = ctx.ScrollTrigger;
    var triggers = [];

    if (ctx.reducedMotion) return; // moto fica estacionada via CSS

    /* ---------- Conteúdo: entrada em cascata ---------- */
    var inner = FB.qs('.finale__inner', footer);
    if (inner) {
      var items = FB.qsa('.finale__logo, .finale__title, .finale__text, .btn', inner);
      gsap.from(items, {
        y: 40,
        autoAlpha: 0,
        duration: .9,
        stagger: .12,
        ease: 'power3.out',
        scrollTrigger: { trigger: inner, start: 'top 82%', once: true }
      });
    }

    /* ---------- Motoboy ---------- */
    var road = FB.qs('[data-moto-road]', footer);
    var moto = road && FB.qs('[data-moto]', road);
    if (!moto) return;
    var bike = moto.querySelector('svg') || moto;

    road.classList.add('is-animated');

    // Cria o rastro: linhas de velocidade + fumaça
    var trail = document.createElement('div');
    trail.className = 'finale__trail';
    var lines = [];
    var puffs = [];
    var i;
    for (i = 0; i < LINES; i++) {
      var line = document.createElement('span');
      line.className = 'finale__speedline';
      line.style.bottom = (22 + i * 11) + 'px'; // alturas do corpo da moto
      trail.appendChild(line);
      lines.push(line);
    }
    for (i = 0; i < PUFFS; i++) {
      var puff = document.createElement('span');
      puff.className = 'finale__puff';
      var pct = 8 + i * (84 / (PUFFS - 1)); // espalhadas pela pista
      puff.style.left = pct + '%';
      puff._pct = pct;
      trail.appendChild(puff);
      puffs.push(puff);
    }
    road.insertBefore(trail, moto);

    var vw = function () { return road.clientWidth || window.innerWidth; };
    gsap.set(moto, { x: function () { return -0.2 * vw(); } });

    var tl = null;
    var lastPlay = 0;

    // Tempo (s) em que a traseira da moto passa pela fração `f` da pista
    function timeAt(f) { return DURATION * (0.2 + f) / 1.4; }

    function build() {
      var w = vw();
      var t = gsap.timeline();

      t.set(moto, { x: -0.2 * w })
        .set(lines, { scaleX: 0, opacity: 1 })
        .set(puffs, { opacity: 0, scale: .3, x: 0, y: 0 })
        // Travessia: linear para casar com o rastro
        .to(moto, { x: 1.2 * w, duration: DURATION, ease: 'none' }, 0)
        // Empinada na arrancada e assentamento elástico
        .fromTo(bike, { rotation: 0 }, { rotation: -14, duration: .2, ease: 'power2.out' }, 0)
        .to(bike, { rotation: 0, duration: .7, ease: 'elastic.out(1, .4)' }, .24)
        // Quiques leves do asfalto
        .fromTo(bike, { y: 0 }, { y: -3, duration: .08, ease: 'sine.inOut', yoyo: true, repeat: 9 }, .35);

      // Linhas esticam da esquerda até a moto e depois se apagam
      lines.forEach(function (line, n) {
        t.to(line, { scaleX: 1, duration: timeAt(1) - timeAt(0), ease: 'none' }, timeAt(0) + n * .03)
          .to(line, { opacity: 0, duration: .55, ease: 'power1.out' }, DURATION * .72 + n * .07);
      });

      // Fumaça: surge quando a traseira passa e sobe se dissipando
      puffs.forEach(function (puff, n) {
        var at = timeAt(puff._pct / 100);
        t.to(puff, { opacity: .9, scale: 1, duration: .12, ease: 'power2.out' }, at)
          .to(puff, {
            opacity: 0,
            scale: 2.4 + (n % 3) * .3,
            x: -18 - (n % 2) * 10,
            y: -22 - (n % 3) * 6,
            duration: .9,
            ease: 'power2.out'
          }, at + .12);
      });

      return t;
    }

    function ride() {
      var now = Date.now();
      if (now - lastPlay < COOLDOWN) return;
      if (tl && tl.isActive()) return;
      lastPlay = now;
      if (tl) tl.kill();
      tl = build(); // reconstrói para usar a largura atual da tela
    }

    triggers.push(ST.create({
      trigger: road,
      start: 'top 90%',
      end: 'bottom top',
      onEnter: ride,
      onEnterBack: ride
    }));

    return function destroy() {
      triggers.forEach(function (t) { t.kill(); });
      if (tl) tl.kill();
      trail.remove();
      road.classList.remove('is-animated');
      gsap.set([moto, bike], { clearProps: 'transform' });
    };
  });
})();
