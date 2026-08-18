// =============================================================
// PATH: src/main/starters/orbit.js
// ROLE: "Orbit" starter — pure data (5 full pages ported verbatim from the
//       standalone bs5-templates/orbit/blue source: index (a self-describing
//       component tour — hero banner, accent intro band, 8-item feature
//       grid, avatar row, quote banner, contact form), plus 4 layout-tour
//       pages that share the same chrome: left-sidebar, right-sidebar,
//       two-sidebar (dual rail), no-sidebar (full width). Like Graphite,
//       this starter has no master template — each page carries its own
//       full navbar/footer chrome, and cross-page nav links (href=
//       "left-sidebar.html" etc.) are kept verbatim because the flat
//       pages/ export layout makes them resolve correctly as-is. Framework
//       CSS/JS is the bundle's own vendored Bootstrap 5.3.8 + Font Awesome
//       7.3.1 (solid + brands) + vendored Roboto webfonts, loaded from
//       bundleDir (site/assets/vendor/**) rather than the landing/portfolio
//       node_modules vendorDeps path. globalCSS points at the bundle's
//       theme.css (its own url("../images/...) refs rewritten from the
//       source's url("../../images/...) to match the bundleDir layout,
//       where assets/images/ is a sibling of assets/css/ — see
//       starters/orbit/).
//
//       In-page 7-theme switcher (blue/cyan/green/red/violet/amber/rose):
//       navbar swatches set data-theme on <html>, persisted to localStorage
//       under 'orbit-theme'. The source site restores the saved theme
//       BEFORE first paint via an inline <script> in <head> — this starter
//       shape has no head-script slot (composeFullPageHtml's customScripts
//       only emits <script src=…>, never an inline block; see
//       ../../shared/page-html.js), so that snippet cannot be ported as-is.
//       main.js already re-applies the saved theme itself (it always has —
//       the head snippet was purely a paint-order optimization on top of
//       it), so nothing was functionally dropped; what changed here is
//       ordering: the theme-restore block was moved to the TOP of main.js'
//       IIFE (ahead of the dropdown/nav-collapse wiring it used to follow),
//       so it runs as early as main.js's single <script src> tag allows.
//       There is still one paint with the default (blue) theme before
//       main.js runs and swaps it — canvas preview never executes main.js
//       at all (consistent with Graphite; not a bug to chase here) — but a
//       served/exported page now repaints as early as this starter shape
//       permits.
// DEPENDS: nothing (imported by src/main/starters/index.js — registration
//          is part of this same port, unlike Graphite's original standalone
//          commit)
// CREATED: 2026-08-17
// =============================================================

