// =============================================================
// PATH: src/main/ai/tools.js
// ROLE: The ten renderer-bridged tool descriptors — pinned names, JSON
//       Schemas, and model-facing descriptions — plus the factory that
//       wraps them into runnable provider tools
// DEPENDS: none (leaf module; the run() implementation is injected)
// CREATED: 2026-08-30
// UPDATED: 2026-08-31 — get_global_css added (tenth tool) and
//          edit_global_css's replace mode now documents its read-first +
//          user-confirm guards; the executor enforces both. Prompted by a
//          live 8b Ollama run replacing the user's whole stylesheet unseen.
// =============================================================
//
// Every tool here is EXECUTED IN THE RENDERER, not in main. main owns the
// model conversation; the renderer owns the GrapesJS canvas, the open
// project, and the file dialogs. `rendererBridged: true` records that: a
// call travels main → ai:tool-call → renderer executor → ai:tool-result →
// main, and agent-session.js's pending-call map is what joins the two halves.
//
// ─── Byte-stability ───────────────────────────────────────────────────────
//
// The rendered `tools` block is the FIRST thing in the cached prefix, ahead
// of the system prompt, so any change here invalidates the whole cache for
// every conversation. Two rules follow:
//
//   1. TOOL_DEFINITIONS is sorted by name at module load. Adding a tool must
//      not reorder the others, and source-order accidents must not matter.
//   2. Descriptions are frozen prose. No project name, no page count, no
//      counts of anything, no dates — nothing that varies between users or
//      between runs. Volatile facts belong in the per-turn context block
//      that agent-session.js prepends to the newest user message.
//
// Schemas are strict (`additionalProperties: false` with explicit `required`)
// so a hallucinated extra field is rejected at the API boundary rather than
// arriving at a renderer executor that would silently ignore it.

const EMPTY_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.freeze({}),
  required: Object.freeze([]),
  additionalProperties: false
})

