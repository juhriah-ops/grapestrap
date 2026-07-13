// =============================================================
// PATH: src/main/starters/blog.js
// ROLE: "Blog" starter — master chrome + TWO composed pages (index list +
//       sample post), proving multi-page starters end-to-end. Navbar/footer
//       harvested from plugins/blocks-sections; the post-list and article
//       markup are hand-authored BS5 (the plugin has no blog sections —
//       flagged in PLAN.md §1 as a deviation from "pure harvest").
// DEPENDS: nothing (imported by src/main/starters/index.js)
// CREATED: 2026-07-12 (Wave 4)
// =============================================================

const CHROME_HEADER = `<header>
  <nav class="navbar navbar-expand-lg bg-body-tertiary">
    <div class="container">
      <a class="navbar-brand" href="index.html">My Blog</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#site-nav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="site-nav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
          <li class="nav-item"><a class="nav-link" href="index.html#about">About</a></li>
        </ul>
      </div>
    </div>
  </nav>
</header>`

const CHROME_FOOTER = `<footer class="py-4 bg-dark text-light">
  <div class="container text-center">
    <p class="text-secondary mb-0">© 2026 My Blog. Powered by plain HTML.</p>
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

const INDEX_CONTENT = `<section class="py-5 bg-light">
  <div class="container">
    <div class="row justify-content-center text-center">
      <div class="col-lg-8">
        <h1 class="display-5 fw-bold mb-2">My Blog</h1>
        <p class="lead mb-0" id="about">Notes on building things for the web.</p>
      </div>
    </div>
  </div>
</section>
<section class="py-5">
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-lg-8">
        <article class="mb-5">
          <h2 class="h3 mb-1"><a href="post.html" class="text-decoration-none">Hello, world</a></h2>
          <p class="text-secondary small mb-2">January 1, 2026 · 3 min read</p>
          <p class="mb-2">Every blog starts somewhere. This first post walks through why this site exists and what to expect here.</p>
          <a href="post.html" class="fw-semibold text-decoration-none">Read more <i class="bi bi-arrow-right"></i></a>
        </article>
        <hr class="my-4">
        <p class="text-secondary">More posts coming soon — duplicate <code>post</code> in the Files panel to add one.</p>
      </div>
    </div>
  </div>
</section>`

const POST_CONTENT = `<article class="py-5">
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-lg-8">
        <p class="mb-2"><a href="index.html" class="text-decoration-none"><i class="bi bi-arrow-left"></i> All posts</a></p>
        <h1 class="fw-bold mb-1">Hello, world</h1>
        <p class="text-secondary mb-4">January 1, 2026 · 3 min read</p>
        <p class="lead">Every blog starts somewhere. This is the somewhere.</p>
        <p>Write your post here. Headings, lists, images from the Asset Manager — everything is plain Bootstrap 5 markup, so whatever you build exports as clean HTML that any host can serve.</p>
        <blockquote class="border-start border-4 border-primary ps-3 my-4 fst-italic">
          The best writing setup is the one that gets out of the way.
        </blockquote>
        <p>The page chrome around this article comes from the <em>site</em> master template — edit the template once and every post updates.</p>
      </div>
    </div>
  </div>
</article>`

export const blog = {
  id: 'blog',
  label: 'Blog',
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
      title: 'My Blog',
      description: 'Notes on building things for the web.',
      body: composeBody(INDEX_CONTENT)
    },
    {
      name: 'post',
      templateName: 'site',
      title: 'Hello, world',
      description: 'The first post.',
      body: composeBody(POST_CONTENT)
    }
  ],
  assets: {},
  vendorDeps: []
}
