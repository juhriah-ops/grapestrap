// =============================================================
// PATH: src/main/starters/graphite.js
// ROLE: "Graphite" starter — pure data (5 full pages ported verbatim from the
//       standalone bs5-import/graphite-light static site: index, elements,
//       left-sidebar, right-sidebar, no-sidebar). This starter has no master
//       template — each page already carries its own full navbar/off-canvas/
//       footer chrome from the source site, and cross-page nav links
//       (href="left-sidebar.html" etc.) are kept verbatim because the flat
//       pages/ export layout makes them resolve correctly as-is. Framework
//       CSS/JS is the bundle's own vendored Bootstrap 5 + Font Awesome 7
//       (solid + brands) + graphite-fonts, loaded from bundleDir
//       (site/assets/vendor/**). globalCSS points at the bundle's theme.css
//       (its own url("../images/...) refs already rewritten to match the
//       bundleDir layout — see starters/graphite/).
// DEPENDS: nothing (imported by src/main/starters/index.js — registration is
//          a separate agent's change, not made here)
// CREATED: 2026-08-02
// UPDATED: 2026-08-19 — dropped the now-unread `vendorDeps` field when the
//          node_modules vendor path left with the first-wave starters
// =============================================================

const INDEX_BODY = `			<nav class="navbar navbar-expand-md fixed-top site-navbar is-overlay" data-nav-overlay="true">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Graphite</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#nav-panel" aria-controls="nav-panel" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div class="navbar-links justify-content-end w-100">
						<ul class="navbar-nav align-items-md-center">
							<li class="nav-item"><a class="nav-link active" href="index.html" aria-current="page">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Page Layouts</a>
								<ul class="dropdown-menu">
									<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
									<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
									<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
									<li class="dropdown-submenu">
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
							<li class="nav-item"><a class="nav-link" href="elements.html">Elements</a></li>
							<li class="nav-item"><a class="nav-link nav-link-cta" href="#">Sign Up</a></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="offcanvas offcanvas-end nav-panel" tabindex="-1" id="nav-panel" aria-labelledby="nav-panel-label">
				<div class="offcanvas-header">
					<h2 class="offcanvas-title visually-hidden" id="nav-panel-label">Site navigation</h2>
					<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
				</div>
				<div class="offcanvas-body">
					<ul class="nav-panel-list">
						<li><a class="nav-panel-link" href="index.html">Home</a></li>
						<li>
							<a class="nav-panel-link" href="#">Page Layouts</a>
							<ul>
								<li><a class="nav-panel-link" href="left-sidebar.html">Left Sidebar</a></li>
								<li><a class="nav-panel-link" href="right-sidebar.html">Right Sidebar</a></li>
								<li><a class="nav-panel-link" href="no-sidebar.html">No Sidebar</a></li>
								<li>
									<a class="nav-panel-link" href="#">Submenu</a>
									<ul>
										<li><a class="nav-panel-link" href="#">Option One</a></li>
										<li><a class="nav-panel-link" href="#">Option Two</a></li>
										<li><a class="nav-panel-link" href="#">Option Three</a></li>
										<li><a class="nav-panel-link" href="#">Option Four</a></li>
									</ul>
								</li>
							</ul>
						</li>
						<li><a class="nav-panel-link" href="elements.html">Elements</a></li>
						<li><a class="nav-panel-link" href="#">Sign Up</a></li>
					</ul>
				</div>
			</div>

			<div id="hero-carousel" class="carousel slide carousel-fade hero-carousel" data-bs-ride="carousel" data-bs-interval="5000">
				<div class="carousel-inner">
					<div class="carousel-item hero-carousel-slide-1 active">
						<div class="hero-carousel-caption">
							<h2><a href="#">Magna tempus. Sed feugiat.</a></h2>
						</div>
					</div>
					<div class="carousel-item hero-carousel-slide-2">
						<div class="hero-carousel-caption">
							<h2><a href="#">Aliquam veroeros nullam.</a></h2>
						</div>
					</div>
					<div class="carousel-item hero-carousel-slide-3">
						<div class="hero-carousel-caption">
							<h2><a href="#">Consequat dolore adipiscing.</a></h2>
						</div>
					</div>
				</div>
				<div class="carousel-indicators">
					<button type="button" data-bs-target="#hero-carousel" data-bs-slide-to="0" class="active" aria-current="true" aria-label="Slide 1"></button>
					<button type="button" data-bs-target="#hero-carousel" data-bs-slide-to="1" aria-label="Slide 2"></button>
					<button type="button" data-bs-target="#hero-carousel" data-bs-slide-to="2" aria-label="Slide 3"></button>
				</div>
			</div>

			<section class="page-section page-section-lg">
				<div class="section-inner">
					<div class="row g-5 align-items-center spotlight">
						<div class="col-lg-4 spotlight-text">
							<h2>Libero bibendum nullam vitae magna sed veroeros</h2>
							<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin id interdum magna, ultricies aliquet curabitur sed metus pellentesque, ornare sapien quis.</p>
						</div>
						<div class="col-lg-8 spotlight-image">
							<img src="assets/images/pic07.jpg" alt="" />
						</div>
					</div>
				</div>
			</section>

			<section class="page-section">
				<div class="section-inner">
					<div class="row row-cols-1 row-cols-md-3 g-4 g-md-5 features-grid">
						<div class="col">
							<span class="icon-badge"><i class="fa-solid fa-pencil" aria-hidden="true"></i></span>
							<h3>Praesent sed donec</h3>
							<p>Proin consequat luctus elit, nec blandit tellus ut volutpat magna. mi euismod elementum lectus et consequat etiam lorem etiam sed tempus. Feugiat veroeros lorem ipsum dolor.</p>
						</div>
						<div class="col">
							<span class="icon-badge"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></span>
							<h3>Commodo mollis</h3>
							<p>Pellentesque, ornare sapien quis, tristique ante. Proin nec facilisis odio. Integer elementum nunc nec leo interdum, non tristique eros laoreet. Integer vitae erat suscipit commodo.</p>
						</div>
						<div class="col">
							<span class="icon-badge"><i class="fa-solid fa-cloud" aria-hidden="true"></i></span>
							<h3>Magnis curabitur</h3>
							<p>Duis vulputate sit amet metus quis facilisis. Sed dapibus neque erat fringilla tincidunt. Nullam sapien et sapien, iaculis ac varius ultrices nec metus. Aenean ultricies magna.</p>
						</div>
					</div>
				</div>
			</section>

			<section class="page-section page-section-alt">
				<div class="section-inner">
					<header class="page-title">
						<h2>Etiam sed tellus</h2>
					</header>
					<div class="row row-cols-1 row-cols-lg-2 row-cols-xl-3 g-4">
						<div class="col">
							<article class="post-card">
								<span class="post-card-image"><img src="assets/images/pic01.jpg" class="w-100" alt="" /></span>
								<div class="post-card-body">
									<h3>Congue portitor</h3>
									<p>Aenean ultricies magna non sapien rhoncus, ac ullamcorper lorem convallis. Quisque at venenatis nisi, amet finibus mauris. Sed sodales ultricies eros, sit amet sodales sapien.</p>
									<a href="#" class="btn btn-outline-accent align-self-start">More</a>
								</div>
							</article>
						</div>
						<div class="col">
							<article class="post-card">
								<span class="post-card-image"><img src="assets/images/pic02.jpg" class="w-100" alt="" /></span>
								<div class="post-card-body">
									<h3>Duis nisl euismod</h3>
									<p>Ultrices nec metus. Aenean ultricies magna et sapien rhoncus ac ullamcorper lorem convallis. Quisque at venenatis nisi amet finibus mauris. Sed sodales ultricies magna etiam.</p>
									<a href="#" class="btn btn-outline-accent align-self-start">More</a>
								</div>
							</article>
						</div>
						<div class="col">
							<article class="post-card">
								<span class="post-card-image"><img src="assets/images/pic03.jpg" class="w-100" alt="" /></span>
								<div class="post-card-body">
									<h3>Elementum auctor</h3>
									<p>Quis interdum. Lorem quis lacus justo. Sed libero condimentum vehicula sem vel, mattis amet mauris. Nullam lacinia sit amet felis vel vestibulum. Morbi aliquam aenean.</p>
									<a href="#" class="btn btn-outline-accent align-self-start">More</a>
								</div>
							</article>
						</div>
						<div class="col">
							<article class="post-card">
								<span class="post-card-image"><img src="assets/images/pic04.jpg" class="w-100" alt="" /></span>
								<div class="post-card-body">
									<h3>Urna vel lacinia</h3>
									<p>Integer vel tincidunt lacus. Nulla augue nunc, eleifend quis leo ac, maximus interdum tellus. Etiam at vestibulum felis, id efficitur risus. Praesent ac nulla ex. Duis elementum.</p>
									<a href="#" class="btn btn-outline-accent align-self-start">More</a>
								</div>
							</article>
						</div>
						<div class="col">
							<article class="post-card">
								<span class="post-card-image"><img src="assets/images/pic05.jpg" class="w-100" alt="" /></span>
								<div class="post-card-body">
									<h3>Neque et suscipit</h3>
									<p>Libero condimentum, vehicula sem vel, mattis mauris. Nullam lacinia sit amet felis vel vestibulum. Morbi in aliquam est. Aenean dapibus porttitor nulla ultrices venenatis.</p>
									<a href="#" class="btn btn-outline-accent align-self-start">More</a>
								</div>
							</article>
						</div>
						<div class="col">
							<article class="post-card">
								<span class="post-card-image"><img src="assets/images/pic06.jpg" class="w-100" alt="" /></span>
								<div class="post-card-body">
									<h3>Vestibulum placerat</h3>
									<p>Tristique tellus et ullamcorper. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Praesent mauris risus, pellentesque eu leo non, tincidunt.</p>
									<a href="#" class="btn btn-outline-accent align-self-start">More</a>
								</div>
							</article>
						</div>
					</div>
				</div>
			</section>

			<section class="page-section page-section-lg">
				<div class="section-inner">
					<div class="row g-5">
						<div class="col-lg-6">
							<h2>Send us a message</h2>
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
										<textarea id="contact-message" name="message" class="form-control" placeholder="Message" rows="5"></textarea>
									</div>
									<div class="col-12">
										<ul class="button-row">
											<li><button type="submit" class="btn btn-accent">Send Message</button></li>
											<li><button type="reset" class="btn btn-outline-accent">Reset</button></li>
										</ul>
									</div>
								</div>
							</form>
						</div>
						<div class="col-lg-6">
							<h2>Other ways to reach us</h2>
							<ul class="reach-list">
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span>
									<h3>Email</h3>
									<p><a href="#">information@untitled.tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span>
									<h3>Twitter</h3>
									<p><a href="#">twitter.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-phone" aria-hidden="true"></i></span>
									<h3>Phone</h3>
									<p>(800) 555-0000</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></span>
									<h3>Facebook</h3>
									<p><a href="#">facebook.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
									<h3>Mailing Address</h3>
									<p>1234 Fictional Avenue<br />Nashville, TN 00000<br />United States</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i></span>
									<h3>LinkedIn</h3>
									<p><a href="#">linkedin.com/untitled-tld</a></p>
								</li>
							</ul>
						</div>
					</div>
				</div>
			</section>

			<footer class="site-footer">
				<div class="section-inner d-flex flex-wrap align-items-center justify-content-between">
					<p class="copyright">&copy; Untitled Corp. All rights reserved. Lorem ipsum dolor sit amet feugiat tempus aliquam.</p>
					<ul class="footer-menu">
						<li><a class="footer-menu-link" href="#">Terms of Use</a></li>
						<li><a class="footer-menu-link" href="#">Privacy Policy</a></li>
						<li><a class="footer-menu-link" href="#">Legal Information</a></li>
					</ul>
				</div>
			</footer>

	`

