/* ==========================================================================
   Fascina Burguer — science.js
   Seção B: "A Ciência do Sabor"

   1. Canvas de brasas (pontinhos incandescentes) + fumaça (manchas suaves).
      - Sprites de brilho pré-renderizados em canvas offscreen (sem shadowBlur).
      - Brasas com composição 'lighter' (somam luz).
      - Loop rAF só roda com a seção visível E a aba ativa.
      - A velocidade do scroll "atiça o fogo": as partículas sobem mais rápido
        e nascem em maior quantidade por alguns instantes. Parallax por profundidade.
   2. Título dividido em palavras com revelação em cascata (acessível).
   3. Cards entram com efeito elástico/fluido; o número "enche" de cheddar.
   4. Com html.has-3d a seção vira palco fixo (sticky, CSS) e os itens entram
      em "batidas" pelo progresso do pin (0.18 / 0.42 / 0.64), enquanto o
      hambúrguer 3D explode do outro lado. Desktop: lista cumulativa à
      esquerda. Mobile/tablet: só o item atual + indicador "01 / 03".
   ========================================================================== */
(function () {
  'use strict';

  var FB = window.FB;
  if (!FB || !FB.register) return;

  FB.register('science', function init(ctx) {
    var gsap = ctx.gsap;
    var ST = ctx.ScrollTrigger;

    var section = FB.qs('#sabor');
    if (!section) return;

    var canvas = FB.qs('[data-embers]', section);
    var title = FB.qs('.section-title', section);
    var items = FB.qsa('.science__item', section);

    var cleanups = [];
    // Palco 3D fixo ativo (classe posta no <head> antes do CSS/JS)
    var pinned = document.documentElement.classList.contains('has-pin');

    /* =====================================================================
       A) TÍTULO — divide em palavras preservando o <em>
       ===================================================================== */
    function splitTitle(h) {
      if (!h || h.dataset.split) return [];
      h.dataset.split = '1';

      // Leitores de tela leem o rótulo íntegro; os spans ficam ocultos para eles.
      h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());

      var holder = document.createElement('span');
      holder.className = 'science__words';
      holder.setAttribute('aria-hidden', 'true');

      var inners = [];

      // Cria a "máscara" (overflow hidden) + conteúdo que desliza
      function makeWord(content) {
        var outer = document.createElement('span');
        outer.className = 'science__word';
        var inner = document.createElement('span');
        inner.className = 'science__word-inner';
        inner.appendChild(content);
        outer.appendChild(inner);
        inners.push(inner);
        return outer;
      }

      // Percorre os nós filhos; texto vira palavras, elementos (<em>) são
      // divididos em palavras mas cada palavra continua dentro de um <em>
      // (mantém o gradiente de fogo e a semântica de ênfase).
      Array.prototype.slice.call(h.childNodes).forEach(function (node) {
        var isEl = node.nodeType === 1;
        var text = node.textContent;
        var parts = text.split(/(\s+)/);
        parts.forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            holder.appendChild(document.createTextNode(' '));
            return;
          }
          var content;
          if (isEl) {
            content = node.cloneNode(false); // mesmo tag/classes, sem filhos
            content.textContent = part;
          } else {
            content = document.createTextNode(part);
          }
          holder.appendChild(makeWord(content));
        });
      });

      h.textContent = '';
      h.appendChild(holder);
      return inners;
    }

    /* =====================================================================
       B) MOVIMENTO REDUZIDO — tudo visível, sem animação
       ===================================================================== */
    if (ctx.reducedMotion) {
      items.forEach(function (el) { el.style.opacity = '1'; });
      // Um único quadro estático de brasas, só como textura
      if (canvas) {
        var still = createEmbers(canvas, { isMobile: ctx.isMobile, staticFrame: true });
        cleanups.push(still.destroy);
      }
      return function destroy() { cleanups.forEach(function (fn) { fn(); }); };
    }

    /* =====================================================================
       C) REVELAÇÃO DO TÍTULO
       ===================================================================== */
    var words = splitTitle(title);
    if (words.length) {
      gsap.set(words, { yPercent: 115, rotate: 6, transformOrigin: '0% 100%' });
      var tTitle = gsap.to(words, {
        yPercent: 0,
        rotate: 0,
        duration: 1.1,
        ease: 'back.out(1.7)',
        stagger: 0.07,
        scrollTrigger: { trigger: title, start: 'top 85%', once: true }
      });
      cleanups.push(function () { tTitle.scrollTrigger && tTitle.scrollTrigger.kill(); tTitle.kill(); });
    }

    /* =====================================================================
       D) ITENS
          - Sem 3D: cards entram com efeito elástico (revelação única).
          - Com 3D (html.has-3d): palco fixo + "batidas" por progresso do pin.
       ===================================================================== */
    var nums = items.map(function (el) { return FB.qs('.science__num', el); }).filter(Boolean);

    if (pinned) {
      cleanups.push(initBeats());
    } else {
      cleanups.push(initCards());
    }

    function initCards() {

      gsap.set(items, {
        opacity: 0,
        y: 80,
        scaleY: 0.85,
        skewY: 4,
        transformOrigin: '50% 100%'
      });
      gsap.set(nums, { '--fill': 0 });

      var batch = ST.batch(items, {
        start: 'top 88%',
        once: true,
        onEnter: function (batchEls) {
          // Forma: elástica, como um queijo que assenta e balança
          gsap.to(batchEls, {
            y: 0,
            scaleY: 1,
            skewY: 0,
            duration: 1.6,
            ease: 'elastic.out(1, 0.6)',
            stagger: 0.14,
            overwrite: 'auto'
          });
          // Opacidade: suave (elastic em opacidade "pisca")
          gsap.to(batchEls, {
            opacity: 1,
            duration: 0.6,
            ease: 'power2.out',
            stagger: 0.14
          });
          // Número: o cheddar sobe dentro do contorno
          batchEls.forEach(function (el, i) {
            var n = FB.qs('.science__num', el);
            if (!n) return;
            gsap.to(n, {
              '--fill': 0.55,
              duration: 1.4,
              delay: 0.25 + i * 0.14,
              ease: 'power3.out',
              // devolve o controle ao CSS (hover enche até 1 com transition)
              onComplete: function () { n.style.removeProperty('--fill'); }
            });
          });
        }
      });
      return function () { batch.forEach(function (t) { t.kill(); }); };
    }

    /* ---------------------------------------------------------------------
       Batidas (modo fixo). O progresso do pin é exatamente o mesmo da
       trilha 3D: p = (scrollY - topo) / (altura - innerHeight), 0..1.
       Cada limiar dispara uma animação por TEMPO (não "scrub"); ao voltar
       para antes do limiar, ela reverte.
       --------------------------------------------------------------------- */
    function initBeats() {
      var THRESHOLDS = [0.18, 0.42, 0.64];
      var bodies = items.map(function (el) { return FB.qs('.science__item-body', el); });
      var counter = FB.qs('.science__count', section);
      var counterCur = FB.qs('[data-science-count]', section);
      var eyebrow = FB.qs('.eyebrow', section);
      var handler = null; // trocado pelo gsap.matchMedia (desktop x mobile)
      var local = [];

      section.classList.add('is-beats');
      // Os <article> deixam de ser o alvo da revelação: quem anima é o corpo
      gsap.set(items, { opacity: 1 });

      // Sobretítulo acompanha o título
      if (eyebrow) {
        var tEye = gsap.from(eyebrow, {
          opacity: 0,
          x: -24,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: title || section, start: 'top 85%', once: true }
        });
        local.push(function () { tEye.scrollTrigger && tEye.scrollTrigger.kill(); tEye.kill(); });
      }

      function levelFor(p) {
        var n = -1;
        for (var i = 0; i < THRESHOLDS.length; i++) if (p >= THRESHOLDS[i]) n = i;
        return n;
      }

      var pin = ST.create({
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: function (self) { if (handler) handler(levelFor(self.progress)); },
        onRefresh: function (self) { if (handler) handler(levelFor(self.progress)); }
      });
      local.push(function () { pin.kill(); });

      // Desfaz o que as batidas aplicaram (troca de breakpoint / destroy)
      function resetBeats() {
        handler = null;
        gsap.killTweensOf(bodies.concat(items, nums));
        gsap.set(bodies, { clearProps: 'transform,opacity' });
        gsap.set(items, { opacity: 1 });
        nums.forEach(function (n) { n.style.removeProperty('--fill'); });
        items.forEach(function (el) { el.classList.remove('is-active'); });
        if (counter) counter.classList.remove('is-on');
      }

      var mm = gsap.matchMedia();

      /* ---------- Desktop: lista cumulativa na coluna esquerda ---------- */
      mm.add('(min-width: 960px)', function () {
        var shown = items.map(function () { return false; });
        var level = -2;
        gsap.set(bodies, { yPercent: 110, opacity: 0 });
        gsap.set(nums, { '--fill': 0 });

        handler = function (n) {
          if (n === level) return;
          level = n;
          items.forEach(function (el, i) {
            var on = i <= n;
            var active = i === n;
            if (on && !shown[i]) {
              shown[i] = true;
              // sobe "de dentro" da máscara (o <article> recorta)
              gsap.to(bodies[i], { yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out', overwrite: true });
            } else if (!on && shown[i]) {
              shown[i] = false;
              gsap.to(bodies[i], { yPercent: 110, opacity: 0, duration: 0.4, ease: 'power3.in', overwrite: true });
            }
            el.classList.toggle('is-active', active);
            // o mais recente em destaque; os anteriores esmaecem
            gsap.to(el, { opacity: on && !active ? 0.45 : 1, duration: 0.6, ease: 'power2.out', overwrite: true });
            if (nums[i]) {
              gsap.to(nums[i], {
                '--fill': active ? 1 : (on ? 0.35 : 0),
                duration: active ? 1.2 : 0.6,
                ease: 'power3.out',
                overwrite: true
              });
            }
          });
        };
        handler(levelFor(pin.progress));
        return resetBeats;
      });

      /* ---------- Tablet/mobile: só o item ATUAL, no mesmo lugar ---------- */
      mm.add('(max-width: 959px)', function () {
        var cur = -1;
        gsap.set(bodies, { yPercent: 110, opacity: 0 });
        gsap.set(nums, { '--fill': 0 });

        handler = function (n) {
          if (n === cur) return;
          var prev = cur;
          var fwd = n > prev;
          cur = n;
          if (prev >= 0) {
            items[prev].classList.remove('is-active');
            // sai para cima ao avançar, para baixo ao voltar
            gsap.to(bodies[prev], { yPercent: fwd ? -110 : 110, opacity: 0, duration: 0.4, ease: 'power3.in', overwrite: true });
          }
          if (n >= 0) {
            items[n].classList.add('is-active');
            gsap.fromTo(bodies[n],
              { yPercent: fwd ? 110 : -110, opacity: 0 },
              { yPercent: 0, opacity: 1, duration: 1, ease: 'expo.out', delay: prev >= 0 ? 0.2 : 0, overwrite: true });
            if (nums[n]) {
              gsap.fromTo(nums[n], { '--fill': 0 }, { '--fill': 1, duration: 1.2, delay: 0.25, ease: 'power3.out', overwrite: true });
            }
            if (counterCur) counterCur.textContent = '0' + (n + 1);
          }
          if (counter) counter.classList.toggle('is-on', n >= 0);
        };
        handler(levelFor(pin.progress));
        return resetBeats;
      });

      return function () {
        mm.revert();
        resetBeats();
        section.classList.remove('is-beats');
        local.forEach(function (fn) { fn(); });
      };
    }

    /* =====================================================================
       E) CANVAS DE BRASAS + ACOPLAMENTO COM O SCROLL
       ===================================================================== */
    if (canvas) {
      var fx = createEmbers(canvas, { isMobile: ctx.isMobile, observe: section });
      cleanups.push(fx.destroy);

      var st = ST.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: function (self) {
          fx.setScroll(self.progress, self.getVelocity());
        }
      });
      cleanups.push(function () { st.kill(); });
    }

    return function destroy() { cleanups.forEach(function (fn) { fn(); }); };
  });

  /* =======================================================================
     Sistema de partículas (independente do GSAP)
     ======================================================================= */
  function createEmbers(canvas, opts) {
    var g = canvas.getContext('2d');
    if (!g) return { destroy: function () {}, setScroll: function () {} };

    // Dimensiona pelo pai (no modo fixo é o .science__sticky = 1 tela);
    // a visibilidade é observada na seção inteira.
    var section = canvas.parentElement;
    var watchEl = opts.observe || section;
    var isMobile = !!opts.isMobile;
    var DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);

    var W = 0, H = 0;
    var embers = [], smokes = [];
    var maxEmbers = 0, maxSmoke = 0;
    var spawnAcc = 0, smokeAcc = 0;

    // Estado do scroll
    var boost = 0;         // 0..1.5 — "atiçar" do fogo pela velocidade do scroll
    var targetBoost = 0;
    var parallax = 0;      // deslocamento em px aplicado por profundidade

    var running = false, inView = false, rafId = 0, last = 0;

    /* ---------- Sprites pré-renderizados ---------- */
    function makeGlow(size, stops) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var cx = c.getContext('2d');
      var r = size / 2;
      var grad = cx.createRadialGradient(r, r, 0, r, r, r);
      stops.forEach(function (s) { grad.addColorStop(s[0], s[1]); });
      cx.fillStyle = grad;
      cx.fillRect(0, 0, size, size);
      return c;
    }
    // Brasa amarela (cheddar) e brasa laranja/vermelha
    var spriteCheddar = makeGlow(64, [
      [0, 'rgba(255,250,225,1)'],
      [0.12, 'rgba(255,214,120,.95)'],
      [0.35, 'rgba(255,182,39,.45)'],
      [1, 'rgba(255,140,0,0)']
    ]);
    var spriteBrasa = makeGlow(64, [
      [0, 'rgba(255,235,200,1)'],
      [0.12, 'rgba(255,140,70,.95)'],
      [0.35, 'rgba(255,90,31,.42)'],
      [1, 'rgba(230,58,31,0)']
    ]);
    // Fumaça: mancha cinza-quente bem difusa
    var spriteSmoke = makeGlow(128, [
      [0, 'rgba(150,128,112,.9)'],
      [0.45, 'rgba(110,92,80,.45)'],
      [1, 'rgba(90,75,65,0)']
    ]);

    function rand(a, b) { return a + Math.random() * (b - a); }

    /* ---------- Fábrica de partículas ---------- */
    function spawnEmber(anywhere) {
      var z = rand(0.35, 1); // profundidade: perto = maior, mais rápido, mais parallax
      return {
        x: rand(-20, W + 20),
        // metade nasce na "cama de brasas" (base), metade já flutuando no ar
        y: anywhere ? rand(0, H) : (Math.random() < 0.5 ? H + rand(10, 80) : rand(H * 0.3, H)),
        vy: rand(28, 70) * z,             // px/s para cima
        vx: rand(-8, 8),
        amp: rand(6, 26),                 // amplitude da oscilação lateral
        freq: rand(0.6, 1.8),
        phase: rand(0, Math.PI * 2),
        size: rand(7, 20) * z,
        z: z,
        life: 0,
        maxLife: rand(4, 9),
        flick: rand(6, 16),               // velocidade do "piscar"
        sprite: Math.random() < 0.55 ? spriteBrasa : spriteCheddar
      };
    }
    function spawnSmoke(anywhere) {
      var z = rand(0.4, 1);
      return {
        x: rand(-0.1, 1.1) * W,
        y: anywhere ? rand(H * 0.2, H) : rand(H * 0.25, H + 120),
        vy: rand(10, 22),
        vx: rand(-6, 6),
        size: rand(140, 260) * (isMobile ? 0.7 : 1),
        grow: rand(10, 24),               // expande enquanto sobe
        z: z,
        life: 0,
        maxLife: rand(10, 18),
        alpha: rand(0.035, 0.07),
        phase: rand(0, Math.PI * 2)
      };
    }

    /* ---------- Dimensionamento (contagem proporcional à área) ---------- */
    function resize() {
      var rect = section.getBoundingClientRect();
      var w = Math.round(rect.width), h = Math.round(rect.height);
      if (!w || !h || (w === W && h === H)) return;
      W = w; H = h;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      g.setTransform(DPR, 0, 0, DPR, 0, 0);

      var area = W * H;
      maxEmbers = Math.round(FB.clamp(area / (isMobile ? 16000 : 9000), 24, isMobile ? 60 : 140));
      maxSmoke = Math.round(FB.clamp(area / (isMobile ? 120000 : 70000), 4, isMobile ? 8 : 16));

      // Pré-aquece: espalha partículas já em voo (sem "tela vazia" ao entrar)
      embers.length = 0; smokes.length = 0;
      for (var i = 0; i < maxEmbers * 0.7; i++) {
        var e = spawnEmber(true); e.life = rand(0, e.maxLife * 0.6); embers.push(e);
      }
      for (var j = 0; j < maxSmoke * 0.8; j++) {
        var s = spawnSmoke(true); s.life = rand(0, s.maxLife * 0.5); smokes.push(s);
      }
      draw(0);
    }

    /* ---------- Simulação ---------- */
    function update(dt) {
      // Suaviza o boost em direção ao alvo e deixa o alvo decair (efeito "breve")
      boost += (targetBoost - boost) * Math.min(1, dt * 6);
      targetBoost *= Math.pow(0.08, dt); // decai ~92% por segundo

      var speedMul = 1 + boost * 2.2;

      // Taxa de nascimento: repõe a população + extra quando o scroll atiça
      var emberRate = (maxEmbers / 6) * (1 + boost * 2.5);
      spawnAcc += emberRate * dt;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        if (embers.length < maxEmbers * (1 + boost * 0.6)) embers.push(spawnEmber(false));
      }
      smokeAcc += (maxSmoke / 12) * (1 + boost) * dt;
      while (smokeAcc >= 1) {
        smokeAcc -= 1;
        if (smokes.length < maxSmoke) smokes.push(spawnSmoke(false));
      }

      var i, p;
      for (i = embers.length - 1; i >= 0; i--) {
        p = embers[i];
        p.life += dt;
        p.y -= p.vy * speedMul * dt;
        p.x += p.vx * dt;
        if (p.life >= p.maxLife || p.y < -60) { embers.splice(i, 1); }
      }
      for (i = smokes.length - 1; i >= 0; i--) {
        p = smokes[i];
        p.life += dt;
        p.y -= p.vy * (1 + boost * 0.8) * dt;
        p.x += p.vx * dt;
        p.size += p.grow * dt;
        if (p.life >= p.maxLife || p.y + p.size < -40) { smokes.splice(i, 1); }
      }
    }

    /* ---------- Desenho ---------- */
    function draw(t) {
      g.clearRect(0, 0, W, H);
      var i, p, k, a, s;

      // Fumaça primeiro (composição normal, alpha baixíssimo)
      g.globalCompositeOperation = 'source-over';
      for (i = 0; i < smokes.length; i++) {
        p = smokes[i];
        k = p.life / p.maxLife;
        // entra e sai suavemente (seno de 0..π)
        a = p.alpha * Math.sin(Math.PI * Math.min(1, k));
        if (a <= 0.002) continue;
        s = p.size;
        g.globalAlpha = a;
        g.drawImage(
          spriteSmoke,
          p.x + Math.sin(t * 0.25 + p.phase) * 18 - s / 2,
          p.y + parallax * p.z * 0.5 - s / 2,
          s, s
        );
      }

      // Brasas somando luz
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < embers.length; i++) {
        p = embers[i];
        k = p.life / p.maxLife;
        // fade-in rápido, fade-out longo
        var fade = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
        // cintilação: mistura de dois senos (menos "mecânico")
        var flick = 0.65 + 0.35 * Math.sin(t * p.flick + p.phase) * Math.sin(t * p.flick * 0.37 + 1.3);
        a = fade * flick * (0.55 + 0.45 * p.z);
        if (a <= 0.01) continue;
        s = p.size * (0.7 + 0.3 * fade);
        g.globalAlpha = a;
        g.drawImage(
          p.sprite,
          p.x + Math.sin(t * p.freq + p.phase) * p.amp - s / 2,
          p.y + parallax * p.z - s / 2,
          s, s
        );
      }

      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    /* ---------- Loop ---------- */
    function frame(now) {
      rafId = requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000 || 0); // limita saltos (aba lenta)
      last = now;
      update(dt);
      draw(now / 1000);
    }
    function start() {
      if (running || opts.staticFrame) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }
    function sync() {
      if (inView && !document.hidden) start(); else stop();
    }

    // Redimensionamento
    var ro = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(resize);
      ro.observe(section);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    // Quadro estático (movimento reduzido): desenhado em resize(), sem loop
    var io = null;
    if (!opts.staticFrame) {
      io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        sync();
      }, { rootMargin: '100px 0px' });
      io.observe(watchEl);
      document.addEventListener('visibilitychange', sync);
    }

    return {
      /* progress 0..1 da seção na tela; velocity em px/s (ScrollTrigger) */
      setScroll: function (progress, velocity) {
        // Parallax suave: partículas "ficam para trás" levemente ao rolar
        parallax = (progress - 0.5) * -120;
        // Rolar para baixo atiça mais que rolar para cima
        var v = Math.abs(velocity) / (velocity > 0 ? 1800 : 2600);
        targetBoost = Math.max(targetBoost, FB.clamp(v, 0, 1.5));
      },
      destroy: function () {
        stop();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (io) io.disconnect();
        document.removeEventListener('visibilitychange', sync);
        g.clearRect(0, 0, W, H);
      }
    };
  }
})();
