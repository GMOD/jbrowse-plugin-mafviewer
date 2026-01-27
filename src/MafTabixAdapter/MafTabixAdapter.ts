import {
  BaseFeatureDataAdapter,
  BaseOptions,
} from '@jbrowse/core/data_adapters/BaseAdapter'
import { Feature, Region, updateStatus } from '@jbrowse/core/util'
import { openLocation } from '@jbrowse/core/util/io'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { getSnapshot } from '@jbrowse/mobx-state-tree'

import MafFeature from '../MafFeature'
import parseNewick from '../parseNewick'
import { normalize } from '../util'
import { subscribeToObservable } from '../util/observableUtils'
import {
  parseAssemblyAndChr,
  selectReferenceSequenceString,
} from '../util/parseAssemblyName'

import type { AlignmentRecord } from '../types'

export default class MafTabixAdapter extends BaseFeatureDataAdapter {
  public setupP?: Promise<{ adapter: BaseFeatureDataAdapter }>

  async setupPre() {
    if (!this.getSubAdapter) {
      throw new Error('no getSubAdapter available')
    }
    return {
      adapter: (
        await this.getSubAdapter({
          ...getSnapshot(this.config),
          type: 'BedTabixAdapter',
        })
      ).dataAdapter as BaseFeatureDataAdapter,
    }
  }
  async setupPre2() {
    if (!this.setupP) {
      this.setupP = this.setupPre().catch((e: unknown) => {
        this.setupP = undefined
        throw e
      })
    }
    return this.setupP
  }

  async setup(opts?: BaseOptions) {
    const { statusCallback = () => {} } = opts || {}
    return updateStatus('Downloading index', statusCallback, () =>
      this.setupPre2(),
    )
  }

  async getRefNames(opts?: BaseOptions) {
    const { adapter } = await this.setup(opts)
    return adapter.getRefNames()
  }

  async getHeader(opts?: BaseOptions) {
    const { adapter } = await this.setup(opts)
    return adapter.getHeader()
  }

  getFeatures(query: Region, opts?: BaseOptions) {
    return ObservableCreate<Feature>(async observer => {
      const { adapter } = await this.setup(opts)
      let firstAssemblyNameFound = ''
      const refAssemblyName = this.getConf('refAssemblyName')

      await subscribeToObservable(adapter.getFeatures(query, opts), feature => {
        const data = (feature.get('field5') as string).split(',')
        const alignments = {} as Record<string, AlignmentRecord>

        for (let j = 0, l = data.length; j < l; j++) {
          const elt = data[j]!
          const parts = elt.split(':')

          const [
            assemblyAndChr,
            startStr,
            srcSizeStr,
            strandStr,
            unknownStr,
            seq,
          ] = parts

          if (!assemblyAndChr || !seq) {
            continue
          }

          const { assemblyName, chr } = parseAssemblyAndChr(assemblyAndChr)

          if (assemblyName) {
            if (!firstAssemblyNameFound) {
              firstAssemblyNameFound = assemblyName
            }

            alignments[assemblyName] = {
              chr,
              start: +startStr!,
              srcSize: +srcSizeStr!,
              strand: strandStr === '-' ? -1 : 1,
              unknown: +unknownStr!,
              seq,
            }
          }
        }

        observer.next(
          new MafFeature(
            feature.id(),
            feature.get('start'),
            feature.get('end'),
            feature.get('refName'),
            0, // strand determined per-alignment
            alignments,
            selectReferenceSequenceString(
              alignments,
              refAssemblyName,
              query.assemblyName,
              firstAssemblyNameFound,
            ) ?? '',
          ),
        )
      })

      observer.complete()
    }, opts?.stopToken)
  }

  async getSamples(_query: Region) {
    const nhLoc = this.getConf('nhLocation')
    const nh =
      nhLoc.uri === '/path/to/my.nh'
        ? undefined
        : await openLocation(nhLoc).readFile('utf8')

    // TODO: we may need to resolve the exact set of rows in the visible region
    // here
    return {
      samples: normalize(this.getConf('samples')),
      tree: nh ? parseNewick(nh) : undefined,
    }
  }

  freeResources(): void {}
}
