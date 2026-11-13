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

// Degradê vertical por vértice (base → topo)
function paintVertical(geo, y0, y1, c0, c1) {
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)))
    c.copy(a).lerp(b, Math.pow(t, 0.8))
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
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

// UV planar (x/z): evita os "raios" do UV radial do Lathe no topo/fundo
function planarUV(geo, k = 0.32) {
  const pos = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) * k + 0.5 + pos.getY(i) * 0.4, pos.getZ(i) * k + 0.5)
  }
}

/* ───────────────────────── texturas ───────────────────────── */

function makeTextures() {
  const patty = canvasTexture(512, 512, (g, w, h) => {
    const r = rng(7)
    g.fillStyle = '#4a2413'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 5200; i++) {
      const s = 1 + r() * 4.5, tone = r()
      g.fillStyle = tone < 0.45 ? 'rgba(28,11,4,.55)' : tone < 0.8 ? 'rgba(120,58,28,.5)' : 'rgba(175,95,48,.45)'
      g.beginPath()
      g.arc(r() * w, r() * h, s, 0, Math.PI * 2)
      g.fill()
    }
  })
  const crumb = canvasTexture(256, 256, (g, w, h) => {
    const r = rng(21)
    g.fillStyle = '#f0cf95'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(200,150,80,.35)' : 'rgba(255,240,205,.5)'
      g.beginPath()
      g.ellipse(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2)
      g.fill()
    }
  })
  const bacon = canvasTexture(512, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h)
    grd.addColorStop(0, '#5e170b')
    grd.addColorStop(0.18, '#a8321e')
    grd.addColorStop(0.42, '#f1b8a0')
    grd.addColorStop(0.55, '#b8402a')
    grd.addColorStop(0.78, '#e7a089')
    grd.addColorStop(1, '#5e170b')
    g.fillStyle = grd
    g.fillRect(0, 0, w, h)
    const r = rng(5)
    for (let i = 0; i < 160; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(60,15,5,.35)' : 'rgba(255,210,180,.25)'
      g.fillRect(r() * w, r() * h, 6 + r() * 30, 1 + r() * 2)
    }
  })
  return { patty, crumb, bacon }
}

/* ───────────────────────── modelo ───────────────────────── */

