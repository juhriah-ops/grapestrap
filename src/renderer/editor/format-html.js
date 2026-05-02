/**
 * GrapeStrap — HTML pretty-printer
 *
 * GrapesJS's editor.getHtml() returns one long line. That's fine for parsers
 * and minifiers, but unreadable in Monaco's Code view, in `git diff` against
 * a saved page, and in the exported flat HTML.
 *
 * Algorithm: tokenize → build a shallow tree of {tag, attrs, children} nodes
 * → render the tree. A block element whose direct children are all inline/
 * text and whose collapsed rendering fits on one line is emitted inline;
 * everything else is rendered as block-and-indent. <pre>/<script>/<style>/
 * <textarea>/<code> are passed through verbatim because their interior
 * whitespace is significant.
 *
 * Public API:
 *   formatHtml(html, { indent = '  ', maxInlineWidth = 100 } = {}) → string
 */

const VOID = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr'
])

const INLINE = new Set([
  'a','abbr','b','bdo','button','cite','code','dfn','em','i',
  'kbd','label','mark','q','s','samp','select','small','span',
  'strong','sub','sup','time','u','var',
  // Phrasing children that often appear inline in user content:
  'em','strong','b','i','u','s','small'
])
// Note: <br>, <img>, <hr>, <input> are intentionally NOT inline. When they
// stand alone in a block container they each go on their own line; when they
// appear inside a phrasing context (<p>, <a>, …) they stay inline because the
// parent decides inline-rendering.

const VERBATIM = new Set(['pre','script','style','textarea','code'])

export function formatHtml(html, { indent = '  ', maxInlineWidth = 100 } = {}) {
  if (!html) return ''
  const tokens = tokenize(String(html))
  const tree = buildTree(tokens)
  const out = []
  for (const node of tree) renderNode(node, 0, out, indent, maxInlineWidth)
  return out.join('').replace(/\n+$/, '\n')
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────
function tokenize(src) {
  const out = []
  let i = 0
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4)
      if (end < 0) { out.push({ kind: 'text', text: src.slice(i) }); break }
      out.push({ kind: 'comment', text: src.slice(i, end + 3) })
      i = end + 3
      continue
    }
    if (src.startsWith('<!', i) || src.startsWith('<?', i)) {
      const end = src.indexOf('>', i)
      if (end < 0) break
      out.push({ kind: 'doctype', text: src.slice(i, end + 1) })
      i = end + 1
      continue
    }
    if (src[i] === '<' && src[i + 1] !== '/') {
      const close = findTagEnd(src, i)
      if (close < 0) { out.push({ kind: 'text', text: src.slice(i) }); break }
      const raw = src.slice(i, close + 1)
      const m = raw.match(/^<\s*([a-zA-Z][a-zA-Z0-9-]*)/)
      const tagName = m ? m[1].toLowerCase() : ''
      const selfClose = raw.endsWith('/>') || VOID.has(tagName)

      if (VERBATIM.has(tagName) && !selfClose) {
        const closeRe = new RegExp(`</\\s*${tagName}\\s*>`, 'i')
        const rest = src.slice(close + 1)
        const m2 = rest.match(closeRe)
        if (!m2) {
          out.push({ kind: 'verbatim', text: raw + rest, tagName })
          i = src.length
        } else {
          const body = rest.slice(0, m2.index)
          const closeTag = m2[0]
          out.push({ kind: 'verbatim', text: raw + body + closeTag, tagName })
          i = close + 1 + m2.index + closeTag.length
        }
        continue
      }
      out.push({ kind: 'open', raw, tagName, selfClose })
      i = close + 1
      continue
    }
    if (src.startsWith('</', i)) {
      const close = src.indexOf('>', i)
      if (close < 0) break
      const m = src.slice(i, close + 1).match(/^<\/\s*([a-zA-Z][a-zA-Z0-9-]*)/)
      out.push({ kind: 'close', tagName: m ? m[1].toLowerCase() : '' })
      i = close + 1
      continue
    }
    const next = src.indexOf('<', i)
    const end = next < 0 ? src.length : next
    const text = src.slice(i, end)
    if (text.length) out.push({ kind: 'text', text })
    i = end
  }
  return out
}

function findTagEnd(src, start) {
  let i = start + 1
  let inQuote = null
  while (i < src.length) {
    const c = src[i]
    if (inQuote) { if (c === inQuote) inQuote = null }
    else if (c === '"' || c === "'") inQuote = c
    else if (c === '>') return i
    i++
  }
  return -1
}

// ─── Tree builder ────────────────────────────────────────────────────────────
function buildTree(tokens) {
  const root = []
  const stack = [{ children: root }]
  for (const t of tokens) {
    const top = stack[stack.length - 1]
    if (t.kind === 'open') {
      const node = { kind: 'element', raw: t.raw, tagName: t.tagName, selfClose: t.selfClose, children: [] }
      top.children.push(node)
      if (!t.selfClose) stack.push(node)
      continue
    }
    if (t.kind === 'close') {
      // pop down to matching tag
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === t.tagName) { stack.length = i; break }
      }
      continue
    }
    top.children.push(t) // text, comment, doctype, verbatim
  }
  return root
}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderNode(node, depth, out, indent, maxInlineWidth) {
  const pad = indent.repeat(depth)

  if (node.kind === 'doctype') { out.push(node.text + '\n'); return }
  if (node.kind === 'comment') { out.push(pad + node.text + '\n'); return }
  if (node.kind === 'verbatim') { out.push(pad + node.text + '\n'); return }
  if (node.kind === 'text') {
    const t = collapseWs(node.text).trim()
    if (t) out.push(pad + t + '\n')
    return
  }
  // element
  if (node.selfClose) { out.push(pad + node.raw + '\n'); return }
  if (node.children.length === 0) {
    out.push(pad + node.raw + `</${node.tagName}>` + '\n')
    return
  }

  // Try inline rendering: only if all children are text or inline elements,
  // and the total collapsed length fits.
  if (canRenderInline(node)) {
    const inlineBody = node.children.map(renderInline).join('')
    const oneLine = pad + node.raw + inlineBody.replace(/\s+/g, ' ').trim() + `</${node.tagName}>`
    if (oneLine.length <= maxInlineWidth + pad.length) {
      out.push(oneLine + '\n')
      return
    }
  }

  // Block render
  out.push(pad + node.raw + '\n')
  for (const child of node.children) renderNode(child, depth + 1, out, indent, maxInlineWidth)
  out.push(pad + `</${node.tagName}>` + '\n')
}

function canRenderInline(node) {
  for (const c of node.children) {
    if (c.kind === 'text' || c.kind === 'comment') continue
    if (c.kind === 'verbatim') return false
    if (c.kind === 'element') {
      if (!INLINE.has(c.tagName) && !c.selfClose) return false
      if (!canRenderInline(c)) return false
    }
  }
  return true
}

function renderInline(node) {
  if (node.kind === 'text') return collapseWs(node.text)
  if (node.kind === 'comment') return node.text
  if (node.kind === 'element') {
    if (node.selfClose) return node.raw
    return node.raw + node.children.map(renderInline).join('') + `</${node.tagName}>`
  }
  return ''
}

function collapseWs(s) { return s.replace(/\s+/g, ' ') }
