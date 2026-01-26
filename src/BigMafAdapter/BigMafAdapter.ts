import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import { SimpleFeature, updateStatus } from '@jbrowse/core/util'
import { openLocation } from '@jbrowse/core/util/io'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { getSnapshot } from '@jbrowse/mobx-state-tree'
import { firstValueFrom, toArray } from 'rxjs'

import parseNewick from '../parseNewick'
import { normalize } from '../util'
import { parseAssemblyAndChrSimple } from '../util/parseAssemblyName'

import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { Feature, Region } from '@jbrowse/core/util'

interface OrganismRecord {
  chr: string
  start: number
  srcSize: number
  strand: number
  unknown: number
  seq: string
}
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
    if (!this.setupP) {
      this.setupP = this.setup().catch((e: unknown) => {
        this.setupP = undefined
        throw e
      })
    }
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
    const { statusCallback = () => {} } = opts || {}
    // Pre-compile regex for better performance
    const WHITESPACE_REGEX = / +/

    return ObservableCreate<Feature>(async observer => {
      const { adapter } = await this.setup()
      const features = await updateStatus(
        'Downloading alignments',
        statusCallback,
        () => firstValueFrom(adapter.getFeatures(query).pipe(toArray())),
      )
      await updateStatus('Processing alignments', statusCallback, () => {
        for (const feature of features) {
          const maf = feature.get('mafBlock') as string
          const blocks = maf.split(';')

          // Count sequence blocks first to pre-size arrays
          let sequenceBlockCount = 0
          for (const block of blocks) {
            if (block.startsWith('s')) {
              sequenceBlockCount++
            }
          }

          // Pre-size arrays based on actual sequence block count
          const alns = new Array<string>(sequenceBlockCount)
          const alignments = {} as Record<string, OrganismRecord>

          let sequenceIndex = 0
          let referenceSeq: string | undefined

          // Single-pass processing: combine both loops
          for (const block of blocks) {
            if (block.startsWith('s')) {
              // Split once and cache the result
              const parts = block.split(WHITESPACE_REGEX)
              const sequence = parts[6]!
              const organismChr = parts[1]!

              // Store sequence in pre-sized array
              alns[sequenceIndex] = sequence

              // Set reference sequence from first block
              if (referenceSeq === undefined) {
                referenceSeq = sequence
              }

              // Parse organism and chromosome
              const { assemblyName: org, chr } =
                parseAssemblyAndChrSimple(organismChr)

              // Create alignment record directly
              alignments[org] = {
                chr,
                start: +parts[2]!,
                srcSize: +parts[3]!,
                strand: parts[4] === '+' ? 1 : -1,
                unknown: +parts[5]!,
                seq: sequence,
              }

              sequenceIndex++
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
        }
      })
      observer.complete()
    })
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
