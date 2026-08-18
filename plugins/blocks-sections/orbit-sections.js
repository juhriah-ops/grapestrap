// =============================================================
// PATH: plugins/blocks-sections/orbit-sections.js
// ROLE: Pure data — the "Orbit" template's page sections, harvested as
//       standalone Library entries. Two exports: CSS_PARTS (marker → rules)
//       and SECTIONS (defs referencing those markers by key). index.js
//       resolves the keys and hands the result to api.registerSection.
// SOURCE: src/main/starters/orbit.js (page bodies) +
//         starters/orbit/assets/css/theme.css (rules)
// HARVESTED: 2026-08-17 (navbar added 2026-08-18)
// DEPENDS: nothing — no imports, no runtime behavior, no DOM.
// CREATED: 2026-08-17
// UPDATED: 2026-08-18 — added orbit-navbar. Page chrome was deliberately
//          excluded from the original harvest; it lands now that the
//          behaviors runtime (assets/behaviors/gstrap-behaviors.js/.css) has
//          somewhere to plug in (`behaviors: true`, data-gs-nav-* attrs).
//
// How the harvest was done, and the rules it followed:
//
//   - Every template class is REWRITTEN here, by hand, into the gs- namespace
//     (`gs-sec` + `gs-orbit-*`). Nothing is transformed at runtime. The point
//     is that a section dropped into a project that was ITSELF started from
//     Orbit cannot collide with the host theme.css — `.hero-banner` there and
//     `.gs-orbit-hero` here are simply different selectors.
//   - Rules live in per-section chunks so a project only carries CSS for the
//     sections it actually inserted. `orbit-base` is the one shared chunk:
//     the accent variable, the Orbit type scale, and the ghost button skin,
//     all of which more than one section needs.
//   - Every accent use goes through `var(--gs-accent)`, defined once on
//     `.gs-orbit`. Retheming an inserted Orbit section is a one-line override
//     in the Custom CSS panel.
//   - `url()` in a chunk is written `../images/<file>`: chunks land in the
//     project's global stylesheet under assets/css/, images under
//     assets/images/ — the same relative pair the starters ship with.
//   - Images referenced by markup OR by a chunk are declared in `assets` with
//     the starter's own filename, so inserting into an Orbit-started project
//     finds the file already there and the copy no-ops.
//   - No inline styles anywhere (house rule), and no `<script>`: the starter's
//     theme picker and nav JS are page-level machinery, not section content.
//
// Deliberate departures from the source pages, all for standalone use:
//   - Cross-page hrefs ("left-sidebar.html") become "#". A bundled section
//     cannot assume the host project has a page by that name.
//   - The hero is a <section>, not the source's <header>: every def here is a
//     page-level band, and insert-section.js keys its sibling placement on
//     exactly that.
//   - Copy that described the starter's own theme-switcher machinery is
//     rewritten — that machinery does not come along with the section.
//   - The 8-item feature grid ships as 4 items (one clean row at the lg
//     breakpoint); the source's extra four were tour filler.
//   - The navbar def is the single <nav> element — Bootstrap's own Collapse
//     component IS the mobile panel here, so unlike Graphite there is no
//     off-canvas sibling to wrap it with. The starter's `<ul class=
//     "theme-picker">` (the seven accent swatches, localStorage, and the
//     data-theme wiring in main.js) is starter machinery and does not ship;
//     the six-entry link list trims to four items plus the Components
//     dropdown, keeping the dropdown's own nested "Layouts" submenu intact so
//     the section still demonstrates the two-level menu. `.dropdown-submenu`
//     becomes the `data-gs-nav-submenu` attribute the shipped behaviors
//     runtime keys on (assets/behaviors/gstrap-behaviors.js/.css); the
//     runtime owns the toggle click and the flyout position, which is why
//     neither survives into this file's CSS chunk.
// =============================================================

/**
 * Rules keyed by chunk marker. A def lists the markers it needs in `cssParts`;
 * index.js resolves them to the `{marker, text}` pairs registerSection wants.
 *
 * Chunk order inside a def matters: 'orbit-base' first, so that where a base
 * rule and a section rule have equal specificity (`.gs-orbit h3` vs
 * `.gs-orbit-feature-item h3`) the section's rule is the later one and wins.
 */
