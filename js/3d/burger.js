// =============================================================================
// Fascina Burguer — 3D / burger.js
// Modelo procedural do hambúrguer (nenhum arquivo .glb): cada ingrediente é
// uma camada independente que pode ser "explodida" na vertical.
//
// Unidades: 1 u ≈ 4 cm. Pão com Ø ≈ 3,1 u. Origem no centro da base do pão
// de baixo (y = 0 na face de baixo), +Y para cima.
//
// API:
//   const b = buildBurger({ mobile })
//   b.group            → THREE.Group (adicionar à cena)
//   b.layers[]         → { name, group, y, drop, visible, lift, squash }
//   b.update(dt, pose) → aplica explode/drop/lift/squash/vapor
//   b.anchors[name]()  → [x, y, z] local (para rótulos presos ao 3D)
//   b.pick(ray)        → nome da camada sob o raio (ou null)
// =============================================================================
import * as THREE from 'three'

export const GAP = 0.62          // distância extra entre camadas com explode = 1
export const HEIGHT = 2.96       // altura do lanche montado

/* ───────────────────────── utilitários ───────────────────────── */

function rng(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

export function glowTexture(inner, outer) {
  return canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    grd.addColorStop(0, inner)
    grd.addColorStop(1, outer)
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
  })
}

// Perfil de retângulo com cantos arredondados (para LatheGeometry)
function roundedProfile(r, h, b, steps = 6) {
  const pts = [new THREE.Vector2(0, 0)]
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2)
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, b + Math.sin(a) * b))
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2)
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b))
  }
  pts.push(new THREE.Vector2(0, h))
  return pts
}

// Borda levemente irregular — aspecto artesanal
function wobbleRadius(geo, amount, seed) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const th = Math.atan2(z, x)
    const k = 1 + amount * (Math.sin(th * 7 + seed) * 0.6 + Math.sin(th * 13 + seed * 2) * 0.4)
    pos.setX(i, x * k)
    pos.setZ(i, z * k)
  }
  geo.computeVertexNormals()
}

// UV "por face": topo/fundo em projeção planar (x/z) e lateral cilíndrica
// (ângulo × altura) — a textura não estica em listras na borda do disco
function capSideUV(geo, k = 0.32) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    if (Math.abs(nor.getY(i)) > 0.55) uv.setXY(i, x * k + 0.5, z * k + 0.5)
    else {
      const th = Math.atan2(z, x)
      uv.setXY(i, (th + Math.PI) * Math.hypot(x, z) * k * 0.5, y * k * 1.6 + 0.37)
    }
  }
}

// Ruído suave 3D (value noise + fbm) para relevo e manchas "de verdade"
function makeNoise(seed = 1) {
  const hash = (x, y, z) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 2246822519)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }
  const sm = (t) => t * t * (3 - 2 * t)
  const lerp = (a, b, t) => a + (b - a) * t
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
    const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi)
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz)
    return lerp(
      lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf),
      lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf),
      zf,
    ) * 2 - 1
  }
  return (x, y, z, oct = 3) => {
    let a = 0, amp = 0.5, f = 1
    for (let i = 0; i < oct; i++) { a += n3(x * f, y * f, z * f) * amp; f *= 2.03; amp *= 0.5 }
    return a
  }
}

// Empurra cada vértice para fora (raio) e em y conforme o ruído
function displace(geo, noise, { scale = 2, radial = 0, vertical = 0, oct = 3 }) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const r = Math.hypot(x, z)
    const n = noise(x * scale, y * scale, z * scale, oct)
    // perto do eixo não empurra para fora (evita esticar o polo do Lathe)
    const k = r < 1e-3 ? 1 : 1 + (n * radial * Math.min(1, r / 0.4)) / r
    pos.setXYZ(i, x * k, y + n * vertical, z * k)
  }
  geo.computeVertexNormals()
}

// Cor por vértice: fn(x, y, z) → THREE.Color
function paintBy(geo, fn) {
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c)
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/* ───────────────────────── texturas ───────────────────────── */

