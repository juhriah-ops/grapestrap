/*
	File: assets/js/main.js
	Purpose: Behavior for the Bootstrap 5 "Graphite" template — navbar overlay-to-solid
	         toggle on scroll (replaces jquery.scrollex header reveal, index.html
	         only), nested dropdown submenu (replaces jquery.dropotron's nested
	         menus), off-canvas nav panel auto-close on link click. The hero
	         carousel, dropdowns, and off-canvas panel itself are handled by
	         Bootstrap's own data-API and need no extra wiring here.
	Used by: index.html, elements.html, left-sidebar.html, right-sidebar.html,
	         no-sidebar.html (loaded after bootstrap.bundle.min.js)
*/

(function () {
	'use strict';

	/**
	 * Wires the navbar's overlay-to-solid transition for pages that start
	 * with a transparent nav floating over the hero carousel (index.html
	 * only). Watches the carousel with an IntersectionObserver: overlay
	 * while it's in view, solid once it scrolls out.
	 * @returns {void}
	 */
	function initNavbarOverlay() {
		var navbar = document.querySelector('.site-navbar[data-nav-overlay]');
		var hero = document.querySelector('.hero-carousel');

		// Nothing to observe — page never had the overlay state to begin with.
		if (!navbar || !hero) return;

		if (!('IntersectionObserver' in window)) {
			// No observer support: fall back to the always-solid navbar.
			navbar.classList.remove('is-overlay');
			return;
		}

		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				navbar.classList.toggle('is-overlay', entry.isIntersecting);
			});
		}, { rootMargin: '-1px 0px 0px 0px', threshold: 0 });

		observer.observe(hero);
	}

	/**
	 * Closes every open nested submenu within a given dropdown menu and
	 * resets their toggle's aria-expanded state.
	 * @param {HTMLElement} scope - element to search inside for open submenus
	 * @returns {void}
	 */
	function closeNestedSubmenus(scope) {
		scope.querySelectorAll('.dropdown-submenu.show').forEach(function (openItem) {
			openItem.classList.remove('show');
			var toggle = openItem.querySelector(':scope > .dropdown-toggle');
			if (toggle) toggle.setAttribute('aria-expanded', 'false');
		});
	}

	/**
	 * Wires click-to-open nested dropdown submenus inside the navbar
	 * (Bootstrap's dropdown component only supports one level natively).
	 * The nested toggle intentionally has no data-bs-toggle="dropdown" —
	 * combining that with this handler fights Bootstrap's own delegated
	 * dropdown listener (see conversion guide gotchas).
	 * @returns {void}
	 */
	function initDropdownSubmenus() {
		var submenuToggles = document.querySelectorAll('.dropdown-submenu > .dropdown-toggle');

		submenuToggles.forEach(function (toggle) {
			toggle.addEventListener('click', function (event) {
				event.preventDefault();
				event.stopPropagation();

				var submenuItem = toggle.closest('.dropdown-submenu');
				var parentMenu = toggle.closest('.dropdown-menu');
				var wasOpen = submenuItem.classList.contains('show');

				if (parentMenu) closeNestedSubmenus(parentMenu);

				submenuItem.classList.toggle('show', !wasOpen);
				toggle.setAttribute('aria-expanded', String(!wasOpen));
			});
		});

		// Close any open submenu whenever its parent top-level dropdown
		// closes, so it doesn't reopen stale the next time it's shown.
		document.querySelectorAll('.navbar .dropdown').forEach(function (dropdown) {
			dropdown.addEventListener('hidden.bs.dropdown', function () {
				closeNestedSubmenus(dropdown);
			});
		});
	}

	/**
	 * Closes the mobile off-canvas nav panel after a real link is chosen
	 * (skips the "Page Layouts" / "Submenu" toggles, which only expand a
	 * nested list in place), so the panel doesn't stay open behind the
	 * newly-loaded page.
	 * @returns {void}
	 */
	function initNavPanelAutoClose() {
		var navPanel = document.getElementById('nav-panel');
		if (!navPanel) return;

		navPanel.querySelectorAll('a[href]:not([href="#"])').forEach(function (link) {
			link.addEventListener('click', function () {
				bootstrap.Offcanvas.getOrCreateInstance(navPanel).hide();
			});
		});
	}

	initNavbarOverlay();
	initDropdownSubmenus();
	initNavPanelAutoClose();

})();
