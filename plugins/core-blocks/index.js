/**
 * @grapestrap/core-blocks
 *
 * The basic content blocks every site needs. Class-first: every block ships with
 * sensible Bootstrap 5 utility classes baked in.
 */

export default function register(api) {
  api.log.info('registering core blocks')

  api.registerBlock({
    id: 'text',
    label: 'Text',
    category: 'Common',
    content: '<p class="mb-3">Insert your text here.</p>',
    media: '<svg viewBox="0 0 24 24" width="20" height="20"><text x="2" y="18" font-family="serif" font-size="20" fill="currentColor">T</text></svg>'
  })

  api.registerBlock({
    id: 'heading',
    label: 'Heading',
    category: 'Text',
    content: '<h2 class="mb-3">Section heading</h2>'
  })

  api.registerBlock({
    id: 'paragraph',
    label: 'Paragraph',
    category: 'Text',
    content: '<p class="mb-3">A paragraph of body text.</p>'
  })

  api.registerBlock({
    id: 'image',
    label: 'Image',
    category: 'Media',
    content: { type: 'image', attributes: { class: 'img-fluid' } }
  })

  api.registerBlock({
    id: 'button',
    label: 'Button',
    category: 'Common',
    content: '<a href="#" class="btn btn-primary">Button</a>'
  })

  api.registerBlock({
    id: 'link',
    label: 'Link',
    category: 'Common',
    content: '<a href="#" class="link-primary">Link text</a>'
  })

  api.registerBlock({
    id: 'list',
    label: 'List',
    category: 'Text',
    content: '<ul class="list-unstyled">\n  <li>Item one</li>\n  <li>Item two</li>\n  <li>Item three</li>\n</ul>'
  })

  api.registerBlock({
    id: 'table',
    label: 'Table',
    category: 'Common',
    content: `<table class="table">
  <thead>
    <tr><th>Heading</th><th>Heading</th></tr>
  </thead>
  <tbody>
    <tr><td>Cell</td><td>Cell</td></tr>
    <tr><td>Cell</td><td>Cell</td></tr>
  </tbody>
</table>`
  })

  api.registerBlock({
    id: 'divider',
    label: 'Divider',
    category: 'Common',
    content: '<hr class="my-4">'
  })
}
