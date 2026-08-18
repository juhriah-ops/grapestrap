/*! gstrap-behaviors v1 */
/*
	File: assets/js/gstrap-behaviors.js (shipped from assets/behaviors/ in the app bundle)
	Purpose: GrapeStrap behaviors runtime — scroll/load reveals, navbar scroll
	         states, nested dropdown submenus, mobile menu auto-close, marquee
	         cloning. Hover + loop presets are pure CSS (sibling stylesheet).
	         Nothing is project-specific: every setting rides a `data-gs-*`
	         attribute, so this file is byte-identical in every project.
	Used by: every page of a project whose manifest carries `behaviors`. Emitted
	         AFTER the framework scripts (page-html.js BEHAVIORS_SCRIPT), so
	         Bootstrap's dropdown/collapse/offcanvas components already exist.
	Version: the machine-readable tag on line 1 is what main's `behaviors:ensure`
	         compares against the project's copy — bump its number whenever this
	         file changes or projects keep the copy they have. Deliberate
	         consequence: a hand-edited project copy LOSES those edits at the
	         next bump. The project copy is a delivery artifact, not a source.
	Inline styles: this runtime writes two custom properties per animated
	         element (--gs-anim-duration, --gs-anim-delay) via style.setProperty.
	         Exempt from the house no-inline-styles rule: it happens in the
	         VISITOR's browser at run time, on markup GrapeStrap never
	         re-serializes, from the element's own data-attributes — which stay
	         the authored, diffable source of truth.
	Created: 2026-08-18
*/