const ELEMENTS_BODY = `			<nav class="navbar navbar-expand-md fixed-top site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Graphite</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#nav-panel" aria-controls="nav-panel" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div class="navbar-links justify-content-end w-100">
						<ul class="navbar-nav align-items-md-center">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Page Layouts</a>
								<ul class="dropdown-menu">
									<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
									<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
									<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
									<li class="dropdown-submenu">
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
							<li class="nav-item"><a class="nav-link active" href="elements.html" aria-current="page">Elements</a></li>
							<li class="nav-item"><a class="nav-link nav-link-cta" href="#">Sign Up</a></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="offcanvas offcanvas-end nav-panel" tabindex="-1" id="nav-panel" aria-labelledby="nav-panel-label">
				<div class="offcanvas-header">
					<h2 class="offcanvas-title visually-hidden" id="nav-panel-label">Site navigation</h2>
					<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
				</div>
				<div class="offcanvas-body">
					<ul class="nav-panel-list">
						<li><a class="nav-panel-link" href="index.html">Home</a></li>
						<li>
							<a class="nav-panel-link" href="#">Page Layouts</a>
							<ul>
								<li><a class="nav-panel-link" href="left-sidebar.html">Left Sidebar</a></li>
								<li><a class="nav-panel-link" href="right-sidebar.html">Right Sidebar</a></li>
								<li><a class="nav-panel-link" href="no-sidebar.html">No Sidebar</a></li>
								<li>
									<a class="nav-panel-link" href="#">Submenu</a>
									<ul>
										<li><a class="nav-panel-link" href="#">Option One</a></li>
										<li><a class="nav-panel-link" href="#">Option Two</a></li>
										<li><a class="nav-panel-link" href="#">Option Three</a></li>
										<li><a class="nav-panel-link" href="#">Option Four</a></li>
									</ul>
								</li>
							</ul>
						</li>
						<li><a class="nav-panel-link" href="elements.html">Elements</a></li>
						<li><a class="nav-panel-link" href="#">Sign Up</a></li>
					</ul>
				</div>
			</div>

			<main>
				<section class="page-section page-section-lg">
					<div class="section-inner">

						<header class="page-title">
							<h2>Elements</h2>
							<p>Sed magna in pharetra ultricies dolor sit amet consequat adipiscing lorem.</p>
						</header>

						<section class="mb-5">
							<h4>Text</h4>
							<p>This is <b>bold</b> and this is <strong>strong</strong>. This is <i>italic</i> and this is <em>emphasized</em>.
							This is <sup>superscript</sup> text and this is <sub>subscript</sub> text.
							This is <u>underlined</u> and this is code: <code>for (;;) { ... }</code>. Finally, <a href="#">this is a link</a>.</p>
							<hr />
							<header>
								<h4 class="heading-plain">Heading with a Subtitle</h4>
								<p>Lorem ipsum dolor sit amet nullam id egestas urna aliquam</p>
							</header>
							<p>Nunc lacinia ante nunc ac lobortis. Interdum adipiscing gravida odio porttitor sem non mi integer non faucibus ornare mi ut ante amet placerat aliquet. Volutpat eu sed ante lacinia sapien lorem accumsan varius montes viverra nibh in adipiscing blandit tempus accumsan.</p>
							<header>
								<h5 class="heading-plain">Heading with a Subtitle</h5>
								<p>Lorem ipsum dolor sit amet nullam id egestas urna aliquam</p>
							</header>
							<p>Nunc lacinia ante nunc ac lobortis. Interdum adipiscing gravida odio porttitor sem non mi integer non faucibus ornare mi ut ante amet placerat aliquet. Volutpat eu sed ante lacinia sapien lorem accumsan varius montes viverra nibh in adipiscing blandit tempus accumsan.</p>
							<hr />
							<h2>Heading Level 2</h2>
							<h3>Heading Level 3</h3>
							<h4>Heading Level 4</h4>
							<h5>Heading Level 5</h5>
							<h6>Heading Level 6</h6>
							<hr />
							<h5 class="heading-plain">Blockquote</h5>
							<blockquote>Fringilla nisl. Donec accumsan interdum nisi, quis tincidunt felis sagittis eget tempus euismod. Vestibulum ante ipsum primis in faucibus vestibulum. Blandit adipiscing eu felis iaculis volutpat ac adipiscing accumsan faucibus. Vestibulum ante ipsum primis in faucibus lorem ipsum dolor sit amet nullam adipiscing eu felis.</blockquote>
							<h5 class="heading-plain">Preformatted</h5>
							<pre><code>i = 0;

while (!deck.isInOrder()) {
    print 'Iteration ' + i;
    deck.shuffle();
    i++;
}

print 'It took ' + i + ' iterations to sort the deck.';</code></pre>
						</section>

						<section class="mb-5">
							<h4>Lists</h4>
							<div class="row g-4">
								<div class="col-md-6">
									<h5 class="heading-plain">Unordered</h5>
									<ul>
										<li>Dolor pulvinar etiam.</li>
										<li>Sagittis adipiscing.</li>
										<li>Felis enim feugiat.</li>
									</ul>
									<h5 class="heading-plain">Alternate</h5>
									<ul class="list-unstyled">
										<li class="border-top py-2">Dolor pulvinar etiam.</li>
										<li class="border-top py-2">Sagittis adipiscing.</li>
										<li class="border-top border-bottom py-2">Felis enim feugiat.</li>
									</ul>
								</div>
								<div class="col-md-6">
									<h5 class="heading-plain">Ordered</h5>
									<ol>
										<li>Dolor pulvinar etiam.</li>
										<li>Etiam vel felis viverra.</li>
										<li>Felis enim feugiat.</li>
										<li>Dolor pulvinar etiam.</li>
										<li>Etiam vel felis lorem.</li>
										<li>Felis enim et feugiat.</li>
									</ol>
									<h5 class="heading-plain">Icons</h5>
									<ul class="icon-link-row">
										<li><a href="#"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i><span class="visually-hidden">Twitter</span></a></li>
										<li><a href="#"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i><span class="visually-hidden">Facebook</span></a></li>
										<li><a href="#"><i class="fa-brands fa-instagram" aria-hidden="true"></i><span class="visually-hidden">Instagram</span></a></li>
										<li><a href="#"><i class="fa-brands fa-github" aria-hidden="true"></i><span class="visually-hidden">Github</span></a></li>
									</ul>
								</div>
							</div>
						</section>

						<section class="mb-5">
							<h4>Table</h4>
							<h5 class="heading-plain">Default</h5>
							<div class="table-responsive mb-4">
								<table class="table table-graphite">
									<thead>
										<tr>
											<th>Name</th>
											<th>Description</th>
											<th>Price</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>Item One</td>
											<td>Ante turpis integer aliquet porttitor.</td>
											<td>29.99</td>
										</tr>
										<tr>
											<td>Item Two</td>
											<td>Vis ac commodo adipiscing arcu aliquet.</td>
											<td>19.99</td>
										</tr>
										<tr>
											<td>Item Three</td>
											<td>Morbi faucibus arcu accumsan lorem.</td>
											<td>29.99</td>
										</tr>
										<tr>
											<td>Item Four</td>
											<td>Vitae integer tempus condimentum.</td>
											<td>19.99</td>
										</tr>
										<tr>
											<td>Item Five</td>
											<td>Ante turpis integer aliquet porttitor.</td>
											<td>29.99</td>
										</tr>
									</tbody>
									<tfoot>
										<tr>
											<td colspan="2"></td>
											<td>100.00</td>
										</tr>
									</tfoot>
								</table>
							</div>

							<h5 class="heading-plain">Alternate</h5>
							<div class="table-responsive">
								<table class="table table-graphite table-graphite-alt">
									<thead>
										<tr>
											<th>Name</th>
											<th>Description</th>
											<th>Price</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>Item One</td>
											<td>Ante turpis integer aliquet porttitor.</td>
											<td>29.99</td>
										</tr>
										<tr>
											<td>Item Two</td>
											<td>Vis ac commodo adipiscing arcu aliquet.</td>
											<td>19.99</td>
										</tr>
										<tr>
											<td>Item Three</td>
											<td>Morbi faucibus arcu accumsan lorem.</td>
											<td>29.99</td>
										</tr>
										<tr>
											<td>Item Four</td>
											<td>Vitae integer tempus condimentum.</td>
											<td>19.99</td>
										</tr>
										<tr>
											<td>Item Five</td>
											<td>Ante turpis integer aliquet porttitor.</td>
											<td>29.99</td>
										</tr>
									</tbody>
									<tfoot>
										<tr>
											<td colspan="2"></td>
											<td>100.00</td>
										</tr>
									</tfoot>
								</table>
							</div>
						</section>

						<section class="mb-5">
							<h4>Buttons</h4>
							<ul class="button-row">
								<li><a href="#" class="btn btn-accent">Special</a></li>
								<li><a href="#" class="btn btn-outline-accent">Default</a></li>
							</ul>
							<ul class="button-row">
								<li><a href="#" class="btn btn-outline-accent btn-lg">Big</a></li>
								<li><a href="#" class="btn btn-outline-accent">Default</a></li>
								<li><a href="#" class="btn btn-outline-accent btn-sm">Small</a></li>
							</ul>
							<ul class="button-row button-row-fit">
								<li><a href="#" class="btn btn-outline-accent">Fit</a></li>
								<li><a href="#" class="btn btn-accent">Fit</a></li>
							</ul>
							<ul class="button-row button-row-fit button-row-sm">
								<li><a href="#" class="btn btn-outline-accent btn-sm">Fit + Small</a></li>
								<li><a href="#" class="btn btn-accent btn-sm">Fit + Small</a></li>
							</ul>
							<ul class="button-row">
								<li><a href="#" class="btn btn-accent"><i class="fa-solid fa-download icon-inline" aria-hidden="true"></i>Icon</a></li>
								<li><a href="#" class="btn btn-outline-accent"><i class="fa-solid fa-download icon-inline" aria-hidden="true"></i>Icon</a></li>
							</ul>
							<ul class="button-row">
								<li><span class="btn btn-accent disabled" aria-disabled="true">Disabled</span></li>
								<li><span class="btn btn-outline-accent disabled" aria-disabled="true">Disabled</span></li>
							</ul>
						</section>

						<section class="mb-5">
							<h4>Form</h4>
							<form method="post" action="#">
								<div class="row g-3">
									<div class="col-md-6">
										<label for="demo-name" class="visually-hidden">Name</label>
										<input type="text" name="demo-name" id="demo-name" class="form-control" placeholder="Name" />
									</div>
									<div class="col-md-6">
										<label for="demo-email" class="visually-hidden">Email</label>
										<input type="email" name="demo-email" id="demo-email" class="form-control" placeholder="Email" />
									</div>
									<div class="col-12">
										<label for="demo-category" class="visually-hidden">Category</label>
										<select name="demo-category" id="demo-category" class="form-select">
											<option value="">- Category -</option>
											<option value="1">Manufacturing</option>
											<option value="2">Shipping</option>
											<option value="3">Administration</option>
											<option value="4">Human Resources</option>
										</select>
									</div>
									<div class="col-sm-4">
										<div class="form-check">
											<input type="radio" id="demo-priority-low" name="demo-priority" class="form-check-input" checked />
											<label for="demo-priority-low" class="form-check-label">Low</label>
										</div>
									</div>
									<div class="col-sm-4">
										<div class="form-check">
											<input type="radio" id="demo-priority-normal" name="demo-priority" class="form-check-input" />
											<label for="demo-priority-normal" class="form-check-label">Normal</label>
										</div>
									</div>
									<div class="col-sm-4">
										<div class="form-check">
											<input type="radio" id="demo-priority-high" name="demo-priority" class="form-check-input" />
											<label for="demo-priority-high" class="form-check-label">High</label>
										</div>
									</div>
									<div class="col-sm-6">
										<div class="form-check">
											<input type="checkbox" id="demo-copy" name="demo-copy" class="form-check-input" />
											<label for="demo-copy" class="form-check-label">Email me a copy</label>
										</div>
									</div>
									<div class="col-sm-6">
										<div class="form-check">
											<input type="checkbox" id="demo-human" name="demo-human" class="form-check-input" checked />
											<label for="demo-human" class="form-check-label">Not a robot</label>
										</div>
									</div>
									<div class="col-12">
										<label for="demo-message" class="visually-hidden">Message</label>
										<textarea name="demo-message" id="demo-message" class="form-control" placeholder="Enter your message" rows="6"></textarea>
									</div>
									<div class="col-12">
										<ul class="button-row">
											<li><button type="submit" class="btn btn-accent">Send Message</button></li>
											<li><button type="reset" class="btn btn-outline-accent">Reset</button></li>
										</ul>
									</div>
								</div>
							</form>
						</section>

						<section>
							<h4>Image</h4>
							<h5 class="heading-plain">Fit</h5>
							<div class="row g-3 mb-4">
								<div class="col-12"><img src="assets/images/pic07.jpg" class="fit-photo" alt="" /></div>
								<div class="col-4"><img src="assets/images/pic01.jpg" class="fit-photo" alt="" /></div>
								<div class="col-4"><img src="assets/images/pic02.jpg" class="fit-photo" alt="" /></div>
								<div class="col-4"><img src="assets/images/pic03.jpg" class="fit-photo" alt="" /></div>
								<div class="col-4"><img src="assets/images/pic03.jpg" class="fit-photo" alt="" /></div>
								<div class="col-4"><img src="assets/images/pic01.jpg" class="fit-photo" alt="" /></div>
								<div class="col-4"><img src="assets/images/pic02.jpg" class="fit-photo" alt="" /></div>
							</div>
							<h5 class="heading-plain">Left &amp; Right</h5>
							<p><img src="assets/images/pic08.jpg" class="inline-photo inline-photo-start" alt="" />Morbi mattis mi consectetur tortor elementum, varius pellentesque velit convallis. Aenean tincidunt lectus auctor mauris maximus, ac scelerisque ipsum tempor. Duis vulputate ex et ex tincidunt, quis lacinia velit aliquet. Duis non efficitur nisi, id malesuada justo. Maecenas sagittis felis ac sagittis semper. Curabitur purus leo, tempus sed finibus eget, fringilla quis risus. Maecenas et lorem quis sem varius sagittis et a est. Maecenas iaculis iaculis sem. Donec vel dolor at arcu tincidunt bibendum. Interdum et malesuada fames ac ante ipsum primis in faucibus. Fusce ut aliquet justo. Donec id neque ipsum. Integer eget ultricies odio. Nam vel ex a orci fringilla tincidunt. Aliquam eleifend ligula non velit accumsan cursus. Etiam ut gravida sapien.</p>
							<p><img src="assets/images/pic08.jpg" class="inline-photo inline-photo-end" alt="" />Vestibulum ultrices risus velit, sit amet blandit massa auctor sit amet. Sed eu lectus sem. Phasellus in odio at ipsum porttitor mollis id vel diam. Praesent sit amet posuere risus, eu faucibus lectus. Vivamus ex ligula, tempus pulvinar ipsum in, auctor porta quam. Proin nec dui cursus, posuere dui eget interdum. Fusce lectus magna, sagittis at facilisis vitae, pellentesque at etiam. Quisque posuere leo quis sem commodo, vel scelerisque nisi scelerisque. Suspendisse id quam vel tortor tincidunt suscipit.</p>
						</section>

					</div>
				</section>
			</main>

			<section class="page-section page-section-alt">
				<div class="section-inner">
					<div class="row g-5">
						<div class="col-lg-6">
							<h2>Send us a message</h2>
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
										<textarea id="contact-message" name="message" class="form-control" placeholder="Message" rows="5"></textarea>
									</div>
									<div class="col-12">
										<ul class="button-row">
											<li><button type="submit" class="btn btn-accent">Send Message</button></li>
											<li><button type="reset" class="btn btn-outline-accent">Reset</button></li>
										</ul>
									</div>
								</div>
							</form>
						</div>
						<div class="col-lg-6">
							<h2>Other ways to reach us</h2>
							<ul class="reach-list">
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span>
									<h3>Email</h3>
									<p><a href="#">information@untitled.tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span>
									<h3>Twitter</h3>
									<p><a href="#">twitter.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-phone" aria-hidden="true"></i></span>
									<h3>Phone</h3>
									<p>(800) 555-0000</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></span>
									<h3>Facebook</h3>
									<p><a href="#">facebook.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
									<h3>Mailing Address</h3>
									<p>1234 Fictional Avenue<br />Nashville, TN 00000<br />United States</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i></span>
									<h3>LinkedIn</h3>
									<p><a href="#">linkedin.com/untitled-tld</a></p>
								</li>
							</ul>
						</div>
					</div>
				</div>
			</section>

			<footer class="site-footer">
				<div class="section-inner d-flex flex-wrap align-items-center justify-content-between">
					<p class="copyright">&copy; Untitled Corp. All rights reserved. Lorem ipsum dolor sit amet feugiat tempus aliquam.</p>
					<ul class="footer-menu">
						<li><a class="footer-menu-link" href="#">Terms of Use</a></li>
						<li><a class="footer-menu-link" href="#">Privacy Policy</a></li>
						<li><a class="footer-menu-link" href="#">Legal Information</a></li>
					</ul>
				</div>
			</footer>

	`

