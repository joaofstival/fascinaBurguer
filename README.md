# Fascina Burguer — Landing Page

Landing page estática da **Fascina Burguer** (hambúrguer artesanal). Visual escuro "carvão",
acentos **Vermelho Brasa** e **Amarelo Cheddar**, animações com GSAP + ScrollTrigger.
Sem build, sem framework: HTML + CSS + JS puro.

Seções:

| # | Seção | Arquivos |
|---|-------|----------|
| A | Hero — montagem do hambúrguer no scroll | `css/hero.css`, `js/hero.js` |
| B | A Ciência do Sabor — brasas e fumaça (canvas) | `css/science.css`, `js/science.js` |
| C | Cardápio — trilho horizontal / carrossel | `css/menu.css`, `js/menu.js` |
| D | Bastidores "A Mágica Acontece" — vídeos + depoimentos | `css/kitchen.css`, `js/kitchen.js` |
| E | Rodapé / pedido final — motoboy com rastro | `css/footer.css`, `js/footer.js` |

---

## Como rodar

Basta abrir o `index.html` no navegador. Para testar como em produção (recomendado,
principalmente para os vídeos), sirva a pasta com um servidor local:

```bash
npx serve .
# ou
python3 -m http.server 8000   # depois acesse http://localhost:8000
```

Para publicar: envie a pasta inteira para qualquer hospedagem estática
(Netlify, Vercel, GitHub Pages, Hostinger, etc.).

---

## Estrutura de arquivos

```
index.html            → marcação de todas as seções
css/
  base.css            → tokens (cores, fontes, espaçamentos), reset, botões, header
  hero.css | science.css | menu.css | kitchen.css | footer.css
js/
  core.js             → namespace FB, configuração (links) e FB.register()
  hero.js | science.js | menu.js | kitchen.js | footer.js  → um módulo por seção
  main.js             → orquestrador: detecta movimento reduzido/toque, inicia os módulos em ordem
assets/
  brand/              → logo
  img/                → fotos dos lanches
  video/              → vídeos dos bastidores (criar a pasta)
```

GSAP 3.12.5 e ScrollTrigger vêm do CDN cdnjs (versões fixas no fim do `index.html`).
Se o CDN falhar, a página continua 100% legível, só sem animações.

---

## Onde inserir os assets

| Slot | Caminho | Formato / tamanho recomendado |
|------|---------|-------------------------------|
| Logo (header, favicon, rodapé) | `assets/brand/logo.png` (original) → versões leves `logo-64.png` (favicon), `logo-112.png` (header), `logo-320.webp` (rodapé) | PNG ou SVG com **fundo transparente**, quadrado, ≥ 512×512. Ao trocar, gere as versões: `sips -Z 64 logo.png --out logo-64.png`, `sips -Z 112 logo.png --out logo-112.png`, `cwebp -q 80 -resize 320 320 logo.png -o logo-320.webp` |
| Hero — imagem de fallback (sem 3D / movimento reduzido; só é baixada nesse caso) | `assets/img/burger-duplo-close.webp` (`.hero__fallback`) | WebP 4:5, ~1024×1280, < 150 KB |
| Card 1 — Fascina Clássico | `assets/img/burger-duplo-bacon-ingredientes.webp` | WebP **4:5**, ~800×1000, < 200 KB |
| Card 2 — Senhor Bacon | `assets/img/burger-bacon-tomate.webp` | idem |
| Card 3 — Smash Duplo Fascina | `assets/img/burger-duplo-close.webp` | idem |
| Card 4 — Segredo da Fascina | `assets/img/burger-segredo-da-fascina.webp` | idem |
| Card 5 — Combo Fascina | `assets/img/burger-rucula-batata-coca.webp` | idem |
| Card 6 — Milkshake de Morango | `assets/img/milkshake-morango.webp` | idem |
| Vídeo 1 — queijo derretendo (clipe alto) | `assets/video/queijo-derretendo.webm` + `.mp4` | vertical/4:5, 720p, 6–10 s em loop, **sem áudio**, < 2 MB cada |
| Pôster do vídeo 1 | `assets/img/burger-segredo-da-fascina.webp` (atributo `data-poster`, carregado perto da tela) | WebP 4:5, mesmo enquadramento do 1º frame |
| Vídeo 2 — carne na chapa (clipe largo) | `assets/video/carne-na-chapa.webm` + `.mp4` | 16:10 ou 16:9, 720p, 6–10 s, sem áudio, < 2 MB cada |
| Pôster do vídeo 2 | `assets/img/burger-duplo-bacon-ingredientes.webp` | WebP 16:10 |
| Imagem de compartilhamento (WhatsApp, Instagram, etc.) | `<meta property="og:image">` → hoje `assets/img/burger-duplo-close.jpg` | JPG **1200×630**; use URL absoluta (`https://seusite.com/...`) em produção |