(function () {
	'use strict';

	// Idempotent by contract: a page can end up with two script tags, and the
	// editor's animation Preview replays this file against the canvas document.
	if (window.gstrapBehaviorsReady) return;
	window.gstrapBehaviorsReady = true;

	var REVEAL_THRESHOLD = 0.15;          // visible fraction that fires a reveal
	var DEFAULT_NAV_OFFSET = 40;          // px, when the markup names no offset

	// Reduced motion is an accessibility setting, not a preference: reveals,
	// loops and nav hide-on-scroll are skipped outright. The informational nav
	// state classes still toggle — the stylesheet zeroes their transitions.
	var prefersReducedMotion = !!(window.matchMedia &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches);

	// One observer for the whole page; assigned on first use by initReveals.
	var revealObserver = null;

	// ─── Reveal engine ──────────────────────────────────────────────────────

	/**
	 * Wire every `data-gs-anim` element to its trigger (scroll by default,
	 * `load` for an entrance). Progressive enhancement: the hidden start state
	 * `gs-anim-pending` is added HERE and never authored into the markup, so a
	 * page with no JS shows all of its content.
	 * @returns {void}
	 */
	function initReveals() {
		var elements = document.querySelectorAll('[data-gs-anim]');
		if (!elements.length) return;

		// Reduced motion: leave everything visible. Adding gs-anim-pending here
		// would hide content behind an animation never allowed to play.
		if (prefersReducedMotion) return;

		var loadTargets = [];

		for (var i = 0; i < elements.length; i++) {
			var element = elements[i];
			applyRevealTiming(element);
			element.classList.add('gs-anim-pending');

			if (element.getAttribute('data-gs-anim-trigger') === 'load') {
				loadTargets.push(element);
			} else if (window.IntersectionObserver) {
				if (!revealObserver) {
					revealObserver = new IntersectionObserver(onRevealChange, { threshold: REVEAL_THRESHOLD });
				}
				revealObserver.observe(element);
			} else {
				// No observer support: reveal now rather than hide for the visit.
				element.classList.remove('gs-anim-pending');
			}
		}

		// One frame between pending and reveal, so the browser has a painted
		// "from" state to transition out of.
		if (loadTargets.length) {
			requestAnimationFrame(function () {
				for (var j = 0; j < loadTargets.length; j++) loadTargets[j].classList.add('gs-anim-in');
			});
		}
	}

	/**
	 * IntersectionObserver callback shared by every scroll-triggered reveal.
	 * @param {IntersectionObserverEntry[]} entries - Elements crossing the threshold
	 * @returns {void}
	 */
	function onRevealChange(entries) {
		for (var i = 0; i < entries.length; i++) {
			var element = entries[i].target;
			var repeats = element.getAttribute('data-gs-anim-once') === '0';

			if (entries[i].isIntersecting) {
				element.classList.add('gs-anim-in');
				// Default is once — stop paying for an observer nothing reads.
				if (!repeats && revealObserver) revealObserver.unobserve(element);
			} else if (repeats) {
				element.classList.remove('gs-anim-in');
			}
		}
	}

	/**
	 * Mirror duration/delay attributes onto the custom properties the
	 * stylesheet reads (see file header re: style.setProperty).
	 * @param {HTMLElement} element - Element carrying data-gs-anim
	 * @returns {void}
	 */
	function applyRevealTiming(element) {
		var duration = parseInt(element.getAttribute('data-gs-anim-duration'), 10);
		var delay = parseInt(element.getAttribute('data-gs-anim-delay'), 10);
		// NaN (absent or junk) and 0 fall through to the stylesheet defaults.
		if (duration > 0) element.style.setProperty('--gs-anim-duration', duration + 'ms');
		if (delay > 0) element.style.setProperty('--gs-anim-delay', delay + 'ms');
	}

	// ─── Nav scroll engine ──────────────────────────────────────────────────

	/**
	 * Wire every navbar that asked for a scroll-driven state class. One passive,
	 * rAF-throttled listener serves all of them — scroll handlers are the
	 * classic source of jank, so the page gets exactly one.
	 * @returns {void}
	 */
	function initNav() {
		var navs = document.querySelectorAll('[data-gs-nav-scroll], [data-gs-nav-shrink], [data-gs-nav-hide]');
		if (!navs.length) return;

		var watched = [];
		for (var i = 0; i < navs.length; i++) {
			var nav = navs[i];
			var offset = parseInt(nav.getAttribute('data-gs-nav-scroll-offset'), 10);
			watched.push({
				element: nav,
				offset: offset > 0 ? offset : DEFAULT_NAV_OFFSET,
				// The data-gs-nav-scroll VALUE (solid|swap) is styling only: both
				// toggle the same class, the CSS decides what scrolled looks like.
				scroll: nav.hasAttribute('data-gs-nav-scroll'),
				shrink: nav.hasAttribute('data-gs-nav-shrink'),
				// Hiding a nav that scrolls away with the page would just blank a
				// strip of document — pinned navs only, never under reduced motion.
				hide: nav.hasAttribute('data-gs-nav-hide') && !prefersReducedMotion && isPinned(nav)
			});
		}

		var lastY = window.pageYOffset;
		var ticking = false;

		var update = function () {
			ticking = false;
			var y = window.pageYOffset;
			var scrollingDown = y > lastY;

			for (var j = 0; j < watched.length; j++) {
				var item = watched[j];
				var isPast = y > item.offset;
				if (item.scroll) item.element.classList.toggle('gs-nav-scrolled', isPast);
				if (item.shrink) item.element.classList.toggle('gs-nav-shrunk', isPast);
				if (item.hide) item.element.classList.toggle('gs-nav-hidden', scrollingDown && isPast);
			}

			// Touch bounce-scroll reports negative offsets; clamping stops the
			// direction test flapping at the top of the page.
			lastY = y > 0 ? y : 0;
		};

		window.addEventListener('scroll', function () {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(update);
		}, { passive: true });

		update();   // deep-linked / restored positions can start below the offset
	}

	/**
	 * Is this element pinned to the viewport (fixed or sticky)?
	 * @param {HTMLElement} element - Candidate navbar
	 * @returns {boolean}
	 */
	function isPinned(element) {
		var position = window.getComputedStyle(element).position;
		return position === 'fixed' || position === 'sticky';
	}

	// ─── Nested dropdown submenus ───────────────────────────────────────────

	/**
	 * Wire click-to-open nested submenus: `data-gs-nav-submenu` on the nested
	 * `<li>`, its direct `.dropdown-toggle` child as trigger, that toggle's
	 * `.dropdown-menu` sibling as panel. Bootstrap's own dropdown supports one
	 * level only, and the nested toggle must NOT carry data-bs-toggle —
	 * combining that with this handler fights Bootstrap's delegated listener.
	 * @returns {void}
	 */
	function initSubmenus() {
		var items = document.querySelectorAll('[data-gs-nav-submenu]');
		if (!items.length) return;

		var boundDropdowns = [];

		for (var i = 0; i < items.length; i++) {
			var toggle = directChild(items[i], '.dropdown-toggle');
			var panel = directChild(items[i], '.dropdown-menu');
			if (!toggle || !panel) continue;
			wireSubmenuToggle(toggle, panel);

			// Close open submenus when their top-level dropdown closes, so they
			// don't reopen stale. Bound once per dropdown, however many submenus.
			var parent = items[i].parentElement;
			var dropdown = parent && parent.closest ? parent.closest('.dropdown') : null;
			if (dropdown && boundDropdowns.indexOf(dropdown) === -1) {
				boundDropdowns.push(dropdown);
				dropdown.addEventListener('hidden.bs.dropdown', function (event) {
					closeSubmenus(event.currentTarget);
				});
			}
		}
	}

	/**
	 * Bind one submenu toggle — its own function so each handler closes over
	 * its own pair rather than the shared loop variables.
	 * @param {HTMLElement} toggle - The nested .dropdown-toggle
	 * @param {HTMLElement} panel - Its .dropdown-menu sibling
	 * @returns {void}
	 */
	function wireSubmenuToggle(toggle, panel) {
		toggle.addEventListener('click', function (event) {
			event.preventDefault();
			// Without this the click reaches Bootstrap's delegated dropdown
			// listener, which closes the parent menu the submenu lives in.
			event.stopPropagation();

			var wasOpen = panel.classList.contains('show');
			var parentMenu = toggle.closest('.dropdown-menu');
			if (parentMenu) closeSubmenus(parentMenu);   // one open submenu per menu

			panel.classList.toggle('show', !wasOpen);
			toggle.setAttribute('aria-expanded', String(!wasOpen));
		});
	}

	/**
	 * Close every open nested submenu inside a scope, resetting aria-expanded.
	 * @param {HTMLElement} scope - Menu (or dropdown) to search inside
	 * @returns {void}
	 */
	function closeSubmenus(scope) {
		var openPanels = scope.querySelectorAll('[data-gs-nav-submenu] > .dropdown-menu.show');
		for (var i = 0; i < openPanels.length; i++) {
			openPanels[i].classList.remove('show');
			var toggle = directChild(openPanels[i].parentNode, '.dropdown-toggle');
			if (toggle) toggle.setAttribute('aria-expanded', 'false');
		}
	}

	// ─── Mobile menu auto-close ─────────────────────────────────────────────

	/**
	 * Close the mobile menu after a real link is chosen, so the panel doesn't
	 * stay open over the page it just navigated to.
	 * @returns {void}
	 */
	function initAutoClose() {
		var navs = document.querySelectorAll('[data-gs-nav-autoclose]');
		for (var i = 0; i < navs.length; i++) {
			var mode = navs[i].getAttribute('data-gs-nav-autoclose');
			if (mode !== 'collapse' && mode !== 'offcanvas') continue;
			var menu = resolveTogglerTarget(navs[i], mode);
			if (menu) wireAutoClose(menu, mode);
		}
	}

	/**
	 * Find the collapse/offcanvas element the nav's toggler controls. The
	 * toggler's own target wins — it can point at a panel OUTSIDE the nav (the
	 * Graphite off-canvas panel does); the in-nav fallback covers markup with
	 * no toggler at all.
	 * @param {HTMLElement} nav - Element carrying data-gs-nav-autoclose
	 * @param {string} mode - 'collapse' or 'offcanvas'
	 * @returns {HTMLElement|null} The menu container, if one resolves
	 */
	function resolveTogglerTarget(nav, mode) {
		var toggler = nav.querySelector('.navbar-toggler[data-bs-target], .navbar-toggler[href]');
		var selector = toggler ? (toggler.getAttribute('data-bs-target') || toggler.getAttribute('href')) : '';
		var target = null;

		if (selector && selector !== '#') {
			try {
				target = document.querySelector(selector);
			} catch (selectorError) {
				// data-bs-target is free text; an invalid selector throws, and
				// the in-nav fallback below is the right answer anyway.
				target = null;
			}
		}

		return target || nav.querySelector(mode === 'offcanvas' ? '.offcanvas' : '.navbar-collapse');
	}

	/**
	 * Bind close-on-click to every real destination link in a menu. Toggles
	 * (dropdown openers, data-bs-toggle, bare "#") expand a list in place and
	 * must leave the menu open.
	 * @param {HTMLElement} menu - The collapse/offcanvas element
	 * @param {string} mode - 'collapse' or 'offcanvas'
	 * @returns {void}
	 */
	function wireAutoClose(menu, mode) {
		var links = menu.querySelectorAll('a[href]:not(.dropdown-toggle):not([data-bs-toggle])');
		for (var i = 0; i < links.length; i++) {
			if (links[i].getAttribute('href') === '#') continue;
			links[i].addEventListener('click', function () {
				hideMenu(menu, mode);
			});
		}
	}

	/**
	 * Hide a Bootstrap collapse/offcanvas menu.
	 * @param {HTMLElement} menu - The menu container
	 * @param {string} mode - 'collapse' or 'offcanvas'
	 * @returns {void}
	 */
	function hideMenu(menu, mode) {
		if (!window.bootstrap) return;   // CSS-only project: nothing to close
		try {
			if (mode === 'offcanvas') {
				window.bootstrap.Offcanvas.getOrCreateInstance(menu).hide();
			} else {
				window.bootstrap.Collapse.getOrCreateInstance(menu, { toggle: false }).hide();
			}
		} catch (bootstrapError) {
			// Component construction can fail on markup edited after load.
			// Leaving the menu open beats throwing inside a link click.
		}
	}

	// ─── Marquee ────────────────────────────────────────────────────────────

	/**
	 * Duplicate a marquee track's children once so the stylesheet's -50%
	 * translate loops seamlessly. Clones duplicate real content, so they are
	 * hidden from assistive tech.
	 * @returns {void}
	 */
	function initMarquees() {
		if (prefersReducedMotion) return;
		var tracks = document.querySelectorAll('[data-gs-anim-loop="marquee"], [data-gs-anim-loop="marquee-reverse"]');

		for (var i = 0; i < tracks.length; i++) {
			var track = tracks[i];
			// Idempotent: a second init on the same document must not keep
			// doubling the content.
			if (track.querySelector('[data-gs-anim-clone]')) continue;

			// Snapshot before appending — children is a live collection.
			var clones = [];
			for (var j = 0; j < track.children.length; j++) {
				var clone = track.children[j].cloneNode(true);
				clone.setAttribute('aria-hidden', 'true');
				clone.setAttribute('data-gs-anim-clone', '');
				clones.push(clone);
			}
			for (var k = 0; k < clones.length; k++) track.appendChild(clones[k]);
		}
	}

	// ─── Shared helpers + boot ──────────────────────────────────────────────

	/**
	 * First direct child of `parent` matching `selector`.
	 * @param {Node} parent - Element to look inside (one level only)
	 * @param {string} selector - CSS selector to match against
	 * @returns {HTMLElement|null}
	 */
	function directChild(parent, selector) {
		var children = parent && parent.children ? parent.children : [];
		for (var i = 0; i < children.length; i++) {
			if (children[i].matches && children[i].matches(selector)) return children[i];
		}
		return null;
	}

	function init() {
		initReveals();
		initNav();
		initSubmenus();
		initAutoClose();
		initMarquees();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();   // deferred parse already finished, or a canvas replay
	}

})();