function makeTextures() {
  // Carne: crosta de chapa (marrom-escuro) com pontos tostados e gordura brilhando
  const patty = canvasTexture(512, 512, (g, w, h) => {
    const r = rng(7)
    g.fillStyle = '#3b2415'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 7000; i++) {
      const s = 0.8 + r() * 4, tone = r()
      // marrons de carne selada (sem puxar para o vermelho/roxo)
      g.fillStyle = tone < 0.4 ? 'rgba(20,12,6,.6)' : tone < 0.72 ? 'rgba(96,60,34,.55)'
        : tone < 0.93 ? 'rgba(142,96,58,.5)' : 'rgba(192,140,92,.5)'
      g.beginPath()
      g.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.7), r() * 3, 0, Math.PI * 2)
      g.fill()
    }
    // fiapos da carne moída
    g.lineCap = 'round'
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI * 2, l = 3 + r() * 9
      g.strokeStyle = r() < 0.5 ? 'rgba(20,12,6,.45)' : 'rgba(160,110,70,.35)'
      g.lineWidth = 1 + r() * 1.6
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
    }
  })
  // Relevo da carne (independente da cor: grumos)
  const pattyBump = canvasTexture(256, 256, (g, w, h) => {
    const r = rng(17)
    g.fillStyle = '#808080'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(r() * 255)
      g.fillStyle = `rgba(${v},${v},${v},.5)`
      g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 3.5, 0, Math.PI * 2); g.fill()
    }
  }, false)
  // Miolo tostado na chapa: centro dourado, manchas mais escuras, borda clara
  const crumb = canvasTexture(512, 512, (g, w, h) => {
    const r = rng(21)
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    grd.addColorStop(0, '#a8662c')
    grd.addColorStop(0.55, '#b97a3c')
    grd.addColorStop(0.8, '#d6a463')
    grd.addColorStop(0.93, '#e9c58a')
    grd.addColorStop(1, '#c58a45')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 260; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.8, y = h / 2 + (r() - 0.5) * h * 0.8
      g.fillStyle = 'rgba(140,72,22,.18)'
      g.beginPath(); g.ellipse(x, y, 6 + r() * 22, 4 + r() * 14, r() * 3, 0, Math.PI * 2); g.fill()
    }
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = r() < 0.55 ? 'rgba(120,70,25,.28)' : 'rgba(255,240,205,.35)'
      g.beginPath()
      g.ellipse(r() * w, r() * h, 0.8 + r() * 2.6, 0.6 + r() * 1.6, r() * 3, 0, Math.PI * 2)
      g.fill()
    }
  })
  // Bacon: faixas de carne e gordura, bordas tostadas
  const bacon = canvasTexture(512, 96, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, '#3e0f06')
    grd.addColorStop(0.1, '#8a2a14')
    grd.addColorStop(0.3, '#b54a2a')
    grd.addColorStop(0.42, '#efc2a2')
    grd.addColorStop(0.54, '#9c341b')
    grd.addColorStop(0.72, '#e5ae8a')
    grd.addColorStop(0.88, '#7a2410')
    grd.addColorStop(1, '#3e0f06')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    const r = rng(5)
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.55 ? 'rgba(45,12,4,.35)' : 'rgba(255,215,185,.22)'
      g.fillRect(r() * w, r() * h, 6 + r() * 40, 1 + r() * 2.5)
    }
    // pontas mais crocantes
    for (const x0 of [0, w]) {
      const e = g.createLinearGradient(x0, 0, x0 === 0 ? 60 : w - 60, 0)
      e.addColorStop(0, 'rgba(40,10,3,.75)')
      e.addColorStop(1, 'rgba(40,10,3,0)')
      g.fillStyle = e
      g.fillRect(x0 === 0 ? 0 : w - 60, 0, 60, h)
    }
  })
  // Tomate: pele, polpa e lóculos com gel e sementes
  const tomato = canvasTexture(512, 512, (g, w, h) => {
    const r = rng(31)
    const cx = w / 2, cy = h / 2, R = w / 2
    g.fillStyle = '#b81d0e'
    g.fillRect(0, 0, w, h)
    const flesh = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R)
    flesh.addColorStop(0, '#f05a3a')
    flesh.addColorStop(0.8, '#e23b20')
    flesh.addColorStop(0.95, '#c4220f')
    flesh.addColorStop(1, '#8e1508')
    g.fillStyle = flesh
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
    // 5 lóculos (gel alaranjado + sementes)
    const N = 5
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + 0.3
      const lx = cx + Math.cos(a) * R * 0.5, ly = cy + Math.sin(a) * R * 0.5
      g.save()
      g.translate(lx, ly); g.rotate(a)
      const gel = g.createRadialGradient(0, 0, 4, 0, 0, R * 0.26)
      gel.addColorStop(0, 'rgba(255,170,90,.95)')
      gel.addColorStop(0.7, 'rgba(244,112,60,.85)')
      gel.addColorStop(1, 'rgba(230,70,40,0)')
      g.fillStyle = gel
      g.beginPath(); g.ellipse(0, 0, R * 0.25, R * 0.17, 0, 0, Math.PI * 2); g.fill()
      for (let i = 0; i < 9; i++) {
        g.fillStyle = 'rgba(250,225,140,.95)'
        g.beginPath()
        g.ellipse((r() - 0.5) * R * 0.3, (r() - 0.5) * R * 0.18, 5, 3, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.restore()
    }
    // miolo central mais claro
    g.fillStyle = 'rgba(255,140,110,.55)'
    g.beginPath(); g.arc(cx, cy, R * 0.16, 0, Math.PI * 2); g.fill()
  })
  // Alface: nervuras claras saindo do centro
  const lettuce = canvasTexture(512, 512, (g, w, h) => {
    const r = rng(41)
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, w, h)
    g.lineCap = 'round'
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2
      g.strokeStyle = 'rgba(235,255,200,.18)'
      g.lineWidth = 1.5 + r() * 3
      g.beginPath()
      g.moveTo(w / 2, h / 2)
      const L = w * (0.3 + r() * 0.22)
      g.quadraticCurveTo(w / 2 + Math.cos(a + 0.2) * L * 0.6, h / 2 + Math.sin(a + 0.2) * L * 0.6, w / 2 + Math.cos(a) * L, h / 2 + Math.sin(a) * L)
      g.stroke()
    }
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(40,90,20,.12)' : 'rgba(255,255,255,.15)'
      g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 5, 0, Math.PI * 2); g.fill()
    }
  })
  // Casca do pão: poros finos e leves rachaduras (relevo)
  const bunBump = canvasTexture(1024, 512, (g, w, h) => {
    const r = rng(53)
    g.fillStyle = '#808080'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 9000; i++) {
      const v = r() < 0.5 ? 70 : 170
      g.fillStyle = `rgba(${v},${v},${v},.35)`
      g.beginPath(); g.ellipse(r() * w, r() * h, 0.6 + r() * 1.8, 0.5 + r() * 1.2, r() * 3, 0, Math.PI * 2); g.fill()
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(60,60,60,.25)'
      g.lineWidth = 1
      let x = r() * w, y = r() * h
      g.beginPath(); g.moveTo(x, y)
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 12; g.lineTo(x, y) }
      g.stroke()
    }
  }, false)
  return { patty, pattyBump, crumb, bacon, tomato, lettuce, bunBump }
}

