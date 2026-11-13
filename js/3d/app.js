// =============================================================================
// Fascina Burguer — 3D / app.js
// Monta o palco, liga a rolagem suave (Lenis) ao ScrollTrigger, faz a
// abertura (ingredientes caindo) e roda o LOOP ÚNICO (gsap.ticker) que lê a
// rolagem e dirige tudo: trilho de poses → cena, rótulos, cursor.
// Carregado por boot.js (import dinâmico) — se algo falhar aqui, o boot
// devolve a página ao modo sem 3D (foto no hero).
// =============================================================================
import Lenis from 'lenis'
import { createStage } from './stage.js'
import { createTrack } from './track.js'
import { createCallouts } from './callouts.js'
import { prepareIntro, intro, skipIntro } from './intro.js'

const gsap = window.gsap
const ScrollTrigger = window.ScrollTrigger
if (!gsap || !ScrollTrigger) throw new Error('GSAP/ScrollTrigger indisponível')

const canvas = document.getElementById('stage')
const mq = matchMedia('(max-width: 959px)')
let mobile = mq.matches

/* ── cena ── */
const stage = createStage({ canvas, mobile })
let track = createTrack(stage, { mobile })
let callouts = createCallouts(stage, { gsap, mobile })
track.update(scrollY)

// Só faz a abertura se a página abriu no topo (recarregar no meio pula)
const playIntro = scrollY < innerHeight * 0.5
if (playIntro) prepareIntro(stage, { mobile })

await stage.compile()
stage.frame(0)

/* ── rolagem suave (Lenis) sincronizada com o ScrollTrigger ── */
const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false })
lenis.on('scroll', ScrollTrigger.update)
window.FB && (window.FB.lenis = lenis)

// Âncoras internas passam pelo Lenis (o skip-link continua nativo, por foco)
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#"]')
  if (!a || a.classList.contains('skip-link')) return
  const id = a.getAttribute('href')
  if (id.length < 2) return
  const el = document.querySelector(id)
  if (!el) return
  e.preventDefault()
  lenis.scrollTo(el, { offset: 0, duration: 1.4 })
})

/* ── loop único ── */
let ptr = null
let interactive = false

gsap.ticker.lagSmoothing(0)
gsap.ticker.add((time, deltaTime) => {
  const dt = Math.min(deltaTime / 1000, 0.1)
  lenis.raf(time * 1000)
  const y = scrollY
  track.update(y)
  callouts.update(track.progress('#sabor'))
  stage.setVisible(track.visible)

  if (interactive && ptr && track.visible) {
    stage.setTilt((ptr.x / innerWidth) * 2 - 1, (ptr.y / innerHeight) * 2 - 1)
    stage.hover(stage.pick(ptr.x, ptr.y))
  }
  stage.frame(dt)
})

addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return
  ptr = ptr || { x: 0, y: 0 }
  ptr.x = e.clientX
  ptr.y = e.clientY
}, { passive: true })
document.documentElement.addEventListener('mouseleave', () => {
  ptr = null
  stage.hover(null)
  stage.setTilt(0, 0)
})

/* ── resize / troca celular ↔ desktop ── */
// No celular a barra de endereço dispara 'resize' a cada rolada: o stage
// ignora mudanças só de altura (ver stage.size) e aqui só remedimos o
// trilho quando o palco realmente mudou de tamanho — senão o lanche "pula".
let rq = 0
function onResize(force = false) {
  cancelAnimationFrame(rq)
  rq = requestAnimationFrame(() => {
    if (!stage.size(force) && !force) return
    track.measure()
    lenis.resize()
  })
}
addEventListener('resize', () => onResize())
addEventListener('orientationchange', () => setTimeout(() => onResize(true), 250))
// Celular ↔ desktop muda o layout da página toda (hero parado × seção
// presa com o lanche explodindo): recarrega para montar o modo certo.
mq.addEventListener('change', () => location.reload())
// Pins do GSAP (cardápio) mudam a altura da página → remede o trilho
ScrollTrigger.addEventListener('refresh', () => track.measure())
// (main.js já faz ScrollTrigger.refresh() em fonts.ready e load — o evento acima remede o trilho)
document.fonts && document.fonts.ready.then(() => track.measure())
addEventListener('load', () => track.measure())

/* ── abertura ── */
canvas.classList.add('is-on')
if (playIntro) {
  await intro(stage, { gsap, delay: 0.25 })
} else {
  skipIntro(stage)
}
interactive = true

export { stage, lenis }
