/**
 * @grapestrap/exporter-flat
 *
 * The default exporter. The actual file-writing happens in the main process
 * (project-manager.js → exportProject) since it needs Node fs. This plugin
 * just registers the exporter entry so it appears in the Export dialog and
 * delegates to the IPC bridge.
 */

export default function register(api) {
  api.log.info('registering flat exporter')

  api.registerExporter({
    id: 'flat',
    label: 'Flat HTML / CSS / Assets',
    exportFn: async (project) => {
      const result = await window.grapestrap.project.export(project)
      if (result) {
        api.notify.success(`Exported ${result.pageCount} page(s) to ${result.outputDir}`)
      }
      return result
    }
  })
}