const INDEX_BODY = `			<nav class="navbar navbar-expand-md site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Orbit</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div id="nav-links" class="collapse navbar-collapse justify-content-end">
						<ul class="navbar-nav">
							<li class="nav-item"><a class="nav-link active" href="index.html" aria-current="page">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" id="navDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">Components</a>
								<ul class="dropdown-menu" aria-labelledby="navDropdown">
									<li><a class="dropdown-item" href="index.html#hero">Hero Banner</a></li>
									<li><a class="dropdown-item" href="index.html#intro">Accent Band</a></li>
									<li><a class="dropdown-item" href="index.html#features">Feature Grid</a></li>
									<li><a class="dropdown-item" href="index.html#staff">Avatar Row</a></li>
									<li><a class="dropdown-item" href="index.html#quote">Quote Banner</a></li>
									<li class="dropdown-submenu">
										<a class="dropdown-item dropdown-toggle" href="#" id="navDropdownSubmenu" role="button" aria-expanded="false">Layouts</a>
										<ul class="dropdown-menu" aria-labelledby="navDropdownSubmenu">
											<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
											<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
											<li><a class="dropdown-item" href="two-sidebar.html">Two Sidebar</a></li>
											<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
										</ul>
									</li>
									<li><a class="dropdown-item" href="index.html#contact">Contact Block</a></li>
								</ul>
							</li>
							<li class="nav-item"><a class="nav-link" href="left-sidebar.html">Left Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="right-sidebar.html">Right Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="two-sidebar.html">Two Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="no-sidebar.html">No Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="index.html#contact">Contact</a></li>
						</ul>
						<ul class="theme-picker" aria-label="Preview color themes">
							<li><button type="button" class="theme-swatch is-active" data-theme-choice="blue" aria-pressed="true"><span class="visually-hidden">Blue theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="cyan" aria-pressed="false"><span class="visually-hidden">Cyan theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="green" aria-pressed="false"><span class="visually-hidden">Green theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="red" aria-pressed="false"><span class="visually-hidden">Red theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="violet" aria-pressed="false"><span class="visually-hidden">Violet theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="amber" aria-pressed="false"><span class="visually-hidden">Amber theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="rose" aria-pressed="false"><span class="visually-hidden">Rose theme</span></button></li>
						</ul>
					</div>
				</div>
			</nav>

			<header class="hero-banner text-white text-center" id="hero">
				<div class="container">
					<h2 class="hero-banner-title">Make an entrance</h2>
					<span class="byline">This is the hero banner: a full-bleed photo behind a dark overlay, one display heading, one line of support, and a single call to action.</span>
					<div><a href="index.html#features" class="btn btn-ghost">See the Components</a></div>
				</div>
			</header>

			<section class="intro-band text-center" id="intro">
				<div class="container">
					<header class="section-header">
						<h2 class="section-title">One accent band, one sentence</h2>
					</header>
					<div class="row justify-content-center">
						<div class="col-lg-8">
							<p>This strip exists for the line you'd say out loud &mdash; state the point of the site and let people keep scrolling. Its background is the theme accent, and every color in the template lives in a handful of <code>:root</code> custom properties: change those and the whole thing recolors, which is exactly how the cyan, green, and red variants were made from this blue one.</p>
						</div>
					</div>
				</div>
			</section>

			<section class="feature-grid-section" id="features">
				<div class="container">
					<div class="row row-cols-1 row-cols-md-2 row-cols-lg-4 g-4">
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-image" aria-hidden="true"></i></span></span>
							<h3>Hero Banner</h3>
							<p>Full-bleed photo, dark overlay, display heading &mdash; the opening move of every landing page, one scroll above this grid.</p>
						</div>
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-bars" aria-hidden="true"></i></span></span>
							<h3>Dropdown Nav</h3>
							<p>A Bootstrap navbar with a dropdown and a nested submenu, collapsing to a toggler on phones. Try Components above.</p>
						</div>
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-table-columns" aria-hidden="true"></i></span></span>
							<h3>Four Layouts</h3>
							<p>Left rail, right rail, both, or none &mdash; every page shares this chrome, so layouts mix freely across one site.</p>
						</div>
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-users" aria-hidden="true"></i></span></span>
							<h3>Avatar Row</h3>
							<p>Circular portraits for teams, authors, or speakers &mdash; faces build trust faster than any paragraph. Below.</p>
						</div>
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-quote-left" aria-hidden="true"></i></span></span>
							<h3>Quote Banner</h3>
							<p>One loud sentence over a full-width photo strip &mdash; a testimonial, a tagline, or the line you want quoted back.</p>
						</div>
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span></span>
							<h3>Contact Block</h3>
							<p>The same ready-to-wire form closes every page &mdash; point its action at your handler and it's live.</p>
						</div>
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-palette" aria-hidden="true"></i></span></span>
							<h3>Palette Variants</h3>
							<p>Seven palettes, each one <code>:root</code> value apart &mdash; flip them live with the dots in the navbar.</p>
						</div>
						<div class="col feature-item">
							<span class="icon-ring"><span class="icon-circle"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span></span>
							<h3>Zero jQuery</h3>
							<p>Bootstrap's bundle plus ~50 lines of vanilla JS run everything: dropdowns, collapse, and the nested submenu.</p>
						</div>
					</div>
					<div class="mt-4">
						<a href="left-sidebar.html" class="btn btn-ghost">Tour the Layouts</a>
					</div>
				</div>
			</section>

			<section class="staff-section" id="staff">
				<div class="container">
					<header class="section-header">
						<h2 class="section-title">The avatar row</h2>
					</header>
					<ul class="staff-list list-unstyled d-flex flex-wrap justify-content-center">
						<li class="staff-avatar"><a href="#"><img src="assets/images/team-01.jpg" class="w-100 h-100" alt="Sample portrait one" /></a></li>
						<li class="staff-avatar"><a href="#"><img src="assets/images/team-02.jpg" class="w-100 h-100" alt="Sample portrait two" /></a></li>
						<li class="staff-avatar"><a href="#"><img src="assets/images/team-03.jpg" class="w-100 h-100" alt="Sample portrait three" /></a></li>
						<li class="staff-avatar"><a href="#"><img src="assets/images/team-04.jpg" class="w-100 h-100" alt="Sample portrait four" /></a></li>
						<li class="staff-avatar"><a href="#"><img src="assets/images/team-05.jpg" class="w-100 h-100" alt="Sample portrait five" /></a></li>
					</ul>
					<p>Five portraits, centered, that read as people before they read as design. The circles are pure CSS over plain square images &mdash; drop in 320px squares, update the alt text, and link each face wherever it should go.</p>
				</div>
			</section>

			<section class="tweet-banner" id="quote">
				<div class="container">
					<span class="icon-ring"><span class="icon-circle"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span></span>
					<span class="tweet-banner-text">@orbit This strip is the quote banner &mdash; one sentence over a photo, sized to be remembered. Testimonials live well here.</span>
				</div>
			</section>

			<section class="contact-section" id="contact">
				<div class="container">
					<header class="section-header">
						<h2 class="section-title">Say Hello</h2>
					</header>
					<form method="post" action="#" class="contact-form">
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
								<textarea id="contact-message" name="message" class="form-control" placeholder="Every page ends with this same contact block &mdash; wire the form's action to your handler and it's live." rows="6"></textarea>
							</div>
							<div class="col-12">
								<button type="submit" class="btn btn-ghost">Send Message</button>
							</div>
						</div>
					</form>
				</div>
			</section>

			<footer class="site-footer">
				<div class="container">
					<header class="footer-header">
						<h2 class="footer-title">Orbit</h2>
					</header>
					<div class="row row-cols-2 row-cols-md-5 g-4 text-center">
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="left-sidebar.html">Left Sidebar</a></li>
								<li><a href="right-sidebar.html">Right Sidebar</a></li>
								<li><a href="two-sidebar.html">Two Sidebar</a></li>
								<li><a href="no-sidebar.html">No Sidebar</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html#hero">Hero Banner</a></li>
								<li><a href="index.html#features">Feature Grid</a></li>
								<li><a href="index.html#staff">Avatar Row</a></li>
								<li><a href="index.html#quote">Quote Banner</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html">Home</a></li>
								<li><a href="left-sidebar.html">Layout Tour</a></li>
								<li><a href="index.html#contact">Say Hello</a></li>
								<li><a href="index.html#hero">Back to Top</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Bootstrap 5.3</a></li>
								<li><a href="#">Font Awesome 7</a></li>
								<li><a href="#">Vendored Roboto</a></li>
								<li><a href="#">Zero jQuery</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Swap the images</a></li>
								<li><a href="#">Recolor in :root</a></li>
								<li><a href="#">Rewrite the copy</a></li>
								<li><a href="#">Ship it</a></li>
							</ul>
						</div>
					</div>
					<ul class="footer-social list-inline mb-0">
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
					</ul>
					<div class="footer-copyright">&copy; Orbit. All rights Reserved</div>
				</div>
			</footer>

	`

