// =============================================================================
// Fascina Burguer — 3D / callouts.js
// "A Ciência do Sabor": rótulos presos a pontos do 3D. Cada um entra numa
// janela do progresso da seção presa: ponto aparece, fio fino se desenha até
// a etiqueta e o texto sobe de dentro de uma máscara. Ao sair, o inverso.
// Estilos em css/stage.css (.callout*).
// =============================================================================

const ITEMS = [
  { anchor: 'patty',   value: 'Blend',   label: 'Carne fresca · crosta na chapa', at: 0.2,  dx: 120, dy: 26 },
  { anchor: 'cheese',  value: 'Cheddar', label: 'Duplo, derretendo',             at: 0.3,  dx: 130, dy: -22 },
  { anchor: 'bun-top', value: 'Brioche', label: 'Selado na manteiga',            at: 0.44, dx: 110, dy: -34 },
  { anchor: 'bacon',   value: 'Bacon',   label: 'Defumado e crocante',           at: 0.52, dx: 120, dy: 10 },
  { anchor: 'sauce',   value: 'Molho',   label: 'Receita secreta da casa',       at: 0.66, dx: 130, dy: 18 },
]
const OUT_AFTER = 0.88

export function createCallouts(stage, { gsap, reduced = false, mobile = false } = {}) {
  const NS = 'http://www.w3.org/2000/svg'
  const k = mobile ? 0.42 : 1
  const out = { x: 0, y: 0, visible: true }

  const items = ITEMS.map((it) => {
    const dx = it.dx * k
    const dy = it.dy * (mobile ? 0.7 : 1)
    const root = document.createElement('div')
    root.className = `callout ${dx < 0 ? 'callout--l' : 'callout--r'}`
    root.setAttribute('aria-hidden', 'true') // o conteúdo já está no texto da seção
    root.hidden = true

    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'callout__wire')
    const ln = document.createElementNS(NS, 'line')
    ln.setAttribute('x1', String(dx)); ln.setAttribute('y1', String(dy))
    ln.setAttribute('x2', '0'); ln.setAttribute('y2', '0')
    ln.setAttribute('pathLength', '1')
    ln.style.strokeDasharray = '1'
    ln.style.strokeDashoffset = '1'
    svg.appendChild(ln)

    const dot = document.createElement('i')
    dot.className = 'callout__dot'

    const text = document.createElement('div')
    text.className = 'callout__text'
    text.style.left = dx < 0 ? 'auto' : `${dx}px`
    text.style.right = dx < 0 ? `${-dx}px` : 'auto'
    text.style.top = `${dy}px`
    const mk = (cls, str) => {
      const m = document.createElement('span'); m.className = 'callout__mask'
      const inn = document.createElement('span'); inn.className = `callout__in ${cls}`; inn.textContent = str
      m.appendChild(inn); text.appendChild(m); return inn
    }
    const v = mk('callout__value', it.value)
    const l = mobile ? null : mk('callout__label', it.label)
    const lines = l ? [v, l] : [v]

    root.append(svg, dot, text)
    document.body.appendChild(root)
    gsap.set(dot, { scale: 0 })
    gsap.set(lines, { yPercent: 110 })
    return { ...it, root, ln, dot, lines, on: false, tl: null, shown: false, inView: true }
  })

  function show(c) {
    c.on = true
    c.tl && c.tl.kill()
    c.root.hidden = false
    c.shown = true
    gsap.set(c.root, { opacity: 1 })
    if (reduced) {
      c.tl = gsap.timeline().set(c.ln, { strokeDashoffset: 0 }).set(c.dot, { scale: 1 }).set(c.lines, { yPercent: 0 })
      return
    }
    c.tl = gsap.timeline()
      .to(c.dot, { scale: 1, duration: 0.35, ease: 'back.out(2)' }, 0)
      .to(c.ln, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, 0.05)
      .to(c.lines, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: 0.08 }, 0.35)
  }
  function hide(c) {
    c.on = false
    c.tl && c.tl.kill()
    const done = () => { c.root.hidden = true; c.shown = false }
    if (reduced) { c.tl = gsap.timeline({ onComplete: done }).to(c.root, { opacity: 0, duration: 0.2 }); return }
    c.tl = gsap.timeline({ onComplete: done })
      .to(c.lines, { yPercent: -110, duration: 0.4, ease: 'power3.in', stagger: 0.04 }, 0)
      .to(c.ln, { strokeDashoffset: 1, duration: 0.35, ease: 'power3.in' }, 0.05)
      .to(c.dot, { scale: 0, duration: 0.25, ease: 'power3.in' }, 0.2)
      .set(c.lines, { yPercent: 110 })
  }

  return {
    update(progress) {
      for (const c of items) {
        const want = progress >= c.at && progress <= OUT_AFTER
        if (want && !c.on) show(c)
        else if (!want && c.on) hide(c)
        if (!c.shown) continue
        stage.anchor(c.anchor, out)
        const vis = out.visible !== false && Number.isFinite(out.x) && Number.isFinite(out.y)
        c.root.style.transform = `translate3d(${out.x.toFixed(1)}px, ${out.y.toFixed(1)}px, 0)`
        if (vis !== c.inView) { c.inView = vis; c.root.style.visibility = vis ? '' : 'hidden' }
      }
    },
    destroy() { items.forEach((c) => { c.tl && c.tl.kill(); c.root.remove() }) },
  }
}
