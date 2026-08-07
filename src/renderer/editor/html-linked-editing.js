/**
 * GrapeStrap — Linked tag editing provider (html + php)
 *
 * Monaco's linkedEditing CONTRIBUTION is data-driven, and the bundled html
 * language service registers no LinkedEditingRangeProvider — imported alone
 * the feature is inert. This module supplies the ranges: when the caret sits
 * in a tag NAME, the matching pair's name range is returned, so typing in
 * `<div|>` live-renames the `</div>` (and vice versa). Registered for html
 * and php models (php pages are mostly markup).
 *
 * Pairing algorithm: single pass over the document collecting every tag
 * token, a per-name stack matches open/close (void and self-closed tags
 * never pair). O(doc) per invocation — the contribution only asks on caret
 * moves, and pages are editor-sized, not corpus-sized.
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

const TAG_TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g

export function registerHtmlLinkedEditing(monaco) {
  const provider = {
    provideLinkedEditingRanges(model, position) {
      const text = model.getValue()
      const offset = model.getOffsetAt(position)
      const pair = pairAtOffset(text, offset)
      if (!pair) return null
      return {
        ranges: pair.map(({ start, length }) => {
          const s = model.getPositionAt(start)
          const e = model.getPositionAt(start + length)
          return new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column)
        }),
        wordPattern: /[a-zA-Z][a-zA-Z0-9-]*/
      }
    }
  }
  monaco.languages.registerLinkedEditingRangeProvider('html', provider)
  monaco.languages.registerLinkedEditingRangeProvider('php', provider)
}

/**
 * The open/close tag-name token pair whose NAME contains `offset`, as
 * [{start, length}, {start, length}] in document order — or null when the
 * caret isn't in a paired tag name. Caret at either end of the name counts
 * (that's where you land before typing).
 */
function pairAtOffset(text, offset) {
  TAG_TOKEN.lastIndex = 0
  const stacks = new Map()   // tag name → [{start, length}] of unmatched opens
  let m
  while ((m = TAG_TOKEN.exec(text))) {
    const [full, slash, name, attrs] = m
    const lower = name.toLowerCase()
    if (VOID_TAGS.has(lower)) continue
    const nameStart = m.index + 1 + slash.length
    const token = { start: nameStart, length: name.length }
    if (!slash) {
      if (attrs.trimEnd().endsWith('/') || full.endsWith('/>')) continue
      if (!stacks.has(lower)) stacks.set(lower, [])
      stacks.get(lower).push(token)
    } else {
      const open = stacks.get(lower)?.pop()
      if (!open) continue
      if (inToken(offset, open) || inToken(offset, token)) return [open, token]
      // Every later pair either encloses this offset via a DIFFERENT pair or
      // not at all — keep scanning; no early exit needed beyond this check.
    }
  }
  return null
}

function inToken(offset, { start, length }) {
  return offset >= start && offset <= start + length
}