const LEFT_SIDEBAR_BODY = `			<nav class="navbar navbar-expand-md site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Orbit</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div id="nav-links" class="collapse navbar-collapse justify-content-end">
						<ul class="navbar-nav">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" id="navDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">Components</a>
								<ul class="dropdown-menu" aria-labelledby="navDropdown">
									<li><a class="dropdown-item" href="index.html#hero">Hero Banner</a></li>
									<li><a class="dropdown-item" href="index.html#intro">Accent Band</a></li>
									<li><a class="dropdown-item" href="index.html#features">Feature Grid</a></li>
									<li><a class="dropdown-item" href="index.html#staff">Avatar Row</a></li>
									<li><a class="dropdown-item" href="index.html#quote">Quote Banner</a></li>
									<li class="dropdown-submenu">
										<a class="dropdown-item dropdown-toggle" href="#" id="navDropdownSubmenu" role="button" aria-expanded="false">Layouts</a>
										<ul class="dropdown-menu" aria-labelledby="navDropdownSubmenu">
											<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
											<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
											<li><a class="dropdown-item" href="two-sidebar.html">Two Sidebar</a></li>
											<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
										</ul>
									</li>
									<li><a class="dropdown-item" href="index.html#contact">Contact Block</a></li>
								</ul>
							</li>
							<li class="nav-item"><a class="nav-link active" aria-current="page" href="left-sidebar.html">Left Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="right-sidebar.html">Right Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="two-sidebar.html">Two Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="no-sidebar.html">No Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="index.html#contact">Contact</a></li>
						</ul>
						<ul class="theme-picker" aria-label="Preview color themes">
							<li><button type="button" class="theme-swatch is-active" data-theme-choice="blue" aria-pressed="true"><span class="visually-hidden">Blue theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="cyan" aria-pressed="false"><span class="visually-hidden">Cyan theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="green" aria-pressed="false"><span class="visually-hidden">Green theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="red" aria-pressed="false"><span class="visually-hidden">Red theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="violet" aria-pressed="false"><span class="visually-hidden">Violet theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="amber" aria-pressed="false"><span class="visually-hidden">Amber theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="rose" aria-pressed="false"><span class="visually-hidden">Rose theme</span></button></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="page-main">
				<div class="container py-5">
					<div class="row gy-5">

						<div class="col-md-4 order-2 order-md-1">
							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">Good fits for this rail</h2>
								</header>
								<p>The left rail earns its keep when visitors need a map before they need prose.</p>
								<ul class="sidebar-link-list">
									<li><a href="#">Documentation &amp; guides</a></li>
									<li><a href="#">Project archives with filters</a></li>
									<li><a href="#">Category-driven blogs</a></li>
									<li><a href="#">Support &amp; FAQ hubs</a></li>
									<li><a href="#">Anything with taxonomy</a></li>
								</ul>
								<a href="right-sidebar.html" class="btn btn-ghost">See the Mirror Layout</a>
							</aside>

							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">Widget ideas</h2>
								</header>
								<p>Anything short and useful can live here &mdash; these are the usual suspects.</p>
								<ul class="sidebar-link-list">
									<li><a href="#">Section navigation</a></li>
									<li><a href="#">Recent posts or projects</a></li>
									<li><a href="#">Tag or category lists</a></li>
									<li><a href="#">A compact contact card</a></li>
									<li><a href="#">Newsletter signup</a></li>
									<li><a href="#">Related pages</a></li>
								</ul>
								<a href="two-sidebar.html" class="btn btn-ghost">Try Two Rails</a>
							</aside>
						</div>

						<div class="col-md-8 order-1 order-md-2">
							<article class="content-article">
								<header>
									<h2 class="section-title">Left Sidebar</h2>
									<span class="byline">A 4/8 split with the rail leading &mdash; wayfinding first, reading second</span>
								</header>
								<p>This page is built on Orbit's left-sidebar layout: a four-column rail and an eight-column reading area on desktop, collapsing to a single stack on phones. The rail is the first thing a desktop visitor scans past and the last thing a mobile visitor reaches &mdash; Bootstrap's order utilities push the article ahead of the rail once the columns stack, so small screens always lead with the content itself.</p>
								<p>Reach for this arrangement when the rail is doing navigation work: documentation with a section tree, a project archive with filters, a blog organized by category. A visitor who arrives from search gets the article immediately; a visitor who's browsing gets the map in the same glance.</p>
								<h3>The rail is furniture, not the room &mdash; it should orient people, never compete with the page they came to read.</h3>
								<p>Keep rail widgets short and scannable: a heading, a sentence of context, a tight list of links, one button. If a widget grows past that, it probably wants to be a page of its own. The two widgets on this page show the pattern at its natural size &mdash; swap their contents freely; the layout doesn't care.</p>
								<p>Every layout in this set shares the same chrome &mdash; header, quote banner, contact block, and footer are identical across all five pages &mdash; so you can mix arrangements page-by-page without the site feeling stitched together. Compare this page with its mirror image and the double-rail version using the buttons in the rail.</p>
							</article>
						</div>

				</div>
				</div>
			</div>

			<section class="tweet-banner">
				<div class="container">
					<span class="icon-ring"><span class="icon-circle"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span></span>
					<span class="tweet-banner-text">@orbit This strip is the quote banner &mdash; one sentence over a photo, sized to be remembered. Testimonials live well here.</span>
				</div>
			</section>

			<section class="contact-section">
				<div class="container">
					<header class="section-header">
						<h2 class="section-title">Say Hello</h2>
					</header>
					<form method="post" action="#" class="contact-form">
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
								<textarea id="contact-message" name="message" class="form-control" placeholder="Every page ends with this same contact block &mdash; wire the form's action to your handler and it's live." rows="6"></textarea>
							</div>
							<div class="col-12">
								<button type="submit" class="btn btn-ghost">Send Message</button>
							</div>
						</div>
					</form>
				</div>
			</section>

			<footer class="site-footer">
				<div class="container">
					<header class="footer-header">
						<h2 class="footer-title">Orbit</h2>
					</header>
					<div class="row row-cols-2 row-cols-md-5 g-4 text-center">
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="left-sidebar.html">Left Sidebar</a></li>
								<li><a href="right-sidebar.html">Right Sidebar</a></li>
								<li><a href="two-sidebar.html">Two Sidebar</a></li>
								<li><a href="no-sidebar.html">No Sidebar</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html#hero">Hero Banner</a></li>
								<li><a href="index.html#features">Feature Grid</a></li>
								<li><a href="index.html#staff">Avatar Row</a></li>
								<li><a href="index.html#quote">Quote Banner</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html">Home</a></li>
								<li><a href="left-sidebar.html">Layout Tour</a></li>
								<li><a href="index.html#contact">Say Hello</a></li>
								<li><a href="index.html#hero">Back to Top</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Bootstrap 5.3</a></li>
								<li><a href="#">Font Awesome 7</a></li>
								<li><a href="#">Vendored Roboto</a></li>
								<li><a href="#">Zero jQuery</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Swap the images</a></li>
								<li><a href="#">Recolor in :root</a></li>
								<li><a href="#">Rewrite the copy</a></li>
								<li><a href="#">Ship it</a></li>
							</ul>
						</div>
					</div>
					<ul class="footer-social list-inline mb-0">
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
					</ul>
					<div class="footer-copyright">&copy; Orbit. All rights Reserved</div>
				</div>
			</footer>

	`

