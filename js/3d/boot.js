// =============================================================================
// Fascina Burguer — 3D / boot.js
// Ponto de entrada do palco 3D. Só carrega o 3D quando <html> tem .has-3d
// (WebGL disponível + sem movimento reduzido — decidido no <head>).
// Se o Three.js/Lenis não carregarem (CDN fora, erro de GPU...), volta a
// página para o modo sem 3D: foto no hero, seções sem pin.
// =============================================================================
const root = document.documentElement

function fallback(err) {
  console.warn('[Fascina] palco 3D indisponível — usando o modo sem 3D.', err)
  root.classList.remove('has-3d', 'has-pin')
  root.classList.add('stage-failed')
  const c = document.getElementById('stage')
  if (c) c.remove()
  if (window.ScrollTrigger) window.ScrollTrigger.refresh()
}

// Espera a página pintar o hero antes de montar a cena: os módulos já
// estão baixando (modulepreload no <head>), mas executar o app.js cria o
// WebGL, gera texturas e compila shaders — trava a thread principal por
// algumas centenas de ms. Assim o texto aparece primeiro e o 3D entra logo
// depois, em vez de a tela ficar vazia até tudo ficar pronto.
const afterFirstPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => setTimeout(resolve, 0))
})

if (root.classList.contains('has-3d')) {
  afterFirstPaint().then(() => {
    // Se a cena não ficar pronta em 15 s (rede muito lenta), desiste do 3D
    const timer = setTimeout(() => fallback(new Error('timeout')), 15000)
    return import('./app.js')
      .then(() => clearTimeout(timer))
      .catch((err) => { clearTimeout(timer); fallback(err) })
  })
}
