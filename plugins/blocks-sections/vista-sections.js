// =============================================================
// PATH: plugins/blocks-sections/vista-sections.js
// ROLE: Pure data — the "Vista" template's page sections, harvested as
//       standalone Library entries. Two exports: CSS_PARTS (marker → rules)
//       and SECTIONS (defs referencing those markers by key). index.js
//       resolves the keys and hands the result to api.registerSection.
// SOURCE: src/main/starters/vista.js (page body) +
//         starters/vista/assets/css/theme.css (rules)
// HARVESTED: 2026-08-19
// DEPENDS: nothing — no imports, no runtime behavior, no DOM.
// CREATED: 2026-08-19
//
// Same harvest rules as orbit-sections.js (read that header first — the
// gs- namespace, per-section chunks, var(--gs-accent), url("../images/…") and
// asset-declaration rules are identical). What is specific to Vista:
//
//   - Vista is a ONE-PAGE template whose whole idea is one fullscreen photo
//     per band. Three of the seven defs here are therefore backdrop bands
//     (hero, split panel, parallax panel) and each ships its own photo; the
//     shared box-model for the two panels lives in 'vista-panel' so only the
//     background-image differs between them.
//   - The source hangs its backdrops off ID selectors (#intro/#one/#two),
//     which a bundled section cannot use — an id is unique per page and the
//     user may insert the same band twice. Every one became a class here.
//   - REVEAL-ON-SCROLL is the template's signature move, and in the source it
//     is main.js machinery (an IntersectionObserver toggling .is-visible,
//     standing in for jquery.scrollex). A bundled section ships no script, so
//     the four defs that had it are wired to the shipped behaviors runtime
//     instead (`behaviors: true` + data-gs-anim, assets/behaviors/
//     gstrap-behaviors.js/.css) — the same delivery path the navbar defs use.
//     The runtime is progressive: with it absent the content is simply
//     visible, never stuck at opacity 0, which is also why an inserted band
//     looks finished in the canvas (the canvas gets the runtime's stylesheet
//     but never its script — see src/renderer/editor/grapesjs-init.js).
//   - The navbar def is the single <nav>: Bootstrap's own Collapse component
//     IS the mobile panel here, so like Orbit and unlike Graphite there is no
//     off-canvas sibling to wrap it with. `fixed-top` is starter chrome (it
//     assumes a body padding-top that a bundled section has no business
//     writing) and is dropped, and the source's in-page anchors
//     (#intro/#one/#two/…) become "#" — a bundled section cannot assume the
//     host page has a band by that id.
//   - The source's seven-swatch theme picker does not appear here for the
//     same reason it does not appear in the starter: it is demo machinery.
//     See src/main/starters/vista.js's header for that decision in full.
//   - The lightbox (a Bootstrap modal wrapping a carousel, opened at the
//     clicked image by main.js) did NOT come along. Its jump-to-index is
//     script the section cannot carry, and a modal that always opens on
//     slide one is a worse thing to hand someone than a plain grid — so the
//     gallery ships as the photo grid alone, with each tile an anchor the
//     user points wherever they want.
//   - Copy is rewritten throughout. The source's prose describes its own
//     construction ("this panel is a min-vh-100 section with…"), which is
//     right for a template tour and wrong for a band someone drops into
//     their own page.
// =============================================================

/**
 * Rules keyed by chunk marker. A def lists the markers it needs in `cssParts`;
 * index.js resolves them to the `{marker, text}` pairs registerSection wants.
 *
 * Chunk order inside a def matters: 'vista-base' first, so that where a base
 * rule and a section rule have equal specificity the section's rule is the
 * later one and wins. Vista leans on that more than the other two templates
 * do — its base sets type and link color on `.gs-vista`, which is on the
 * SAME element as each section's own class, so several overrides below
 * (`.gs-vista-nav` font size, `.gs-vista-footer a` color) are equal-
 * specificity and depend entirely on arriving second.
 */
