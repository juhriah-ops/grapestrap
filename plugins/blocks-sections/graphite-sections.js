// =============================================================
// PATH: plugins/blocks-sections/graphite-sections.js
// ROLE: Pure data — the "Graphite" template's page sections, harvested as
//       standalone Library entries. Two exports: CSS_PARTS (marker → rules)
//       and SECTIONS (defs referencing those markers by key). index.js
//       resolves the keys and hands the result to api.registerSection.
// SOURCE: src/main/starters/graphite.js (page bodies) +
//         starters/graphite/assets/css/theme.css (rules)
// HARVESTED: 2026-08-17 (navbar added 2026-08-18)
// DEPENDS: nothing — no imports, no runtime behavior, no DOM.
// CREATED: 2026-08-17
// UPDATED: 2026-08-18 — added graphite-navbar. Page chrome was deliberately
//          excluded from the original harvest; it lands now that the
//          behaviors runtime (assets/behaviors/gstrap-behaviors.js/.css) has
//          somewhere to plug in (`behaviors: true`, data-gs-nav-* attrs).
//
// Same harvest rules as orbit-sections.js (read that header first — the
// namespace, chunk, var(--gs-accent), url("../images/…") and asset-declaration
// rules are identical). What is specific to Graphite:
//
//   - `.section-inner` (the template's own 90%/90em rhythm wrapper) becomes
//     Bootstrap's `.container` everywhere. It is the one structural conversion
//     in this file: two rules of custom CSS replaced by a class the host
//     project already ships, and the visual difference is a slightly narrower
//     measure on very wide screens.
//   - The post grid is rebuilt on Bootstrap cards. The source hand-rolled
//     equal-height columns with a flex `.post-card`; here it is
//     `row-cols-1 row-cols-md-2 row-cols-lg-3 g-4` + `card h-100` +
//     `card-body d-flex flex-column` + `mt-auto` on the button, so the CSS
//     chunk carries nothing but the card SKIN (square corners, hairline
//     border, the roomier 2em padding). Three cards instead of the source's
//     six: one full row at the lg breakpoint, and duplicating a column is a
//     single canvas gesture.
//   - Graphite has one monochrome palette, so `--gs-accent` is its ink (#444)
//     rather than a color. Everything that used `--ink` reads the accent, so
//     one override still rethemes the whole family.
//   - The hero carousel drops the source's negative top margin: that pulled
//     the slider under a fixed overlay navbar, which is page chrome a bundled
//     section has no business assuming.
//   - The carousel is a <section> carrying Bootstrap's own carousel classes,
//     not the source's <div> — every def here is a page-level band, and
//     insert-section.js keys its sibling placement on exactly that.
//   - The navbar def is rooted on a <header> wrapping BOTH the <nav> and its
//     off-canvas mobile mirror — neither works without the other, and the
//     wrapper is what keeps them one page band for insert-section.js's
//     sibling-placement rule. `fixed-top`/`is-overlay`/`data-nav-overlay` are
//     starter chrome (they assume a body padding-top and a hero band directly
//     underneath) and are stripped; the def's description names the in-app
//     recipe for the same "floats over a hero" look. `.dropdown-submenu`
//     becomes the `data-gs-nav-submenu` attribute the shipped behaviors
//     runtime keys on (assets/behaviors/gstrap-behaviors.js/.css) — the
//     runtime owns the toggle click, the flyout position, and the mobile
//     fallback, so none of that machinery is in this file's CSS chunk. Two
//     rule groups were body-level in the source theme.css (not nested under
//     `.site-navbar`): the submenu chevron and the whole off-canvas panel.
//     Both are re-scoped under `.gs-graphite-navbar` here so they cannot
//     paint an unrelated `.dropdown-item` elsewhere on the page.
// =============================================================

/**
 * Rules keyed by chunk marker. A def lists the markers it needs in `cssParts`;
 * index.js resolves them to the `{marker, text}` pairs registerSection wants.
 *
 * Chunk order inside a def matters: 'graphite-base' first, so that where a
 * base rule and a section rule have equal specificity the section's rule is
 * the later one and wins.
 */