// Source order is irrelevant — sortByName below is what fixes the wire order.
const DEFINITIONS = [
  {
    name: 'get_project_overview',
    description:
      'Get a summary of the project the user currently has open: its name, the list of pages it contains, which page is active in the editor, and a short summary of the project file tree. Call this first when you need to know what exists before acting, when the user refers to a page you have not seen, or when you are about to create or open something and need to know whether it already exists. It takes no arguments and makes no changes.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    rendererBridged: true
  },
  {
    name: 'get_selected_element',
    description:
      'Get the element the user currently has selected on the canvas: a short quick-tag line identifying it (tag, id, and classes) followed by its outer HTML, truncated if the element is large. Call this whenever the user says "this", "here", "the selected one", or otherwise points at something without naming it, and before any edit that targets the selection. Returns a message saying nothing is selected when the canvas has no selection. It takes no arguments and makes no changes.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    rendererBridged: true
  },
  {
    name: 'get_page_html',
    description:
      'Read the full HTML of a page in the project, truncated if the page is large. Omit the page argument to read the page currently open in the editor, or pass a page name exactly as it appears in the project overview to read a different one. Call this before editing markup you have not already seen this turn, rather than assuming what the page contains. It makes no changes.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        page: Object.freeze({
          type: 'string',
          description: 'Page name exactly as listed by get_project_overview. Omit to read the page currently open in the editor.'
        })
      }),
      required: Object.freeze([]),
      additionalProperties: false
    }),
    rendererBridged: true
  },
  {
    name: 'replace_element_html',
    description:
      'Replace the currently selected element on the canvas with the HTML you supply. Your html argument replaces the element entirely, including its outermost tag, so include that tag and all attributes you want to keep — anything you omit is removed. This is the preferred way to modify an existing element: it is a targeted change the user can see and undo, unlike rewriting a whole page. It fails when nothing is selected, so read get_selected_element first if you are unsure.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        html: Object.freeze({
          type: 'string',
          description: 'Complete replacement markup including the outermost tag and its attributes.'
        })
      }),
      required: Object.freeze(['html']),
      additionalProperties: false
    }),
    rendererBridged: true
  },
  {
    name: 'insert_html',
    description:
      'Insert new HTML onto the current page, positioned relative to the selected element. Use position "append" to place it inside the selection as its last child, "before" to place it immediately above the selection, or "after" to place it immediately below; position defaults to "append". When nothing is selected the markup is added at the end of the page body. Use this to add new content, and use replace_element_html instead when changing something that already exists.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        html: Object.freeze({
          type: 'string',
          description: 'Markup to insert.'
        }),
        position: Object.freeze({
          type: 'string',
          enum: Object.freeze(['append', 'before', 'after']),
          description: 'Placement relative to the selected element. Defaults to "append".'
        })
      }),
      required: Object.freeze(['html']),
      additionalProperties: false
    }),
    rendererBridged: true
  },
  {
    name: 'get_global_css',
    description:
      'Read the project global stylesheet — the custom CSS the user has written, applied to every page. Call this before edit_global_css whenever existing rules matter, and ALWAYS before mode "replace": a replace is refused until this has been called in the same turn, so the current stylesheet is never discarded unseen.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({}),
      additionalProperties: false
    }),
    rendererBridged: true
  },
  {
    name: 'edit_global_css',
    description:
      'Edit the project global stylesheet, which applies to every page. Use mode "append" to add rules to the end of the existing stylesheet, which is almost always what you want; use mode "replace" only when the user has explicitly asked you to rewrite the whole stylesheet, because it discards everything currently in it. A replace is refused unless get_global_css was called earlier in the same turn, and then still asks the user to confirm before it lands; the confirmed result echoes the stylesheet it discarded so it can be restored if that was a mistake. Put styling here rather than in inline style attributes, and write selectors against semantic class names rather than generated ids.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        css: Object.freeze({
          type: 'string',
          description: 'CSS source to append or to write as the new stylesheet.'
        }),
        mode: Object.freeze({
          type: 'string',
          enum: Object.freeze(['replace', 'append']),
          description: '"append" adds to the existing stylesheet; "replace" discards it and writes css as the whole file.'
        })
      }),
      required: Object.freeze(['css', 'mode']),
      additionalProperties: false
    }),
    rendererBridged: true
  },
  {
    name: 'create_page',
    description:
      'Create a new empty page in the open project under the name you supply. Check get_project_overview first so you do not create a page that already exists or pick a name that collides with one. Creating a page opens it as the active page in the editor, but does not add navigation links to it — if the user wants it linked from existing pages, edit that markup separately.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        name: Object.freeze({
          type: 'string',
          description: 'Name for the new page.'
        })
      }),
      required: Object.freeze(['name']),
      additionalProperties: false
    }),
    rendererBridged: true
  },
  {
    name: 'read_file',
    description:
      'Read a text file from inside the open project, given a path relative to the project root. Paths are restricted to the project directory: absolute paths and paths that climb above the project root are rejected. Use this for stylesheets, scripts, and other project files that the page-level tools do not cover, and use get_page_html for page markup. Never guess at a path — take it from get_project_overview.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        path: Object.freeze({
          type: 'string',
          description: 'Path relative to the project root, such as site/assets/css/custom.css.'
        })
      }),
      required: Object.freeze(['path']),
      additionalProperties: false
    }),
    rendererBridged: true
  },
  {
    name: 'write_file',
    description:
      'Write a text file inside the open project, given a path relative to the project root, creating it if it does not exist and overwriting it if it does. Paths are restricted to the project directory: absolute paths and paths that climb above the project root are rejected. Writing over an existing file asks the user to confirm first, and the call comes back as an error if they decline. Prefer the page and stylesheet tools where they apply, and use this for files they do not cover.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        path: Object.freeze({
          type: 'string',
          description: 'Path relative to the project root.'
        }),
        content: Object.freeze({
          type: 'string',
          description: 'Full file contents to write.'
        })
      }),
      required: Object.freeze(['path', 'content']),
      additionalProperties: false
    }),
    rendererBridged: true
  }
]

function sortByName(first, second) {
  return first.name.localeCompare(second.name)
}

/**
 * The nine tool descriptors, frozen and in a fixed wire order.
 *
 * Sorted here rather than trusted to source order: the sort is the guarantee
 * that the cached prefix does not shift when someone adds a tenth tool in
 * the middle of the list above.
 */
export const TOOL_DEFINITIONS = Object.freeze(
  [...DEFINITIONS].sort(sortByName).map(definition => Object.freeze(definition))
)

/**
 * Wrap the descriptors into the provider-neutral runnable shape.
 *
 * The descriptors carry no behavior of their own — `requestToolRun` is
 * injected so this module stays a leaf with no dependency on the session,
 * the IPC layer, or any provider.
 *
 * @param {{requestToolRun: (name: string, input: object) => Promise<unknown>}} bridge
 * @returns {Array<{name: string, description: string, inputSchema: object, run: Function}>}
 * @throws {TypeError} when no bridge function is supplied — a tool set whose
 *         run() is undefined would fail deep inside the SDK loop instead of here
 */
export function buildTools({ requestToolRun } = {}) {
  if (typeof requestToolRun !== 'function') {
    throw new TypeError('buildTools requires a requestToolRun(name, input) function')
  }
  return TOOL_DEFINITIONS.map(definition => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    run: input => requestToolRun(definition.name, input)
  }))
}
