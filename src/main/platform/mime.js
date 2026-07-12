/**
 * GrapeStrap — Shared MIME table
 *
 * PATH: src/main/platform/mime.js
 * ROLE: Extension → Content-Type lookup shared by the gstrap-plugin://
 *       protocol handler (main.js) and the preview HTTP server
 *       (preview-server.js)
 * DEPENDS: (none — pure data + one lookup)
 * CREATED: 2026-07-12
 *
 * Extracted from main.js's PLUGIN_MIME when the Wave 3 preview server became
 * the second consumer. Superset of the plugin handler's needs: adds the types
 * a preview must serve — html/htm, the full font set, the video kinds the
 * Asset Manager imports (ipc-handlers.js ASSET_KIND_FILTERS), plus
 * gif/avif/ico/txt/xml/map/pdf. Unknown extensions fall back to
 * application/octet-stream.
 */

const MIME_TYPES = {
  '.html': 'text/html',
  '.htm':  'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.map':  'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.eot':  'application/vnd.ms-fontobject',
  '.mp4':  'video/mp4',
  '.m4v':  'video/x-m4v',
  '.webm': 'video/webm',
  '.ogg':  'video/ogg',
  '.mov':  'video/quicktime',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
  '.pdf':  'application/pdf'
}

export function mimeForPath(p) {
  const dot = p.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return MIME_TYPES[p.slice(dot).toLowerCase()] || 'application/octet-stream'
}