export const CSS_PARTS = {
  // Shared by every Graphite section: palette, the Raleway/Open Sans type
  // scale with its underlined headings, the band rhythm, the two button skins,
  // and the hexagon icon badge (used by both the feature row and the reach
  // list, which is why it is here and not in either section's own chunk).
  'graphite-base': `.gs-graphite {
  --gs-accent: #444444;
  --gs-graphite-ink-light: #bbbbbb;
  --gs-graphite-paper: #ffffff;
  --gs-graphite-paper-alt: #f6f6f6;
  --gs-graphite-border: #e6e6e6;
  --gs-graphite-border-bg: #f6f6f6;
  --gs-graphite-on-dark: #ffffff;
  --gs-graphite-element-margin: 2em;
  background: var(--gs-graphite-paper);
  color: var(--gs-accent);
  font-family: 'Open Sans', Helvetica, sans-serif;
  font-weight: 400;
  font-size: 1.05rem;
  line-height: 1.7;
}
.gs-graphite a {
  color: var(--gs-accent);
  text-decoration: none;
  border-bottom: dotted 1px currentColor;
  transition: border-color 0.2s ease-in-out;
}
.gs-graphite a:hover {
  border-bottom-color: transparent;
}
.gs-graphite .btn,
.gs-graphite .gs-graphite-footer-link,
.gs-graphite .gs-graphite-hero-caption a {
  border-bottom: 0;
}
.gs-graphite strong,
.gs-graphite b {
  font-weight: 600;
}
.gs-graphite p {
  margin: 0 0 var(--gs-graphite-element-margin) 0;
}
.gs-graphite h1,
.gs-graphite h2,
.gs-graphite h3,
.gs-graphite h4,
.gs-graphite h5,
.gs-graphite h6 {
  font-family: 'Raleway', Helvetica, sans-serif;
  font-weight: 700;
  line-height: 1.3;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0 0 1em 0;
  padding-bottom: 0.85em;
  position: relative;
  color: var(--gs-accent);
}
.gs-graphite h1::after,
.gs-graphite h2::after,
.gs-graphite h3::after,
.gs-graphite h4::after,
.gs-graphite h5::after,
.gs-graphite h6::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 3rem;
  border-bottom: solid 1px currentColor;
}
.gs-graphite h1 a,
.gs-graphite h2 a,
.gs-graphite h3 a {
  color: inherit;
  border-bottom: 0;
}
.gs-graphite h1 { font-size: 2em; }
.gs-graphite h2 { font-size: 1.65em; }
.gs-graphite h3 { font-size: 1.2em; }
.gs-graphite h4 { font-size: 1.1em; }
.gs-graphite h5 { font-size: 0.95em; }
.gs-graphite h6 { font-size: 0.8em; }
.gs-graphite-band {
  padding: 4em 0;
  border-top: solid 1px var(--gs-graphite-border);
}
.gs-graphite-band-lg {
  padding: 6em 0;
}
.gs-graphite-band-alt {
  background: var(--gs-graphite-paper-alt);
  border-top: 0;
}
.gs-graphite-title {
  margin-bottom: 2.5em;
}
.gs-graphite-title p {
  margin-bottom: 0;
}
.gs-graphite-icon-badge {
  --gs-graphite-badge-size: 4em;
  width: var(--gs-graphite-badge-size);
  aspect-ratio: 0.9;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: var(--gs-accent);
  color: var(--gs-graphite-paper);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin: 0 0 1.25em 0;
}
/* Descendant-scoped, and deliberately AFTER the .gs-graphite .btn rule above:
   these buttons are often anchors, so they have to outrank both .gs-graphite a
   (which would recolor them) and that border-bottom reset (which would eat the
   outline button's bottom edge). */
.gs-graphite .gs-graphite-btn-accent,
.gs-graphite .gs-graphite-btn-outline {
  border-radius: 0;
  font-family: 'Raleway', Helvetica, sans-serif;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.85em 1.75em;
}
.gs-graphite .gs-graphite-btn-accent {
  background: var(--gs-accent);
  border: 0;
  color: var(--gs-graphite-on-dark);
}
.gs-graphite .gs-graphite-btn-accent:hover,
.gs-graphite .gs-graphite-btn-accent:focus {
  background: #575757;
  color: var(--gs-graphite-on-dark);
}
.gs-graphite .gs-graphite-btn-outline {
  background: transparent;
  border: solid 1px var(--gs-accent);
  color: var(--gs-accent);
}
.gs-graphite .gs-graphite-btn-outline:hover,
.gs-graphite .gs-graphite-btn-outline:focus {
  background: var(--gs-graphite-border-bg);
  color: var(--gs-accent);
}
.gs-graphite-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75em;
  list-style: none;
  margin: 0 0 1.5em 0;
  padding: 0;
}
@media (max-width: 991.98px) {
  .gs-graphite-band { padding: 3em 0; }
  .gs-graphite-band-lg { padding: 4em 0; }
}
@media (max-width: 767.98px) {
  .gs-graphite { font-size: 1rem; }
  .gs-graphite-band { padding: 2.5em 0; }
  .gs-graphite-band-lg { padding: 2.5em 0; }
}`,

  // Slides are CSS backgrounds so the fixed-attachment parallax and the dark
  // scrim over them stay one layer apart from the caption.
  'graphite-hero-carousel': `.gs-graphite-hero-carousel {
  min-height: 30em;
  height: 70vh;
}
.gs-graphite-hero-carousel .carousel-item {
  min-height: 30em;
  height: 70vh;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: cover;
  background-attachment: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.gs-graphite-hero-carousel .carousel-item::before {
  content: '';
  position: absolute;
  inset: 0;
  background: #000511;
  opacity: 0.35;
}
.gs-graphite-hero-slide-first { background-image: url("../images/slide01.jpg"); }
.gs-graphite-hero-slide-second { background-image: url("../images/slide02.jpg"); }
.gs-graphite-hero-slide-third { background-image: url("../images/slide03.jpg"); }
.gs-graphite-hero-caption {
  position: relative;
  z-index: 1;
  color: var(--gs-graphite-on-dark);
}
.gs-graphite-hero-caption h2 {
  color: var(--gs-graphite-on-dark);
  font-size: 2.5em;
  margin: 0;
}
.gs-graphite-hero-caption h2::after {
  left: 50%;
  transform: translateX(-50%);
}
.gs-graphite-hero-carousel .carousel-indicators {
  bottom: 1.5em;
}
.gs-graphite-hero-carousel .carousel-indicators [data-bs-target] {
  width: 0.8em;
  height: 0.8em;
  border-radius: 50%;
  border: 0;
  background-color: rgba(255, 255, 255, 0.35);
  opacity: 1;
}
.gs-graphite-hero-carousel .carousel-indicators .active {
  background-color: var(--gs-graphite-on-dark);
}
/* Fixed backgrounds jank on touch devices — fall back to scroll. */
@media (hover: none), (max-width: 767.98px) {
  .gs-graphite-hero-carousel .carousel-item { background-attachment: scroll; }
}
@media (max-width: 991.98px) {
  .gs-graphite-hero-carousel,
  .gs-graphite-hero-carousel .carousel-item {
    min-height: 26em;
    height: 60vh;
  }
  .gs-graphite-hero-caption h2 { font-size: 1.85em; }
}
@media (max-width: 575.98px) {
  .gs-graphite-hero-carousel,
  .gs-graphite-hero-carousel .carousel-item { min-height: 22em; }
  .gs-graphite-hero-caption h2 { font-size: 1.5em; }
}`,

  'graphite-spotlight': `.gs-graphite-spotlight-image img {
  width: 100%;
  display: block;
}`,

  // Hairline dividers between the columns, turning into rules above each
  // column once they stack.
  'graphite-features': `.gs-graphite-features > .col {
  position: relative;
}
.gs-graphite-features > .col:not(:first-child) {
  border-left: solid 1px var(--gs-graphite-border);
}
@media (max-width: 767.98px) {
  .gs-graphite-features > .col:not(:first-child) {
    border-left: 0;
    border-top: solid 1px var(--gs-graphite-border);
    padding-top: 2.5em;
    margin-top: 2.5em;
  }
}`,

  // Card SKIN only — Bootstrap's own card/h-100/mt-auto do the equal-height
  // and bottom-aligned-button work the source hand-rolled.
  'graphite-post-card': `.gs-graphite-post-card {
  background: var(--gs-graphite-paper);
  border: solid 1px var(--gs-graphite-border);
  border-radius: 0;
}
.gs-graphite-post-card .card-img-top {
  border-radius: 0;
}
.gs-graphite-post-card .card-body {
  padding: 2em;
}`,

  // Two-up list of contact methods, each with a small badge floated into the
  // left gutter. The badge inherits the hexagon from graphite-base.
  'graphite-reach-list': `.gs-graphite-reach-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
}
.gs-graphite-reach-item {
  width: 50%;
  position: relative;
  padding: 0 0 0 3.75em;
  margin-top: var(--gs-graphite-element-margin);
}
.gs-graphite-reach-item:nth-child(-n + 2) {
  margin-top: 0;
}
.gs-graphite-reach-item h3 {
  font-size: 1em;
  margin-bottom: 0.35em;
  padding-bottom: 0;
}
.gs-graphite-reach-item h3::after {
  display: none;
}
.gs-graphite-reach-item p {
  margin-bottom: 0;
}
.gs-graphite-icon-badge-sm {
  --gs-graphite-badge-size: 2.75em;
  font-size: 1rem;
  margin: 0;
  position: absolute;
  left: 0;
  top: 0.2em;
}
@media (max-width: 575.98px) {
  .gs-graphite-reach-item { width: 100%; }
  .gs-graphite-reach-item:nth-child(2) { margin-top: var(--gs-graphite-element-margin); }
}`,

  'graphite-footer': `.gs-graphite-footer {
  padding: 2.5em 0;
}
.gs-graphite-footer-copyright {
  color: var(--gs-graphite-ink-light);
  font-size: 0.9em;
  margin: 0;
}
.gs-graphite-footer-menu {
  list-style: none;
  display: flex;
  gap: 1.5em;
  margin: 0;
  padding: 0;
  font-size: 0.9em;
}
/* Descendant-scoped: these are anchors, and .gs-graphite a would otherwise
   pull them back to full ink instead of the footer's lighter grey. */
.gs-graphite .gs-graphite-footer-link {
  color: var(--gs-graphite-ink-light);
}
.gs-graphite .gs-graphite-footer-link:hover {
  color: var(--gs-accent);
}
@media (max-width: 991.98px) {
  .gs-graphite-footer .container {
    text-align: center;
    flex-direction: column;
    gap: 1em;
  }
  .gs-graphite-footer-menu { justify-content: center; }
}`,

  // Square, flat form fields — the only thing Graphite changes about
  // Bootstrap's form controls.
  'graphite-form': `.gs-graphite-form .form-control,
.gs-graphite-form .form-select {
  border-color: var(--gs-graphite-border);
  background: var(--gs-graphite-border-bg);
  border-radius: 0;
  color: var(--gs-accent);
}
.gs-graphite-form .form-control:focus,
.gs-graphite-form .form-select:focus {
  border-color: var(--gs-accent);
  box-shadow: 0 0 0 0.2rem rgba(68, 68, 68, 0.15);
}
.gs-graphite-form .form-check-input {
  border-radius: 0;
}
.gs-graphite-form .form-check-input:checked {
  background-color: var(--gs-accent);
  border-color: var(--gs-accent);
}
.gs-graphite-form .form-check-input:focus {
  border-color: var(--gs-accent);
  box-shadow: 0 0 0 0.2rem rgba(68, 68, 68, 0.15);
}`,

  // Root nav bar + its off-canvas mobile mirror. Harvested in-flow (no
  // fixed-top/is-overlay): the source's overlay skin depends on a body
  // padding-top and a hero band directly underneath it, which is page chrome
  // a bundled section has no business assuming. Recreate the "floats over a
  // hero" look with `sticky-top` (Style Manager's Position group) plus
  // `data-gs-nav-scroll="solid"` from the Navbar sub-panel instead — that
  // swaps in this same solid skin once the page scrolls past the hero, with
  // no CSS here to carry for it.
  'graphite-navbar': `.gs-graphite-nav {
  --gs-graphite-navbar-height: 3.5em;
  min-height: var(--gs-graphite-navbar-height);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 0 0.15em 0 rgba(0, 0, 0, 0.2);
  transition: background-color 0.3s ease, box-shadow 0.3s ease, min-height 0.3s ease;
}
/* graphite-base's ".gs-graphite a" gives every anchor a dotted underline —
   right for inline text links, wrong for anchors that are really UI controls.
   The source resets that list (.navbar-brand, .nav-link, .dropdown-item,
   .nav-panel-link among others) at the site root; graphite-base predates this
   section and only carries the subset OTHER sections needed, so the navbar
   ones are reset here instead of widening a shared chunk for one section. */
.gs-graphite-nav .gs-graphite-navlogo,
.gs-graphite-nav .nav-link,
.gs-graphite-nav .dropdown-item,
.gs-graphite-navbar .gs-graphite-navpanel-link {
  border-bottom: 0;
}
.gs-graphite-nav .gs-graphite-navlogo {
  font-family: 'Raleway', Helvetica, sans-serif;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--gs-accent);
}
.gs-graphite-nav .nav-link {
  font-family: 'Raleway', Helvetica, sans-serif;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--gs-accent);
  padding: 0.5em 0.9em;
}
.gs-graphite-nav .nav-link:hover,
.gs-graphite-nav .nav-link.active {
  color: var(--gs-accent);
  box-shadow: inset 0 -2px 0 0 var(--gs-accent);
}
.gs-graphite-nav .gs-graphite-navcta {
  background: var(--gs-accent);
  color: var(--gs-graphite-on-dark);
  border-radius: 0;
  padding: 0.5em 1.25em;
  margin-left: 0.5em;
}
.gs-graphite-nav .gs-graphite-navcta:hover {
  background: #575757;
  box-shadow: none;
}
/* Desktop nav row: plain flex row — mobile uses the off-canvas panel instead
   of Bootstrap's Collapse component, so this never collapses. */
.gs-graphite-nav .gs-graphite-navlinks {
  display: none;
}
@media (min-width: 768px) {
  .gs-graphite-nav .gs-graphite-navlinks {
    display: flex;
    align-items: center;
  }
}
.gs-graphite-nav .dropdown-menu {
  border: 0;
  border-radius: 0;
  box-shadow: 0 0.1em 0.3em 0 rgba(0, 0, 0, 0.2);
  padding: 0.5em 0;
  min-width: 13em;
}
.gs-graphite-nav .dropdown-item {
  font-family: 'Raleway', Helvetica, sans-serif;
  font-weight: 700;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.75em 1.25em;
  color: var(--gs-accent);
}
.gs-graphite-nav .dropdown-item:hover,
.gs-graphite-nav .dropdown-item:focus {
  background: var(--gs-graphite-paper-alt);
  color: var(--gs-accent);
}
/* Nested-submenu chevron only — open/close and flyout position are the
   behaviors runtime's job (gstrap-behaviors.css), keyed on the same
   [data-gs-nav-submenu] attribute. Scoped to this section: the source rule
   was body-level (a bare .dropdown-submenu selector), and left bare here it
   would mark every submenu on the page, Orbit's included, with this glyph. */
.gs-graphite-navbar [data-gs-nav-submenu] > .dropdown-item::after {
  content: '\\f105';
  font-family: 'Font Awesome 7 Free';
  font-weight: 900;
  float: right;
  margin-left: 0.5em;
}
/* Off-canvas mobile mirror — also body-level in the source (a sibling of
   .site-navbar, not a descendant of it), so it gets the same section scoping. */
.gs-graphite-navbar .gs-graphite-navpanel {
  width: 20em;
  max-width: 85%;
  background: var(--gs-graphite-paper);
}
.gs-graphite-navbar .gs-graphite-navpanel-list,
.gs-graphite-navbar .gs-graphite-navpanel-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.gs-graphite-navbar .gs-graphite-navpanel-list ul {
  padding-left: 1.25em;
}
.gs-graphite-navbar .gs-graphite-navpanel-link {
  display: block;
  padding: 0.85em 0;
  border-top: solid 1px var(--gs-graphite-border);
  font-family: 'Raleway', Helvetica, sans-serif;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--gs-accent);
}
.gs-graphite-navbar .gs-graphite-navpanel-list li:first-child > .gs-graphite-navpanel-link {
  border-top: 0;
}
.gs-graphite-navbar .gs-graphite-navpanel-link:hover {
  color: #777777;
}`
}

