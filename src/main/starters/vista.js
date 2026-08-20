// =============================================================
// PATH: src/main/starters/vista.js
// ROLE: "Vista" starter — pure data (one full page ported from the edited
//       standalone Vista/light source: a single-page portfolio that reads as
//       a tour of its own parts — fullscreen photo hero, two fullscreen split
//       panels whose white content box docks right then left over a
//       parallax-pinned backdrop, a six-image lightbox gallery (a Bootstrap
//       modal wrapping a carousel, in place of jquery.poptrox), a contact
//       block, and a social footer). Vista is a ONE-pager, so unlike Graphite
//       and Orbit there are no cross-page links: every nav entry is an
//       in-page anchor (#intro/#one/#two/#work/#contact) and resolves
//       against this same page. Framework CSS/JS is the bundle's own vendored
//       Bootstrap 5.3.8 + Font Awesome 7 (solid + brands) + vendored Source
//       Sans Pro, loaded from bundleDir (site/assets/vendor/**). globalCSS
//       points at the bundle's theme.css.
// DEPENDS: nothing (imported by src/main/starters/index.js)
// CREATED: 2026-08-19
//
// Departures from the source page, and why:
//
//   - IMAGES: the source keeps content photos in a root images/ tree
//     (fulls/, thumbs/, three backdrops) and the theme's own textures in
//     assets/css/images/. The bundle merges both into assets/images/ — the
//     convention Graphite and Orbit already ship — so the body's
//     src/href="images/…" became "assets/images/…" (fulls/ and thumbs/ kept
//     as subdirectories; the six full-size photos are what the lightbox
//     carousel shows, the six thumbnails what the grid shows), and every
//     url() in theme.css became "../images/…". See starters/vista/.
//
//   - THEME PICKER: the source header carried a seven-swatch palette
//     preview (markup, .theme-picker rules, :root[data-theme=…] accent
//     overrides, the main.js block behind them, and an inline <head> script
//     restoring the choice from localStorage before first paint). All of it
//     is gone here: it is a template-gallery demo device, not something a
//     site built from this starter wants, and green — the :root defaults in
//     theme.css — is now the one palette. Orbit's picker was stripped the
//     same day for parity (user call, 2026-08-19) — stripping the picker is
//     now the house rule for every future template port.
//
//   - SCROLLSPY: the source sets data-bs-spy/data-bs-target on <body>, which
//     is what lights the current section's nav link. A starter page is body
//     CONTENT only — composeFullPageHtml emits a bare <body> (see
//     ../../shared/page-html.js) — so those attributes have nowhere to live
//     and the active-link highlight does not come along. The nav still
//     scrolls to every section; only the highlight is missing, and adding
//     the two attributes back on the page's <body> in the code editor
//     restores it. Same class of limitation as Orbit's dropped head script.
//
//   - The demo gallery's "All Templates" return link (a stylesheet and an
//     anchor appended after the scripts) belongs to the site that hosts the
//     template gallery, not to the template, and is stripped.
//
//   - HTML-comment breadcrumbs are dropped, as in the other two starters:
//     GrapesJS normalizes them away on the first canvas round-trip anyway.
//
// Canvas note (same as Graphite/Orbit): the canvas does not execute
// assets/js/main.js, so the reveal-on-scroll transitions, the lightbox's
// jump-to-clicked-image, and the mobile nav auto-collapse are inert while
// editing and live in preview/export.
// =============================================================