const LEFT_SIDEBAR_BODY = `			<nav class="navbar navbar-expand-md fixed-top site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Graphite</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#nav-panel" aria-controls="nav-panel" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div class="navbar-links justify-content-end w-100">
						<ul class="navbar-nav align-items-md-center">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Page Layouts</a>
								<ul class="dropdown-menu">
									<li><a class="dropdown-item active" href="left-sidebar.html" aria-current="page">Left Sidebar</a></li>
									<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
									<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
									<li class="dropdown-submenu">
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
							<li class="nav-item"><a class="nav-link" href="elements.html">Elements</a></li>
							<li class="nav-item"><a class="nav-link nav-link-cta" href="#">Sign Up</a></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="offcanvas offcanvas-end nav-panel" tabindex="-1" id="nav-panel" aria-labelledby="nav-panel-label">
				<div class="offcanvas-header">
					<h2 class="offcanvas-title visually-hidden" id="nav-panel-label">Site navigation</h2>
					<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
				</div>
				<div class="offcanvas-body">
					<ul class="nav-panel-list">
						<li><a class="nav-panel-link" href="index.html">Home</a></li>
						<li>
							<a class="nav-panel-link" href="#">Page Layouts</a>
							<ul>
								<li><a class="nav-panel-link" href="left-sidebar.html">Left Sidebar</a></li>
								<li><a class="nav-panel-link" href="right-sidebar.html">Right Sidebar</a></li>
								<li><a class="nav-panel-link" href="no-sidebar.html">No Sidebar</a></li>
								<li>
									<a class="nav-panel-link" href="#">Submenu</a>
									<ul>
										<li><a class="nav-panel-link" href="#">Option One</a></li>
										<li><a class="nav-panel-link" href="#">Option Two</a></li>
										<li><a class="nav-panel-link" href="#">Option Three</a></li>
										<li><a class="nav-panel-link" href="#">Option Four</a></li>
									</ul>
								</li>
							</ul>
						</li>
						<li><a class="nav-panel-link" href="elements.html">Elements</a></li>
						<li><a class="nav-panel-link" href="#">Sign Up</a></li>
					</ul>
				</div>
			</div>

			<section class="page-section page-section-lg">
				<div class="section-inner">

					<header class="page-title">
						<h2>Left Sidebar</h2>
						<p>Sed magna in pharetra ultricies dolor sit amet consequat adipiscing lorem.</p>
					</header>

					<div class="row gy-5 content-layout content-layout-left">

							<div class="col-md-8 content-main">
								<article>
									<a href="#" class="content-image-link"><img src="assets/images/pic07.jpg" alt="" /></a>
									<h3>Dolore Amet Consequat</h3>
									<p>Aliquam massa urna, imperdiet sit amet mi non, bibendum euismod est. Curabitur mi justo, tincidunt vel eros ullamcorper, porta cursus justo. Cras vel neque eros. Vestibulum diam quam, mollis at magna consectetur non, malesuada quis augue. Morbi tincidunt pretium interdum est. Curabitur mi justo, tincidunt vel eros ullamcorper, porta cursus justo. Cras vel neque eros. Vestibulum diam.</p>
									<p>Vestibulum diam quam, mollis at consectetur non, malesuada quis augue. Morbi tincidunt pretium interdum. Morbi mattis elementum orci, nec dictum porta cursus justo. Quisque ultricies lorem in ligula condimentum, et egestas turpis sagittis. Cras ac nunc urna. Nullam eget lobortis purus. Phasellus vitae tortor non est placerat tristique.</p>
									<h3>Sed Magna Ornare</h3>
									<p>In vestibulum massa quis arcu lobortis tempus. Nam pretium arcu in odio vulputate luctus. Suspendisse euismod lorem eget lacinia fringilla. Sed sed felis justo. Nunc sodales elit in laoreet aliquam. Nam gravida, nisl sit amet iaculis porttitor, risus nisi rutrum metus.</p>
									<ul>
										<li>Faucibus orci lobortis ac adipiscing integer.</li>
										<li>Col accumsan arcu mi aliquet placerat.</li>
										<li>Lobortis vestibulum ut magna tempor massa nascetur.</li>
										<li>Blandit massa non blandit tempor interdum.</li>
										<li>Lacinia mattis arcu nascetur lobortis.</li>
									</ul>
								</article>
							</div>

							<div class="col-md-4 content-sidebar">
								<aside class="sidebar-widget">
									<h3>Magna Feugiat</h3>
									<p>Sed tristique purus vitae volutpat commodo suscipit amet sed nibh. Proin a ullamcorper sed blandit. Sed tristique purus vitae volutpat commodo suscipit ullamcorper commodo suscipit amet sed nibh. Proin a ullamcorper sed blandit.</p>
									<ul class="button-row">
										<li><a href="#" class="btn btn-outline-accent">Learn More</a></li>
									</ul>
								</aside>

								<aside class="sidebar-widget">
									<a href="#" class="content-image-link"><img src="assets/images/pic01.jpg" alt="" /></a>
									<h3>Amet Lorem Tempus</h3>
									<p>Sed tristique purus vitae volutpat commodo suscipit amet sed nibh. Proin a ullamcorper sed blandit. Sed tristique purus vitae volutpat commodo suscipit ullamcorper sed blandit lorem ipsum dolore.</p>
									<ul class="button-row">
										<li><a href="#" class="btn btn-outline-accent">Learn More</a></li>
									</ul>
								</aside>
							</div>

					</div>

				</div>
			</section>

			<section class="page-section page-section-alt">
				<div class="section-inner">
					<div class="row g-5">
						<div class="col-lg-6">
							<h2>Send us a message</h2>
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
										<textarea id="contact-message" name="message" class="form-control" placeholder="Message" rows="5"></textarea>
									</div>
									<div class="col-12">
										<ul class="button-row">
											<li><button type="submit" class="btn btn-accent">Send Message</button></li>
											<li><button type="reset" class="btn btn-outline-accent">Reset</button></li>
										</ul>
									</div>
								</div>
							</form>
						</div>
						<div class="col-lg-6">
							<h2>Other ways to reach us</h2>
							<ul class="reach-list">
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span>
									<h3>Email</h3>
									<p><a href="#">information@untitled.tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span>
									<h3>Twitter</h3>
									<p><a href="#">twitter.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-phone" aria-hidden="true"></i></span>
									<h3>Phone</h3>
									<p>(800) 555-0000</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></span>
									<h3>Facebook</h3>
									<p><a href="#">facebook.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
									<h3>Mailing Address</h3>
									<p>1234 Fictional Avenue<br />Nashville, TN 00000<br />United States</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i></span>
									<h3>LinkedIn</h3>
									<p><a href="#">linkedin.com/untitled-tld</a></p>
								</li>
							</ul>
						</div>
					</div>
				</div>
			</section>

			<footer class="site-footer">
				<div class="section-inner d-flex flex-wrap align-items-center justify-content-between">
					<p class="copyright">&copy; Untitled Corp. All rights reserved. Lorem ipsum dolor sit amet feugiat tempus aliquam.</p>
					<ul class="footer-menu">
						<li><a class="footer-menu-link" href="#">Terms of Use</a></li>
						<li><a class="footer-menu-link" href="#">Privacy Policy</a></li>
						<li><a class="footer-menu-link" href="#">Legal Information</a></li>
					</ul>
				</div>
			</footer>

	`

