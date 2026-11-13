// =============================================================================
// Fascina Burguer — 3D / track.js
// Trilho da rolagem → stage.pose.
// Lista de poses presas a pontos da rolagem; entre dois pontos cada campo é
// interpolado com cúbica entra-e-sai. `reduced` troca por corte.
//
// Ponto da rolagem: { sel, p, off }
//   seção presa (data-pin): px = topo + p · (altura − 1 tela)  (p = progresso do pino)
//   seção solta:            px = topo + p · altura
//   off (em telas) soma no fim: off: -1 = topo da seção entrando por baixo.
//
// Unidades da cena: 1 u ≈ 4 cm. Lanche montado com ~3 u de altura; com
// explode = 1 ele vai a ~8,5 u (centro em y ≈ 4,3).
// =============================================================================
import { DEFAULT_POSE } from './stage.js'
import { GAP } from './burger.js'

const BASE = { ...DEFAULT_POSE }

// Multiplica o vetor câmera→alvo (aproxima/afasta mantendo o ângulo)
function dolly(p, k) {
  return {
    camX: p.tgtX + (p.camX - p.tgtX) * k,
    camY: p.tgtY + (p.camY - p.tgtY) * k,
    camZ: p.tgtZ + (p.camZ - p.tgtZ) * k,
  }
}

/* ───────────────────────────── DESKTOP ───────────────────────────── */
const HERO_D = {
  ...BASE, camX: 5.1, camY: 5.1, camZ: 9.8, tgtX: 0, tgtY: 1.45, tgtZ: 0, fov: 30,
  rotY: -0.35, sway: 0.28, explode: 0, glow: 0.7, steam: 1, shiftX: 0.21, shiftY: 0.02, scale: 1,
}
const INSIDE_D = {
  camX: -3.2, camY: 7.4, camZ: 19.5, tgtX: 0, tgtY: 4.3, tgtZ: 0, fov: 30,
  rotY: 0.2, sway: 0, explode: 1, glow: 0.45, steam: 0, shiftX: 0.13, shiftY: 0,
}
const DESKTOP = [
  // 01 hero — três quartos, à direita, balançando de leve
  { at: { sel: '#topo', p: 0 }, pose: HERO_D },
  // aproximação: a seção 02 sobe, o lanche para de balançar e esfria o vapor
  { at: { sel: '#sabor', p: 0, off: -0.4 }, pose: { sway: 0, steam: 0.2, rotY: -0.1, shiftX: 0.16 } },
  // 02 a ciência do sabor — camadas soltas na vertical
  { at: { sel: '#sabor', p: 0.12 }, pose: INSIDE_D },
  // fim da leitura: órbita lenta, aproxima 6%, camadas se afastam mais
  { at: { sel: '#sabor', p: 0.88 }, pose: { ...dolly(INSIDE_D, 0.94), rotY: 0.2 + 0.22, explode: 1.08 } },
  // recompõe, encolhe e sobe junto com a página (sai antes do cardápio)
  { at: { sel: '#sabor', p: 1 }, pose: {
    ...HERO_D, rotY: 0.55, sway: 0.15, explode: 0, scale: 0.82, shiftX: 0.18, shiftY: 0.06, glow: 0.5,
  }, follow: true },
]

