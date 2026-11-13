// =============================================================================
// Fascina Burguer — 3D / intro.js
// Abertura: os ingredientes caem um a um, de baixo para cima, e assentam com
// um leve achatamento (squash) — como se alguém montasse o lanche na hora.
// Só mexe em layer.drop / layer.squash / layer.visible; stage.frame() aplica.
// =============================================================================

const SINK = 0.06   // u de afundada ao pousar
const FALL = 0.5    // s de queda

export function prepareIntro(stage, { mobile = false } = {}) {
  const h = mobile ? 3 : 6 // celular: queda curta, sem passar por trás do texto
  for (const l of stage.layers) { l.drop = h; l.visible = false }
}

export function intro(stage, { gsap, delay = 0, stagger = 0.14, onLand } = {}) {
  const layers = stage.layers
  const h = layers[0]?.drop || 6
  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve, delay })
    layers.forEach((l, i) => {
      const t = i * stagger
      tl.call(() => { l.visible = true }, null, t)
      tl.fromTo(l, { drop: h }, { drop: -SINK, duration: FALL, ease: 'power2.in', immediateRender: false }, t)
      // pouso: achata, e a camada de baixo sente o impacto
      tl.to(l, { squash: 1, duration: 0.08, ease: 'power1.out' }, t + FALL)
      tl.to(l, { drop: 0, squash: 0, duration: 0.45, ease: 'elastic.out(1, 0.5)' }, t + FALL + 0.08)
      if (i > 0) {
        const below = layers[i - 1]
        tl.to(below, { squash: 0.5, duration: 0.08, ease: 'power1.out' }, t + FALL)
          .to(below, { squash: 0, duration: 0.35, ease: 'back.out(3)' }, t + FALL + 0.08)
      }
      if (onLand) tl.call(() => onLand(i + 1, layers.length), null, t + FALL)
    })
  })
}

export function skipIntro(stage) {
  for (const l of stage.layers) { l.drop = 0; l.squash = 0; l.visible = true }
}