export const CSS_PARTS = {
  // Shared by every Orbit section: palette, type scale, section headings,
  // and the single button skin the template uses.
  'orbit-base': `.gs-orbit {
  --gs-accent: #7c9cd0;
  --gs-orbit-ink: #333131;
  --gs-orbit-body: #888787;
  --gs-orbit-paper: #ffffff;
  --gs-orbit-paper-alt: #f2f1f1;
  font-family: 'Roboto', system-ui, sans-serif;
  font-weight: 300;
  font-size: 1.25rem;
  line-height: 1.75;
  color: var(--gs-orbit-body);
}
.gs-orbit h1,
.gs-orbit h2,
.gs-orbit h3,
.gs-orbit h4,
.gs-orbit h5,
.gs-orbit h6 {
  font-weight: 300;
  color: var(--gs-orbit-ink);
}
.gs-orbit strong,
.gs-orbit b {
  font-weight: 400;
  color: var(--gs-orbit-ink);
}
.gs-orbit a {
  color: var(--gs-accent);
  text-decoration: none;
}
.gs-orbit h1 a,
.gs-orbit h2 a,
.gs-orbit h3 a {
  color: inherit;
}
.gs-orbit-section-header {
  margin-bottom: 2.5em;
  text-align: center;
}
.gs-orbit-section-title {
  font-size: 2.3em;
  font-weight: 300;
}
.gs-orbit-byline {
  display: block;
  padding: 1.2em 0 0.5em 0;
  font-size: 1.3em;
  font-weight: 300;
}
/* Descendant-scoped on purpose: a bare .gs-orbit-btn-ghost would lose the
   color to .gs-orbit a above it (one class + one element beats one class),
   and every ghost button in this template is an anchor. */
.gs-orbit .gs-orbit-btn-ghost {
  display: inline-block;
  padding: 0.5em 2em;
  font-size: 1.2em;
  font-weight: 300;
  color: var(--gs-orbit-ink);
  background-color: transparent;
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 0.3125rem;
  transition: background-color 0.35s ease-in-out, border-color 0.35s ease-in-out, color 0.35s ease-in-out;
}
.gs-orbit .gs-orbit-btn-ghost:hover {
  background-color: var(--gs-orbit-ink);
  border-color: var(--gs-orbit-ink);
  color: #fff;
}
@media (max-width: 1680px) {
  .gs-orbit { font-size: 1.1rem; }
}
@media (max-width: 1280px) {
  .gs-orbit { font-size: 1rem; }
}
@media (max-width: 767.98px) {
  .gs-orbit { font-size: 0.95rem; }
}`,

  // Hero: the photo + gradient overlay is the whole point, so the image is a
  // CSS background here exactly as it is in the source, not an <img>.
  'orbit-hero': `.gs-orbit-hero {
  padding: 10em 0 9em;
  background-color: var(--gs-orbit-ink);
  background-image: linear-gradient(rgba(31, 35, 40, 0.55), rgba(31, 35, 40, 0.55)), url("../images/hero.jpg");
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
}
.gs-orbit-hero .gs-orbit-hero-title {
  font-size: 3.5em;
  font-weight: 100;
  margin-bottom: 0.5em;
  color: #fff;
}
.gs-orbit-hero .gs-orbit-byline {
  font-size: 1.5em;
  font-weight: 100;
  margin-bottom: 1.5em;
}
.gs-orbit-hero .gs-orbit-btn-ghost {
  padding: 0.7em 2em;
  color: #fff;
  border-color: rgba(255, 255, 255, 0.6);
}
.gs-orbit-hero .gs-orbit-btn-ghost:hover {
  background-color: #fff;
  border-color: #fff;
  color: var(--gs-orbit-ink);
}
@media (max-width: 767.98px) {
  .gs-orbit-hero { padding: 3em 0; }
  .gs-orbit-hero .gs-orbit-hero-title { font-size: 2.4em; }
  .gs-orbit-hero .gs-orbit-byline { font-size: 1.2em; }
}`,

  'orbit-intro': `.gs-orbit-intro-band {
  padding: 5em 0 4em;
  background-color: var(--gs-accent);
  color: #fff;
}
.gs-orbit-intro-band .gs-orbit-section-title {
  color: #fff;
}
.gs-orbit-intro-band p {
  font-size: 1.3em;
  font-weight: 100;
  line-height: 1.8;
}
@media (max-width: 767.98px) {
  .gs-orbit-intro-band { padding: 4em 0 3em; }
  .gs-orbit-intro-band p { font-size: 1.1em; }
}`,

  // The ring/circle pair is a two-element frame around one icon; the source
  // sets a lighter border inside the feature grid than on its dark banner, and
  // since the banner is not part of wave 1 the lighter value is inlined here.
  'orbit-feature-grid': `.gs-orbit-feature-grid {
  padding: 5em 0;
  background-color: var(--gs-orbit-paper);
  text-align: center;
}
.gs-orbit-icon-ring {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5em;
  padding: 0.4em;
  border-radius: 50%;
  border: 1px solid #c9c9c9;
}
.gs-orbit-icon-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3em;
  height: 3em;
  border-radius: 50%;
  border: 1px solid #c9c9c9;
  font-size: 1.5em;
  color: var(--gs-accent);
}
.gs-orbit-feature-item h3 {
  padding: 1em 0;
  font-size: 1.3em;
}
@media (max-width: 767.98px) {
  .gs-orbit-feature-grid { padding: 4em 0; }
}`,

  // Circles are pure CSS over square images — the accent shows through until
  // the portrait loads, which is why the avatar carries a background color.
  'orbit-avatar-row': `.gs-orbit-avatar-row {
  padding: 5em 0 4em;
  background-color: var(--gs-orbit-paper-alt);
  text-align: center;
}
.gs-orbit-avatar-list {
  margin: 0 0 2em;
  padding: 2em 0 1.5em;
  list-style: none;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.gs-orbit-avatar {
  display: inline-block;
  width: 160px;
  height: 160px;
  margin: 0 0.5em 1em;
  background-color: var(--gs-accent);
  border-radius: 50%;
  overflow: hidden;
}
.gs-orbit-avatar-row p {
  font-size: 1.3em;
}
@media (max-width: 767.98px) {
  .gs-orbit-avatar-row { padding: 4em 0 3em; }
  .gs-orbit-avatar-row p { font-size: 1.1em; }
}`,

  'orbit-footer': `.gs-orbit-footer {
  padding: 5em 0 4em;
  background-color: var(--gs-orbit-ink);
}
.gs-orbit-footer-header {
  padding-bottom: 2em;
  margin-bottom: 2.5em;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.gs-orbit-footer .gs-orbit-footer-title {
  color: var(--gs-accent);
}
.gs-orbit-footer-link-list {
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: center;
}
.gs-orbit-footer-link-list li {
  border-top: 1px solid #403e3e;
  line-height: 2.5em;
}
.gs-orbit-footer-link-list li:first-child {
  border-top: 0;
}
.gs-orbit-footer-link-list a {
  color: var(--gs-orbit-body);
}
.gs-orbit-footer-link-list a:hover {
  color: #fff;
}
.gs-orbit-footer-social {
  margin: 3em 0 0;
  padding: 2em 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
}
/* Descendant-scoped for the same reason as the ghost button: the icon is an
   anchor, and .gs-orbit a would otherwise paint it accent-on-accent. */
.gs-orbit .gs-orbit-footer-social-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 0 3px;
  background-color: var(--gs-accent);
  border-radius: 50%;
  color: var(--gs-orbit-ink);
  font-size: 1rem;
}
.gs-orbit-footer-copyright {
  display: block;
  padding-top: 1.5em;
  text-align: center;
  font-size: 0.9em;
}`,

  // Shared by all three layout defs: the white page body they sit on and the
  // article type inside them.
  'orbit-layout': `.gs-orbit-page-main {
  background-color: var(--gs-orbit-paper);
}
.gs-orbit-article h3 {
  margin: 1.5em 0;
  font-size: 1.3em;
}`,

  // Rail widgets. Only the two sidebar layouts pull this in — the full-width
  // article has no rail.
  'orbit-sidebar': `.gs-orbit-widget + .gs-orbit-widget {
  margin-top: 4em;
}
.gs-orbit-widget-title {
  font-size: 1.6em;
  margin-bottom: 1em;
}
.gs-orbit-link-list {
  margin: 1em 0 0;
  padding: 0;
  list-style: none;
  text-align: left;
}
.gs-orbit-link-list li {
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  line-height: 2.5em;
}
.gs-orbit-link-list li:first-child {
  border-top: 0;
}
.gs-orbit-link-list a {
  color: var(--gs-orbit-body);
}
.gs-orbit-link-list a:hover {
  text-decoration: underline;
}
.gs-orbit-widget .gs-orbit-btn-ghost {
  margin-top: 1.5em;
}`,

  // The single-element navbar — Bootstrap's own Collapse handles the mobile
  // panel, so there is no off-canvas companion chunk the way Graphite needs
  // one. Everything here was already scoped under `.site-navbar` in the
  // source, so a straight rename to `.gs-orbit-nav` is the whole job — no
  // body-level rules to re-scope. Nested-submenu open/close and flyout
  // position are the behaviors runtime's job (gstrap-behaviors.css); the
  // theme-picker and its seven swatch colors are starter machinery and do
  // not ship with the section.
  'orbit-navbar': `.gs-orbit-nav {
  padding: 1em 1.5em;
  background-color: var(--gs-orbit-ink);
}
.gs-orbit-nav .gs-orbit-navlogo {
  letter-spacing: 1px;
  font-size: 1.25em;
  font-weight: 300;
  color: #fff;
}
.gs-orbit-nav .nav-link {
  margin-left: 0.7em;
  padding: 0.35em 1.2em;
  letter-spacing: 0.06em;
  font-size: 0.8em;
  color: #ccc;
  border-radius: 0.3125rem;
  transition: background-color 0.25s ease-in-out, color 0.25s ease-in-out;
}
.gs-orbit-nav .nav-link:hover,
.gs-orbit-nav .nav-link:focus {
  color: #fff;
}
.gs-orbit-nav .nav-link.active {
  background-color: var(--gs-accent);
  color: #fff;
}
.gs-orbit-nav .dropdown-menu {
  min-width: 13em;
  padding: 0.85em;
  background-color: var(--gs-orbit-ink);
  border: 0;
  border-radius: 0.5rem;
}
.gs-orbit-nav .dropdown-item {
  padding: 1em 0;
  border-top: solid 1px rgba(255, 255, 255, 0.1);
  letter-spacing: 0.05em;
  font-size: 0.8em;
  color: #ccc;
  background-color: transparent;
}
.gs-orbit-nav .dropdown-item:first-child {
  border-top: 0;
}
.gs-orbit-nav .dropdown-item:hover,
.gs-orbit-nav .dropdown-item:focus {
  color: #fff;
  background-color: transparent;
}
@media (max-width: 767.98px) {
  .gs-orbit-nav .navbar-collapse {
    margin-top: 1em;
  }
}`
}

