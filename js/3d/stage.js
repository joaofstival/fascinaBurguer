// =============================================================================
// Fascina Burguer — 3D / stage.js
// Palco 3D fixo (canvas #stage cobrindo a tela). Tudo que muda com a rolagem
// é escrito em `stage.pose` (pelo trilho em track.js) e aplicado a cada quadro.
//
// Luz: RoomEnvironment como estúdio (reflexos no brilho do pão/cheddar),
// luz principal quente com sombra suave, contraluz vermelho-brasa e um calor
// "de chapa" vindo de baixo. Canvas transparente: o fundo é o CSS.
// =============================================================================
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { buildBurger } from './burger.js'

export const DEFAULT_POSE = {
  camX: 5.5, camY: 5.2, camZ: 9.5, tgtX: 0, tgtY: 1.4, tgtZ: 0, fov: 30,
  rotX: 0, rotY: 0, rotZ: 0, posY: 0, scale: 1,
  explode: 0,   // 0 = montado · 1 = camadas soltas na vertical
  sway: 0.3,    // balanço lento em Y (rad) — 0 = parado (para rótulos estáveis)
  glow: 0.6,    // calor vermelho por baixo
  steam: 1,     // vapor saindo do pão
  shiftX: 0, shiftY: 0, // fração da tela: + = lanche para a direita / para cima
  scrollY: 0,   // px: faz o lanche "rolar junto" com a página
}
const FIELDS = Object.keys(DEFAULT_POSE)

export function createStage({ canvas, mobile = false } = {}) {
  const shadows = true
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const dpr = () => Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  scene.environment = pmrem.fromScene(room, 0.04).texture
  scene.environmentIntensity = 0.42
  room.dispose?.()
  pmrem.dispose()

  // Luz principal quente com sombra suave
  const key = new THREE.DirectionalLight('#ffe9cf', 2.1)
  key.position.set(-4, 9, 6)
  if (shadows) {
    key.castShadow = true
    const s = mobile ? 1024 : 2048
    key.shadow.mapSize.set(s, s)
    const c = key.shadow.camera
    c.left = -6; c.right = 6; c.top = 10; c.bottom = -4; c.near = 1; c.far = 30
    key.shadow.radius = 5
    key.shadow.bias = -0.0005
    key.shadow.normalBias = 0.02
  }
  scene.add(key, key.target)

  // Contraluz vermelho-brasa (recorte na silhueta)
  const rim = new THREE.DirectionalLight('#ff4a1a', 2.6)
  rim.position.set(3, 4, -8)
  scene.add(rim, rim.target)

  // Preenchimento cheddar + céu/chão quentes
  const fill = new THREE.HemisphereLight('#ffe0b0', '#1a0a04', 0.35)
  scene.add(fill)

  // Calor da chapa vindo de baixo (intensidade = pose.glow)
  const under = new THREE.PointLight('#ff5a1f', 0, 10, 1.6)
  under.position.set(0, -1.2, 1.4)
  scene.add(under)

  const burger = buildBurger({ shadows })
  scene.add(burger.group)
  key.target = burger.group

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200)
  const pose = { ...DEFAULT_POSE }
  let W = 1, H = 1
  let visible = true
  let time = 0
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 }

  function applyPose() {
    camera.position.set(pose.camX, pose.camY, pose.camZ)
    camera.lookAt(pose.tgtX, pose.tgtY, pose.tgtZ)
    camera.fov = pose.fov
    camera.aspect = W / H
    // Desloca o enquadramento sem mudar a perspectiva (lanche à direita/acima)
    camera.setViewOffset(W, H, -pose.shiftX * W, pose.shiftY * H + pose.scrollY, W, H)
    camera.updateProjectionMatrix()

    const g = burger.group
    const sway = Math.sin(time * 0.45) * pose.sway
    g.rotation.set(pose.rotX + tilt.y * 0.08, pose.rotY + sway + tilt.x * 0.28, pose.rotZ)
    g.position.set(0, pose.posY, 0)
    g.scale.setScalar(pose.scale)
    under.intensity = pose.glow * 14
    g.updateMatrixWorld()
    camera.updateMatrixWorld()
  }

  function size() {
    W = window.innerWidth
    H = window.innerHeight
    renderer.setPixelRatio(dpr())
    renderer.setSize(W, H, false)
    applyPose()
  }
  size()

  // Projeta um ponto local do lanche para px na tela
  const tmp = new THREE.Vector3()
  function project(local, out = {}) {
    tmp.copy(local).applyMatrix4(burger.group.matrixWorld)
    const behind = tmp.clone().applyMatrix4(camera.matrixWorldInverse).z > 0
    tmp.project(camera)
    out.x = (tmp.x + 1) * 0.5 * W
    out.y = (1 - tmp.y) * 0.5 * H
    out.visible = !behind && tmp.z >= -1 && tmp.z <= 1
    return out
  }
  const av = new THREE.Vector3()
  function anchor(name, out = {}) {
    const f = burger.anchors[name]
    if (!f) { out.x = out.y = 0; out.visible = false; return out }
    const [x, y, z] = f()
    return project(av.set(x, y, z), out)
  }

  // Camada sob o cursor
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  function pick(clientX, clientY) {
    ndc.set((clientX / W) * 2 - 1, -(clientY / H) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    return burger.pick(raycaster.ray)
  }

  // Hover: lanche montado → o pão de cima "espia" (sobe um pouco);
  // camadas soltas → a camada sob o cursor se destaca.
  let hovered = null
  function hover(name) {
    if (hovered === name) return
    hovered = name || null
    const exploded = pose.explode > 0.3
    for (const l of burger.layers) {
      l.liftT = !hovered ? 0
        : exploded ? (l.name === hovered ? 0.18 : 0)
        : (l.name === 'bun-top' ? 0.32 : l.name === 'bacon' ? 0.12 : 0)
    }
  }

  function setTilt(x, y) {
    tilt.tx = Math.max(-1, Math.min(1, x || 0))
    tilt.ty = Math.max(-1, Math.min(1, y || 0))
  }
  function setVisible(v) {
    v = !!v
    if (v === visible) return
    visible = v
    canvas.style.visibility = v ? '' : 'hidden'
  }

  function frame(dt = 1 / 60) {
    time += dt
    const a = 1 - Math.exp(-Math.min(dt, 0.1) * 5)
    tilt.x += (tilt.tx - tilt.x) * a
    tilt.y += (tilt.ty - tilt.y) * a
    burger.update(dt, pose)
    applyPose()
    if (!visible) return
    renderer.render(scene, camera)
  }

  function compile() {
    applyPose()
    burger.update(0, pose)
    return renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))
  }

  return {
    pose, renderer, scene, camera, burger, layers: burger.layers,
    frame, compile, size, project, anchor, pick, hover, setTilt, setVisible,
    get hovered() { return hovered },
    fields: FIELDS,
  }
}
