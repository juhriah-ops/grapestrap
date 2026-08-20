/*
	File: assets/js/main.js
	Purpose: Behavior for the Bootstrap 5 "Vista" template — reveal-on-scroll
	         (IntersectionObserver replaces jquery.scrollex), lightbox carousel
	         jump-to-image (replaces jquery.poptrox), and mobile nav
	         auto-collapse. Smooth scrolling is handled by CSS.
	Used by: index.html (loaded after bootstrap.bundle.min.js)
	GrapeStrap starter note (2026-08-19): the standalone source also carried an
	in-page seven-palette preview (header swatches writing data-theme on
	<html>, persisted in localStorage, restored by an inline <head> snippet
	before first paint). That is demo machinery for a template gallery, not
	something a site built from this starter wants, so the swatch markup, its
	CSS, and the block that drove them are all gone — green (the :root
	defaults in theme.css) is the one palette. Nothing else in this file
	changed. A spec greps this file for the dropped localStorage key, so it is
	described here rather than quoted. See src/main/starters/vista.js.
*/

(function () {
	'use strict';

	// Reveal-on-scroll: toggle .is-visible both directions, like the original scrollex setup.
	var revealables = document.querySelectorAll('[data-reveal]');

	if ('IntersectionObserver' in window) {
		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				entry.target.classList.toggle('is-visible', entry.isIntersecting);
			});
		}, { threshold: 0.2 });

		revealables.forEach(function (el) {
			observer.observe(el);
		});
	} else {
		revealables.forEach(function (el) {
			el.classList.add('is-visible');
		});
	}

	// Lightbox: gallery thumbnails open the modal (Bootstrap data-API) at the clicked image.
	var carouselEl = document.getElementById('lightbox-carousel');

	if (carouselEl) {
		var carousel = bootstrap.Carousel.getOrCreateInstance(carouselEl, { interval: false, ride: false });

		document.querySelectorAll('[data-lightbox-index]').forEach(function (link) {
			link.addEventListener('click', function () {
				carousel.to(Number(link.dataset.lightboxIndex));
			});
		});
	}

	// Mobile nav: collapse the menu after a section link is chosen.
	var navCollapse = document.getElementById('nav-links');

	if (navCollapse) {
		navCollapse.querySelectorAll('.nav-link').forEach(function (link) {
			link.addEventListener('click', function () {
				bootstrap.Collapse.getOrCreateInstance(navCollapse, { toggle: false }).hide();
			});
		});
	}

})();
