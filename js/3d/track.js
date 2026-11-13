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
// Retrato: texto em cima, lanche na metade de baixo.
const HERO_M = {
  ...BASE, camX: 5.2, camY: 7.2, camZ: 14, tgtX: 0, tgtY: 1.45, tgtZ: 0, fov: 40,
  rotY: -0.35, sway: 0.25, explode: 0, glow: 0.7, steam: 1, shiftX: 0, shiftY: -0.2, scale: 1,
}
const INSIDE_M = {
  camX: -3, camY: 10, camZ: 20.5, tgtX: 0, tgtY: 4.3, tgtZ: 0, fov: 40,
  rotY: 0.2, sway: 0, explode: 1, glow: 0.45, steam: 0, shiftX: -0.13, shiftY: -0.2,
}
const MOBILE = [
  { at: { sel: '#topo', p: 0 }, pose: HERO_M },
  { at: { sel: '#sabor', p: 0, off: -0.4 }, pose: { sway: 0, steam: 0.2, rotY: -0.1 } },
  { at: { sel: '#sabor', p: 0.12 }, pose: INSIDE_M },
  { at: { sel: '#sabor', p: 0.88 }, pose: { ...dolly(INSIDE_M, 0.95), rotY: 0.2 + 0.22, explode: 1.06 } },
  { at: { sel: '#sabor', p: 1 }, pose: {
    ...HERO_M, rotY: 0.55, sway: 0.15, explode: 0, scale: 0.8, shiftY: -0.1, glow: 0.5,
  }, follow: true },
]

const FIELDS = Object.keys(BASE)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

export function createTrack(stage, { mobile = false, reduced = false } = {}) {
  // Resolve a tabela em poses cheias (herança campo a campo)
  const table = mobile ? MOBILE : DESKTOP
  const rows = []
  let prev = { ...BASE }
  for (const r of table) {
    const full = { ...prev, ...r.pose }
    rows.push({ at: r.at, pose: full, follow: !!r.follow, px: 0 })
    prev = full
  }

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