const RIGHT_SIDEBAR_BODY = `			<nav class="navbar navbar-expand-md site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Orbit</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div id="nav-links" class="collapse navbar-collapse justify-content-end">
						<ul class="navbar-nav">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" id="navDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">Components</a>
								<ul class="dropdown-menu" aria-labelledby="navDropdown">
									<li><a class="dropdown-item" href="index.html#hero">Hero Banner</a></li>
									<li><a class="dropdown-item" href="index.html#intro">Accent Band</a></li>
									<li><a class="dropdown-item" href="index.html#features">Feature Grid</a></li>
									<li><a class="dropdown-item" href="index.html#staff">Avatar Row</a></li>
									<li><a class="dropdown-item" href="index.html#quote">Quote Banner</a></li>
									<li class="dropdown-submenu">
										<a class="dropdown-item dropdown-toggle" href="#" id="navDropdownSubmenu" role="button" aria-expanded="false">Layouts</a>
										<ul class="dropdown-menu" aria-labelledby="navDropdownSubmenu">
											<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
											<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
											<li><a class="dropdown-item" href="two-sidebar.html">Two Sidebar</a></li>
											<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
										</ul>
									</li>
									<li><a class="dropdown-item" href="index.html#contact">Contact Block</a></li>
								</ul>
							</li>
							<li class="nav-item"><a class="nav-link" href="left-sidebar.html">Left Sidebar</a></li>
							<li class="nav-item"><a class="nav-link active" aria-current="page" href="right-sidebar.html">Right Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="two-sidebar.html">Two Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="no-sidebar.html">No Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="index.html#contact">Contact</a></li>
						</ul>
						<ul class="theme-picker" aria-label="Preview color themes">
							<li><button type="button" class="theme-swatch is-active" data-theme-choice="blue" aria-pressed="true"><span class="visually-hidden">Blue theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="cyan" aria-pressed="false"><span class="visually-hidden">Cyan theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="green" aria-pressed="false"><span class="visually-hidden">Green theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="red" aria-pressed="false"><span class="visually-hidden">Red theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="violet" aria-pressed="false"><span class="visually-hidden">Violet theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="amber" aria-pressed="false"><span class="visually-hidden">Amber theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="rose" aria-pressed="false"><span class="visually-hidden">Rose theme</span></button></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="page-main">
				<div class="container py-5">
					<div class="row gy-5">

						<div class="col-md-8">
							<article class="content-article">
								<header>
									<h2 class="section-title">Right Sidebar</h2>
									<span class="byline">The classic article arrangement &mdash; content leads, the rail follows</span>
								</header>
								<p>This is the same 8/4 split as the left-sidebar page with the columns swapped: the reading area takes the left edge and the rail sits to the right. Readers enter a page at the top-left, so the article wins the first glance and the rail becomes a quiet second column &mdash; the arrangement most blogs and news sites settle on.</p>
								<p>It's the natural home for complementary material: author bios, related links, calls to action, a signup form. Nothing in the rail is required to understand the page; everything in it rewards the reader who finishes and wants somewhere to go next.</p>
								<h3>Put the destination in the rail, not the journey &mdash; the article is the journey.</h3>
								<p>On phones the columns stack in source order, which here already puts the article first &mdash; no order utilities needed. That's the practical difference from the left-sidebar page: this layout is simpler in the markup, while the left-rail version spends two utility classes to get the same mobile behavior.</p>
								<p>If your rail is mostly navigation, consider the left-sidebar arrangement instead; if it's mostly &ldquo;what next&rdquo; material, keep it here on the right. When you genuinely need both, the two-sidebar layout gives each job its own column.</p>
							</article>
						</div>

						<div class="col-md-4">
							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">What lives here well</h2>
								</header>
								<p>Complementary, skippable, rewarding &mdash; that's the test for a right rail.</p>
								<ul class="sidebar-link-list">
									<li><a href="#">Related articles</a></li>
									<li><a href="#">About the author</a></li>
									<li><a href="#">Calls to action</a></li>
									<li><a href="#">Newsletter signup</a></li>
									<li><a href="#">Social proof &amp; reviews</a></li>
								</ul>
								<a href="left-sidebar.html" class="btn btn-ghost">See the Left-Rail Version</a>
							</aside>

							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">Keep it light</h2>
								</header>
								<p>A right rail sinks fast when it's stuffed. Three widgets is plenty; two is better.</p>
								<ul class="sidebar-link-list">
									<li><a href="#">One clear call to action</a></li>
									<li><a href="#">One tight list of links</a></li>
									<li><a href="#">One small sign-off</a></li>
									<li><a href="#">Nothing that scrolls forever</a></li>
								</ul>
								<a href="no-sidebar.html" class="btn btn-ghost">Go Full Width</a>
							</aside>
						</div>

				</div>
				</div>
			</div>

			<section class="tweet-banner">
				<div class="container">
					<span class="icon-ring"><span class="icon-circle"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span></span>
					<span class="tweet-banner-text">@orbit This strip is the quote banner &mdash; one sentence over a photo, sized to be remembered. Testimonials live well here.</span>
				</div>
			</section>

			<section class="contact-section">
				<div class="container">
					<header class="section-header">
						<h2 class="section-title">Say Hello</h2>
					</header>
					<form method="post" action="#" class="contact-form">
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
								<textarea id="contact-message" name="message" class="form-control" placeholder="Every page ends with this same contact block &mdash; wire the form's action to your handler and it's live." rows="6"></textarea>
							</div>
							<div class="col-12">
								<button type="submit" class="btn btn-ghost">Send Message</button>
							</div>
						</div>
					</form>
				</div>
			</section>

			<footer class="site-footer">
				<div class="container">
					<header class="footer-header">
						<h2 class="footer-title">Orbit</h2>
					</header>
					<div class="row row-cols-2 row-cols-md-5 g-4 text-center">
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="left-sidebar.html">Left Sidebar</a></li>
								<li><a href="right-sidebar.html">Right Sidebar</a></li>
								<li><a href="two-sidebar.html">Two Sidebar</a></li>
								<li><a href="no-sidebar.html">No Sidebar</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html#hero">Hero Banner</a></li>
								<li><a href="index.html#features">Feature Grid</a></li>
								<li><a href="index.html#staff">Avatar Row</a></li>
								<li><a href="index.html#quote">Quote Banner</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html">Home</a></li>
								<li><a href="left-sidebar.html">Layout Tour</a></li>
								<li><a href="index.html#contact">Say Hello</a></li>
								<li><a href="index.html#hero">Back to Top</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Bootstrap 5.3</a></li>
								<li><a href="#">Font Awesome 7</a></li>
								<li><a href="#">Vendored Roboto</a></li>
								<li><a href="#">Zero jQuery</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Swap the images</a></li>
								<li><a href="#">Recolor in :root</a></li>
								<li><a href="#">Rewrite the copy</a></li>
								<li><a href="#">Ship it</a></li>
							</ul>
						</div>
					</div>
					<ul class="footer-social list-inline mb-0">
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
					</ul>
					<div class="footer-copyright">&copy; Orbit. All rights Reserved</div>
				</div>
			</footer>

	`