export const CSS_PARTS = {
  // Shared by every Vista section: palette, the Source Sans Pro type scale
  // with its heavy headings, the section-header rhythm, and the white content
  // box that three of the seven defs sit their copy in.
  'vista-base': `.gs-vista {
  --gs-accent: #98c593;
  --gs-accent-hover: #a8d5a3;
  --gs-accent-active: #88b583;
  --gs-accent-rgb: 152, 197, 147;
  --gs-vista-ink: #39454b;
  --gs-vista-paper: #ffffff;
  --gs-vista-paper-alt: #f5f6f7;
  font-family: 'Source Sans Pro', Helvetica, sans-serif;
  font-weight: 300;
  font-size: 1.35rem;
  line-height: 1.75;
  letter-spacing: 0.5px;
  color: var(--gs-vista-ink);
}
.gs-vista h1,
.gs-vista h2,
.gs-vista h3,
.gs-vista h4,
.gs-vista h5,
.gs-vista h6 {
  font-weight: 900;
  color: inherit;
}
.gs-vista h2 {
  font-size: 2.25em;
  line-height: 1.25;
  letter-spacing: -2px;
}
.gs-vista a {
  color: var(--gs-accent);
}
.gs-vista-section-header {
  margin-bottom: 2em;
}
.gs-vista-content-box {
  padding: 3.5em 2.5em;
  background-color: var(--gs-vista-paper);
  color: var(--gs-vista-ink);
}
@media (max-width: 1280px) {
  .gs-vista { font-size: 1.2rem; }
}
@media (max-width: 767.98px) {
  .gs-vista { font-size: 1.1rem; }
  .gs-vista-content-box { padding: 2.5em 1.75em; }
}`,

  // The two button skins the photo bands use. Descendant-scoped for the same
  // reason Orbit's ghost button is: a bare .gs-vista-btn-ghost would lose its
  // color to `.gs-vista a` above (one class plus one element beats one class),
  // and every button in these bands is an anchor.
  'vista-buttons': `.gs-vista .gs-vista-btn-ghost {
  display: inline-block;
  height: 3.5em;
  padding: 0 2em;
  border: solid 2px rgba(255, 255, 255, 0.75);
  border-radius: 3.5em;
  background-color: rgba(64, 64, 64, 0.05);
  color: #fff;
  font-size: 1em;
  font-weight: 300;
  line-height: 3.5em;
  letter-spacing: 0.5px;
  transition: background-color 0.25s ease-in-out;
}
.gs-vista .gs-vista-btn-ghost:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}
/* The down-arrow is a label-less button: the caption is pushed out of the box
   by text-indent so the SVG chevron is all that shows, exactly as the source
   does it. Keep the text in the markup — it is what a screen reader reads.
   white-space: nowrap is this file's own addition, not the source's:
   text-indent only offsets the FIRST line, so a label long enough to wrap
   drops its second line back into view at indent 0 (a stray "g" from "Keep
   scrolling", caught in the 2026-08-19 fidelity pass). Keeping it on one line
   means any label the user types stays outside the box. */
.gs-vista .gs-vista-btn-down {
  width: 5em;
  height: 5em;
  padding: 0;
  overflow: hidden;
  background-image: url("../images/dark-arrow.svg");
  background-position: center center;
  background-repeat: no-repeat;
  line-height: 4.5em;
  white-space: nowrap;
  text-indent: -10em;
}
.gs-vista .gs-vista-btn-down-anchored {
  position: absolute;
  left: 50%;
  bottom: 0;
  height: 4.5em;
  transform: translateX(-50%);
  border-bottom: 0;
  border-radius: 3em 3em 0 0;
}`,

  // Hero: photo, a texture tile, and a flat gradient between them so white
  // type stays legible over any photograph. background-attachment: fixed is
  // what makes it drift against the scroll; touch browsers stutter on it, so
  // they get the ordinary scrolling version.
  'vista-hero': `.gs-vista-hero {
  padding: 4em 0;
  background-color: var(--gs-vista-ink);
  background-image: url("../images/overlay.png"), linear-gradient(rgba(20, 22, 24, 0.4), rgba(20, 22, 24, 0.4)), url("../images/hero-backdrop.jpg");
  background-size: 256px 256px, cover, cover;
  background-position: top left, center center, center center;
  background-repeat: repeat, no-repeat, no-repeat;
  background-attachment: fixed, fixed, fixed;
}
.gs-vista-hero .gs-vista-hero-title {
  font-size: 3.75em;
  line-height: 1;
  letter-spacing: -4px;
}
.gs-vista-hero .gs-vista-hero-copy {
  max-width: 46em;
}
@media (hover: none), (max-width: 767.98px) {
  .gs-vista-hero { background-attachment: scroll, scroll, scroll; }
}
@media (max-width: 767.98px) {
  .gs-vista-hero .gs-vista-hero-title { font-size: 2.4em; letter-spacing: -2px; }
}`,

  // Everything the two docked-box panels share EXCEPT the photo — which is
  // the only thing that differs between them, and rides in its own chunk so
  // a project that inserts one panel does not carry the other's image rules.
  'vista-panel': `.gs-vista-panel {
  position: relative;
  overflow: hidden;
  padding: 4em 0 6em;
  background-color: var(--gs-vista-ink);
  background-size: 256px 256px, cover, cover;
  background-position: top left, center center, center center;
  background-repeat: repeat, no-repeat, no-repeat;
  background-attachment: fixed, fixed, fixed;
}
@media (hover: none), (max-width: 767.98px) {
  .gs-vista-panel { background-attachment: scroll, scroll, scroll; }
}`,

  'vista-split-panel': `.gs-vista-split-panel {
  background-image: url("../images/overlay.png"), linear-gradient(rgba(20, 22, 24, 0.35), rgba(20, 22, 24, 0.35)), url("../images/split-panel-backdrop.jpg");
}`,

  'vista-parallax-panel': `.gs-vista-parallax-panel {
  background-image: url("../images/overlay.png"), linear-gradient(rgba(20, 22, 24, 0.4), rgba(20, 22, 24, 0.4)), url("../images/parallax-backdrop.jpg");
}`,

  // The grid is gapless on purpose (g-0 in the markup): the tiles butt
  // against each other and the texture overlay reads as one surface across
  // the whole block. Hover thins the texture instead of moving anything.
  'vista-photo-grid': `.gs-vista-photo-grid {
  padding: 6em 0;
  background-color: var(--gs-vista-paper);
  overflow-x: hidden;
}
.gs-vista-photo-tile {
  position: relative;
  display: block;
}
.gs-vista-photo-tile::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("../images/overlay.png");
  transition: opacity 0.25s ease-in-out;
}
.gs-vista-photo-tile:hover::before {
  opacity: 0.35;
}`,

  'vista-contact': `.gs-vista-contact {
  padding: 6em 0;
  background-color: var(--gs-vista-paper-alt);
  overflow: hidden;
}
.gs-vista-contact-box {
  padding: 2em;
}
.gs-vista-contact-box .form-control {
  font-weight: 300;
  letter-spacing: 0.5px;
  color: var(--gs-vista-ink);
}
.gs-vista-contact-box .form-control:focus {
  border-color: var(--gs-accent);
  box-shadow: 0 0 0 0.25rem rgba(var(--gs-accent-rgb), 0.25);
}
.gs-vista .gs-vista-btn-accent {
  display: inline-block;
  height: 3.5em;
  padding: 0 2em;
  border: 0;
  border-radius: 3.5em;
  background-color: var(--gs-accent);
  color: #fff;
  font-size: 1em;
  font-weight: 300;
  line-height: 3.5em;
  letter-spacing: 0.5px;
}
.gs-vista .gs-vista-btn-accent:hover {
  background-color: var(--gs-accent-hover);
  color: #fff;
}
.gs-vista .gs-vista-btn-accent:active {
  background-color: var(--gs-accent-active);
  color: #fff;
}`,

  // `.gs-vista-footer a` is deliberately equal in specificity to the base's
  // `.gs-vista a` — it wins because 'vista-base' is listed first in the def
  // and css-chunks.js appends in that order. Scoping it tighter would work
  // too; matching the source's own selector shape reads better.
  'vista-footer': `.gs-vista-footer {
  padding: 1.5em 1em;
  background-color: var(--gs-vista-ink);
  color: rgba(185, 186, 187, 0.5);
}
.gs-vista-footer a {
  color: rgba(185, 186, 187, 0.5);
  text-decoration: none;
}
.gs-vista-footer a:hover {
  color: #b9babb;
}
.gs-vista-footer .gs-vista-social-link {
  display: inline-block;
  padding: 0.5em;
  font-size: 1.25em;
}
.gs-vista-footer .gs-vista-footer-copy {
  font-size: 0.9em;
}`,

  // Everything here was already scoped under `.site-navbar` in the source, so
  // the rename to `.gs-vista-nav` is the whole job. The font-size override is
  // equal-specificity against the base's `.gs-vista` (both land on this same
  // element) and depends on the base chunk being listed first — see the
  // CSS_PARTS doc block.
  'vista-navbar': `.gs-vista-nav {
  min-height: 3.5rem;
  padding: 0 0.75rem;
  background-color: rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0.15em 0 rgba(0, 0, 0, 0.1);
  font-size: 1.125rem;
}
.gs-vista-nav .gs-vista-navlogo {
  font-weight: 900;
  letter-spacing: -1px;
  color: var(--gs-vista-ink);
}
.gs-vista-nav .nav-link {
  color: var(--gs-vista-ink);
}
.gs-vista-nav .nav-link:hover,
.gs-vista-nav .nav-link:focus,
.gs-vista-nav .nav-link.active {
  color: var(--gs-accent);
}
@media (max-width: 767.98px) {
  .gs-vista-nav .navbar-collapse {
    background-color: rgba(255, 255, 255, 0.97);
  }
}`
}