/* ───────────────────────────── CELULAR ───────────────────────────── */
// Celular: o lanche COMEÇA parado no hero, enquadrado no espaço reservado
// [data-burger-stage] (abaixo dos textos). Ao rolar até a seção 02 ele faz a
// mesma coreografia do desktop (camadas soltas), com o texto no topo.
const HERO_M = {
  ...BASE, camX: 5.2, camY: 6.4, camZ: 14, tgtX: 0, tgtY: 1.5, tgtZ: 0, fov: 35,
  rotY: -0.35, sway: 0, explode: 0, glow: 0.7, steam: 0.7, shiftX: 0, shiftY: 0, scale: 1,
}
const INSIDE_M = {
  camX: -3, camY: 10, camZ: 20.5, tgtX: 0, tgtY: 4.3, tgtZ: 0, fov: 40,
  rotY: 0.2, sway: 0, explode: 1, glow: 0.45, steam: 0, shiftX: -0.13, shiftY: -0.2,
}
function mobileTable(hero, inside = INSIDE_M) {
  return [
    // 01 hero — parado no espaço do hero (pose medida em fitHero)
    { at: { sel: '#topo', p: 0 }, pose: hero },
    // aproximação: a seção 02 sobe e o vapor esfria
    { at: { sel: '#sabor', p: 0, off: -0.4 }, pose: { steam: 0.2, rotY: -0.1 } },
    // 02 a ciência do sabor — camadas soltas na vertical, abaixo do texto
    { at: { sel: '#sabor', p: 0.12 }, pose: inside },
    { at: { sel: '#sabor', p: 0.88 }, pose: { ...dolly(inside, INSIDE_END), rotY: 0.2 + 0.22, explode: 1.06 } },
    // recompõe, encolhe e sobe junto com a página
    { at: { sel: '#sabor', p: 1 }, pose: {
      ...HERO_M, rotY: 0.55, sway: 0.15, explode: 0, scale: 0.8, shiftY: -0.1, glow: 0.5,
    }, follow: true },
  ]
}
const INSIDE_END = 0.95 // aproximação no fim da leitura (dolly)

// Contorno do lanche (cilindro de raio r, do chão até `top`)
function hull(top, r) {
  const pts = []
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2
    for (const y of [0, top]) pts.push([Math.cos(th) * r, y, Math.sin(th) * r])
  }
  return pts
}
// Montado: alface/bacon passam um pouco do pão
const HULL = hull(2.96, 1.85)

// Ajusta a distância da câmera e o deslocamento para o contorno `pts`
// caber em `box` (px na tela, com a página/pino parados). `place(b)` diz
// onde pôr o centro: { x, y } em px.
function fitPose(stage, base, pts, { maxW, maxH, place }) {
  const P = stage.pose
  const pt = { x: 0, y: 0 }
  const v = { x: 0, y: 0, z: 0 }
  const write = (p) => { for (let i = 0; i < FIELDS.length; i++) P[FIELDS[i]] = p[FIELDS[i]] }
  function bbox() {
    stage.applyPose()
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [x, y, z] of pts) {
      v.x = x; v.y = y; v.z = z
      stage.project(v, pt)
      x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x)
      y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y)
    }
    return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
  }
  const pose = { ...BASE, ...base, scrollY: 0 }
  // 1) distância da câmera para caber
  for (let i = 0; i < 3; i++) {
    write(pose)
    const b = bbox()
    if (!(b.w > 0 && b.h > 0)) break
    const k = Math.min(maxW / b.w, maxH / b.h)
    Object.assign(pose, dolly(pose, 1 / k))
  }
  // 2) desloca o enquadramento para o centro pedido
  write(pose)
  const b = bbox()
  const c = place(b)
  pose.shiftX += (c.x - b.cx) / stage.width
  pose.shiftY += (b.cy - c.y) / stage.height
  return pose
}

