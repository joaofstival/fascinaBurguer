/* ==========================================================================
   Fascina Burguer — core.js
   Namespace global, configuração e contrato dos módulos.

   Cada arquivo de seção registra um módulo assim:

     FB.register('hero', function init(ctx) {
       // ctx = { gsap, ScrollTrigger, reducedMotion, isTouch, isMobile, config }
       // ... cria animações ...
       return function destroy() { ... }   // opcional
     });

   js/main.js chama os módulos NA ORDEM DA PÁGINA (hero → science → menu →
   kitchen → footer), o que é importante para que os pins do ScrollTrigger
   calculem as posições corretamente.
   ========================================================================== */
(function () {
  'use strict';

  var FB = (window.FB = window.FB || {});

  /* -------- Configuração editável -------- */
  FB.config = {
    // Link de pedido (WhatsApp, iFood, cardápio digital...). Todos os
    // elementos com [data-order] recebem este href.
    orderUrl: 'https://wa.me/5519991632341?text=Ol%C3%A1!%20Quero%20fazer%20um%20pedido%20na%20Fascina%20Burguer%20%F0%9F%8D%94',
    // Perfil do Instagram (elementos com [data-instagram])
    instagramUrl: 'https://www.instagram.com/_joaofst',
    // Ordem de inicialização dos módulos
    order: ['hero', 'science', 'menu', 'kitchen', 'footer']
  };

  FB.modules = {};

  FB.register = function (name, init) {
    FB.modules[name] = init;
  };

  /* -------- Helpers compartilhados -------- */
  FB.qs = function (sel, root) { return (root || document).querySelector(sel); };
  FB.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  FB.clamp = function (v, min, max) { return Math.min(max, Math.max(min, v)); };
  FB.lerp = function (a, b, t) { return a + (b - a) * t; };
})();