> As fotos são servidas em **WebP** (≈ 60% menores que JPG). Para converter:
> `cwebp -q 78 -m 6 foto.jpg -o foto.webp`.
>
> Para trocar a foto de um card, edite o `src` **e** o `alt` (descrição do lanche) do `<img>`
> dentro do respectivo `<li class="menu-card">` no `index.html`. Ajuste `width`/`height` para a
> proporção real da imagem (evita "pulos" de layout).

### Vídeos: enquanto não existirem

Os vídeos ainda **não estão** na pasta `assets/video/`. Sem eles, o `js/kitchen.js` detecta o erro
de carregamento e mantém o **pôster** com um zoom lento (Ken Burns). Nada quebra. Ao colocar os
arquivos com os nomes acima, eles passam a tocar automaticamente.

Como funciona: o vídeo só começa a baixar quando está a ~200px de entrar na tela, toca quando
≥ 35% está visível, pausa quando sai e também quando a aba fica oculta.

### Codificando os vídeos (ffmpeg)

```bash
# MP4 H.264 — compatível com tudo (Safari/iOS incluso). Sem áudio, 720p, ~1.5 Mbps
ffmpeg -i bruto.mov -an -vf "scale=-2:720,fps=30" -c:v libx264 -profile:v high \
  -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart assets/video/carne-na-chapa.mp4

# WebM VP9 — menor, usado primeiro pelo Chrome/Firefox
ffmpeg -i bruto.mov -an -vf "scale=-2:720,fps=30" -c:v libvpx-vp9 -b:v 0 -crf 36 \
  -row-mt 1 assets/video/carne-na-chapa.webm

# Pôster a partir do 1º frame
ffmpeg -i assets/video/carne-na-chapa.mp4 -frames:v 1 -q:v 3 assets/img/poster-carne-na-chapa.jpg
```

Dicas: corte de 6 a 10 s com início e fim parecidos (loop sem "pulo"); `-an` remove o áudio
(obrigatório para autoplay no celular); `+faststart` faz o MP4 começar a tocar antes de
terminar de baixar. Para o clipe vertical, troque `scale=-2:720` por `scale=720:-2`.

---

## Link de pedido e Instagram

Tudo fica em **`js/core.js`**, em `FB.config`:

```js
FB.config = {
  orderUrl: 'https://wa.me/55DDDNUMERO?text=...', // WhatsApp, iFood, cardápio digital...
  instagramUrl: 'https://www.instagram.com/seu_perfil/',
  ...
};
```

- Todo elemento com `data-order` (botões "Pedir", "Quero Devorar Agora", CTA final…) recebe o `orderUrl`.
- Todo elemento com `data-instagram` recebe o `instagramUrl`.
- WhatsApp: use `https://wa.me/55` + DDD + número (só dígitos). A mensagem pronta vai em
  `?text=` codificada (use `encodeURIComponent` ou um gerador de link de WhatsApp).

Endereço, horário e outras redes: edite o bloco `.finale__bottom` no fim do `index.html`.

---

## Cores e fontes

Todos os tokens ficam no topo de **`css/base.css`** (`:root`):

- Cores: `--carvao-900` (fundo), `--creme` (texto), `--cheddar`, `--brasa`, `--brasa-hot`,
  `--fumaca` (texto secundário), `--grad-fogo` (gradiente dos destaques).
- Fontes: `--font-display` (Fraunces, títulos), `--font-body` (Manrope, texto), `--font-label`
  (Bebas Neue, rótulos). Para trocar, altere o `<link>` do Google Fonts no `<head>` do
  `index.html` **e** as variáveis.
