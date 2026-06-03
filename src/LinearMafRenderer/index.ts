import PluginManager from '@jbrowse/core/PluginManager'

import LinearMafRenderer from './LinearMafRenderer'
import ReactComponent from './components/LinearMafRendering'
import configSchema from './configSchema'

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