const RIGHT_SIDEBAR_BODY = `			<nav class="navbar navbar-expand-md fixed-top site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Graphite</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#nav-panel" aria-controls="nav-panel" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div class="navbar-links justify-content-end w-100">
						<ul class="navbar-nav align-items-md-center">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Page Layouts</a>
								<ul class="dropdown-menu">
									<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
									<li><a class="dropdown-item active" href="right-sidebar.html" aria-current="page">Right Sidebar</a></li>
									<li><a class="dropdown-item" href="no-sidebar.html">No Sidebar</a></li>
									<li class="dropdown-submenu">
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
							<li class="nav-item"><a class="nav-link" href="elements.html">Elements</a></li>
							<li class="nav-item"><a class="nav-link nav-link-cta" href="#">Sign Up</a></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="offcanvas offcanvas-end nav-panel" tabindex="-1" id="nav-panel" aria-labelledby="nav-panel-label">
				<div class="offcanvas-header">
					<h2 class="offcanvas-title visually-hidden" id="nav-panel-label">Site navigation</h2>
					<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
				</div>
				<div class="offcanvas-body">
					<ul class="nav-panel-list">
						<li><a class="nav-panel-link" href="index.html">Home</a></li>
						<li>
							<a class="nav-panel-link" href="#">Page Layouts</a>
							<ul>
								<li><a class="nav-panel-link" href="left-sidebar.html">Left Sidebar</a></li>
								<li><a class="nav-panel-link" href="right-sidebar.html">Right Sidebar</a></li>
								<li><a class="nav-panel-link" href="no-sidebar.html">No Sidebar</a></li>
								<li>
									<a class="nav-panel-link" href="#">Submenu</a>
									<ul>
										<li><a class="nav-panel-link" href="#">Option One</a></li>
										<li><a class="nav-panel-link" href="#">Option Two</a></li>
										<li><a class="nav-panel-link" href="#">Option Three</a></li>
										<li><a class="nav-panel-link" href="#">Option Four</a></li>
									</ul>
								</li>
							</ul>
						</li>
						<li><a class="nav-panel-link" href="elements.html">Elements</a></li>
						<li><a class="nav-panel-link" href="#">Sign Up</a></li>
					</ul>
				</div>
			</div>

			<section class="page-section page-section-lg">
				<div class="section-inner">

					<header class="page-title">
						<h2>Right Sidebar</h2>
						<p>Sed magna in pharetra ultricies dolor sit amet consequat adipiscing lorem.</p>
					</header>

					<div class="row gy-5 content-layout">

							<div class="col-md-8 content-main">
								<article>
									<a href="#" class="content-image-link"><img src="assets/images/pic07.jpg" alt="" /></a>
									<h3>Dolore Amet Consequat</h3>
									<p>Aliquam massa urna, imperdiet sit amet mi non, bibendum euismod est. Curabitur mi justo, tincidunt vel eros ullamcorper, porta cursus justo. Cras vel neque eros. Vestibulum diam quam, mollis at magna consectetur non, malesuada quis augue. Morbi tincidunt pretium interdum est. Curabitur mi justo, tincidunt vel eros ullamcorper, porta cursus justo. Cras vel neque eros. Vestibulum diam.</p>
									<p>Vestibulum diam quam, mollis at consectetur non, malesuada quis augue. Morbi tincidunt pretium interdum. Morbi mattis elementum orci, nec dictum porta cursus justo. Quisque ultricies lorem in ligula condimentum, et egestas turpis sagittis. Cras ac nunc urna. Nullam eget lobortis purus. Phasellus vitae tortor non est placerat tristique.</p>
									<h3>Sed Magna Ornare</h3>
									<p>In vestibulum massa quis arcu lobortis tempus. Nam pretium arcu in odio vulputate luctus. Suspendisse euismod lorem eget lacinia fringilla. Sed sed felis justo. Nunc sodales elit in laoreet aliquam. Nam gravida, nisl sit amet iaculis porttitor, risus nisi rutrum metus.</p>
									<ul>
										<li>Faucibus orci lobortis ac adipiscing integer.</li>
										<li>Col accumsan arcu mi aliquet placerat.</li>
										<li>Lobortis vestibulum ut magna tempor massa nascetur.</li>
										<li>Blandit massa non blandit tempor interdum.</li>
										<li>Lacinia mattis arcu nascetur lobortis.</li>
									</ul>
								</article>
							</div>

							<div class="col-md-4 content-sidebar">
								<aside class="sidebar-widget">
									<h3>Magna Feugiat</h3>
									<p>Sed tristique purus vitae volutpat commodo suscipit amet sed nibh. Proin a ullamcorper sed blandit. Sed tristique purus vitae volutpat commodo suscipit ullamcorper commodo suscipit amet sed nibh. Proin a ullamcorper sed blandit.</p>
									<ul class="button-row">
										<li><a href="#" class="btn btn-outline-accent">Learn More</a></li>
									</ul>
								</aside>

								<aside class="sidebar-widget">
									<a href="#" class="content-image-link"><img src="assets/images/pic01.jpg" alt="" /></a>
									<h3>Amet Lorem Tempus</h3>
									<p>Sed tristique purus vitae volutpat commodo suscipit amet sed nibh. Proin a ullamcorper sed blandit. Sed tristique purus vitae volutpat commodo suscipit ullamcorper sed blandit lorem ipsum dolore.</p>
									<ul class="button-row">
										<li><a href="#" class="btn btn-outline-accent">Learn More</a></li>
									</ul>
								</aside>
							</div>

					</div>

				</div>
			</section>

			<section class="page-section page-section-alt">
				<div class="section-inner">
					<div class="row g-5">
						<div class="col-lg-6">
							<h2>Send us a message</h2>
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
										<textarea id="contact-message" name="message" class="form-control" placeholder="Message" rows="5"></textarea>
									</div>
									<div class="col-12">
										<ul class="button-row">
											<li><button type="submit" class="btn btn-accent">Send Message</button></li>
											<li><button type="reset" class="btn btn-outline-accent">Reset</button></li>
										</ul>
									</div>
								</div>
							</form>
						</div>
						<div class="col-lg-6">
							<h2>Other ways to reach us</h2>
							<ul class="reach-list">
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span>
									<h3>Email</h3>
									<p><a href="#">information@untitled.tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span>
									<h3>Twitter</h3>
									<p><a href="#">twitter.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-phone" aria-hidden="true"></i></span>
									<h3>Phone</h3>
									<p>(800) 555-0000</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></span>
									<h3>Facebook</h3>
									<p><a href="#">facebook.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
									<h3>Mailing Address</h3>
									<p>1234 Fictional Avenue<br />Nashville, TN 00000<br />United States</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i></span>
									<h3>LinkedIn</h3>
									<p><a href="#">linkedin.com/untitled-tld</a></p>
								</li>
							</ul>
						</div>
					</div>
				</div>
			</section>

			<footer class="site-footer">
				<div class="section-inner d-flex flex-wrap align-items-center justify-content-between">
					<p class="copyright">&copy; Untitled Corp. All rights reserved. Lorem ipsum dolor sit amet feugiat tempus aliquam.</p>
					<ul class="footer-menu">
						<li><a class="footer-menu-link" href="#">Terms of Use</a></li>
						<li><a class="footer-menu-link" href="#">Privacy Policy</a></li>
						<li><a class="footer-menu-link" href="#">Legal Information</a></li>
					</ul>
				</div>
			</footer>

	`

