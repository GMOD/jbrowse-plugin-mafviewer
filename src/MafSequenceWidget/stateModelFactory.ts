import { types } from '@jbrowse/mobx-state-tree'

import type { Sample } from '../LinearMafDisplay/types'
import type { AnyConfigurationModel } from '@jbrowse/core/configuration'
import type { Instance } from '@jbrowse/mobx-state-tree'

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
        | {
            refName: string
            start: number
            end: number
            assemblyName: string
          }[]
        | undefined,
      connectedViewId: undefined as string | undefined,
    }))
}

export type MafSequenceWidgetStateModel = ReturnType<typeof stateModelFactory>
export type MafSequenceWidgetModel = Instance<MafSequenceWidgetStateModel>
