/**
 * @grapestrap/blocks-bootstrap5
 *
 * Layout primitives wrapping the upstream cwalabs/grapesjs-blocks-bootstrap5
 * package. Once we publish our own fork at @grapestrap/blocks-bootstrap5 (after
 * v0.0.1 releases), this plugin switches its dependency.
 *
 * For v0.0.1 walking skeleton we register the blocks directly via raw HTML, so
 * the project doesn't break if the upstream package is unavailable. Phase 2
 * swaps in the rich GrapesJS components with traits.
 */

export default function register(api) {
  api.log.info('registering Bootstrap 5 layout blocks')

  api.registerBlock({
    id: 'bs-container',
    label: 'Container',
    category: 'Layout',
    content: '<div class="container py-4">\n  <p>Container content</p>\n</div>'
  })

  api.registerBlock({
    id: 'bs-container-fluid',
    label: 'Container (fluid)',
    category: 'Layout',
    content: '<div class="container-fluid py-4">\n  <p>Fluid container</p>\n</div>'
  })

  api.registerBlock({
    id: 'bs-row',
    label: 'Row',
    category: 'Layout',
    content: '<div class="row g-3">\n  <div class="col">Column</div>\n  <div class="col">Column</div>\n</div>'
  })

  api.registerBlock({
    id: 'bs-row-2col',
    label: '2 Columns',
    category: 'Layout',
    content: '<div class="row g-3">\n  <div class="col-md-6">Column</div>\n  <div class="col-md-6">Column</div>\n</div>'
  })

  api.registerBlock({
    id: 'bs-row-3col',
    label: '3 Columns',
    category: 'Layout',
    content: '<div class="row g-3">\n  <div class="col-md-4">Column</div>\n  <div class="col-md-4">Column</div>\n  <div class="col-md-4">Column</div>\n</div>'
  })

  api.registerBlock({
    id: 'bs-form',
    label: 'Form',
    category: 'Forms',
    content: `<form class="vstack gap-3">
  <div>
    <label class="form-label">Email</label>
    <input type="email" class="form-control" placeholder="name@example.com">
  </div>
  <div>
    <label class="form-label">Message</label>
    <textarea class="form-control" rows="4"></textarea>
  </div>
  <button type="submit" class="btn btn-primary">Send</button>
</form>`
  })

  api.registerBlock({
    id: 'bs-input',
    label: 'Input',
    category: 'Forms',
    content: '<input type="text" class="form-control" placeholder="Text input">'
  })

  api.registerBlock({
    id: 'bs-select',
    label: 'Select',
    category: 'Forms',
    content: `<select class="form-select">
  <option>Choose…</option>
  <option value="1">One</option>
  <option value="2">Two</option>
</select>`
  })

  api.registerBlock({
    id: 'bs-card',
    label: 'Card',
    category: 'Common',
    content: `<div class="card">
  <div class="card-body">
    <h5 class="card-title">Card title</h5>
    <p class="card-text">Some quick example text to build on the card title.</p>
    <a href="#" class="btn btn-primary">Action</a>
  </div>
</div>`
  })

  api.registerBlock({
    id: 'bs-alert',
    label: 'Alert',
    category: 'Common',
    content: '<div class="alert alert-info" role="alert">An alert message.</div>'
  })

  api.registerBlock({
    id: 'bs-badge',
    label: 'Badge',
    category: 'Common',
    content: '<span class="badge bg-primary">Badge</span>'
  })
}