export function buildBurger({ shadows = true } = {}) {
  const tex = makeTextures()

  const M = {
    bun: new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.28, sheen: 0.4,
      sheenColor: new THREE.Color('#ffcf8a'), sheenRoughness: 0.6,
    }),
    crumb: new THREE.MeshStandardMaterial({ map: tex.crumb, roughness: 0.95 }),
    patty: new THREE.MeshStandardMaterial({ map: tex.patty, bumpMap: tex.patty, bumpScale: 2.2, roughness: 0.72 }),
    cheese: new THREE.MeshPhysicalMaterial({
      color: '#f59200', roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2,
      emissive: '#6a2a00', emissiveIntensity: 0.25, side: THREE.DoubleSide,
    }),
    sauce: new THREE.MeshPhysicalMaterial({ color: '#f3e2bd', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }),
    lettuce: new THREE.MeshStandardMaterial({ color: '#6fbf3d', roughness: 0.5, side: THREE.DoubleSide }),
    tomato: new THREE.MeshPhysicalMaterial({ color: '#d8301a', roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    bacon: new THREE.MeshStandardMaterial({ map: tex.bacon, roughness: 0.45, side: THREE.DoubleSide }),
    sesame: new THREE.MeshStandardMaterial({ color: '#f6e7c3', roughness: 0.55 }),
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
    const geo = new THREE.LatheGeometry(prof, 80)
    wobbleRadius(geo, 0.012, 2)
    paintVertical(geo, 0, 0.55, '#6e2e0c', '#c97a26')
    g.add(mesh(geo, M.bun))
    const cap = new THREE.CircleGeometry(1.4, 80)
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
    const geo = new THREE.LatheGeometry(prof, 96)
    wobbleRadius(geo, 0.01, 5)
    paintVertical(geo, 0, 1.18, '#d98c32', '#6e2a08')
    g.add(mesh(geo, M.bun))

    const cap = new THREE.CircleGeometry(1.38, 80)
    cap.rotateX(Math.PI / 2)
    g.add(mesh(cap, M.crumb))

    // Gergelim: 1 draw call, cada semente achatada e orientada pela normal do domo
    const COUNT = 80, r = rng(13)
    const seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), M.sesame, COUNT)
    const d = new THREE.Object3D(), n = new THREE.Vector3()
    for (let k = 0; k < COUNT; k++) {
      const el = 0.35 + r() * 1.05
      const th = r() * Math.PI * 2
      const px = R * Math.cos(el) * Math.cos(th)
      const pz = R * Math.cos(el) * Math.sin(th)
      const py = 0.16 + 1.02 * Math.pow(Math.sin(el), 0.85)
      n.set(px, (py - 0.16) * 1.4, pz).normalize()
      d.position.set(px, py, pz).addScaledVector(n, 0.01)
      d.lookAt(d.position.clone().add(n))
      d.rotateZ(r() * Math.PI)
      d.scale.set(0.075, 0.04, 0.022)
      d.updateMatrix()
      seeds.setMatrixAt(k, d.matrix)
    }
    seeds.castShadow = shadows
    g.add(seeds)
    return g
  }

  /* Maionese da casa: camada fina e brilhante com borda irregular */
  function sauce() {
    const geo = new THREE.LatheGeometry(roundedProfile(1.28, 0.08, 0.04, 4), 72)
    wobbleRadius(geo, 0.07, 9)
    const g = new THREE.Group()
    g.add(mesh(geo, M.sauce))
    return g
  }

  /* Carne: disco com bordas arredondadas e irregulares, crosta na textura */
  function patty(seed) {
    const geo = new THREE.LatheGeometry(roundedProfile(1.56, 0.42, 0.15, 6), 80)
    wobbleRadius(geo, 0.03, seed)
    planarUV(geo)
    const g = new THREE.Group()
    const m = mesh(geo, M.patty)
    m.rotation.y = seed
    g.add(m)
    return g
  }

  /* Cheddar: placa quadrada que derrete sobre a carne + gotas escorrendo */
  function cheese(angle) {
    const g = new THREE.Group()
    const geo = new THREE.BoxGeometry(2.95, 0.045, 2.95, 56, 1, 56)
    const pos = geo.attributes.position
    const droop = (x, z) => {
      const over = Math.max(0, Math.sqrt(x * x + z * z) - 1.45)
      return -(over * over * 1.25 + over * 0.35)
    }
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + droop(pos.getX(i), pos.getZ(i)))
    geo.computeVertexNormals()
    g.add(mesh(geo, M.cheese))
    const DRIPS = [[1.44, 1.44, 0.34], [-1.44, 1.44, 0.22], [1.44, -1.44, 0.18], [-1.44, -1.44, 0.3],
      [1.47, 0.35, 0.16], [-0.5, 1.47, 0.2], [0.2, -1.47, 0.24]]
    for (const [x, z, len] of DRIPS) {
      const cap = mesh(new THREE.CapsuleGeometry(0.075, len, 4, 10), M.cheese)
      const k = 0.93
      cap.position.set(x * k, droop(x * k, z * k) - len / 2 - 0.02, z * k)
      g.add(cap)
    }
    g.rotation.y = angle
    return g
  }

  /* Alface: anel ondulado, maior que o pão */
  function lettuce() {
    const geo = new THREE.RingGeometry(0.02, 1.82, 128, 8)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const r = Math.sqrt(x * x + z * z), th = Math.atan2(z, x)
      const t = r / 1.82
      const k = 1 + 0.05 * Math.sin(th * 9) * t
      pos.setX(i, x * k)
      pos.setZ(i, z * k)
      pos.setY(i, Math.sin(th * 18) * 0.06 * t * t + Math.sin(th * 5) * 0.025 - t * t * 0.08)
    }
    geo.computeVertexNormals()
    const g = new THREE.Group()
    g.add(mesh(geo, M.lettuce))
    return g
  }

  /* Tomate: fatia fina e brilhante */
  function tomato() {
    const g = new THREE.Group()
    const m = mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.1, 56), M.tomato)
    m.position.y = 0.05
    g.add(m)
    return g
  }

  /* Bacon: 3 tiras onduladas passando da borda do pão */
  function bacon() {
    const g = new THREE.Group()
    ;[[0.35, 0, 0.0], [-0.25, 0.04, 1.15], [0.05, 0.08, 2.2]].forEach(([z, y, rot], idx) => {
      const geo = new THREE.PlaneGeometry(3.7, 0.42, 100, 3)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        pos.setY(i, Math.sin(x * 4.2 + idx) * 0.07 - x * x * 0.03)
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
