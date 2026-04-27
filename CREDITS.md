# Credits

GrapeStrap stands on the shoulders of excellent open-source work.

## Direct dependencies

- **[GrapesJS](https://grapesjs.com/)** — MIT — visual web builder framework
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** — MIT — code editor (the engine behind VS Code)
- **[Golden Layout](https://golden-layout.com/)** — MIT — dockable panel system
- **[Bootstrap 5](https://getbootstrap.com/)** — MIT — CSS framework
- **[Bootstrap Icons](https://icons.getbootstrap.com/)** — MIT — UI icons
- **[Font Awesome Free](https://fontawesome.com/)** — Font Awesome Free License (CC BY 4.0 + SIL OFL 1.1 + MIT) — canvas icons
- **[Inter](https://rsms.me/inter/)** — SIL OFL 1.1 — UI font
- **[JetBrains Mono](https://www.jetbrains.com/lp/mono/)** — SIL OFL 1.1 — code font
- **[Notyf](https://github.com/caroso1222/notyf)** — MIT — toast notifications
- **[Prettier](https://prettier.io/)** — MIT — code formatting
- **[chokidar](https://github.com/paulmillr/chokidar)** — MIT — file watching
- **[Splide](https://splidejs.com/)** — MIT — carousel (lazy-loaded for blocks that need it)
- **[GLightbox](https://biati-digital.github.io/glightbox/)** — MIT — lightbox (lazy-loaded for blocks that need it)
- **[i18next](https://www.i18next.com/)** — MIT — internationalization

## Adapted patterns and assets

### Gramateria — MIT
Source: <https://github.com/ronaldaug/gramateria>

We performed a complete source review of Gramateria v1.0.6 and adapted four specific patterns:

1. Lazy CDN-style dependency injection per block (adapted to inject locally bundled assets, not CDN URLs)
2. Section block library (~12 sections, adapted to remove hardcoded Cloudinary URLs and to align with class-first styling)
3. Export template pattern (single function returning HTML string)
4. Standard exported folder layout (`index.html`, `css/`, `js/`, `assets/`)

We do **not** borrow Gramateria's broken Electron security configuration, Laravel Mix tooling, localStorage-as-source-of-truth pattern, Netlify deployment with plain-text token storage, deprecated `document.execCommand` calls, or hardcoded Cloudinary asset URLs.

### CWALabs `grapesjs-blocks-bootstrap5` — MIT
Source: <https://github.com/cwalabs/grapesjs-blocks-bootstrap5>

Forked to the GrapeStrap organization as `@grapestrap/blocks-bootstrap5`. Maintained independently. Customizations: tooltips on size dropdowns, responsive variant traits, `col-xxl-*` support, default `col-md-X` over `col-X`.

## Design influence

### Adobe Dreamweaver
GrapeStrap mimics the Dreamweaver workflow — Property Inspector, Design/Code/Split view modes, DOM tree panel, Library Items, master templates, Quick Tag Editor, Linked Files bar — because those workflows define a category. **No Adobe code is used or referenced.** All implementation is original.

## Special thanks

- The Linux desktop community, for keeping the platform we build on alive
- Every contributor who files an issue, sends a PR, writes a translation, or builds a plugin

## Reporting an attribution issue

If you believe we've missed credit for a borrowed pattern, asset, or piece of code, please open an issue or email the maintainers. We'll fix it promptly.
