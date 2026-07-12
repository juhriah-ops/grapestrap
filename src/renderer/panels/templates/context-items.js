/**
 * GrapeStrap — Master Templates: context-menu items
 *
 * PATH: src/renderer/panels/templates/context-items.js
 * ROLE: Template-aware right-click items merged into the single context-menu
 *       open path (renderer/main.js 'canvas:context-menu' listener), after
 *       buildComponentMenuItems(). Template tabs get region add/remove;
 *       templated pages get Edit Master Template / Detach (v4 §14).
 * DEPENDS: state/project-state.js, state/page-state.js, i18n.js,
 *          ./manage.js, ./lock.js
 * CREATED: 2026-07-12
 */

import { projectState } from '../../state/project-state.js'
import { pageState } from '../../state/page-state.js'
import { t } from '../../i18n.js'
import { makeEditableRegion, removeEditableRegion, detachActivePage } from './manage.js'
import { isRegionEl } from './lock.js'

/**
 * Items appropriate to the active tab kind. Returns [] when templates play
 * no role (no project, library tab, plain page) so the caller can spread it
 * unconditionally: [...buildComponentMenuItems(c), ...buildTemplateMenuItems(c)].
 */
export function buildTemplateMenuItems(component) {
  if (!projectState.current) return []
  const tab = pageState.active()
  if (!tab) return []

  // ── Editing the template itself: region add/remove ────────────────────────
  if (tab.kind === 'template') {
    if (component && isRegionEl(component)) {
      return [
        { separator: true },
        { label: t('tpl.menu.remove-region'), action: () => removeEditableRegion(component) }
      ]
    }
    return [
      { separator: true },
      {
        label: t('tpl.menu.make-region'),
        action: () => makeEditableRegion(component),
        // Root can't be a region; nesting is validated (with a toast that
        // explains WHY) inside makeEditableRegion — only structurally
        // impossible cases are greyed out here.
        disabled: !component || !component.parent?.()
      }
    ]
  }

  // ── A page built from a template: edit master / detach ────────────────────
  if ((tab.kind || 'page') === 'page') {
    const page = projectState.getPage(tab.pageName)
    if (!page?.templateName) return []
    return [
      { separator: true },
      {
        // v4 §14: "Right-click locked area → Edit master template". Offered
        // everywhere on the page (harmless from inside a region too), which
        // keeps the menu stable instead of appearing/vanishing per target.
        label: t('tpl.menu.edit-master', { name: page.templateName }),
        action: () => pageState.open(page.templateName, { kind: 'template', label: page.templateName })
      },
      {
        label: t('tpl.menu.detach'),
        action: () => detachActivePage(),
        danger: true
      }
    ]
  }

  return []
}