- Tamanhos fluidos: `--fs-hero`, `--fs-h2`, `--fs-h3`, `--fs-lead`.

Mudando os tokens, todas as seções acompanham. Ao trocar cores, mantenha o contraste de texto
≥ 4.5:1 (teste em https://webaim.org/resources/contrastchecker/).

---

## Depoimentos (placeholders!)

Os três depoimentos da seção "Quem provou, voltou" são **textos de exemplo**. Substitua por
avaliações reais (Google, iFood, Instagram), com autorização dos clientes. Edite cada
`<li class="testimonial">` no `index.html`: o texto no `<blockquote>`, o nome/origem em
`.testimonial__author` e, se a nota não for 5, ajuste as estrelas e o `aria-label`
(ex.: `aria-label="4 de 5 estrelas"`). Não publique depoimentos inventados como se fossem reais.

---

## Performance e acessibilidade

- **Movimento reduzido**: com `prefers-reduced-motion: reduce` no sistema, a página desliga
  scroll animado, revelações, Ken Burns, pulsos e o motoboy (que fica estacionado). Vídeos
  não tocam sozinhos, só o pôster aparece.
- **Vídeos lazy**: `preload="none"` + carregamento via IntersectionObserver; pausam fora da tela
  e com a aba oculta.
- **Imagens**: `loading="lazy"` e `decoding="async"` nos cards; o hero é pré-carregado.
  Prefira WebP/JPG otimizados (ex.: squoosh.app).
- **Animações** usam só `transform`/`opacity` (e `clip-path` nas revelações de mídia),
  pensando em 60 fps no celular.
- **Teclado**: link "Pular para o conteúdo", foco visível em cheddar, o cardápio horizontal é
  focável e navegável pelas setas; todos os CTAs são links reais.
- **Leitores de tela**: textos decorativos ficam com `aria-hidden`; o "Tsssss." animado letra a
  letra mantém uma cópia legível para leitores de tela.
- **Sem JS / sem CDN**: o conteúdo continua visível e utilizável.

## Navegadores suportados

Últimas 2 versões de Chrome, Edge, Firefox e Safari (macOS e iOS 15+), Samsung Internet e
Chrome Android. Recursos como `clip-path`, `aspect-ratio`, `backdrop-filter` e `background-clip:
text` degradam de forma elegante em navegadores antigos (o conteúdo continua legível).

## Hambúrguer 3D (palco fixo)

O lanche 3D é desenhado num único canvas fixo (`#stage`) que acompanha a página inteira — o mesmo modelo de "página de produto" usado no projeto do teclado:

| Arquivo | Papel |
|---|---|
| `js/3d/boot.js` | Entrada. Só carrega o 3D se `<html>` tem `.has-3d` (WebGL + sem movimento reduzido). Se falhar, volta para a foto. |
| `js/3d/burger.js` | Modelo procedural (pães, maionese, alface, carnes, cheddar, tomate, bacon, gergelim). Sem arquivos `.glb`. |
| `js/3d/stage.js` | Cena, luz de estúdio (RoomEnvironment), sombra, contraluz brasa; aplica `stage.pose` a cada quadro. |
| `js/3d/track.js` | **Trilho de poses** preso à rolagem (câmera, explosão das camadas, deslocamento). Edite as tabelas `DESKTOP`/`MOBILE` para mudar o roteiro. |
| `js/3d/callouts.js` | Rótulos presos a pontos do 3D na seção "A Ciência do Sabor". |
| `js/3d/intro.js` | Abertura: ingredientes caem e assentam um a um. |
| `js/3d/app.js` | Loop único (gsap.ticker) + rolagem suave Lenis + cursor. |

Roteiro: hero (montado, três quartos, inclina com o cursor; passar o mouse levanta o pão) → "A Ciência do Sabor" presa (camadas se soltam na vertical, rótulos entram) → recompõe e sobe com a página antes do cardápio.

Bibliotecas via `importmap` no `<head>`: three@0.170.0 e lenis@1.1.20 (jsDelivr).
Para trocar o modelo procedural por um `.glb` real no futuro, substitua `buildBurger()` mantendo a mesma API (`layers`, `anchors`, `update`, `pick`).