// Pose do hero no celular: encaixa o lanche no espaço [data-burger-stage]
// com a página no topo. null se o espaço não existe.
function fitHero(stage) {
  const el = document.querySelector('[data-burger-stage]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const top = r.top + scrollY // topo do espaço no documento
  // (folga p/ vapor/sombra)
  return fitPose(stage, HERO_M, HULL, {
    maxW: r.width * 0.86, maxH: r.height * 0.8,
    place: () => ({ x: r.left + r.width / 2, y: top + r.height * 0.54 }),
  })
}

// Pose "por dentro" no celular: as camadas soltas cabem no espaço ABAIXO do
// texto da seção 02 (que fica preso no topo), sem passar por cima dele.
function fitInside(stage) {
  const sticky = document.querySelector('#sabor .science__sticky')
  const inner = document.querySelector('#sabor .science__inner')
  const top0 = stage.burger.byName && stage.burger.byName['bun-top']
  if (!sticky || !inner || !top0) return null
  const textBottom = inner.getBoundingClientRect().bottom - sticky.getBoundingClientRect().top
  const W = stage.width
  const H = Math.min(stage.height, sticky.offsetHeight || innerHeight)
  const gapTop = 22, gapBottom = 10
  const room = H - textBottom - gapTop - gapBottom
  if (room < 80) return null
  // pior caso: fim da leitura (explode 1.06 e câmera 5% mais perto)
  const explode = 1.06
  const pts = hull(top0.y + top0.index * GAP * explode + 1.15, 1.95)
  const end = fitPose(stage, { ...INSIDE_M, explode, rotY: 0.2 + 0.22 }, pts, {
    maxW: W * 0.6, maxH: room,
    place: (b) => ({ x: W * 0.38, y: textBottom + gapTop + room / 2 }),
  })
  // volta para a pose do começo da leitura (mesma moldura, 5% mais longe)
  return { ...INSIDE_M, ...dolly(end, 1 / INSIDE_END), shiftX: end.shiftX, shiftY: end.shiftY }
}

const FIELDS = Object.keys(BASE)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

export function createTrack(stage, { mobile = false, reduced = false } = {}) {
  // Resolve a tabela em poses cheias (herança campo a campo)
  function resolve(table) {
    const out = []
    let prev = { ...BASE }
    for (const r of table) {
      const full = { ...prev, ...r.pose }
      out.push({ at: r.at, pose: full, follow: !!r.follow, px: 0 })
      prev = full
    }
    return out
  }
  let rows = resolve(mobile ? mobileTable(HERO_M) : DESKTOP)

  const geo = new Map()
  let vh = innerHeight
  let followPx = Infinity
  let hidePx = Infinity

  function measureSel(sel) {
    if (geo.has(sel)) return geo.get(sel)
    const el = document.querySelector(sel)
    let g = null
    if (el) {
      // posição sem transforms do pin do GSAP: soma offsetTop até o documento
      let top = 0, n = el
      while (n) { top += n.offsetTop; n = n.offsetParent }
      g = { top, height: el.offsetHeight, pinned: el.hasAttribute('data-pin') }
    }
    geo.set(sel, g)
    return g
  }

  function toPx({ sel, p = 0, off = 0 }) {
    const g = measureSel(sel)
    if (!g) return null
    const span = g.pinned ? Math.max(1, g.height - vh) : g.height
    return g.top + p * span + off * vh
  }

  function measure() {
    geo.clear()
    vh = innerHeight
    if (mobile) {
      // o enquadramento do hero depende do layout → recalcula a tabela
      const hero = fitHero(stage)
      const inside = fitInside(stage) || INSIDE_M
      if (hero) rows = api.rows = resolve(mobileTable(hero, inside))
    }
    let last = 0
    for (const r of rows) {
      const px = toPx(r.at)
      r.px = px == null ? last : Math.max(last, px) // monotônico mesmo se faltar seção
      last = r.px
    }
    const f = rows.find((r) => r.follow)
    followPx = f ? f.px : Infinity
    // quando o cardápio encosta no topo, o lanche já saiu da tela
    const d = toPx({ sel: '#cardapio', p: 0, off: 0.1 })
    hidePx = d == null ? Infinity : d
  }

  const out = { ...BASE }
  function write(pose) {
    const P = stage.pose
    for (let i = 0; i < FIELDS.length; i++) P[FIELDS[i]] = pose[FIELDS[i]]
  }

  function update(y) {
    const n = rows.length
    let pose
    if (y <= rows[0].px) pose = rows[0].pose
    else if (y >= rows[n - 1].px) pose = rows[n - 1].pose
    else {
      let i = 0
      while (i < n - 2 && y >= rows[i + 1].px) i++
      const a = rows[i], b = rows[i + 1]
      const span = b.px - a.px
      if (reduced) {
        pose = (span <= 0 || y - a.px < span / 2) ? a.pose : b.pose
      } else {
        const t = span <= 0 ? 1 : ease(clamp01((y - a.px) / span))
        for (let k = 0; k < FIELDS.length; k++) {
          const f = FIELDS[k]
          out[f] = a.pose[f] + (b.pose[f] - a.pose[f]) * t
        }
        pose = out
      }
    }
    write(pose)
    stage.pose.scrollY = y > followPx ? y - followPx : 0
    api.visible = y < hidePx
  }

  function progress(sel) {
    const g = measureSel(sel)
    if (!g) return 0
    const span = g.pinned ? Math.max(1, g.height - vh) : g.height
    return clamp01((scrollY - g.top) / span)
  }

  const api = { update, measure, progress, visible: true, rows }
  measure()
  return api
}