/**
 * The Graphite sections offered in the Library panel, in the order they appear
 * there. Each `preview` is a 22×16 wireframe of the layout, sized by the
 * panel's own CSS and inheriting the row's text color.
 */
export const SECTIONS = [
  {
    id: 'graphite-hero-carousel',
    label: 'Hero Carousel',
    description: 'Three full-bleed photo slides with a centered caption and dot indicators.',
    cssParts: ['graphite-base', 'graphite-hero-carousel'],
    assets: [
      { from: 'starters/graphite/assets/images/slide01.jpg', to: 'assets/images/slide01.jpg' },
      { from: 'starters/graphite/assets/images/slide02.jpg', to: 'assets/images/slide02.jpg' },
      { from: 'starters/graphite/assets/images/slide03.jpg', to: 'assets/images/slide03.jpg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="14" fill="currentColor" opacity="0.15"/><rect x="1" y="1" width="20" height="14"/><path d="M6 7h10"/><circle cx="9" cy="12" r="0.9" fill="currentColor" stroke="none"/><circle cx="11" cy="12" r="0.9"/><circle cx="13" cy="12" r="0.9"/></svg>',
    content: `<section id="gs-graphite-hero-carousel" class="gs-sec gs-graphite gs-graphite-hero-carousel carousel slide carousel-fade" data-bs-ride="carousel" data-bs-interval="5000">
  <div class="carousel-inner">
    <div class="carousel-item gs-graphite-hero-slide-first active">
      <div class="gs-graphite-hero-caption">
        <h2><a href="#">Magna tempus. Sed feugiat.</a></h2>
      </div>
    </div>
    <div class="carousel-item gs-graphite-hero-slide-second">
      <div class="gs-graphite-hero-caption">
        <h2><a href="#">Aliquam veroeros nullam.</a></h2>
      </div>
    </div>
    <div class="carousel-item gs-graphite-hero-slide-third">
      <div class="gs-graphite-hero-caption">
        <h2><a href="#">Consequat dolore adipiscing.</a></h2>
      </div>
    </div>
  </div>
  <div class="carousel-indicators">
    <button type="button" data-bs-target="#gs-graphite-hero-carousel" data-bs-slide-to="0" class="active" aria-current="true" aria-label="Slide 1"></button>
    <button type="button" data-bs-target="#gs-graphite-hero-carousel" data-bs-slide-to="1" aria-label="Slide 2"></button>
    <button type="button" data-bs-target="#gs-graphite-hero-carousel" data-bs-slide-to="2" aria-label="Slide 3"></button>
  </div>
</section>`
  },

  {
    id: 'graphite-spotlight',
    label: 'Spotlight Split',
    description: 'A 4/8 split: heading and a paragraph beside one large photo.',
    cssParts: ['graphite-base', 'graphite-spotlight'],
    assets: [
      { from: 'starters/graphite/assets/images/pic07.jpg', to: 'assets/images/pic07.jpg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M1.5 4h5M1.5 6.5h5M1.5 9h3.5"/><rect x="9" y="2" width="12" height="12" fill="currentColor" opacity="0.15"/><rect x="9" y="2" width="12" height="12"/><path d="M9 11l3.5-3 3 2.5 2.5-2 3 3"/></svg>',
    content: `<section class="gs-sec gs-graphite gs-graphite-band gs-graphite-band-lg">
  <div class="container">
    <div class="row g-5 align-items-center">
      <div class="col-lg-4">
        <h2>Libero bibendum nullam vitae magna sed veroeros</h2>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin id interdum magna, ultricies aliquet curabitur sed metus pellentesque, ornare sapien quis.</p>
      </div>
      <div class="col-lg-8 gs-graphite-spotlight-image">
        <img src="assets/images/pic07.jpg" alt="" />
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'graphite-feature-row',
    label: 'Feature Row',
    description: 'Three columns divided by hairlines, each led by a hexagon icon badge.',
    cssParts: ['graphite-base', 'graphite-features'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M8 2v12M14.5 2v12"/><path d="M3.5 3.2l1.6.9v1.8l-1.6.9-1.6-.9V4.1zM10 3.2l1.6.9v1.8l-1.6.9-1.6-.9V4.1zM16.5 3.2l1.6.9v1.8l-1.6.9-1.6-.9V4.1z"/><path d="M1.6 9h4M1.6 11h4M8.1 9h4M8.1 11h4M14.6 9h4M14.6 11h4"/></svg>',
    content: `<section class="gs-sec gs-graphite gs-graphite-band">
  <div class="container">
    <div class="row row-cols-1 row-cols-md-3 g-4 g-md-5 gs-graphite-features">
      <div class="col">
        <span class="gs-graphite-icon-badge"><i class="fa-solid fa-pencil" aria-hidden="true"></i></span>
        <h3>Praesent sed donec</h3>
        <p>Proin consequat luctus elit, nec blandit tellus ut volutpat magna. Mi euismod elementum lectus et consequat etiam lorem etiam sed tempus.</p>
      </div>
      <div class="col">
        <span class="gs-graphite-icon-badge"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></span>
        <h3>Commodo mollis</h3>
        <p>Pellentesque, ornare sapien quis, tristique ante. Proin nec facilisis odio. Integer elementum nunc nec leo interdum, non tristique eros laoreet.</p>
      </div>
      <div class="col">
        <span class="gs-graphite-icon-badge"><i class="fa-solid fa-cloud" aria-hidden="true"></i></span>
        <h3>Magnis curabitur</h3>
        <p>Duis vulputate sit amet metus quis facilisis. Sed dapibus neque erat fringilla tincidunt. Nullam sapien et sapien, iaculis ac varius ultrices nec metus.</p>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'graphite-post-grid',
    label: 'Post Card Grid',
    description: 'Three equal-height Bootstrap cards, image on top, button pinned to the base.',
    cssParts: ['graphite-base', 'graphite-post-card'],
    assets: [
      { from: 'starters/graphite/assets/images/pic01.jpg', to: 'assets/images/pic01.jpg' },
      { from: 'starters/graphite/assets/images/pic02.jpg', to: 'assets/images/pic02.jpg' },
      { from: 'starters/graphite/assets/images/pic03.jpg', to: 'assets/images/pic03.jpg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="2" width="6" height="12"/><rect x="8" y="2" width="6" height="12"/><rect x="15" y="2" width="6" height="12"/><path d="M1 6h6M8 6h6M15 6h6" /><path d="M2 8.5h4M9 8.5h4M16 8.5h4"/><rect x="2" y="11" width="2.6" height="2"/><rect x="9" y="11" width="2.6" height="2"/><rect x="16" y="11" width="2.6" height="2"/></svg>',
    content: `<section class="gs-sec gs-graphite gs-graphite-band gs-graphite-band-alt">
  <div class="container">
    <header class="gs-graphite-title">
      <h2>Etiam sed tellus</h2>
    </header>
    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
      <div class="col">
        <article class="card h-100 gs-graphite-post-card">
          <img src="assets/images/pic01.jpg" class="card-img-top" alt="" />
          <div class="card-body d-flex flex-column">
            <h3>Congue portitor</h3>
            <p>Aenean ultricies magna non sapien rhoncus, ac ullamcorper lorem convallis. Quisque at venenatis nisi, amet finibus mauris.</p>
            <a href="#" class="btn gs-graphite-btn-outline mt-auto align-self-start">More</a>
          </div>
        </article>
      </div>
      <div class="col">
        <article class="card h-100 gs-graphite-post-card">
          <img src="assets/images/pic02.jpg" class="card-img-top" alt="" />
          <div class="card-body d-flex flex-column">
            <h3>Duis nisl euismod</h3>
            <p>Ultrices nec metus. Aenean ultricies magna et sapien rhoncus ac ullamcorper lorem convallis. Quisque at venenatis nisi amet finibus mauris. Sed sodales ultricies magna etiam.</p>
            <a href="#" class="btn gs-graphite-btn-outline mt-auto align-self-start">More</a>
          </div>
        </article>
      </div>
      <div class="col">
        <article class="card h-100 gs-graphite-post-card">
          <img src="assets/images/pic03.jpg" class="card-img-top" alt="" />
          <div class="card-body d-flex flex-column">
            <h3>Elementum auctor</h3>
            <p>Quis interdum. Lorem quis lacus justo. Sed libero condimentum vehicula sem vel, mattis amet mauris.</p>
            <a href="#" class="btn gs-graphite-btn-outline mt-auto align-self-start">More</a>
          </div>
        </article>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'graphite-reach-list',
    label: 'Reach List',
    description: 'Six contact methods in two columns, each with a small hexagon badge.',
    cssParts: ['graphite-base', 'graphite-reach-list'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M2.6 2.4l1.1.6v1.3l-1.1.6-1.1-.6V3zM2.6 8.4l1.1.6v1.3l-1.1.6-1.1-.6V9zM13.1 2.4l1.1.6v1.3l-1.1.6-1.1-.6V3zM13.1 8.4l1.1.6v1.3l-1.1.6-1.1-.6V9z"/><path d="M5.2 3.2h4.5M5.2 5h3M5.2 9.2h4.5M5.2 11h3M15.7 3.2h4.5M15.7 5h3M15.7 9.2h4.5M15.7 11h3"/></svg>',
    content: `<section class="gs-sec gs-graphite gs-graphite-band">
  <div class="container">
    <h2>Other ways to reach us</h2>
    <ul class="gs-graphite-reach-list">
      <li class="gs-graphite-reach-item">
        <span class="gs-graphite-icon-badge gs-graphite-icon-badge-sm"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span>
        <h3>Email</h3>
        <p><a href="#">information@untitled.tld</a></p>
      </li>
      <li class="gs-graphite-reach-item">
        <span class="gs-graphite-icon-badge gs-graphite-icon-badge-sm"><i class="fa-solid fa-phone" aria-hidden="true"></i></span>
        <h3>Phone</h3>
        <p>(800) 555-0000</p>
      </li>
      <li class="gs-graphite-reach-item">
        <span class="gs-graphite-icon-badge gs-graphite-icon-badge-sm"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
        <h3>Mailing Address</h3>
        <p>1234 Fictional Avenue<br />Nashville, TN 00000<br />United States</p>
      </li>
      <li class="gs-graphite-reach-item">
        <span class="gs-graphite-icon-badge gs-graphite-icon-badge-sm"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i></span>
        <h3>LinkedIn</h3>
        <p><a href="#">linkedin.com/untitled-tld</a></p>
      </li>
      <li class="gs-graphite-reach-item">
        <span class="gs-graphite-icon-badge gs-graphite-icon-badge-sm"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></span>
        <h3>Facebook</h3>
        <p><a href="#">facebook.com/untitled-tld</a></p>
      </li>
      <li class="gs-graphite-reach-item">
        <span class="gs-graphite-icon-badge gs-graphite-icon-badge-sm"><i class="fa-brands fa-instagram" aria-hidden="true"></i></span>
        <h3>Instagram</h3>
        <p><a href="#">instagram.com/untitled-tld</a></p>
      </li>
    </ul>
  </div>
</section>`
  },

  {
    id: 'graphite-form',
    label: 'Contact Form',
    description: 'Full Bootstrap form — name, email, category, radios, checkboxes, message.',
    cssParts: ['graphite-base', 'graphite-form'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="2" width="8" height="2.4"/><rect x="12" y="2" width="8" height="2.4"/><rect x="2" y="6" width="18" height="2.4"/><rect x="2" y="10" width="12" height="4"/><rect x="16" y="11.6" width="4" height="2.4" fill="currentColor" opacity="0.3"/></svg>',
    content: `<section class="gs-sec gs-graphite gs-graphite-band gs-graphite-form">
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-lg-8">
        <h2>Send us a message</h2>
        <form method="post" action="#">
          <div class="row g-3">
            <div class="col-md-6">
              <label for="gs-graphite-name" class="visually-hidden">Name</label>
              <input type="text" id="gs-graphite-name" name="name" class="form-control" placeholder="Name" />
            </div>
            <div class="col-md-6">
              <label for="gs-graphite-email" class="visually-hidden">Email</label>
              <input type="email" id="gs-graphite-email" name="email" class="form-control" placeholder="Email" />
            </div>
            <div class="col-12">
              <label for="gs-graphite-category" class="visually-hidden">Category</label>
              <select name="category" id="gs-graphite-category" class="form-select">
                <option value="">- Category -</option>
                <option value="1">Manufacturing</option>
                <option value="2">Shipping</option>
                <option value="3">Administration</option>
                <option value="4">Human Resources</option>
              </select>
            </div>
            <div class="col-sm-4">
              <div class="form-check">
                <input type="radio" id="gs-graphite-priority-low" name="priority" class="form-check-input" checked />
                <label for="gs-graphite-priority-low" class="form-check-label">Low</label>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="form-check">
                <input type="radio" id="gs-graphite-priority-normal" name="priority" class="form-check-input" />
                <label for="gs-graphite-priority-normal" class="form-check-label">Normal</label>
              </div>
            </div>
            <div class="col-sm-4">
              <div class="form-check">
                <input type="radio" id="gs-graphite-priority-high" name="priority" class="form-check-input" />
                <label for="gs-graphite-priority-high" class="form-check-label">High</label>
              </div>
            </div>
            <div class="col-sm-6">
              <div class="form-check">
                <input type="checkbox" id="gs-graphite-copy" name="copy" class="form-check-input" />
                <label for="gs-graphite-copy" class="form-check-label">Email me a copy</label>
              </div>
            </div>
            <div class="col-sm-6">
              <div class="form-check">
                <input type="checkbox" id="gs-graphite-subscribe" name="subscribe" class="form-check-input" checked />
                <label for="gs-graphite-subscribe" class="form-check-label">Keep me posted</label>
              </div>
            </div>
            <div class="col-12">
              <label for="gs-graphite-message" class="visually-hidden">Message</label>
              <textarea name="message" id="gs-graphite-message" class="form-control" placeholder="Enter your message" rows="6"></textarea>
            </div>
            <div class="col-12">
              <ul class="gs-graphite-button-row">
                <li><button type="submit" class="btn gs-graphite-btn-accent">Send Message</button></li>
                <li><button type="reset" class="btn gs-graphite-btn-outline">Reset</button></li>
              </ul>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'graphite-footer',
    label: 'Footer',
    description: 'Slim footer bar: copyright on one side, a short link menu on the other.',
    cssParts: ['graphite-base', 'graphite-footer'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M1 5h20"/><path d="M2 9h8M13 9h2.5M16.5 9h2M19 9h2"/></svg>',
    content: `<footer class="gs-sec gs-graphite gs-graphite-footer">
  <div class="container d-flex flex-wrap align-items-center justify-content-between">
    <p class="gs-graphite-footer-copyright">&copy; Untitled Corp. All rights reserved. Lorem ipsum dolor sit amet feugiat tempus aliquam.</p>
    <ul class="gs-graphite-footer-menu">
      <li><a class="gs-graphite-footer-link" href="#">Terms of Use</a></li>
      <li><a class="gs-graphite-footer-link" href="#">Privacy Policy</a></li>
      <li><a class="gs-graphite-footer-link" href="#">Legal Information</a></li>
    </ul>
  </div>
</footer>`
  },

  {
    id: 'graphite-navbar',
    label: 'Navbar',
    description: 'Top nav with a two-level dropdown and an off-canvas mobile panel. For the overlay-over-a-hero look, add sticky-top and set data-gs-nav-scroll="solid" from the Navbar panel.',
    cssParts: ['graphite-base', 'graphite-navbar'],
    behaviors: true,
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="3.6" fill="currentColor" opacity="0.08"/><rect x="1" y="1" width="20" height="3.6"/><path d="M2.4 2.8h3"/><path d="M9.5 2.8h2M13 2.8h2"/><path d="M18 2h2M18 2.8h2M18 3.6h2"/></svg>',
    content: `<header class="gs-sec gs-graphite gs-graphite-navbar">
  <nav class="navbar navbar-expand-md gs-graphite-nav" data-gs-nav-autoclose="offcanvas">
    <div class="container-fluid">
      <a class="navbar-brand gs-graphite-navlogo" href="#">Graphite</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#nav-panel" aria-controls="nav-panel" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="gs-graphite-navlinks justify-content-end w-100">
        <ul class="navbar-nav align-items-md-center">
          <li class="nav-item"><a class="nav-link active" href="#" aria-current="page">Home</a></li>
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Page Layouts</a>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item" href="#">Left Sidebar</a></li>
              <li><a class="dropdown-item" href="#">Right Sidebar</a></li>
              <li><a class="dropdown-item" href="#">No Sidebar</a></li>
              <li data-gs-nav-submenu>
                <a class="dropdown-item dropdown-toggle" href="#" role="button" aria-expanded="false">Submenu</a>
                <ul class="dropdown-menu">
                  <li><a class="dropdown-item" href="#">Option One</a></li>
                  <li><a class="dropdown-item" href="#">Option Two</a></li>
                  <li><a class="dropdown-item" href="#">Option Three</a></li>
                  <li><a class="dropdown-item" href="#">Option Four</a></li>
                </ul>
              </li>
            </ul>
          </li>
          <li class="nav-item"><a class="nav-link" href="#">Elements</a></li>
          <li class="nav-item"><a class="nav-link gs-graphite-navcta" href="#">Sign Up</a></li>
        </ul>
      </div>
    </div>
  </nav>

  <div class="offcanvas offcanvas-end gs-graphite-navpanel" tabindex="-1" id="nav-panel" aria-labelledby="nav-panel-label">
    <div class="offcanvas-header">
      <h2 class="offcanvas-title visually-hidden" id="nav-panel-label">Site navigation</h2>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
      <ul class="gs-graphite-navpanel-list">
        <li><a class="gs-graphite-navpanel-link" href="#">Home</a></li>
        <li>
          <a class="gs-graphite-navpanel-link" href="#">Page Layouts</a>
          <ul>
            <li><a class="gs-graphite-navpanel-link" href="#">Left Sidebar</a></li>
            <li><a class="gs-graphite-navpanel-link" href="#">Right Sidebar</a></li>
            <li><a class="gs-graphite-navpanel-link" href="#">No Sidebar</a></li>
            <li>
              <a class="gs-graphite-navpanel-link" href="#">Submenu</a>
              <ul>
                <li><a class="gs-graphite-navpanel-link" href="#">Option One</a></li>
                <li><a class="gs-graphite-navpanel-link" href="#">Option Two</a></li>
                <li><a class="gs-graphite-navpanel-link" href="#">Option Three</a></li>
                <li><a class="gs-graphite-navpanel-link" href="#">Option Four</a></li>
              </ul>
            </li>
          </ul>
        </li>
        <li><a class="gs-graphite-navpanel-link" href="#">Elements</a></li>
        <li><a class="gs-graphite-navpanel-link" href="#">Sign Up</a></li>
      </ul>
    </div>
  </div>
</header>`
  }
]
