// =============================================================
// PATH: src/main/starters/landing.js
// ROLE: "Landing Page" starter — pure data (master chrome + one composed
//       page + no vendor deps). Content harvested from
//       plugins/blocks-sections (hero/features/pricing/cta/contact/
//       navbar/footer) with the features-grid inline-style icon circles
//       replaced by Bootstrap Icons + utility classes (house rule: no
//       inline styles). All markup BS5 utility classes only.
// DEPENDS: nothing (imported by src/main/starters/index.js)
// CREATED: 2026-07-12 (Wave 4)
// =============================================================

// ─── Master chrome (shared by the template AND every composed page) ─────────
// Authored once so page chrome is character-identical to template chrome:
// the first propagation after a template edit then diffs only real changes.

const CHROME_HEADER = `<header>
  <nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container">
      <a class="navbar-brand" href="index.html">Brand</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#site-nav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="site-nav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item"><a class="nav-link active" href="index.html">Home</a></li>
          <li class="nav-item"><a class="nav-link" href="#features">Features</a></li>
          <li class="nav-item"><a class="nav-link" href="#pricing">Pricing</a></li>
          <li class="nav-item"><a class="nav-link" href="#contact">Contact</a></li>
        </ul>
      </div>
    </div>
  </nav>
</header>`

const CHROME_FOOTER = `<footer class="py-5 bg-dark text-light">
  <div class="container">
    <div class="row">
      <div class="col-md-4 mb-4 mb-md-0">
        <h5>Brand</h5>
        <p class="text-secondary">A short company description.</p>
      </div>
      <div class="col-md-2 mb-4 mb-md-0">
        <h6>Product</h6>
        <ul class="list-unstyled">
          <li><a href="#features" class="link-light text-decoration-none">Features</a></li>
          <li><a href="#pricing" class="link-light text-decoration-none">Pricing</a></li>
        </ul>
      </div>
      <div class="col-md-2 mb-4 mb-md-0">
        <h6>Company</h6>
        <ul class="list-unstyled">
          <li><a href="#" class="link-light text-decoration-none">About</a></li>
          <li><a href="#contact" class="link-light text-decoration-none">Contact</a></li>
        </ul>
      </div>
      <div class="col-md-4">
        <h6>Subscribe</h6>
        <form class="d-flex gap-2">
          <input type="email" class="form-control" placeholder="you@example.com">
          <button class="btn btn-primary" type="submit">Join</button>
        </form>
      </div>
    </div>
    <hr class="border-secondary my-4">
    <p class="text-secondary mb-0">© 2026 Brand. All rights reserved.</p>
  </div>
</footer>`

// Template default for the region — what a NEW page created from this master
// starts with (v4 §14: template defaults fill empty regions).
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

// ─── index page region content (harvested sections) ─────────────────────────

const INDEX_CONTENT = `<section class="py-5 py-md-7 bg-light">
  <div class="container">
    <div class="row align-items-center">
      <div class="col-lg-6">
        <h1 class="display-4 fw-bold mb-3">Headline that converts</h1>
        <p class="lead mb-4">A short supporting paragraph that explains the value proposition in plain language.</p>
        <a href="#pricing" class="btn btn-primary btn-lg me-2">Get Started</a>
        <a href="#features" class="btn btn-outline-secondary btn-lg">Learn more</a>
      </div>
      <div class="col-lg-6">
        <div class="ratio ratio-16x9 bg-secondary-subtle rounded"></div>
      </div>
    </div>
  </div>
</section>
<section class="py-5 py-md-7" id="features">
  <div class="container">
    <div class="text-center mb-5">
      <h2 class="fw-bold mb-2">Why choose us</h2>
      <p class="lead text-secondary">Three reasons our customers stay.</p>
    </div>
    <div class="row g-4">
      <div class="col-md-4">
        <div class="text-center">
          <span class="d-inline-flex align-items-center justify-content-center bg-primary-subtle text-primary rounded-circle p-3 fs-3 mb-3"><i class="bi bi-lightning-charge"></i></span>
          <h5>Fast</h5>
          <p class="text-secondary">Built for speed at every layer of the stack.</p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="text-center">
          <span class="d-inline-flex align-items-center justify-content-center bg-success-subtle text-success rounded-circle p-3 fs-3 mb-3"><i class="bi bi-shield-check"></i></span>
          <h5>Reliable</h5>
          <p class="text-secondary">99.99% uptime, audited regularly.</p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="text-center">
          <span class="d-inline-flex align-items-center justify-content-center bg-warning-subtle text-warning rounded-circle p-3 fs-3 mb-3"><i class="bi bi-heart"></i></span>
          <h5>Loved</h5>
          <p class="text-secondary">Thousands of teams already on board.</p>
        </div>
      </div>
    </div>
  </div>
</section>
<section class="py-5 py-md-7 bg-light" id="pricing">
  <div class="container">
    <div class="text-center mb-5">
      <h2 class="fw-bold mb-2">Simple pricing</h2>
      <p class="lead text-secondary">No hidden fees, cancel anytime.</p>
    </div>
    <div class="row g-4 justify-content-center">
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-body text-center">
            <h5>Starter</h5>
            <p class="display-6 fw-bold mb-3">$0</p>
            <p class="text-secondary mb-4">For individuals just getting started.</p>
            <a href="#contact" class="btn btn-outline-primary w-100">Choose Starter</a>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100 border-primary">
          <div class="card-body text-center">
            <h5>Pro</h5>
            <p class="display-6 fw-bold mb-3">$29</p>
            <p class="text-secondary mb-4">For growing teams.</p>
            <a href="#contact" class="btn btn-primary w-100">Choose Pro</a>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-body text-center">
            <h5>Enterprise</h5>
            <p class="display-6 fw-bold mb-3">Custom</p>
            <p class="text-secondary mb-4">For organizations at scale.</p>
            <a href="#contact" class="btn btn-outline-primary w-100">Contact sales</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<section class="py-5 bg-primary text-white text-center">
  <div class="container">
    <h2 class="fw-bold mb-3">Ready to start?</h2>
    <p class="lead mb-4 text-white-50">Spin up your first project in under five minutes.</p>
    <a href="#contact" class="btn btn-light btn-lg me-2">Get Started</a>
    <a href="#features" class="btn btn-outline-light btn-lg">Learn more</a>
  </div>
</section>
<section class="py-5 py-md-7" id="contact">
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

// ─── Starter definition ──────────────────────────────────────────────────────

export const landing = {
  id: 'landing',
  label: 'Landing Page',
  templates: [
    {
      name: 'site',
      html: composeBody(REGION_DEFAULT),
      // Authored statically — must match the data-grpstr-region els above.
      // (Main never parses HTML; the spec pins the consistency.)
      regions: [{ id: 'content', label: 'Page content' }]
    }
  ],
  pages: [
    {
      name: 'index',
      templateName: 'site',
      title: 'Home',
      description: 'A one-page Bootstrap 5 landing site.',
      body: composeBody(INDEX_CONTENT)
    }
  ],
  assets: {},
  vendorDeps: []
}
