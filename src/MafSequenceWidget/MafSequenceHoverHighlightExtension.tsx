import React from 'react'

import MafSequenceHoverHighlight from './MafSequenceHoverHighlight'

import type PluginManager from '@jbrowse/core/PluginManager'
import type { LinearGenomeViewModel } from '@jbrowse/plugin-linear-genome-view'

export default function MafSequenceHoverHighlightExtensionF(
  pluginManager: PluginManager,
) {
  pluginManager.addToExtensionPoint(
    'LinearGenomeView-TracksContainerComponent',
    (rest: React.ReactNode[], { model }: { model: LinearGenomeViewModel }) => {
      return [
        ...rest,
        <MafSequenceHoverHighlight
          key="maf-sequence-hover-highlight"
          model={model}
        />,
      ]
    },
  )
}
