// =============================================================
// PATH: src/main/starters/portfolio.js
// ROLE: "Portfolio" starter — master chrome + one composed page + six
//       text-SVG placeholder images + glightbox vendor dep. Gallery
//       harvested from plugins/blocks-sections section-gallery, upgraded
//       from dead ratio-divs to real <a class="glightbox"> anchors so the
//       lightbox actually functions in preview/export. glightbox CSS/JS is
//       copied in-project (copyVendorAssets — copyFrameworkAssets pattern)
//       and page-linked via head.customLinks / customScripts, which
//       round-trip through composeFullPageHtml/extractPageFromFullHtml.
// DEPENDS: nothing (imported by src/main/starters/index.js)
// CREATED: 2026-07-12 (Wave 4)
// =============================================================

const CHROME_HEADER = `<header>
  <nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container">
      <a class="navbar-brand" href="index.html">Studio</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#site-nav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="site-nav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item"><a class="nav-link active" href="index.html">Home</a></li>
          <li class="nav-item"><a class="nav-link" href="#work">Work</a></li>
          <li class="nav-item"><a class="nav-link" href="#contact">Contact</a></li>
        </ul>
      </div>
    </div>
  </nav>
</header>`

const CHROME_FOOTER = `<footer class="py-4 bg-dark text-light">
  <div class="container text-center">
    <p class="text-secondary mb-0">© 2026 Studio. All rights reserved.</p>
  </div>
</footer>`

const REGION_DEFAULT = `<section class="py-5">
  <div class="container">
    <p class="lead">Editable region: content — replace this with your page sections.</p>
  </div>
</section>`

function composeBody(regionContent) {
  return `${CHROME_HEADER}
<main data-grpstr-region="content" data-grpstr-region-label="Page content">
${regionContent}
</main>
${CHROME_FOOTER}
`
}

// Gallery tiles: real anchors so GLightbox picks them up. Images are the
// starter's own text-SVG placeholders (no binary assets — house constraint);
// the user swaps them via the Asset Manager.
function galleryTile(n, label) {
  return `      <div class="col-6 col-md-4">
        <a href="assets/images/work-${n}.svg" class="glightbox d-block" data-gallery="work">
          <img src="assets/images/work-${n}.svg" class="img-fluid rounded" alt="${label}">
        </a>
      </div>`
}

const INDEX_CONTENT = `<section class="py-5 py-md-7 bg-light">
  <div class="container">
    <div class="row justify-content-center text-center">
      <div class="col-lg-8">
        <h1 class="display-4 fw-bold mb-3">Selected work</h1>
        <p class="lead mb-0">Design and build projects, most recent first. Click any tile for a closer look.</p>
      </div>
    </div>
  </div>
</section>
<section class="py-5 py-md-7" id="work">
  <div class="container">
    <h2 class="fw-bold text-center mb-5">Gallery</h2>
    <div class="row g-3">
${galleryTile(1, 'Project one')}
${galleryTile(2, 'Project two')}
${galleryTile(3, 'Project three')}
${galleryTile(4, 'Project four')}
${galleryTile(5, 'Project five')}
${galleryTile(6, 'Project six')}
    </div>
  </div>
</section>
<section class="py-5 py-md-7 bg-light" id="contact">
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-8 col-lg-6">
        <h2 class="fw-bold text-center mb-4">Get in touch</h2>
        <form class="vstack gap-3">
          <div class="row g-3">
            <div class="col-md-6"><input type="text" class="form-control" placeholder="First name"></div>
            <div class="col-md-6"><input type="text" class="form-control" placeholder="Last name"></div>
          </div>
          <input type="email" class="form-control" placeholder="Email">
          <textarea class="form-control" rows="5" placeholder="Your message…"></textarea>
          <button type="submit" class="btn btn-primary btn-lg">Send</button>
        </form>
      </div>
    </div>
  </div>
</section>`

// ─── Text assets written into site/ at creation ──────────────────────────────

function placeholderSvg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="Placeholder — ${label}">
  <rect width="800" height="600" fill="#e9ecef"/>
  <rect x="24" y="24" width="752" height="552" fill="none" stroke="#adb5bd" stroke-width="2"/>
  <text x="400" y="312" font-family="sans-serif" font-size="40" fill="#6c757d" text-anchor="middle">${label}</text>
</svg>
`
}

// Lightbox init — deferred script; no-ops harmlessly if glightbox is removed.
const SITE_JS = `// =============================================================
// PATH: assets/js/site.js  (inside your exported site)
// ROLE: Page-behavior bootstrap for this GrapeStrap starter — initializes
//       GLightbox on every element with the .glightbox class.
// DEPENDS: assets/vendor/glightbox/glightbox.js (loaded before this file)
// CREATED: by the GrapeStrap Portfolio starter
// =============================================================
document.addEventListener('DOMContentLoaded', function () {
  if (typeof GLightbox === 'function') {
    GLightbox({ selector: '.glightbox' })
  }
})
`

export const portfolio = {
  id: 'portfolio',
  label: 'Portfolio',
  templates: [
    {
      name: 'site',
      html: composeBody(REGION_DEFAULT),
      regions: [{ id: 'content', label: 'Page content' }]
    }
  ],
  pages: [
    {
      name: 'index',
      templateName: 'site',
      title: 'Portfolio',
      description: 'A Bootstrap 5 portfolio with a lightbox gallery.',
      body: composeBody(INDEX_CONTENT),
      // Round-trip-safe head extras (page-html.js emits + re-extracts these).
      customLinks: [
        { rel: 'stylesheet', href: 'assets/vendor/glightbox/glightbox.css' }
      ],
      customScripts: [
        { src: 'assets/vendor/glightbox/glightbox.js', defer: true },
        { src: 'assets/js/site.js', defer: true }
      ]
    }
  ],
  assets: {
    'assets/images/work-1.svg': placeholderSvg('Project one'),
    'assets/images/work-2.svg': placeholderSvg('Project two'),
    'assets/images/work-3.svg': placeholderSvg('Project three'),
    'assets/images/work-4.svg': placeholderSvg('Project four'),
    'assets/images/work-5.svg': placeholderSvg('Project five'),
    'assets/images/work-6.svg': placeholderSvg('Project six'),
    'assets/js/site.js': SITE_JS
  },
  vendorDeps: ['glightbox']
}