/**
 * The Vista sections offered in the Library panel, in the order they appear
 * there. Each `preview` is a 22×16 wireframe of the layout, sized by the
 * panel's own CSS and inheriting the row's text color.
 */
export const SECTIONS = [
  {
    id: 'vista-hero',
    label: 'Fullscreen Hero',
    description: 'Full-height photo under a legibility gradient: one heading, one paragraph, one button.',
    cssParts: ['vista-base', 'vista-buttons', 'vista-hero'],
    behaviors: true,
    assets: [
      { from: 'starters/vista/assets/images/hero-backdrop.jpg', to: 'assets/images/hero-backdrop.jpg' },
      { from: 'starters/vista/assets/images/overlay.png', to: 'assets/images/overlay.png' },
      { from: 'starters/vista/assets/images/dark-arrow.svg', to: 'assets/images/dark-arrow.svg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="14" fill="currentColor" opacity="0.35"/><rect x="1" y="1" width="20" height="14"/><path d="M5 6h12M7 8.5h8"/><circle cx="11" cy="12" r="1.6"/></svg>',
    content: `<section class="gs-sec gs-vista gs-vista-hero text-white text-center d-flex align-items-center min-vh-100">
  <div class="container" data-gs-anim="fade" data-gs-anim-trigger="load">
    <h2 class="gs-vista-hero-title">One photo.<br />One sentence.</h2>
    <p class="gs-vista-hero-copy mx-auto">A full-height photograph, a thin dark gradient so the type stays readable over any image, and nothing competing for attention. Swap the background in the Style Manager and rewrite these two lines &mdash; that is the whole band.</p>
    <div><a href="#" class="btn gs-vista-btn-ghost gs-vista-btn-down">More</a></div>
  </div>
</section>`
  },

  {
    id: 'vista-split-panel',
    label: 'Split Panel',
    description: 'Fullscreen photo with a white content box docked to the right half.',
    cssParts: ['vista-base', 'vista-buttons', 'vista-panel', 'vista-split-panel'],
    behaviors: true,
    assets: [
      { from: 'starters/vista/assets/images/split-panel-backdrop.jpg', to: 'assets/images/split-panel-backdrop.jpg' },
      { from: 'starters/vista/assets/images/overlay.png', to: 'assets/images/overlay.png' },
      { from: 'starters/vista/assets/images/dark-arrow.svg', to: 'assets/images/dark-arrow.svg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="14" fill="currentColor" opacity="0.35"/><rect x="1" y="1" width="20" height="14"/><rect x="12" y="4" width="8" height="8" fill="currentColor" opacity="0.9"/><path d="M13.2 6.5h5.6M13.2 8.4h5.6M13.2 10h3.5" stroke-opacity="0.4"/></svg>',
    content: `<section class="gs-sec gs-vista gs-vista-panel gs-vista-split-panel text-white d-flex align-items-center min-vh-100">
  <div class="container">
    <div class="row justify-content-end">
      <div class="col-md-8 col-lg-5">
        <div class="gs-vista-content-box" data-gs-anim="fade-left">
          <h2>Photograph on the left.<br />The point on the right.</h2>
          <p>One backdrop, one docked box. The photo fills the band edge to edge and the copy sits in a column pushed to one side, so the picture keeps most of the frame and the words still have somewhere quiet to live.</p>
        </div>
      </div>
    </div>
  </div>
  <a href="#" class="btn gs-vista-btn-ghost gs-vista-btn-down gs-vista-btn-down-anchored">Next</a>
</section>`
  },

  {
    id: 'vista-parallax-panel',
    label: 'Parallax Panel',
    description: 'Mirror of the split panel: box docked left, photo pinned so it drifts against the scroll.',
    cssParts: ['vista-base', 'vista-buttons', 'vista-panel', 'vista-parallax-panel'],
    behaviors: true,
    assets: [
      { from: 'starters/vista/assets/images/parallax-backdrop.jpg', to: 'assets/images/parallax-backdrop.jpg' },
      { from: 'starters/vista/assets/images/overlay.png', to: 'assets/images/overlay.png' },
      { from: 'starters/vista/assets/images/dark-arrow.svg', to: 'assets/images/dark-arrow.svg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="14" fill="currentColor" opacity="0.35"/><rect x="1" y="1" width="20" height="14"/><rect x="2" y="4" width="8" height="8" fill="currentColor" opacity="0.9"/><path d="M3.2 6.5h5.6M3.2 8.4h5.6M3.2 10h3.5" stroke-opacity="0.4"/></svg>',
    content: `<section class="gs-sec gs-vista gs-vista-panel gs-vista-parallax-panel text-white d-flex align-items-center min-vh-100">
  <div class="container">
    <div class="row justify-content-start">
      <div class="col-md-8 col-lg-5">
        <div class="gs-vista-content-box" data-gs-anim="fade-right">
          <h2>The same idea,<br />flipped.</h2>
          <p>Alternating the side the box docks to is what keeps a page of photo bands from reading as one long wall. The photograph behind this one stays put while the page scrolls past it; phones and tablets get ordinary scrolling instead, where pinned backgrounds stutter.</p>
        </div>
      </div>
    </div>
  </div>
  <a href="#" class="btn gs-vista-btn-ghost gs-vista-btn-down gs-vista-btn-down-anchored">Next</a>
</section>`
  },

  {
    id: 'vista-photo-grid',
    label: 'Photo Grid',
    description: 'Six gapless photo tiles, two across, each an anchor with a texture overlay on hover.',
    cssParts: ['vista-base', 'vista-photo-grid'],
    behaviors: true,
    assets: [
      { from: 'starters/vista/assets/images/overlay.png', to: 'assets/images/overlay.png' },
      { from: 'starters/vista/assets/images/thumbs/gallery-jet-flight.jpg', to: 'assets/images/thumbs/gallery-jet-flight.jpg' },
      { from: 'starters/vista/assets/images/thumbs/gallery-radial-detail.jpg', to: 'assets/images/thumbs/gallery-radial-detail.jpg' },
      { from: 'starters/vista/assets/images/thumbs/gallery-turbine-detail.jpg', to: 'assets/images/thumbs/gallery-turbine-detail.jpg' },
      { from: 'starters/vista/assets/images/thumbs/gallery-floatplane.jpg', to: 'assets/images/thumbs/gallery-floatplane.jpg' },
      { from: 'starters/vista/assets/images/thumbs/gallery-propeller-sky.jpg', to: 'assets/images/thumbs/gallery-propeller-sky.jpg' },
      { from: 'starters/vista/assets/images/thumbs/gallery-formation-detail.jpg', to: 'assets/images/thumbs/gallery-formation-detail.jpg' }
    ],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="1.5" width="8.6" height="4" fill="currentColor" opacity="0.35"/><rect x="11.4" y="1.5" width="8.6" height="4" fill="currentColor" opacity="0.35"/><rect x="2" y="6" width="8.6" height="4" fill="currentColor" opacity="0.35"/><rect x="11.4" y="6" width="8.6" height="4" fill="currentColor" opacity="0.35"/><rect x="2" y="10.5" width="8.6" height="4" fill="currentColor" opacity="0.35"/><rect x="11.4" y="10.5" width="8.6" height="4" fill="currentColor" opacity="0.35"/></svg>',
    content: `<section class="gs-sec gs-vista gs-vista-photo-grid text-center">
  <div class="container">
    <header class="gs-vista-section-header">
      <h2>The work</h2>
      <p>Six pictures, two across, no gutters. Point each tile wherever it should go &mdash; a project page, a full-size copy of the photo, a lightbox you wire yourself.</p>
    </header>
    <div class="row justify-content-center">
      <div class="col-lg-9">
        <div class="row g-0">
          <div class="col-md-6"><a href="#" class="gs-vista-photo-tile" data-gs-anim="fade-right"><img src="assets/images/thumbs/gallery-jet-flight.jpg" class="img-fluid w-100" alt="Fighter jet climbing against a blue sky" /></a></div>
          <div class="col-md-6"><a href="#" class="gs-vista-photo-tile" data-gs-anim="fade-left"><img src="assets/images/thumbs/gallery-radial-detail.jpg" class="img-fluid w-100" alt="Close-up of a vintage radial engine in black and white" /></a></div>
        </div>
        <div class="row g-0">
          <div class="col-md-6"><a href="#" class="gs-vista-photo-tile" data-gs-anim="fade-right" data-gs-anim-delay="100"><img src="assets/images/thumbs/gallery-turbine-detail.jpg" class="img-fluid w-100" alt="Close-up of a jet turbine engine in black and white" /></a></div>
          <div class="col-md-6"><a href="#" class="gs-vista-photo-tile" data-gs-anim="fade-left" data-gs-anim-delay="100"><img src="assets/images/thumbs/gallery-floatplane.jpg" class="img-fluid w-100" alt="Yellow floatplane docked on a mountain lake" /></a></div>
        </div>
        <div class="row g-0">
          <div class="col-md-6"><a href="#" class="gs-vista-photo-tile" data-gs-anim="fade-right" data-gs-anim-delay="200"><img src="assets/images/thumbs/gallery-propeller-sky.jpg" class="img-fluid w-100" alt="Aircraft propeller and nose against a cloudy sky" /></a></div>
          <div class="col-md-6"><a href="#" class="gs-vista-photo-tile" data-gs-anim="fade-left" data-gs-anim-delay="200"><img src="assets/images/thumbs/gallery-formation-detail.jpg" class="img-fluid w-100" alt="Twin-engine aircraft banking in formation" /></a></div>
        </div>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'vista-contact',
    label: 'Contact Block',
    description: 'Name/email/message form in a white box on a soft grey band, ready to point at an endpoint.',
    cssParts: ['vista-base', 'vista-contact'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="14" fill="currentColor" opacity="0.12"/><rect x="3" y="3.5" width="16" height="9.5" fill="currentColor" opacity="0.9"/><rect x="4.5" y="5" width="6" height="1.8" stroke-opacity="0.4"/><rect x="11.5" y="5" width="6" height="1.8" stroke-opacity="0.4"/><rect x="4.5" y="7.8" width="13" height="2.6" stroke-opacity="0.4"/><rect x="4.5" y="11" width="4.5" height="1.5" stroke-opacity="0.4"/></svg>',
    content: `<section class="gs-sec gs-vista gs-vista-contact text-center">
  <div class="container">
    <header class="gs-vista-section-header">
      <h2>Say hello.</h2>
      <p>This form does not send anywhere yet &mdash; its action is a bare "#". Point it at your own handler or a form service and it is live; the fields, spacing, and focus states are already wired up.</p>
    </header>
    <div class="row justify-content-center">
      <div class="col-lg-9">
        <div class="gs-vista-content-box gs-vista-contact-box">
          <form method="post" action="#">
            <div class="row g-3">
              <div class="col-md-6">
                <label for="vista-contact-name" class="visually-hidden">Name</label>
                <input type="text" id="vista-contact-name" name="name" class="form-control" placeholder="Name" />
              </div>
              <div class="col-md-6">
                <label for="vista-contact-email" class="visually-hidden">Email</label>
                <input type="email" id="vista-contact-email" name="email" class="form-control" placeholder="Email" />
              </div>
              <div class="col-12">
                <label for="vista-contact-message" class="visually-hidden">Message</label>
                <textarea id="vista-contact-message" name="message" class="form-control" placeholder="Message" rows="6"></textarea>
              </div>
              <div class="col-12">
                <button type="submit" class="btn gs-vista-btn-accent">Send message</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</section>`
  },

  {
    id: 'vista-footer',
    label: 'Footer',
    description: 'Single dark bar: social icons at one end, copyright at the other, stacking on phones.',
    cssParts: ['vista-base', 'vista-footer'],
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="5.5" width="20" height="5" fill="currentColor" opacity="0.85"/><circle cx="4" cy="8" r="1" stroke-opacity="0.5"/><circle cx="6.6" cy="8" r="1" stroke-opacity="0.5"/><circle cx="9.2" cy="8" r="1" stroke-opacity="0.5"/><path d="M14 8h5" stroke-opacity="0.5"/></svg>',
    content: `<footer class="gs-sec gs-vista gs-vista-footer">
  <div class="container-fluid d-flex flex-wrap align-items-center justify-content-between">
    <ul class="gs-vista-social-links list-inline mb-0">
      <li class="list-inline-item"><a href="#" class="gs-vista-social-link"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
      <li class="list-inline-item"><a href="#" class="gs-vista-social-link"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
      <li class="list-inline-item"><a href="#" class="gs-vista-social-link"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
      <li class="list-inline-item"><a href="#" class="gs-vista-social-link"><i class="fa-brands fa-instagram" aria-hidden="true"></i><span class="visually-hidden">Instagram</span></a></li>
    </ul>
    <p class="gs-vista-footer-copy mb-0">&copy; Vista. All rights reserved.</p>
  </div>
</footer>`
  },

  {
    id: 'vista-navbar',
    label: 'Navbar',
    description: 'Slim light bar with a wordmark and section links, collapsing to the built-in Bootstrap mobile panel.',
    cssParts: ['vista-base', 'vista-navbar'],
    behaviors: true,
    preview: '<svg viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="20" height="3.6" fill="currentColor" opacity="0.15"/><rect x="1" y="1" width="20" height="3.6"/><path d="M2.6 2.8h3"/><path d="M11 2.8h1.8M13.8 2.8h1.8M16.6 2.8h1.8" stroke-opacity="0.5"/></svg>',
    content: `<nav class="gs-sec gs-vista gs-vista-navbar navbar navbar-expand-md gs-vista-nav" data-gs-nav-autoclose="collapse">
  <div class="container-fluid">
    <a class="navbar-brand gs-vista-navlogo" href="#">Vista</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div id="nav-links" class="collapse navbar-collapse justify-content-end">
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link active" href="#" aria-current="page">Overview</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Work</a></li>
        <li class="nav-item"><a class="nav-link" href="#">About</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Contact</a></li>
      </ul>
    </div>
  </div>
</nav>`
  }
]