/**
 * The Orbit sections offered in the Library panel, in the order they appear
 * there. Each `preview` is a 22×16 wireframe of the layout, sized by the
 * panel's own CSS and inheriting the row's text color.
 */
export const SECTIONS = [
  {
    id: 'orbit-hero-banner',
    label: 'Hero Banner',
    description: 'Full-bleed photo behind a dark overlay, display heading, one call to action.',
    cssParts: ['orbit-base', 'orbit-hero'],
    assets: [
      { from: 'starters/orbit/assets/images/hero.jpg', to: 'assets/images/hero.jpg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="14" fill="currentColor" opacity="0.15"/><rect x="1" y="1" width="20" height="14"/><path d="M6 6h10M7.5 9h7"/><rect x="8.5" y="11" width="5" height="2.2"/></svg>',
    content: `<section class="gs-sec gs-orbit gs-orbit-hero text-white text-center">
  <div class="container">
    <h2 class="gs-orbit-hero-title">Make an entrance</h2>
    <span class="gs-orbit-byline">A full-bleed photo behind a dark overlay, one display heading, one line of support, and a single call to action.</span>
    <div><a href="#" class="btn gs-orbit-btn-ghost">See What We Do</a></div>
  </div>
</section>`
  },

  {
    id: 'orbit-intro-band',
    label: 'Accent Band',
    description: 'Full-width accent strip for the one sentence that states the point.',
    cssParts: ['orbit-base', 'orbit-intro'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="3" width="20" height="10" fill="currentColor" opacity="0.3"/><rect x="1" y="3" width="20" height="10"/><path d="M6 7h10M8 10h6"/></svg>',
    content: `<section class="gs-sec gs-orbit gs-orbit-intro-band text-center">
  <div class="container">
    <header class="gs-orbit-section-header">
      <h2 class="gs-orbit-section-title">One accent band, one sentence</h2>
    </header>
    <div class="row justify-content-center">
      <div class="col-lg-8">
        <p>This strip exists for the line you would say out loud &mdash; state the point of the page and let people keep scrolling. Its background is the theme accent, so recoloring it recolors every accent on the page at once.</p>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'orbit-feature-grid',
    label: 'Feature Grid',
    description: 'Four ring-framed icons with headings, one row on desktop, stacked on phones.',
    cssParts: ['orbit-base', 'orbit-feature-grid'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><circle cx="3.5" cy="6" r="2"/><circle cx="8.5" cy="6" r="2"/><circle cx="13.5" cy="6" r="2"/><circle cx="18.5" cy="6" r="2"/><path d="M2 11h3M7 11h3M12 11h3M17 11h3M2.2 13h2.6M7.2 13h2.6M12.2 13h2.6M17.2 13h2.6"/></svg>',
    content: `<section class="gs-sec gs-orbit gs-orbit-feature-grid">
  <div class="container">
    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-4 g-4">
      <div class="col gs-orbit-feature-item">
        <span class="gs-orbit-icon-ring"><span class="gs-orbit-icon-circle"><i class="fa-solid fa-image" aria-hidden="true"></i></span></span>
        <h3>Hero Banner</h3>
        <p>Full-bleed photo, dark overlay, display heading &mdash; the opening move of every landing page.</p>
      </div>
      <div class="col gs-orbit-feature-item">
        <span class="gs-orbit-icon-ring"><span class="gs-orbit-icon-circle"><i class="fa-solid fa-table-columns" aria-hidden="true"></i></span></span>
        <h3>Four Layouts</h3>
        <p>Left rail, right rail, both, or none &mdash; every page shares one set of chrome, so layouts mix freely.</p>
      </div>
      <div class="col gs-orbit-feature-item">
        <span class="gs-orbit-icon-ring"><span class="gs-orbit-icon-circle"><i class="fa-solid fa-users" aria-hidden="true"></i></span></span>
        <h3>Avatar Row</h3>
        <p>Circular portraits for teams, authors, or speakers &mdash; faces build trust faster than any paragraph.</p>
      </div>
      <div class="col gs-orbit-feature-item">
        <span class="gs-orbit-icon-ring"><span class="gs-orbit-icon-circle"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span></span>
        <h3>Contact Block</h3>
        <p>The same ready-to-wire form closes every page &mdash; point its action at your handler and it is live.</p>
      </div>
    </div>
    <div class="mt-4">
      <a href="#" class="btn gs-orbit-btn-ghost">See Everything</a>
    </div>
  </div>
</section>`
  },

  {
    id: 'orbit-avatar-row',
    label: 'Avatar Row',
    description: 'Five circular portraits between hairlines, centered, with a caption below.',
    cssParts: ['orbit-base', 'orbit-avatar-row'],
    assets: [
      { from: 'starters/orbit/assets/images/team-01.jpg', to: 'assets/images/team-01.jpg' },
      { from: 'starters/orbit/assets/images/team-02.jpg', to: 'assets/images/team-02.jpg' },
      { from: 'starters/orbit/assets/images/team-03.jpg', to: 'assets/images/team-03.jpg' },
      { from: 'starters/orbit/assets/images/team-04.jpg', to: 'assets/images/team-04.jpg' },
      { from: 'starters/orbit/assets/images/team-05.jpg', to: 'assets/images/team-05.jpg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M1 4h20M1 12h20"/><circle cx="3.4" cy="8" r="2"/><circle cx="7.2" cy="8" r="2"/><circle cx="11" cy="8" r="2"/><circle cx="14.8" cy="8" r="2"/><circle cx="18.6" cy="8" r="2"/></svg>',
    content: `<section class="gs-sec gs-orbit gs-orbit-avatar-row">
  <div class="container">
    <header class="gs-orbit-section-header">
      <h2 class="gs-orbit-section-title">The avatar row</h2>
    </header>
    <ul class="gs-orbit-avatar-list list-unstyled d-flex flex-wrap justify-content-center">
      <li class="gs-orbit-avatar"><a href="#"><img src="assets/images/team-01.jpg" class="w-100 h-100" alt="Sample portrait one" /></a></li>
      <li class="gs-orbit-avatar"><a href="#"><img src="assets/images/team-02.jpg" class="w-100 h-100" alt="Sample portrait two" /></a></li>
      <li class="gs-orbit-avatar"><a href="#"><img src="assets/images/team-03.jpg" class="w-100 h-100" alt="Sample portrait three" /></a></li>
      <li class="gs-orbit-avatar"><a href="#"><img src="assets/images/team-04.jpg" class="w-100 h-100" alt="Sample portrait four" /></a></li>
      <li class="gs-orbit-avatar"><a href="#"><img src="assets/images/team-05.jpg" class="w-100 h-100" alt="Sample portrait five" /></a></li>
    </ul>
    <p>Five portraits, centered, that read as people before they read as design. The circles are pure CSS over plain square images &mdash; drop in 320px squares, update the alt text, and link each face wherever it should go.</p>
  </div>
</section>`
  },

  {
    id: 'orbit-sidebar-layout',
    label: 'Sidebar Layout',
    description: 'Rail plus article on a 4/8 split; the article leads once the columns stack.',
    cssParts: ['orbit-base', 'orbit-layout', 'orbit-sidebar'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="2" width="6" height="12"/><rect x="9" y="2" width="12" height="12"/><path d="M2 5h4M2 7h4M2 9h3M11 5h8M11 7h8M11 9h8M11 11h5"/></svg>',
    content: `<section class="gs-sec gs-orbit gs-orbit-page-main">
  <div class="container py-5">
    <div class="row gy-5">
      <div class="col-md-4 order-2 order-md-1">
        <aside class="gs-orbit-widget">
          <header>
            <h2 class="gs-orbit-widget-title">Good fits for this rail</h2>
          </header>
          <p>The left rail earns its keep when visitors need a map before they need prose.</p>
          <ul class="gs-orbit-link-list">
            <li><a href="#">Documentation &amp; guides</a></li>
            <li><a href="#">Project archives with filters</a></li>
            <li><a href="#">Category-driven blogs</a></li>
            <li><a href="#">Support &amp; FAQ hubs</a></li>
          </ul>
          <a href="#" class="btn gs-orbit-btn-ghost">Browse the Archive</a>
        </aside>
        <aside class="gs-orbit-widget">
          <header>
            <h2 class="gs-orbit-widget-title">Widget ideas</h2>
          </header>
          <p>Anything short and useful can live here &mdash; these are the usual suspects.</p>
          <ul class="gs-orbit-link-list">
            <li><a href="#">Section navigation</a></li>
            <li><a href="#">Recent posts or projects</a></li>
            <li><a href="#">A compact contact card</a></li>
            <li><a href="#">Newsletter signup</a></li>
          </ul>
        </aside>
      </div>
      <div class="col-md-8 order-1 order-md-2">
        <article class="gs-orbit-article">
          <header>
            <h2 class="gs-orbit-section-title">Left Sidebar</h2>
            <span class="gs-orbit-byline">A 4/8 split with the rail leading &mdash; wayfinding first, reading second</span>
          </header>
          <p>A four-column rail and an eight-column reading area on desktop, collapsing to a single stack on phones. The rail is the first thing a desktop visitor scans past and the last thing a mobile visitor reaches &mdash; the order utilities push the article ahead of the rail once the columns stack, so small screens always lead with the content itself.</p>
          <p>Reach for this arrangement when the rail is doing navigation work: documentation with a section tree, a project archive with filters, a blog organized by category. A visitor who arrives from search gets the article immediately; a visitor who is browsing gets the map in the same glance.</p>
          <h3>The rail is furniture, not the room &mdash; it should orient people, never compete with the page they came to read.</h3>
          <p>Keep rail widgets short and scannable: a heading, a sentence of context, a tight list of links, one button. If a widget grows past that, it probably wants to be a page of its own. Swap the two widgets here for your own &mdash; the layout does not care.</p>
        </article>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'orbit-triple-layout',
    label: 'Two-Rail Layout',
    description: 'A 3/6/3 split: wayfinding on the left, what-next on the right, article between.',
    cssParts: ['orbit-base', 'orbit-layout', 'orbit-sidebar'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="2" width="4.5" height="12"/><rect x="7" y="2" width="8" height="12"/><rect x="16.5" y="2" width="4.5" height="12"/><path d="M8 5h6M8 7h6M8 9h4"/></svg>',
    content: `<section class="gs-sec gs-orbit gs-orbit-page-main">
  <div class="container py-5">
    <div class="row gy-5">
      <div class="col-md-3 order-2 order-md-1">
        <aside class="gs-orbit-widget">
          <header>
            <h2 class="gs-orbit-widget-title">Wayfinding</h2>
          </header>
          <ul class="gs-orbit-link-list">
            <li><a href="#">Left Sidebar</a></li>
            <li><a href="#">Right Sidebar</a></li>
            <li><a href="#">Two Sidebar</a></li>
            <li><a href="#">No Sidebar</a></li>
          </ul>
          <a href="#" class="btn gs-orbit-btn-ghost">Start at Home</a>
        </aside>
      </div>
      <div class="col-md-6 order-1 order-md-2">
        <article class="gs-orbit-article">
          <header>
            <h2 class="gs-orbit-section-title">Two Sidebar</h2>
            <span class="gs-orbit-byline">A 3/6/3 split for pages doing two jobs at once</span>
          </header>
          <p>The center column here is six of twelve &mdash; a comfortable reading measure &mdash; flanked by a three-column rail on each side. On phones everything stacks with the article first, then the left rail, then the right, so the mobile page reads top-to-bottom in order of importance.</p>
          <p>Two rails make sense when navigation and action both matter on the same page: a documentation portal with a section tree on one side and download links on the other, a magazine hub with categories and a subscribe box.</p>
          <h3>Give each rail one job. The moment both rails do a bit of everything, readers stop trusting either.</h3>
          <p>The trade-off is width: at the md breakpoint each rail is only a few words wide, so keep widget titles short and lists tighter than you would on a 4/8 page. If a rail keeps wanting more room, that is the layout telling you it should be the only rail.</p>
        </article>
      </div>
      <div class="col-md-3 order-3">
        <aside class="gs-orbit-widget">
          <header>
            <h2 class="gs-orbit-widget-title">What next</h2>
          </header>
          <ul class="gs-orbit-link-list">
            <li><a href="#">See the hero banner</a></li>
            <li><a href="#">Browse the feature grid</a></li>
            <li><a href="#">Meet the avatar row</a></li>
          </ul>
          <a href="#" class="btn gs-orbit-btn-ghost">Get in Touch</a>
        </aside>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'orbit-article',
    label: 'Full-Width Article',
    description: 'One centered ten-column reading area, no rails &mdash; long-form and landing copy.',
    cssParts: ['orbit-base', 'orbit-layout'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="2" width="16" height="12"/><path d="M4.5 5h13M4.5 7h13M4.5 9h13M4.5 11h8"/></svg>',
    content: `<section class="gs-sec gs-orbit gs-orbit-page-main">
  <div class="container py-5">
    <div class="row justify-content-center">
      <div class="col-lg-10">
        <article class="gs-orbit-article">
          <header>
            <h2 class="gs-orbit-section-title">No Sidebar</h2>
            <span class="gs-orbit-byline">One column, full measure &mdash; for pages that need room to breathe</span>
          </header>
          <p>With both rails gone the article takes the full container width &mdash; here softened to a centered ten-column reading area so long lines stay comfortable. This is the layout for pages where nothing should compete with the content: landing pages, long-form writing, legal text, and detail pages.</p>
          <p>Full width does not mean full-width paragraphs. Long lines tire readers; if you are setting a lot of continuous text, keep the centered column and let images, galleries, and tables break out to the container edge when they need it. The layout gives you the room &mdash; spend it on the elements that benefit.</p>
          <h3>Whitespace is the sidebar now. Let it do the framing the rails used to do.</h3>
          <p>Mixing layouts across a site is the point: a full-width landing page, articles with a right rail, documentation with a left one, and a two-rail hub &mdash; all sharing the same chrome, so navigation feels seamless while each page gets the arrangement its content wants.</p>
        </article>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'orbit-footer',
    label: 'Footer',
    description: 'Five link columns under a centered brand rule, with social circles and copyright.',
    cssParts: ['orbit-base', 'orbit-footer'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="14" fill="currentColor" opacity="0.15"/><rect x="1" y="1" width="20" height="14"/><path d="M7 3.5h8M3 6h2.5M7 6h2.5M11 6h2.5M15 6h2.5M3 8h2.5M7 8h2.5M11 8h2.5M15 8h2.5"/><circle cx="9" cy="12" r="1.1"/><circle cx="13" cy="12" r="1.1"/></svg>',
    content: `<footer class="gs-sec gs-orbit gs-orbit-footer">
  <div class="container">
    <header class="gs-orbit-footer-header">
      <h2 class="gs-orbit-footer-title">Orbit</h2>
    </header>
    <div class="row row-cols-2 row-cols-md-5 g-4 text-center">
      <div class="col">
        <ul class="gs-orbit-footer-link-list">
          <li><a href="#">Left Sidebar</a></li>
          <li><a href="#">Right Sidebar</a></li>
          <li><a href="#">Two Sidebar</a></li>
          <li><a href="#">No Sidebar</a></li>
        </ul>
      </div>
      <div class="col">
        <ul class="gs-orbit-footer-link-list">
          <li><a href="#">Hero Banner</a></li>
          <li><a href="#">Feature Grid</a></li>
          <li><a href="#">Avatar Row</a></li>
          <li><a href="#">Accent Band</a></li>
        </ul>
      </div>
      <div class="col">
        <ul class="gs-orbit-footer-link-list">
          <li><a href="#">Home</a></li>
          <li><a href="#">Layout Tour</a></li>
          <li><a href="#">Say Hello</a></li>
          <li><a href="#">Back to Top</a></li>
        </ul>
      </div>
      <div class="col">
        <ul class="gs-orbit-footer-link-list">
          <li><a href="#">Bootstrap 5.3</a></li>
          <li><a href="#">Font Awesome 7</a></li>
          <li><a href="#">Vendored Roboto</a></li>
          <li><a href="#">Zero jQuery</a></li>
        </ul>
      </div>
      <div class="col">
        <ul class="gs-orbit-footer-link-list">
          <li><a href="#">Swap the images</a></li>
          <li><a href="#">Recolor the accent</a></li>
          <li><a href="#">Rewrite the copy</a></li>
          <li><a href="#">Ship it</a></li>
        </ul>
      </div>
    </div>
    <ul class="gs-orbit-footer-social list-inline mb-0">
      <li class="list-inline-item"><a href="#" class="gs-orbit-footer-social-icon"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
      <li class="list-inline-item"><a href="#" class="gs-orbit-footer-social-icon"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
      <li class="list-inline-item"><a href="#" class="gs-orbit-footer-social-icon"><i class="fa-brands fa-instagram" aria-hidden="true"></i><span class="visually-hidden">Instagram</span></a></li>
    </ul>
    <div class="gs-orbit-footer-copyright">&copy; Orbit. All rights reserved.</div>
  </div>
</footer>`
  },

  {
    id: 'orbit-navbar',
    label: 'Navbar',
    description: 'Top nav with a Components dropdown (nested Layouts submenu), collapsing to the built-in Bootstrap mobile panel.',
    cssParts: ['orbit-base', 'orbit-navbar'],
    behaviors: true,
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="3.6" fill="currentColor" opacity="0.85"/><path d="M2.4 2.8h3" stroke-opacity="0.5"/><path d="M9.5 2.8h2M13 2.8h2" stroke-opacity="0.5"/><path d="M18 2h2M18 2.8h2M18 3.6h2" stroke-opacity="0.5"/></svg>',
    content: `<nav class="gs-sec gs-orbit gs-orbit-navbar navbar navbar-expand-md gs-orbit-nav" data-gs-nav-autoclose="collapse">
  <div class="container-fluid">
    <a class="navbar-brand gs-orbit-navlogo" href="#">Orbit</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div id="nav-links" class="collapse navbar-collapse justify-content-end">
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link active" href="#" aria-current="page">Home</a></li>
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" href="#" id="navDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">Components</a>
          <ul class="dropdown-menu" aria-labelledby="navDropdown">
            <li><a class="dropdown-item" href="#">Hero Banner</a></li>
            <li><a class="dropdown-item" href="#">Accent Band</a></li>
            <li><a class="dropdown-item" href="#">Feature Grid</a></li>
            <li data-gs-nav-submenu>
              <a class="dropdown-item dropdown-toggle" href="#" id="navDropdownSubmenu" role="button" aria-expanded="false">Layouts</a>
              <ul class="dropdown-menu" aria-labelledby="navDropdownSubmenu">
                <li><a class="dropdown-item" href="#">Left Sidebar</a></li>
                <li><a class="dropdown-item" href="#">Right Sidebar</a></li>
                <li><a class="dropdown-item" href="#">Two Sidebar</a></li>
                <li><a class="dropdown-item" href="#">No Sidebar</a></li>
              </ul>
            </li>
          </ul>
        </li>
        <li class="nav-item"><a class="nav-link" href="#">Left Sidebar</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Contact</a></li>
      </ul>
    </div>
  </div>
</nav>`
  }
]
