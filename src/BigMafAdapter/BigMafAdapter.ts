import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import { SimpleFeature } from '@jbrowse/core/util'
import { openLocation } from '@jbrowse/core/util/io'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { getSnapshot } from '@jbrowse/mobx-state-tree'

import parseNewick from '../parseNewick'
import { normalize } from '../util'
import { subscribeToObservable } from '../util/observableUtils'
import { parseAssemblyAndChrSimple } from '../util/parseAssemblyName'

import type { AlignmentRecord } from '../types'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { Feature, Region } from '@jbrowse/core/util'
export default class BigMafAdapter extends BaseFeatureDataAdapter {
  public setupP?: Promise<{ adapter: BaseFeatureDataAdapter }>

  async setup() {
    if (!this.getSubAdapter) {
      throw new Error('no getSubAdapter available')
    }
    return {
      adapter: (
        await this.getSubAdapter({
          ...getSnapshot(this.config),
          type: 'BigBedAdapter',
        })
      ).dataAdapter as BaseFeatureDataAdapter,
    }
  }
  async setupPre() {
    this.setupP ??= this.setup().catch((e: unknown) => {
      this.setupP = undefined
      throw e
    })
    return this.setupP
  }

  async getRefNames() {
    const { adapter } = await this.setup()
    return adapter.getRefNames()
  }

  async getHeader() {
    const { adapter } = await this.setup()
    return adapter.getHeader()
  }

  getFeatures(query: Region, opts?: BaseOptions) {
    const WHITESPACE_REGEX = / +/

    return ObservableCreate<Feature>(async observer => {
      const { adapter } = await this.setupPre()

      await subscribeToObservable(adapter.getFeatures(query, opts), feature => {
        const maf = feature.get('mafBlock') as string
        const blocks = maf.split(';')
        const alignments = {} as Record<string, AlignmentRecord>
        let referenceSeq: string | undefined

        for (const block of blocks) {
          if (block.startsWith('s')) {
            const parts = block.split(WHITESPACE_REGEX)
            const sequence = parts[6]!
            const organismChr = parts[1]!

            if (referenceSeq === undefined) {
              referenceSeq = sequence
            }

            const { assemblyName: org, chr } =
              parseAssemblyAndChrSimple(organismChr)

            alignments[org] = {
              chr,
              start: +parts[2]!,
              srcSize: +parts[3]!,
              strand: parts[4] === '+' ? 1 : -1,
              unknown: +parts[5]!,
              seq: sequence,
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
              seq: referenceSeq,
              alignments,
            },
          }),
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