const INDEX_BODY = `			<nav id="header" class="navbar navbar-expand-md fixed-top site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="#intro">Vista</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div id="nav-links" class="collapse navbar-collapse justify-content-end">
						<ul class="navbar-nav">
							<li class="nav-item"><a class="nav-link" href="#intro">Overview</a></li>
							<li class="nav-item"><a class="nav-link" href="#one">Anatomy</a></li>
							<li class="nav-item"><a class="nav-link" href="#two">Motion</a></li>
							<li class="nav-item"><a class="nav-link" href="#work">Gallery</a></li>
							<li class="nav-item"><a class="nav-link" href="#contact">Contact</a></li>
						</ul>
					</div>
				</div>
			</nav>

			<section id="intro" class="hero-section text-white text-center d-flex align-items-center min-vh-100">
				<div class="container" data-reveal="fade">
					<header>
						<h2 class="hero-title">One Photo, Full Screen,<br />Nothing Else.</h2>
					</header>
					<p class="hero-copy mx-auto">Vista is a one-page portfolio built from repeating this same idea: a fullscreen photo, a slim gradient so the type stays legible, and one focused message. Scroll to watch it become a docked content box, then a parallax panel, then a lightbox gallery.</p>
					<footer>
						<a href="#one" class="btn btn-ghost btn-down btn-down-light">More</a>
					</footer>
				</div>
			</section>

			<section id="one" class="split-section text-white d-flex align-items-center min-vh-100">
				<div class="container">
					<div class="row justify-content-end">
						<div class="col-md-7 col-lg-5">
							<div class="content-box" data-reveal="from-right">
								<header>
									<h2>A Fullscreen Photo.<br />One Box, Docked Right.</h2>
								</header>
								<p>This panel is a <code>min-vh-100</code> section with a <code>background-size: cover</code> photo behind it &mdash; no image tag, no cropping markup, just one CSS rule. The white <code>.content-box</code> on top lives in a <code>col-lg-5</code>, pushed to the right edge by <code>justify-content-end</code> on its row. One backdrop, one docked box &mdash; that's the entire pattern.</p>
							</div>
						</div>
					</div>
				</div>
				<a href="#two" class="btn btn-ghost btn-down btn-down-light btn-down-anchored">Next</a>
			</section>

			<section id="two" class="split-section text-white d-flex align-items-center min-vh-100">
				<div class="container">
					<div class="row justify-content-start">
						<div class="col-md-7 col-lg-5">
							<div class="content-box" data-reveal="from-left">
								<header>
									<h2>It Faded In The Moment<br />You Scrolled Here.</h2>
								</header>
								<p>An <code>IntersectionObserver</code> watches this box and adds <code>.is-visible</code> the instant it enters the viewport &mdash; a few lines of vanilla JS standing in for jQuery's scrollex plugin. The photo behind it holds still while the page scrolls, pinned with <code>background-attachment: fixed</code>; touch devices fall back to normal scrolling instead, since fixed backgrounds stutter on mobile browsers. This box docks left, mirroring the one before it.</p>
							</div>
						</div>
					</div>
				</div>
				<a href="#work" class="btn btn-ghost btn-down btn-down-light btn-down-anchored">Next</a>
			</section>

			<section id="work" class="showcase-section text-center">
				<div class="container">
					<header class="section-header">
						<h2>The Lightbox, Demoed Live</h2>
						<p>Six photos, one Bootstrap modal, one carousel inside it. Click any tile below and the lightbox opens already scrolled to that image &mdash; each thumbnail carries a <code>data-lightbox-index</code>, and a few lines of JS turn that into <code>carousel.to(i)</code>. No poptrox, no jQuery, no plugin config.</p>
					</header>
					<div class="row justify-content-center">
						<div class="col-lg-9">
							<div class="row g-0 gallery-row">
								<div class="col-md-6"><a href="assets/images/fulls/gallery-jet-flight.jpg" class="gallery-item" data-bs-toggle="modal" data-bs-target="#lightbox" data-lightbox-index="0" data-reveal="from-left"><img src="assets/images/thumbs/gallery-jet-flight.jpg" class="img-fluid w-100" alt="F-35 fighter jet climbing against a blue sky" /></a></div>
								<div class="col-md-6"><a href="assets/images/fulls/gallery-radial-detail.jpg" class="gallery-item" data-bs-toggle="modal" data-bs-target="#lightbox" data-lightbox-index="1" data-reveal="from-right"><img src="assets/images/thumbs/gallery-radial-detail.jpg" class="img-fluid w-100" alt="Close-up of a vintage radial engine in black and white" /></a></div>
							</div>
							<div class="row g-0 gallery-row">
								<div class="col-md-6"><a href="assets/images/fulls/gallery-turbine-detail.jpg" class="gallery-item" data-bs-toggle="modal" data-bs-target="#lightbox" data-lightbox-index="2" data-reveal="from-left"><img src="assets/images/thumbs/gallery-turbine-detail.jpg" class="img-fluid w-100" alt="Close-up of a jet turbine engine in black and white" /></a></div>
								<div class="col-md-6"><a href="assets/images/fulls/gallery-floatplane.jpg" class="gallery-item" data-bs-toggle="modal" data-bs-target="#lightbox" data-lightbox-index="3" data-reveal="from-right"><img src="assets/images/thumbs/gallery-floatplane.jpg" class="img-fluid w-100" alt="Yellow floatplane docked on a mountain lake" /></a></div>
							</div>
							<div class="row g-0 gallery-row">
								<div class="col-md-6"><a href="assets/images/fulls/gallery-propeller-sky.jpg" class="gallery-item" data-bs-toggle="modal" data-bs-target="#lightbox" data-lightbox-index="4" data-reveal="from-left"><img src="assets/images/thumbs/gallery-propeller-sky.jpg" class="img-fluid w-100" alt="Aircraft propeller and nose against a cloudy sky" /></a></div>
								<div class="col-md-6"><a href="assets/images/fulls/gallery-formation-detail.jpg" class="gallery-item" data-bs-toggle="modal" data-bs-target="#lightbox" data-lightbox-index="5" data-reveal="from-right"><img src="assets/images/thumbs/gallery-formation-detail.jpg" class="img-fluid w-100" alt="Close-up crop of the twin-engine aircraft from the hero photo" /></a></div>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section id="contact" class="contact-section text-center">
				<div class="container">
					<header class="section-header">
						<h2>Say Hello.</h2>
						<p>This form doesn't send anywhere yet &mdash; its <code>action</code> is a bare <code>#</code>. Point it at your own endpoint or a form service and it's live; the fields, spacing, and focus states are already wired up with Bootstrap's <code>row g-3</code> and <code>form-control</code>.</p>
					</header>
					<div class="row justify-content-center">
						<div class="col-lg-9">
							<div class="content-box contact-box" data-reveal="from-bottom">
								<form method="post" action="#">
									<div class="row g-3">
										<div class="col-md-6">
											<label for="contact-name" class="visually-hidden">Name</label>
											<input type="text" id="contact-name" name="name" class="form-control" placeholder="Name" />
										</div>
										<div class="col-md-6">
											<label for="contact-email" class="visually-hidden">Email</label>
											<input type="email" id="contact-email" name="email" class="form-control" placeholder="Email" />
										</div>
										<div class="col-12">
											<label for="contact-message" class="visually-hidden">Message</label>
											<textarea id="contact-message" name="message" class="form-control" placeholder="Message" rows="6"></textarea>
										</div>
										<div class="col-12">
											<button type="submit" class="btn btn-accent">Send Message</button>
										</div>
									</div>
								</form>
							</div>
						</div>
					</div>
				</div>
			</section>

			<footer id="footer" class="site-footer">
				<div class="container-fluid d-flex flex-wrap align-items-center justify-content-between">
					<ul class="social-links list-inline mb-0">
						<li class="list-inline-item"><a href="#"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
						<li class="list-inline-item"><a href="#"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
						<li class="list-inline-item"><a href="#"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
						<li class="list-inline-item"><a href="#"><i class="fa-brands fa-dribbble" aria-hidden="true"></i><span class="visually-hidden">Dribbble</span></a></li>
						<li class="list-inline-item"><a href="#"><i class="fa-brands fa-pinterest-p" aria-hidden="true"></i><span class="visually-hidden">Pinterest</span></a></li>
						<li class="list-inline-item"><a href="#"><i class="fa-brands fa-instagram" aria-hidden="true"></i><span class="visually-hidden">Instagram</span></a></li>
					</ul>
					<p class="footer-copy mb-0">&copy; Vista. All rights reserved.</p>
				</div>
			</footer>

			<div class="modal fade lightbox-modal" id="lightbox" tabindex="-1" aria-hidden="true">
				<div class="modal-dialog modal-dialog-centered modal-xl">
					<div class="modal-content">
						<div class="modal-header border-0">
							<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
						</div>
						<div class="modal-body p-0">
							<div id="lightbox-carousel" class="carousel slide" data-bs-interval="false">
								<div class="carousel-inner">
									<div class="carousel-item active"><img src="assets/images/fulls/gallery-jet-flight.jpg" class="d-block w-100" alt="F-35 fighter jet climbing against a blue sky" /><div class="carousel-caption"><p>Click any tile &mdash; the lightbox opens straight to this image, not slide one.</p></div></div>
									<div class="carousel-item"><img src="assets/images/fulls/gallery-radial-detail.jpg" class="d-block w-100" alt="Close-up of a vintage radial engine in black and white" /><div class="carousel-caption"><p>Under the hood it's one Bootstrap modal wrapping one carousel.</p></div></div>
									<div class="carousel-item"><img src="assets/images/fulls/gallery-turbine-detail.jpg" class="d-block w-100" alt="Close-up of a jet turbine engine in black and white" /><div class="carousel-caption"><p>Each thumbnail's <code>data-lightbox-index</code> maps straight to <code>carousel.to(i)</code>.</p></div></div>
									<div class="carousel-item"><img src="assets/images/fulls/gallery-floatplane.jpg" class="d-block w-100" alt="Yellow floatplane docked on a mountain lake" /><div class="carousel-caption"><p>No poptrox, no jQuery &mdash; swipe and the arrow keys just work.</p></div></div>
									<div class="carousel-item"><img src="assets/images/fulls/gallery-propeller-sky.jpg" class="d-block w-100" alt="Aircraft propeller and nose against a cloudy sky" /><div class="carousel-caption"><p>Captions live in <code>.carousel-caption</code>, one per slide, plain HTML.</p></div></div>
									<div class="carousel-item"><img src="assets/images/fulls/gallery-formation-detail.jpg" class="d-block w-100" alt="Close-up crop of the twin-engine aircraft from the hero photo" /><div class="carousel-caption"><p>Same photo as the hero &mdash; cropped differently. Reused art, two crops.</p></div></div>
								</div>
								<button class="carousel-control-prev" type="button" data-bs-target="#lightbox-carousel" data-bs-slide="prev">
									<span class="carousel-control-prev-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Previous</span>
								</button>
								<button class="carousel-control-next" type="button" data-bs-target="#lightbox-carousel" data-bs-slide="next">
									<span class="carousel-control-next-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Next</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>`

export default {
  id: 'vista',
  label: 'Vista',
  templates: [],
  pages: [
    {
      name: 'index',
      title: 'Vista',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: INDEX_BODY
    }
  ],
  assets: {},
  bundleDir: 'vista',
  globalCSS: 'assets/css/theme.css',
  framework: {
    css: [
      'assets/vendor/bootstrap/bootstrap.min.css',
      'assets/vendor/fontawesome/css/fontawesome.min.css',
      'assets/vendor/fontawesome/css/solid.min.css',
      'assets/vendor/fontawesome/css/brands.min.css',
      'assets/vendor/fonts/source-sans-pro.css'
    ],
    js: ['assets/vendor/bootstrap/bootstrap.bundle.min.js']
  }
}