const TWO_SIDEBAR_BODY = `			<nav class="navbar navbar-expand-md site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Orbit</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div id="nav-links" class="collapse navbar-collapse justify-content-end">
						<ul class="navbar-nav">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" id="navDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">Components</a>
								<ul class="dropdown-menu" aria-labelledby="navDropdown">
									<li><a class="dropdown-item" href="index.html#hero">Hero Banner</a></li>
									<li><a class="dropdown-item" href="index.html#intro">Accent Band</a></li>
									<li><a class="dropdown-item" href="index.html#features">Feature Grid</a></li>
									<li><a class="dropdown-item" href="index.html#staff">Avatar Row</a></li>
									<li><a class="dropdown-item" href="index.html#quote">Quote Banner</a></li>
									<li class="dropdown-submenu">
										<a class="dropdown-item dropdown-toggle" href="#" id="navDropdownSubmenu" role="button" aria-expanded="false">Layouts</a>
										<ul class="dropdown-menu" aria-labelledby="navDropdownSubmenu">
											<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
											<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
											<li><a class="dropdown-item" href="two-sidebar.html">Two Sidebar</a></li>
											<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
										</ul>
									</li>
									<li><a class="dropdown-item" href="index.html#contact">Contact Block</a></li>
								</ul>
							</li>
							<li class="nav-item"><a class="nav-link" href="left-sidebar.html">Left Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="right-sidebar.html">Right Sidebar</a></li>
							<li class="nav-item"><a class="nav-link active" aria-current="page" href="two-sidebar.html">Two Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="no-sidebar.html">No Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="index.html#contact">Contact</a></li>
						</ul>
						<ul class="theme-picker" aria-label="Preview color themes">
							<li><button type="button" class="theme-swatch is-active" data-theme-choice="blue" aria-pressed="true"><span class="visually-hidden">Blue theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="cyan" aria-pressed="false"><span class="visually-hidden">Cyan theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="green" aria-pressed="false"><span class="visually-hidden">Green theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="red" aria-pressed="false"><span class="visually-hidden">Red theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="violet" aria-pressed="false"><span class="visually-hidden">Violet theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="amber" aria-pressed="false"><span class="visually-hidden">Amber theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="rose" aria-pressed="false"><span class="visually-hidden">Rose theme</span></button></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="page-main">
				<div class="container py-5">
					<div class="row gy-5">

						<div class="col-md-3 order-2 order-md-1">
							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">Wayfinding</h2>
								</header>
								<ul class="sidebar-link-list">
									<li><a href="left-sidebar.html">Left Sidebar</a></li>
									<li><a href="right-sidebar.html">Right Sidebar</a></li>
									<li><a href="two-sidebar.html">Two Sidebar &mdash; here</a></li>
									<li><a href="no-sidebar.html">No Sidebar</a></li>
									<li><a href="index.html">Home page</a></li>
								</ul>
								<a href="index.html" class="btn btn-ghost">Start at Home</a>
							</aside>

							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">Anatomy</h2>
								</header>
								<p>What you're looking at, in Bootstrap terms.</p>
								<ul class="sidebar-link-list">
									<li><a href="#">col-md-3 &middot; left rail</a></li>
									<li><a href="#">col-md-6 &middot; article</a></li>
									<li><a href="#">col-md-3 &middot; right rail</a></li>
									<li><a href="#">order-* &middot; mobile stacking</a></li>
									<li><a href="#">gy-5 &middot; row spacing</a></li>
								</ul>
								<a href="no-sidebar.html" class="btn btn-ghost">Full-Width Version</a>
							</aside>
						</div>

						<div class="col-md-6 order-1 order-md-2">
							<article class="content-article">
								<header>
									<h2 class="section-title">Two Sidebar</h2>
									<span class="byline">A 3/6/3 split for pages doing two jobs at once</span>
								</header>
								<p>The center column here is six of twelve columns &mdash; a comfortable reading measure &mdash; flanked by a three-column rail on each side. On phones everything stacks with the article first, then the left rail's widgets, then the right's, so the mobile page reads top-to-bottom in order of importance.</p>
								<p>Two rails make sense when navigation and action both matter on the same page: a documentation portal with a section tree on one side and download links on the other, a magazine hub with categories and a subscribe box, a dashboard-style landing with status on the left and shortcuts on the right.</p>
								<h3>Give each rail one job. The moment both rails do a bit of everything, readers stop trusting either.</h3>
								<p>The trade-off is width: at the md breakpoint each rail is only a few words wide, so keep widget titles short and lists tighter than you would on a 4/8 page. If a rail keeps wanting more room, that's the layout telling you it should be the only rail.</p>
								<p>This page keeps wayfinding on the left and &ldquo;what next&rdquo; on the right &mdash; the same division of labor described on the single-rail pages, just given a column each.</p>
							</article>
						</div>

						<div class="col-md-3 order-3">
							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">What next</h2>
								</header>
								<ul class="sidebar-link-list">
									<li><a href="index.html#hero">See the hero banner</a></li>
									<li><a href="index.html#features">Browse the feature grid</a></li>
									<li><a href="index.html#staff">Meet the avatar row</a></li>
									<li><a href="right-sidebar.html">Read about right rails</a></li>
								</ul>
								<a href="index.html#contact" class="btn btn-ghost">Get in Touch</a>
							</aside>

							<aside class="sidebar-widget">
								<header>
									<h2 class="sidebar-widget-title">Rules of thumb</h2>
								</header>
								<p>Double rails stay readable if you hold a few lines.</p>
								<ul class="sidebar-link-list">
									<li><a href="#">One job per rail</a></li>
									<li><a href="#">Titles of three words or fewer</a></li>
									<li><a href="#">Five links, not fifteen</a></li>
									<li><a href="#">Buttons at the bottom only</a></li>
								</ul>
								<a href="right-sidebar.html" class="btn btn-ghost">Single Rail Instead</a>
							</aside>
						</div>

				</div>
				</div>
			</div>

			<section class="tweet-banner">
				<div class="container">
					<span class="icon-ring"><span class="icon-circle"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span></span>
					<span class="tweet-banner-text">@orbit This strip is the quote banner &mdash; one sentence over a photo, sized to be remembered. Testimonials live well here.</span>
				</div>
			</section>

			<section class="contact-section">
				<div class="container">
					<header class="section-header">
						<h2 class="section-title">Say Hello</h2>
					</header>
					<form method="post" action="#" class="contact-form">
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
								<textarea id="contact-message" name="message" class="form-control" placeholder="Every page ends with this same contact block &mdash; wire the form's action to your handler and it's live." rows="6"></textarea>
							</div>
							<div class="col-12">
								<button type="submit" class="btn btn-ghost">Send Message</button>
							</div>
						</div>
					</form>
				</div>
			</section>

			<footer class="site-footer">
				<div class="container">
					<header class="footer-header">
						<h2 class="footer-title">Orbit</h2>
					</header>
					<div class="row row-cols-2 row-cols-md-5 g-4 text-center">
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="left-sidebar.html">Left Sidebar</a></li>
								<li><a href="right-sidebar.html">Right Sidebar</a></li>
								<li><a href="two-sidebar.html">Two Sidebar</a></li>
								<li><a href="no-sidebar.html">No Sidebar</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html#hero">Hero Banner</a></li>
								<li><a href="index.html#features">Feature Grid</a></li>
								<li><a href="index.html#staff">Avatar Row</a></li>
								<li><a href="index.html#quote">Quote Banner</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html">Home</a></li>
								<li><a href="left-sidebar.html">Layout Tour</a></li>
								<li><a href="index.html#contact">Say Hello</a></li>
								<li><a href="index.html#hero">Back to Top</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Bootstrap 5.3</a></li>
								<li><a href="#">Font Awesome 7</a></li>
								<li><a href="#">Vendored Roboto</a></li>
								<li><a href="#">Zero jQuery</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Swap the images</a></li>
								<li><a href="#">Recolor in :root</a></li>
								<li><a href="#">Rewrite the copy</a></li>
								<li><a href="#">Ship it</a></li>
							</ul>
						</div>
					</div>
					<ul class="footer-social list-inline mb-0">
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
					</ul>
					<div class="footer-copyright">&copy; Orbit. All rights Reserved</div>
				</div>
			</footer>

	`