const NO_SIDEBAR_BODY = `			<nav class="navbar navbar-expand-md fixed-top site-navbar">
				<div class="container-fluid">
					<a class="navbar-brand site-logo" href="index.html">Graphite</a>
					<button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#nav-panel" aria-controls="nav-panel" aria-label="Toggle navigation">
						<span class="navbar-toggler-icon"></span>
					</button>
					<div class="navbar-links justify-content-end w-100">
						<ul class="navbar-nav align-items-md-center">
							<li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
							<li class="nav-item dropdown">
								<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Page Layouts</a>
								<ul class="dropdown-menu">
									<li><a class="dropdown-item" href="left-sidebar.html">Left Sidebar</a></li>
									<li><a class="dropdown-item" href="right-sidebar.html">Right Sidebar</a></li>
									<li><a class="dropdown-item active" href="no-sidebar.html" aria-current="page">No Sidebar</a></li>
									<li class="dropdown-submenu">
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
							<li class="nav-item"><a class="nav-link" href="elements.html">Elements</a></li>
							<li class="nav-item"><a class="nav-link nav-link-cta" href="#">Sign Up</a></li>
						</ul>
					</div>
				</div>
			</nav>

			<div class="offcanvas offcanvas-end nav-panel" tabindex="-1" id="nav-panel" aria-labelledby="nav-panel-label">
				<div class="offcanvas-header">
					<h2 class="offcanvas-title visually-hidden" id="nav-panel-label">Site navigation</h2>
					<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>
				</div>
				<div class="offcanvas-body">
					<ul class="nav-panel-list">
						<li><a class="nav-panel-link" href="index.html">Home</a></li>
						<li>
							<a class="nav-panel-link" href="#">Page Layouts</a>
							<ul>
								<li><a class="nav-panel-link" href="left-sidebar.html">Left Sidebar</a></li>
								<li><a class="nav-panel-link" href="right-sidebar.html">Right Sidebar</a></li>
								<li><a class="nav-panel-link" href="no-sidebar.html">No Sidebar</a></li>
								<li>
									<a class="nav-panel-link" href="#">Submenu</a>
									<ul>
										<li><a class="nav-panel-link" href="#">Option One</a></li>
										<li><a class="nav-panel-link" href="#">Option Two</a></li>
										<li><a class="nav-panel-link" href="#">Option Three</a></li>
										<li><a class="nav-panel-link" href="#">Option Four</a></li>
									</ul>
								</li>
							</ul>
						</li>
						<li><a class="nav-panel-link" href="elements.html">Elements</a></li>
						<li><a class="nav-panel-link" href="#">Sign Up</a></li>
					</ul>
				</div>
			</div>

			<section class="page-section page-section-lg">
				<div class="section-inner">

					<header class="page-title">
						<h2>No Sidebar</h2>
						<p>Sed magna in pharetra ultricies dolor sit amet consequat adipiscing lorem.</p>
					</header>

					<div class="row justify-content-center">
						<div class="col-lg-9">
							<article>
								<a href="#" class="content-image-link"><img src="assets/images/pic07.jpg" alt="" /></a>
								<h3>Dolore Amet Consequat</h3>
								<p>Aliquam massa urna, imperdiet sit amet mi non, bibendum euismod est. Curabitur mi justo, tincidunt vel eros ullamcorper, porta cursus justo. Cras vel neque eros. Vestibulum diam quam, mollis at magna consectetur non, malesuada quis augue. Morbi tincidunt pretium interdum est. Curabitur mi justo, tincidunt vel eros ullamcorper, porta cursus justo. Cras vel neque eros. Vestibulum diam.</p>
								<p>Vestibulum diam quam, mollis at consectetur non, malesuada quis augue. Morbi tincidunt pretium interdum. Morbi mattis elementum orci, nec dictum porta cursus justo. Quisque ultricies lorem in ligula condimentum, et egestas turpis sagittis. Cras ac nunc urna. Nullam eget lobortis purus. Phasellus vitae tortor non est placerat tristique.</p>
								<h3>Sed Magna Ornare</h3>
								<p>In vestibulum massa quis arcu lobortis tempus. Nam pretium arcu in odio vulputate luctus. Suspendisse euismod lorem eget lacinia fringilla. Sed sed felis justo. Nunc sodales elit in laoreet aliquam. Nam gravida, nisl sit amet iaculis porttitor, risus nisi rutrum metus.</p>
								<ul>
									<li>Faucibus orci lobortis ac adipiscing integer.</li>
									<li>Col accumsan arcu mi aliquet placerat.</li>
									<li>Lobortis vestibulum ut magna tempor massa nascetur.</li>
									<li>Blandit massa non blandit tempor interdum.</li>
									<li>Lacinia mattis arcu nascetur lobortis.</li>
								</ul>
							</article>
						</div>
					</div>

				</div>
			</section>

			<section class="page-section page-section-alt">
				<div class="section-inner">
					<div class="row g-5">
						<div class="col-lg-6">
							<h2>Send us a message</h2>
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
										<textarea id="contact-message" name="message" class="form-control" placeholder="Message" rows="5"></textarea>
									</div>
									<div class="col-12">
										<ul class="button-row">
											<li><button type="submit" class="btn btn-accent">Send Message</button></li>
											<li><button type="reset" class="btn btn-outline-accent">Reset</button></li>
										</ul>
									</div>
								</div>
							</form>
						</div>
						<div class="col-lg-6">
							<h2>Other ways to reach us</h2>
							<ul class="reach-list">
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-envelope" aria-hidden="true"></i></span>
									<h3>Email</h3>
									<p><a href="#">information@untitled.tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i></span>
									<h3>Twitter</h3>
									<p><a href="#">twitter.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-phone" aria-hidden="true"></i></span>
									<h3>Phone</h3>
									<p>(800) 555-0000</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></span>
									<h3>Facebook</h3>
									<p><a href="#">facebook.com/untitled-tld</a></p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-solid fa-house" aria-hidden="true"></i></span>
									<h3>Mailing Address</h3>
									<p>1234 Fictional Avenue<br />Nashville, TN 00000<br />United States</p>
								</li>
								<li class="reach-item">
									<span class="icon-badge icon-badge-sm"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i></span>
									<h3>LinkedIn</h3>
									<p><a href="#">linkedin.com/untitled-tld</a></p>
								</li>
							</ul>
						</div>
					</div>
				</div>
			</section>

			<footer class="site-footer">
				<div class="section-inner d-flex flex-wrap align-items-center justify-content-between">
					<p class="copyright">&copy; Untitled Corp. All rights reserved. Lorem ipsum dolor sit amet feugiat tempus aliquam.</p>
					<ul class="footer-menu">
						<li><a class="footer-menu-link" href="#">Terms of Use</a></li>
						<li><a class="footer-menu-link" href="#">Privacy Policy</a></li>
						<li><a class="footer-menu-link" href="#">Legal Information</a></li>
					</ul>
				</div>
			</footer>

	`

