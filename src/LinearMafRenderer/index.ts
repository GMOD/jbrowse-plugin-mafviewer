import LinearMafRenderer from './LinearMafRenderer'
import ReactComponent from './components/LinearMafRendering'
import configSchema from './configSchema'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function LinearMafRendererF(pluginManager: PluginManager) {
  pluginManager.addRendererType(
    () =>
      new LinearMafRenderer({
        name: 'LinearMafRenderer',
        ReactComponent,
        configSchema,
        pluginManager,
      }),
  )
}