const NO_SIDEBAR_BODY = `			<nav class="navbar navbar-expand-md site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Orbit</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div id="nav-links" class="collapse navbar-collapse justify-content-end">
						<ul class="navbar-nav">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" id="navDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">Components</a>
								<ul class="dropdown-menu" aria-labelledby="navDropdown">
									<li><a class="dropdown-item" href="index.html#hero">Hero Banner</a></li>
									<li><a class="dropdown-item" href="index.html#intro">Accent Band</a></li>
									<li><a class="dropdown-item" href="index.html#features">Feature Grid</a></li>
									<li><a class="dropdown-item" href="index.html#staff">Avatar Row</a></li>
									<li><a class="dropdown-item" href="index.html#quote">Quote Banner</a></li>
									<li class="dropdown-submenu">
										<a class="dropdown-item dropdown-toggle" href="#" id="navDropdownSubmenu" role="button" aria-expanded="false">Layouts</a>
										<ul class="dropdown-menu" aria-labelledby="navDropdownSubmenu">
											<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
											<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
											<li><a class="dropdown-item" href="two-sidebar.html">Two Sidebar</a></li>
											<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
										</ul>
									</li>
									<li><a class="dropdown-item" href="index.html#contact">Contact Block</a></li>
								</ul>
							</li>
							<li class="nav-item"><a class="nav-link" href="left-sidebar.html">Left Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="right-sidebar.html">Right Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="two-sidebar.html">Two Sidebar</a></li>
							<li class="nav-item"><a class="nav-link active" aria-current="page" href="no-sidebar.html">No Sidebar</a></li>
							<li class="nav-item"><a class="nav-link" href="index.html#contact">Contact</a></li>
						</ul>
						<ul class="theme-picker" aria-label="Preview color themes">
							<li><button type="button" class="theme-swatch is-active" data-theme-choice="blue" aria-pressed="true"><span class="visually-hidden">Blue theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="cyan" aria-pressed="false"><span class="visually-hidden">Cyan theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="green" aria-pressed="false"><span class="visually-hidden">Green theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="red" aria-pressed="false"><span class="visually-hidden">Red theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="violet" aria-pressed="false"><span class="visually-hidden">Violet theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="amber" aria-pressed="false"><span class="visually-hidden">Amber theme</span></button></li>
							<li><button type="button" class="theme-swatch" data-theme-choice="rose" aria-pressed="false"><span class="visually-hidden">Rose theme</span></button></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="page-main">
				<div class="container py-5">
					<div class="row justify-content-center">
					<div class="col-lg-10">
						<article class="content-article">
							<header>
								<h2 class="section-title">No Sidebar</h2>
								<span class="byline">One column, full measure &mdash; for pages that need room to breathe</span>
							</header>
							<p>With both rails gone the article takes the full container width &mdash; here softened to a centered ten-column reading area so long lines stay comfortable. This is the layout for pages where nothing should compete with the content: landing pages, long-form writing, legal text, and detail pages. Anything with a single message deserves the whole room &mdash; which is why detail pages usually start here.</p>
							<p>Full width doesn't mean full-width paragraphs. Long lines tire readers; if you're setting a lot of continuous text, keep the centered column and let images, galleries, and tables break out to the container edge when they need it. The layout gives you the room &mdash; spend it on the elements that benefit.</p>
							<h3>Whitespace is the sidebar now. Let it do the framing the rails used to do.</h3>
							<p>Mixing layouts across a site is the point of the set: a full-width landing page, articles with a right rail, documentation with a left one, and a two-rail hub &mdash; all sharing the same header, quote banner, contact block, and footer, so navigation feels seamless while each page gets the arrangement its content wants.</p>
							<p>That's the whole tour: four arrangements of the same page, one set of chrome. Pick per page, not per site &mdash; and when in doubt, start here with no rails and add one only when a real job shows up for it.</p>
						</article>
					</div>
				</div>
				</div>
			</div>

			<section class="tweet-banner">
				<div class="container">
					<span class="icon-ring"><span class="icon-circle"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span></span>
					<span class="tweet-banner-text">@orbit This strip is the quote banner &mdash; one sentence over a photo, sized to be remembered. Testimonials live well here.</span>
				</div>
			</section>

			<section class="contact-section">
				<div class="container">
					<header class="section-header">
						<h2 class="section-title">Say Hello</h2>
					</header>
					<form method="post" action="#" class="contact-form">
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
								<textarea id="contact-message" name="message" class="form-control" placeholder="Every page ends with this same contact block &mdash; wire the form's action to your handler and it's live." rows="6"></textarea>
							</div>
							<div class="col-12">
								<button type="submit" class="btn btn-ghost">Send Message</button>
							</div>
						</div>
					</form>
				</div>
			</section>

			<footer class="site-footer">
				<div class="container">
					<header class="footer-header">
						<h2 class="footer-title">Orbit</h2>
					</header>
					<div class="row row-cols-2 row-cols-md-5 g-4 text-center">
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="left-sidebar.html">Left Sidebar</a></li>
								<li><a href="right-sidebar.html">Right Sidebar</a></li>
								<li><a href="two-sidebar.html">Two Sidebar</a></li>
								<li><a href="no-sidebar.html">No Sidebar</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html#hero">Hero Banner</a></li>
								<li><a href="index.html#features">Feature Grid</a></li>
								<li><a href="index.html#staff">Avatar Row</a></li>
								<li><a href="index.html#quote">Quote Banner</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="index.html">Home</a></li>
								<li><a href="left-sidebar.html">Layout Tour</a></li>
								<li><a href="index.html#contact">Say Hello</a></li>
								<li><a href="index.html#hero">Back to Top</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Bootstrap 5.3</a></li>
								<li><a href="#">Font Awesome 7</a></li>
								<li><a href="#">Vendored Roboto</a></li>
								<li><a href="#">Zero jQuery</a></li>
							</ul>
						</div>
						<div class="col">
							<ul class="footer-link-list">
								<li><a href="#">Swap the images</a></li>
								<li><a href="#">Recolor in :root</a></li>
								<li><a href="#">Rewrite the copy</a></li>
								<li><a href="#">Ship it</a></li>
							</ul>
						</div>
					</div>
					<ul class="footer-social list-inline mb-0">
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
						<li class="list-inline-item"><a href="#" class="footer-social-icon"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i><span class="visually-hidden">LinkedIn</span></a></li>
					</ul>
					<div class="footer-copyright">&copy; Orbit. All rights Reserved</div>
				</div>
			</footer>

	`