export default {
  id: 'graphite',
  label: 'Graphite',
  templates: [],
  pages: [
    {
      name: 'index',
      title: 'Graphite',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: INDEX_BODY
    },
    {
      name: 'elements',
      title: 'Elements — Graphite',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: ELEMENTS_BODY
    },
    {
      name: 'left-sidebar',
      title: 'Left Sidebar — Graphite',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: LEFT_SIDEBAR_BODY
    },
    {
      name: 'right-sidebar',
      title: 'Right Sidebar — Graphite',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: RIGHT_SIDEBAR_BODY
    },
    {
      name: 'no-sidebar',
      title: 'No Sidebar — Graphite',
      description: '',
      customLinks: [],
      customScripts: [{ src: 'assets/js/main.js' }],
      body: NO_SIDEBAR_BODY
    }
  ],
  assets: {},
  bundleDir: 'graphite',
  globalCSS: 'assets/css/theme.css',
  framework: {
    css: [
      'assets/vendor/bootstrap/bootstrap.min.css',
      'assets/vendor/fontawesome/css/fontawesome.min.css',
      'assets/vendor/fontawesome/css/solid.min.css',
      'assets/vendor/fontawesome/css/brands.min.css',
      'assets/vendor/fonts/graphite-fonts.css'
    ],
    js: ['assets/vendor/bootstrap/bootstrap.bundle.min.js']
  }
}
