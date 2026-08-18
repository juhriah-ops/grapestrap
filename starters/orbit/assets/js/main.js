/*
	File: assets/js/main.js
	Purpose: Behavior for the Bootstrap 5 "Orbit" template — the in-page theme
	         preview (navbar swatches set data-theme on <html>, persisted in
	         localStorage), second-level dropdown submenu toggling (Bootstrap
	         5's dropdown component only supports one level; replaces
	         jquery.dropotron's nested menus), and mobile nav auto-collapse
	         after a link is chosen. The theme-restore block runs FIRST in
	         this file (GrapeStrap starter note, 2026-08-17): the original
	         source site restored the saved theme via an inline <script> in
	         <head>, before first paint; GrapeStrap's page shape has no
	         head-script slot (customScripts only emits <script src=…>), so
	         that snippet can't be ported. Running the restore as the very
	         first thing this file does is the closest equivalent GrapeStrap
	         allows — it still means one paint with the default (blue) theme
	         before this script runs, since it's a single <script src> at the
	         end of body, not an inline head script.
	Used by: index.html, left-sidebar.html, right-sidebar.html, two-sidebar.html,
	         no-sidebar.html (loaded after bootstrap.bundle.min.js)
*/

(function () {
	'use strict';

	// Theme preview (runs first — see file header): the navbar swatches swap
	// the accent palette in place (data-theme on <html> drives :root
	// overrides in theme.css) and the choice is remembered across pages.
	var themeSwatches = document.querySelectorAll('.theme-swatch[data-theme-choice]');

	if (themeSwatches.length) {
		var applyTheme = function (theme) {
			if (theme === 'blue') {
				delete document.documentElement.dataset.theme;
			} else {
				document.documentElement.dataset.theme = theme;
			}
			themeSwatches.forEach(function (swatch) {
				swatch.classList.toggle('is-active', swatch.dataset.themeChoice === theme);
				swatch.setAttribute('aria-pressed', String(swatch.dataset.themeChoice === theme));
			});
		};

		themeSwatches.forEach(function (swatch) {
			swatch.addEventListener('click', function () {
				applyTheme(swatch.dataset.themeChoice);
				try {
					localStorage.setItem('orbit-theme', swatch.dataset.themeChoice);
				} catch (storageError) {
					// Private-mode storage failures just lose persistence, not the preview.
				}
			});
		});

		var savedTheme = null;
		try {
			savedTheme = localStorage.getItem('orbit-theme');
		} catch (storageError) {
			savedTheme = null;
		}
		applyTheme(savedTheme || 'blue');
	}

	/**
	 * Closes every open nested submenu within a given dropdown menu.
	 * @param {HTMLElement} dropdownMenu - The top-level .dropdown-menu to search inside
	 * @returns {void}
	 */
	function closeNestedSubmenus(dropdownMenu) {
		dropdownMenu.querySelectorAll('.dropdown-submenu > .dropdown-menu.show').forEach(function (openMenu) {
			openMenu.classList.remove('show');
			var toggle = openMenu.previousElementSibling;
			if (toggle) {
				toggle.setAttribute('aria-expanded', 'false');
			}
		});
	}

	// Second-level dropdown: click the submenu toggle to open/close it in place,
	// without letting the click bubble up and close the parent dropdown.
	document.querySelectorAll('.dropdown-submenu > .dropdown-toggle').forEach(function (toggle) {
		toggle.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();

			var submenu = toggle.nextElementSibling;
			if (!submenu) {
				return;
			}

			var parentMenu = toggle.closest('.dropdown-menu');
			var isOpen = submenu.classList.contains('show');

			// Only one nested submenu open at a time within the same parent menu.
			if (parentMenu) {
				closeNestedSubmenus(parentMenu);
			}

			submenu.classList.toggle('show', !isOpen);
			toggle.setAttribute('aria-expanded', String(!isOpen));
		});
	});

	// Collapse any open nested submenu whenever its parent top-level dropdown closes.
	document.querySelectorAll('.navbar-nav > .dropdown').forEach(function (dropdownEl) {
		dropdownEl.addEventListener('hidden.bs.dropdown', function () {
			closeNestedSubmenus(dropdownEl);
		});
	});

	// Mobile nav: collapse the menu after a real (non-toggle) link is chosen.
	var navCollapse = document.getElementById('nav-links');

	if (navCollapse) {
		navCollapse.querySelectorAll('a:not(.dropdown-toggle)').forEach(function (link) {
			link.addEventListener('click', function () {
				bootstrap.Collapse.getOrCreateInstance(navCollapse, { toggle: false }).hide();
			});
		});
	}

})();
