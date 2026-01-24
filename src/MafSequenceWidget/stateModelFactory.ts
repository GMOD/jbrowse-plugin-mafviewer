import { types } from 'mobx-state-tree'

import type { AnyConfigurationModel } from '@jbrowse/core/configuration'
import type { Sample } from '../LinearMafDisplay/types'
import type { Instance } from 'mobx-state-tree'

export function stateModelFactory() {
  return types
    .model('MafSequenceWidget', {
      id: types.identifier,
      type: types.literal('MafSequenceWidget'),
    })
    .volatile(() => ({
      adapterConfig: undefined as AnyConfigurationModel | undefined,
      samples: undefined as Sample[] | undefined,
      regions: undefined as
        | { refName: string; start: number; end: number; assemblyName: string }[]
        | undefined,
      connectedViewId: undefined as string | undefined,
    }))
    .actions(self => ({
      setData(data: {
        adapterConfig: AnyConfigurationModel
        samples: Sample[]
        regions: {
          refName: string
          start: number
          end: number
          assemblyName: string
        }[]
        connectedViewId?: string
      }) {
        self.adapterConfig = data.adapterConfig
        self.samples = data.samples
        self.regions = data.regions
        self.connectedViewId = data.connectedViewId
      },
    }))
}

export type MafSequenceWidgetStateModel = ReturnType<typeof stateModelFactory>
export type MafSequenceWidgetModel = Instance<MafSequenceWidgetStateModel>