export default {
  id: 'orbit',
  label: 'Orbit',
  templates: [],
  pages: [
    {
      name: 'index',
      title: 'Orbit — Bootstrap 5 Template',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: INDEX_BODY
    },
    {
      name: 'left-sidebar',
      title: 'Orbit — Left Sidebar',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: LEFT_SIDEBAR_BODY
    },
    {
      name: 'right-sidebar',
      title: 'Orbit — Right Sidebar',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: RIGHT_SIDEBAR_BODY
    },
    {
      name: 'two-sidebar',
      title: 'Orbit — Two Sidebar',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: TWO_SIDEBAR_BODY
    },
    {
      name: 'no-sidebar',
      title: 'Orbit — No Sidebar',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: NO_SIDEBAR_BODY
    }
  ],
  assets: {},
  vendorDeps: [],
  bundleDir: 'orbit',
  globalCSS: 'assets/css/theme.css',
  framework: {
    css: [
      'assets/vendor/bootstrap/bootstrap.min.css',
      'assets/vendor/fontawesome/css/fontawesome.min.css',
      'assets/vendor/fontawesome/css/solid.min.css',
      'assets/vendor/fontawesome/css/brands.min.css',
      'assets/vendor/fonts/roboto.css'
    ],
    js: ['assets/vendor/bootstrap/bootstrap.bundle.min.js']
  }
}
