import {
  BaseFeatureDataAdapter,
  BaseOptions,
} from '@jbrowse/core/data_adapters/BaseAdapter'
import { Feature, Region, SimpleFeature, updateStatus } from '@jbrowse/core/util'
import { openLocation } from '@jbrowse/core/util/io'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { getSnapshot } from '@jbrowse/mobx-state-tree'

import parseNewick from '../parseNewick'
import { normalize } from '../util'
import {
  parseAssemblyAndChr,
  selectReferenceSequence,
} from '../util/parseAssemblyName'
import { encodeSequence } from '../util/sequenceEncoding'

import type { EncodedSequence } from '../util/sequenceEncoding'

interface OrganismRecord {
  chr: string
  start: number
  srcSize: number
  strand: number
  unknown: number
  seq: EncodedSequence
}

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

      // Stream features directly instead of collecting with toArray()
      // This reduces peak memory from O(all features) to O(1 feature)
      await new Promise<void>((resolve, reject) => {
        adapter.getFeatures(query, opts).subscribe({
          next: feature => {
            const data = (feature.get('field5') as string).split(',')
            const alignments = {} as Record<string, OrganismRecord>
            const dataLength = data.length

            for (let j = 0; j < dataLength; j++) {
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
                  seq: encodeSequence(seq),
                }
              }
            }

            observer.next(
              new SimpleFeature({
                id: feature.id(),
                data: {
                  start: feature.get('start'),
                  end: feature.get('end'),
                  refName: feature.get('refName'),
                  name: feature.get('name'),
                  score: feature.get('score'),
                  alignments,
                  seq: selectReferenceSequence(
                    alignments,
                    refAssemblyName,
                    query.assemblyName,
                    firstAssemblyNameFound,
                  ),
                },
              }),
            )
          },
          error: reject,
          complete: resolve,
        })
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