/* ───────────────────────── modelo ───────────────────────── */

export function buildBurger({ shadows = true, mobile = false } = {}) {
  const tex = makeTextures()
  // Celular: MeshPhysical (clearcoat/sheen) pesa muito na GPU do aparelho →
  // usa MeshStandard com as mesmas cores (o RoomEnvironment segura o brilho)
  const Physical = mobile
    ? (o) => {
        const { clearcoat, clearcoatRoughness, sheen, sheenColor, sheenRoughness, ...rest } = o
        return new THREE.MeshStandardMaterial(rest)
      }
    : (o) => new THREE.MeshPhysicalMaterial(o)

  const M = {
    // brioche pincelado com gema: brilho de verniz por cima da casca
    bun: Physical({
      vertexColors: true, bumpMap: tex.bunBump, bumpScale: 0.9,
      roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.25,
      sheenColor: new THREE.Color('#ffd9a0'), sheenRoughness: 0.7,
    }),
    crumb: new THREE.MeshStandardMaterial({ map: tex.crumb, bumpMap: tex.pattyBump, bumpScale: 0.6, roughness: 0.92 }),
    patty: new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.patty, bumpMap: tex.pattyBump, bumpScale: 1.6, roughness: 0.78, metalness: 0,
    }),
    // cheddar tipo americano: lençol liso, brilhante, quase translúcido
    cheese: Physical({
      color: '#ee8a08', roughness: 0.34, clearcoat: 0.45, clearcoatRoughness: 0.25,
      sheen: 0.25, sheenColor: new THREE.Color('#ffc060'),
      emissive: '#5a2000', emissiveIntensity: 0.12, side: THREE.DoubleSide,
    }),
    sauce: Physical({ color: '#efd9a2', roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 }),
    lettuce: new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex.lettuce, roughness: 0.45, side: THREE.DoubleSide,
    }),
    tomato: Physical({ color: '#c8240f', roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.08 }),
    tomatoCut: Physical({ map: tex.tomato, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }),
    bacon: new THREE.MeshStandardMaterial({ map: tex.bacon, roughness: 0.4, side: THREE.DoubleSide }),
    sesame: new THREE.MeshStandardMaterial({ color: '#f1dfb0', roughness: 0.5 }),
  }

  const noise = makeNoise(3)
  // Casca do brioche: base clara (onde cresceu no forno) → topo bem dourado,
  // com manchas de forno; `crown` = altura do ponto mais tostado
  const bunColor = (y0, y1, light, dark, invert = false) => {
    const A = new THREE.Color(light), B = new THREE.Color(dark), C = new THREE.Color('#5a2207')
    return (x, y, z, c) => {
      let t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))
      if (invert) t = 1 - t
      t = t * t * (3 - 2 * t)
      const n = noise(x * 2.2, y * 2.2, z * 2.2, 3)
      c.copy(A).lerp(B, Math.min(1, Math.max(0, t + n * 0.12)))
      c.lerp(C, Math.max(0, n) * 0.3 * t) // manchas mais tostadas no topo
    }
  }

  const mesh = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = shadows
    m.receiveShadow = shadows
    return m
  }

  /* Pão de baixo: base arredondada + miolo virado para cima */
  function bunBottom() {
    const g = new THREE.Group()
    const prof = [
      [0, 0], [1.25, 0], [1.42, 0.03], [1.51, 0.12], [1.54, 0.28], [1.52, 0.42], [1.46, 0.52], [1.4, 0.55],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const geo = new THREE.LatheGeometry(prof, 96)
    wobbleRadius(geo, 0.012, 2)
    displace(geo, noise, { scale: 1.6, radial: 0.035, vertical: 0.01 })
    // fundo tostado em contato com a chapa → lateral clarinha
    paintBy(geo, bunColor(0.02, 0.4, '#e2ae66', '#7a330c', true))
    g.add(mesh(geo, M.bun))
    const cap = new THREE.CircleGeometry(1.4, 96)
    cap.rotateX(-Math.PI / 2)
    cap.translate(0, 0.55, 0)
    g.add(mesh(cap, M.crumb))
    return g
  }

  /* Pão de cima: domo brilhante (egg wash) com gergelim */
  function bunTop() {
    const g = new THREE.Group()
    const R = 1.58
    const prof = [new THREE.Vector2(1.38, 0), new THREE.Vector2(1.52, 0.05)]
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * (Math.PI / 2)
      prof.push(new THREE.Vector2(R * Math.cos(a) + 0.0001, 0.16 + 1.02 * Math.pow(Math.sin(a), 0.85)))
    }
    const geo = new THREE.LatheGeometry(prof, 128)
    wobbleRadius(geo, 0.01, 5)
    // domo levemente irregular (massa fermentada, nunca uma esfera perfeita)
    displace(geo, noise, { scale: 1.3, radial: 0.045, vertical: 0.035 })
    paintBy(geo, bunColor(0.04, 0.5, '#e8b46a', '#8f3e0e'))
    g.add(mesh(geo, M.bun))

    const cap = new THREE.CircleGeometry(1.38, 96)
    cap.rotateX(Math.PI / 2)
    g.add(mesh(cap, M.crumb))

    // Gergelim: 1 draw call, cada semente achatada e orientada pela normal do domo
    const COUNT = mobile ? 110 : 150, r = rng(13)
    const seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), M.sesame, COUNT)
    const seedTint = new THREE.Color()
    const d = new THREE.Object3D(), n = new THREE.Vector3()
    for (let k = 0; k < COUNT; k++) {
      const el = 0.3 + Math.sqrt(r()) * 1.15
      const th = r() * Math.PI * 2
      const px = R * Math.cos(el) * Math.cos(th)
      const pz = R * Math.cos(el) * Math.sin(th)
      const py = 0.16 + 1.02 * Math.pow(Math.sin(el), 0.85)
      n.set(px, (py - 0.16) * 1.4, pz).normalize()
      d.position.set(px, py, pz).addScaledVector(n, 0.01)
      d.lookAt(d.position.clone().add(n))
      d.rotateZ(r() * Math.PI)
      const sz = 0.8 + r() * 0.4
      d.scale.set(0.068 * sz, 0.036 * sz, 0.02)
      d.updateMatrix()
      seeds.setMatrixAt(k, d.matrix)
      // umas mais tostadas que outras
      seedTint.setRGB(1, 1, 1).lerp(new THREE.Color('#d9a35c'), r() * r() * 0.8)
      seeds.setColorAt(k, seedTint)
    }
    seeds.castShadow = shadows
    g.add(seeds)
    return g
  }

  /* Maionese da casa: camada fina e brilhante com borda irregular */
  function sauce() {
    const geo = new THREE.LatheGeometry(roundedProfile(1.18, 0.07, 0.035, 5), 120)
    wobbleRadius(geo, 0.07, 9)
    // espalhada com a faca: borda em gotas irregulares, superfície ondulada
    displace(geo, makeNoise(61), { scale: 2.6, radial: 0.12, vertical: 0.015, oct: 3 })
    const g = new THREE.Group()
    g.add(mesh(geo, M.sauce))
    return g
  }

  /* Carne: disco com bordas arredondadas e irregulares, crosta na textura */
  function patty(seed) {
    const geo = new THREE.LatheGeometry(roundedProfile(1.56, 0.4, 0.16, 8), 112)
    wobbleRadius(geo, 0.03, seed)
    // carne moída prensada: borda com grumos e faces irregulares
    const pn = makeNoise(Math.round(seed * 10))
    displace(geo, pn, { scale: 3.2, radial: 0.05, vertical: 0.012, oct: 4 })
    displace(geo, makeNoise(Math.round(seed * 10) + 1), { scale: 9, radial: 0.018, vertical: 0, oct: 2 })
    capSideUV(geo)
    // crosta mais escura nas faces e na quina, lateral um pouco mais clara/suculenta
    const dark = new THREE.Color('#4a3020'), side = new THREE.Color('#b08a70'), cc = new THREE.Color()
    paintBy(geo, (x, y, z, c) => {
      const mid = 1 - Math.min(1, Math.abs(y - 0.2) / 0.2)
      const n = pn(x * 5, y * 5, z * 5, 2)
      c.setRGB(1, 1, 1).lerp(side, mid * 0.45 + n * 0.1)
      cc.copy(c).lerp(dark, Math.max(0, n) * 0.6)
      c.copy(cc)
    })
    const g = new THREE.Group()
    const m = mesh(geo, M.patty)
    m.rotation.y = seed
    g.add(m)
    return g
  }

  /* Cheddar: placa quadrada que derrete sobre a carne + gotas escorrendo */
  function cheese(angle) {
    const g = new THREE.Group()
    const geo = new THREE.BoxGeometry(2.95, 0.035, 2.95, 72, 1, 72)
    const pos = geo.attributes.position
    const cn = makeNoise(Math.round(angle * 100) + 7)
    // derrete sobre a quina da carne e escorre; as pontas cedem mais
    const droop = (x, z) => {
      // começa a cair só depois da quina arredondada da carne (r ≈ 1,5);
      // a linha onde derrete varia ao redor (nunca é um círculo perfeito)
      const th = Math.atan2(z, x)
      const edge = 1.5 + Math.abs(cn(Math.cos(th) * 1.6, 3, Math.sin(th) * 1.6, 2)) * 0.18
      const over = Math.max(0, Math.sqrt(x * x + z * z) - edge)
      return -(over * over * 1.9 + over * 0.5)
    }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      // pontas encolhem (queijo derretido puxa para dentro) + ondinhas
      const r = Math.hypot(x, z), over = Math.max(0, r - 1.6)
      const pull = 1 - over * 0.22
      const wav = Math.abs(cn(x * 2.4, 0, z * 2.4, 2)) * 0.03 * Math.min(1, Math.max(0, r - 1.5) * 3)
      pos.setXYZ(i, x * pull, pos.getY(i) + 0.012 + droop(x, z) + wav, z * pull)
    }
    geo.computeVertexNormals()
    g.add(mesh(geo, M.cheese))
    const DRIPS = [[1.44, 1.44, 0.34], [-1.44, 1.44, 0.22], [1.44, -1.44, 0.18], [-1.44, -1.44, 0.3],
      [1.47, 0.35, 0.16], [-0.5, 1.47, 0.2], [0.2, -1.47, 0.24]]
    for (const [x, z, len] of DRIPS) {
      // ponto da borda já derretida (mesmo puxão da placa), um pouco para dentro
      const k = 0.9
      const px = x * k, pz = z * k
      const pull = 1 - Math.max(0, Math.hypot(px, pz) - 1.6) * 0.22
      // gota: mais grossa embaixo (gravidade), presa à borda
      const drop = mesh(new THREE.CapsuleGeometry(0.06, len, 4, 12), M.cheese)
      drop.scale.set(1, 1, 0.8)
      drop.position.set(px * pull, 0.012 + droop(px, pz) - len / 2 + 0.01, pz * pull)
      const tip = mesh(new THREE.SphereGeometry(0.078, 12, 10), M.cheese)
      tip.position.set(0, -len / 2 - 0.01, 0)
      drop.add(tip)
      g.add(drop)
    }
    g.rotation.y = angle
    return g
  }

  /* Alface: anel ondulado, maior que o pão */
  function lettuce() {
    const g = new THREE.Group()
    const pale = new THREE.Color('#d6eb92'), mid = new THREE.Color('#79c043'), edge = new THREE.Color('#3f8f22')
    // duas folhas sobrepostas, cada uma com contorno em lóbulos e babados
    const leaf = (R, seed, lift) => {
      const geo = new THREE.RingGeometry(0.02, R, 160, 10)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position
      const ln = makeNoise(seed)
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i)
        const r = Math.hypot(x, z), th = Math.atan2(z, x)
        const t = r / R
        const cx = Math.cos(th) * 1.3, cz = Math.sin(th) * 1.3
        // lóbulos irregulares do contorno
        const lobe = ln(cx, seed, cz, 3) * 0.22 + Math.sin(th * 7 + seed) * 0.04
        const k = 1 + lobe * t * t
        pos.setX(i, x * k)
        pos.setZ(i, z * k)
        // babados finos na borda (folha crespa) + ondas largas + caimento
        const frill = Math.sin(th * 38 + seed) * 0.03 + Math.sin(th * 17 + seed * 2) * 0.05
        pos.setY(i, lift + frill * Math.pow(Math.max(0, t - 0.55) / 0.45, 2) + ln(x * 1.4, 0, z * 1.4, 2) * 0.06 * t - t * t * 0.1)
      }
      geo.computeVertexNormals()
      const uv = geo.attributes.uv
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3.9 + 0.5, pos.getZ(i) / 3.9 + 0.5)
      paintBy(geo, (x, y, z, c) => {
        const t = Math.hypot(x, z) / (R * 1.05)
        if (t < 0.55) c.copy(pale).lerp(mid, t / 0.55)
        else c.copy(mid).lerp(edge, Math.min(1, (t - 0.55) / 0.45))
        c.offsetHSL(0, 0, ln(x * 3, 1, z * 3, 2) * 0.07)
      })
      return mesh(geo, M.lettuce)
    }
    g.add(leaf(1.8, 11, 0))
    const top = leaf(1.66, 29, 0.035)
    top.rotation.y = 2.1
    g.add(top)
    return g
  }

  /* Tomate: fatia fina e brilhante */
  function tomato() {
    const g = new THREE.Group()
    // lateral = pele; tampas = corte com polpa, gel e sementes
    const m = mesh(new THREE.CylinderGeometry(1.32, 1.3, 0.11, 64), [M.tomato, M.tomatoCut, M.tomatoCut])
    m.position.y = 0.055
    g.add(m)
    return g
  }

  /* Bacon: 3 tiras onduladas passando da borda do pão */
  function bacon() {
    const g = new THREE.Group()
    ;[[0.35, 0, 0.0], [-0.25, 0.04, 1.15], [0.05, 0.08, 2.2]].forEach(([z, y, rot], idx) => {
      const geo = new THREE.PlaneGeometry(3.7, 0.6, 100, 4)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const zz = pos.getZ(i)
        // ondas irregulares de bacon crocante + leve torção ao longo da tira
        pos.setY(i, Math.sin(x * 4.2 + idx) * 0.075 + Math.sin(x * 9.5 + idx * 2) * 0.02
          - x * x * 0.03 + zz * Math.sin(x * 2 + idx) * 0.18)
      }
      geo.computeVertexNormals()
      const m = mesh(geo, M.bacon)
      m.position.set(0, y + 0.06, z)
      const wrap = new THREE.Group()
      wrap.add(m)
      wrap.rotation.y = rot
      g.add(wrap)
    })
    return g
  }

  // Camadas de BAIXO para CIMA (y = altura de apoio com o lanche montado)
  const DEFS = [
    ['bun-bottom', bunBottom(), 0],
    ['sauce', sauce(), 0.55],
    ['lettuce', lettuce(), 0.62],
    ['patty-1', patty(1.3), 0.62],
    ['cheese-1', cheese(0.3), 1.06],
    ['patty-2', patty(4.1), 1.09],
    ['cheese-2', cheese(1.1), 1.53],
    ['tomato', tomato(), 1.55],
    ['bacon', bacon(), 1.66],
    ['bun-top', bunTop(), 1.78],
  ]

  const group = new THREE.Group()
  group.name = 'burger'

  // Chão invisível que só recebe a sombra (acompanha o lanche)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.5 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.01
  ground.receiveShadow = shadows
  group.add(ground)

  const layers = DEFS.map(([name, obj, y], i) => {
    const outer = new THREE.Group()
    outer.name = name
    outer.add(obj)
    outer.position.y = y
    group.add(outer)
    obj.traverse((o) => { o.userData.layer = name })
    return {
      name, index: i, group: outer, y,
      drop: 0,          // altura extra (abertura: ingredientes caindo)
      visible: true,
      lift: 0, liftT: 0, // hover
      squash: 0,        // achatamento ao pousar (0..1)
    }
  })
  const byName = Object.fromEntries(layers.map((l) => [l.name, l]))

  // Vapor saindo do pão (sprites suaves)
  const steamTex = glowTexture('rgba(255,240,225,.9)', 'rgba(255,240,225,0)')
  const steams = [0, 1, 2, 3].map(() => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false }))
    group.add(sp)
    return sp
  })

  let explodeNow = 0
  const layerY = (l) => l.y + l.index * GAP * explodeNow + l.drop + l.lift

  let t = 0
  function update(dt, pose) {
    t += dt
    explodeNow = pose.explode
    const a = 1 - Math.exp(-dt * 10)
    for (const l of layers) {
      l.lift += (l.liftT - l.lift) * a
      l.group.visible = l.visible
      l.group.position.y = layerY(l)
      const s = l.squash
      l.group.scale.set(1 + s * 0.06, 1 - s * 0.22, 1 + s * 0.06)
    }
    // vapor sobe do topo do pão de cima
    const top = layerY(byName['bun-top']) + 1.1
    for (let v = 0; v < steams.length; v++) {
      const sp = steams[v]
      const f = (t * 0.32 + v / steams.length) % 1
      sp.position.set(Math.sin(f * 5 + v * 2) * 0.35 + (v - 1.5) * 0.25, top + f * 1.6, 0.2)
      const sc = 0.7 + f * 1.3
      sp.scale.set(sc, sc * 1.4, 1)
      sp.material.opacity = (pose.steam || 0) * Math.sin(f * Math.PI) * 0.12
    }
  }

  // Pontos para os rótulos (lado +X/+Z, voltado para a câmera do "por dentro")
  const anchors = {
    'bun-top': () => [1.05, layerY(byName['bun-top']) + 0.85, 0.55],
    bacon: () => [1.75, layerY(byName.bacon) + 0.08, 0.25],
    cheese: () => [1.5, layerY(byName['cheese-2']) - 0.22, 0.75],
    patty: () => [1.48, layerY(byName['patty-2']) + 0.21, 0.45],
    lettuce: () => [1.7, layerY(byName.lettuce) - 0.02, 0.5],
    sauce: () => [1.05, layerY(byName.sauce) + 0.06, 0.65],
    'bun-bottom': () => [1.3, layerY(byName['bun-bottom']) + 0.3, 0.7],
  }

  // Raycast: qual camada está sob o cursor
  const raycaster = new THREE.Raycaster()
  const pickables = []
  group.traverse((o) => { if (o.isMesh && o.userData.layer) pickables.push(o) })
  function pick(ray) {
    raycaster.ray.copy(ray)
    const hit = raycaster.intersectObjects(pickables, false)[0]
    return hit ? hit.object.userData.layer : null
  }

  return { group, layers, byName, update, anchors, pick }
}
