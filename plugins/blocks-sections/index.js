/**
 * @grapestrap/blocks-sections
 *
 * 12 pre-built Bootstrap 5 sections. Adapted from Gramateria with hardcoded
 * Cloudinary image URLs replaced with semantic placeholders. Class-first:
 * everything uses Bootstrap utility classes, no inline styles.
 *
 * Sections that need third-party JS (carousel/lightbox) declare dependencies;
 * the host injects locally bundled scripts into the canvas iframe on demand.
 */

export default function register(api) {
  api.log.info('registering section blocks')

  for (const section of SECTIONS) {
    api.registerBlock({
      id: section.id,
      label: section.label,
      category: 'Sections',
      content: section.content,
      attributes: { 'data-gstrap-section': section.id }
    })
    api.registerSection({
      id: section.id,
      label: section.label,
      content: section.content,
      dependencies: section.dependencies || []
    })
  }
}

const SECTIONS = [
  {
    id: 'section-hero',
    label: 'Hero',
    content: `<section class="py-5 py-md-7 bg-light">
  <div class="container">
    <div class="row align-items-center">
      <div class="col-lg-6">
        <h1 class="display-4 fw-bold mb-3">Headline that converts</h1>
        <p class="lead mb-4">A short supporting paragraph that explains the value proposition in plain language.</p>
        <a href="#" class="btn btn-primary btn-lg me-2">Get Started</a>
        <a href="#" class="btn btn-outline-secondary btn-lg">Learn more</a>
      </div>
      <div class="col-lg-6">
        <div class="ratio ratio-16x9 bg-secondary-subtle rounded"></div>
      </div>
    </div>
  </div>
</section>`
  },
  {
    id: 'section-header',
    label: 'Navbar',
    content: `<header>
  <nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container">
      <a class="navbar-brand" href="#">Brand</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="nav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item"><a class="nav-link active" href="#">Home</a></li>
          <li class="nav-item"><a class="nav-link" href="#">Features</a></li>
          <li class="nav-item"><a class="nav-link" href="#">Pricing</a></li>
          <li class="nav-item"><a class="nav-link" href="#">Contact</a></li>
        </ul>
      </div>
    </div>
  </nav>
</header>`
  },
  {
    id: 'section-footer',
    label: 'Footer',
    content: `<footer class="py-5 bg-dark text-light">
  <div class="container">
    <div class="row">
      <div class="col-md-4 mb-4 mb-md-0">
        <h5>Brand</h5>
        <p class="text-secondary">A short company description.</p>
      </div>
      <div class="col-md-2 mb-4 mb-md-0">
        <h6>Product</h6>
        <ul class="list-unstyled">
          <li><a href="#" class="link-light text-decoration-none">Features</a></li>
          <li><a href="#" class="link-light text-decoration-none">Pricing</a></li>
        </ul>
      </div>
      <div class="col-md-2 mb-4 mb-md-0">
        <h6>Company</h6>
        <ul class="list-unstyled">
          <li><a href="#" class="link-light text-decoration-none">About</a></li>
          <li><a href="#" class="link-light text-decoration-none">Contact</a></li>
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
  },
  {
    id: 'section-features',
    label: 'Features grid',
    content: `<section class="py-5 py-md-7">
  <div class="container">
    <div class="text-center mb-5">
      <h2 class="fw-bold mb-2">Why choose us</h2>
      <p class="lead text-secondary">Three reasons our customers stay.</p>
    </div>
    <div class="row g-4">
      <div class="col-md-4">
        <div class="text-center">
          <div class="d-inline-flex align-items-center justify-content-center bg-primary-subtle text-primary rounded-circle mb-3" style="width:64px;height:64px;font-size:24px">★</div>
          <h5>Fast</h5>
          <p class="text-secondary">Built for speed at every layer of the stack.</p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="text-center">
          <div class="d-inline-flex align-items-center justify-content-center bg-success-subtle text-success rounded-circle mb-3" style="width:64px;height:64px;font-size:24px">✓</div>
          <h5>Reliable</h5>
          <p class="text-secondary">99.99% uptime, audited regularly.</p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="text-center">
          <div class="d-inline-flex align-items-center justify-content-center bg-warning-subtle text-warning rounded-circle mb-3" style="width:64px;height:64px;font-size:24px">♥</div>
          <h5>Loved</h5>
          <p class="text-secondary">Thousands of teams already on board.</p>
        </div>
      </div>
    </div>
  </div>
</section>`
  },
  {
    id: 'section-pricing',
    label: 'Pricing',
    content: `<section class="py-5 py-md-7 bg-light">
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
            <a href="#" class="btn btn-outline-primary w-100">Choose Starter</a>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100 border-primary">
          <div class="card-body text-center">
            <h5>Pro</h5>
            <p class="display-6 fw-bold mb-3">$29</p>
            <p class="text-secondary mb-4">For growing teams.</p>
            <a href="#" class="btn btn-primary w-100">Choose Pro</a>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-body text-center">
            <h5>Enterprise</h5>
            <p class="display-6 fw-bold mb-3">Custom</p>
            <p class="text-secondary mb-4">For organizations at scale.</p>
            <a href="#" class="btn btn-outline-primary w-100">Contact sales</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>`
  },
  {
    id: 'section-testimonial',
    label: 'Testimonial',
    content: `<section class="py-5 py-md-7">
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-8 text-center">
        <blockquote class="mb-4 fs-4 fst-italic">
          "GrapeStrap turned our four-day landing-page workflow into a four-hour one. The class-first approach makes the export drop straight into our existing Bootstrap site."
        </blockquote>
        <p class="fw-semibold mb-0">Alex Carter</p>
        <p class="text-secondary">Lead Designer, Acme Co</p>
      </div>
    </div>
  </div>
</section>`
  },
  {
    id: 'section-cta',
    label: 'Call to action',
    content: `<section class="py-5 bg-primary text-white text-center">
  <div class="container">
    <h2 class="fw-bold mb-3">Ready to start?</h2>
    <p class="lead mb-4 text-white-50">Spin up your first project in under five minutes.</p>
    <a href="#" class="btn btn-light btn-lg me-2">Get Started</a>
    <a href="#" class="btn btn-outline-light btn-lg">Read the docs</a>
  </div>
</section>`
  },
  {
    id: 'section-contact',
    label: 'Contact form',
    content: `<section class="py-5 py-md-7">
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
  },
  {
    id: 'section-gallery',
    label: 'Gallery',
    dependencies: ['glightbox'],
    content: `<section class="py-5 py-md-7">
  <div class="container">
    <h2 class="fw-bold text-center mb-5">Gallery</h2>
    <div class="row g-3">
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
      <div class="col-6 col-md-4 col-lg-3"><div class="ratio ratio-1x1 bg-secondary-subtle rounded"></div></div>
    </div>
  </div>
</section>`
  },
  {
    id: 'section-stats',
    label: 'Stats',
    content: `<section class="py-5 bg-light">
  <div class="container">
    <div class="row text-center g-4">
      <div class="col-md-3"><div class="display-4 fw-bold text-primary">10K+</div><div class="text-secondary">Active users</div></div>
      <div class="col-md-3"><div class="display-4 fw-bold text-primary">99.9%</div><div class="text-secondary">Uptime</div></div>
      <div class="col-md-3"><div class="display-4 fw-bold text-primary">200+</div><div class="text-secondary">Integrations</div></div>
      <div class="col-md-3"><div class="display-4 fw-bold text-primary">24/7</div><div class="text-secondary">Support</div></div>
    </div>
  </div>
</section>`
  },
  {
    id: 'section-team',
    label: 'Team',
    content: `<section class="py-5 py-md-7">
  <div class="container">
    <h2 class="fw-bold text-center mb-5">Meet the team</h2>
    <div class="row g-4">
      <div class="col-md-3 text-center">
        <div class="ratio ratio-1x1 bg-secondary-subtle rounded-circle mb-3"></div>
        <h6 class="mb-0">Person Name</h6>
        <small class="text-secondary">Title</small>
      </div>
      <div class="col-md-3 text-center">
        <div class="ratio ratio-1x1 bg-secondary-subtle rounded-circle mb-3"></div>
        <h6 class="mb-0">Person Name</h6>
        <small class="text-secondary">Title</small>
      </div>
      <div class="col-md-3 text-center">
        <div class="ratio ratio-1x1 bg-secondary-subtle rounded-circle mb-3"></div>
        <h6 class="mb-0">Person Name</h6>
        <small class="text-secondary">Title</small>
      </div>
      <div class="col-md-3 text-center">
        <div class="ratio ratio-1x1 bg-secondary-subtle rounded-circle mb-3"></div>
        <h6 class="mb-0">Person Name</h6>
        <small class="text-secondary">Title</small>
      </div>
    </div>
  </div>
</section>`
  },
  {
    id: 'section-faq',
    label: 'FAQ',
    content: `<section class="py-5 py-md-7">
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-8">
        <h2 class="fw-bold text-center mb-5">Frequently asked questions</h2>
        <div class="accordion" id="faq">
          <div class="accordion-item">
            <h2 class="accordion-header"><button class="accordion-button" data-bs-toggle="collapse" data-bs-target="#faq1">First question?</button></h2>
            <div id="faq1" class="accordion-collapse collapse show" data-bs-parent="#faq"><div class="accordion-body">Answer to the first question.</div></div>
          </div>
          <div class="accordion-item">
            <h2 class="accordion-header"><button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq2">Second question?</button></h2>
            <div id="faq2" class="accordion-collapse collapse" data-bs-parent="#faq"><div class="accordion-body">Answer to the second question.</div></div>
          </div>
          <div class="accordion-item">
            <h2 class="accordion-header"><button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq3">Third question?</button></h2>
            <div id="faq3" class="accordion-collapse collapse" data-bs-parent="#faq"><div class="accordion-body">Answer to the third question.</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>`
  }
]
