/*
	File: assets/js/main.js
	Purpose: Behavior for the Bootstrap 5 "Orbit" template — second-level
	         dropdown submenu toggling (Bootstrap 5's dropdown component only
	         supports one level; replaces jquery.dropotron's nested menus)
	         and mobile nav auto-collapse after a link is chosen. The demo's
	         in-page theme-preview block was stripped 2026-08-19 (parity with
	         the Vista starter — the picker is a gallery affordance, not
	         starter machinery); blue, the :root default, is the shipped
	         palette.
	Used by: index.html, left-sidebar.html, right-sidebar.html, two-sidebar.html,
	         no-sidebar.html (loaded after bootstrap.bundle.min.js)
*/

(function () {
	'use strict';


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
