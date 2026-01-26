import { unzip } from '@gmod/bgzf-filehandle'
import {
  BaseFeatureDataAdapter,
  BaseOptions,
} from '@jbrowse/core/data_adapters/BaseAdapter'
import {
  Feature,
  Region,
  SimpleFeature,
  updateStatus,
} from '@jbrowse/core/util'
import QuickLRU from '@jbrowse/core/util/QuickLRU'
import { openLocation } from '@jbrowse/core/util/io'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import AbortablePromiseCache from 'abortable-promise-cache'

import VirtualOffset from './virtualOffset'
import parseNewick from '../parseNewick'
import { normalize } from '../util'
import { RowInstruction, parseRowInstructions } from './rowInstructions'
import { countNonGapBases, parseLineByLine } from './util'
import { parseAssemblyAndChrSimple } from '../util/parseAssemblyName'

import type { IndexData, OrganismRecord } from './types'

// Represents a row in the alignment
interface RowState {
  sequenceName: string
  start: number
  strand: number
  sequenceLength: number
  seq: string
}

interface SetupData {
  index: IndexData
  runLengthEncodeBases: boolean
}

const toP = (s = 0) => +s.toFixed(1)

// Binary search to find the index of the first element >= target
function lowerBound<T>(arr: T[], target: number, getKey: (item: T) => number) {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (getKey(arr[mid]!) < target) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

export default class BgzipTaffyAdapter extends BaseFeatureDataAdapter {
  public setupP?: Promise<SetupData>

  private cache = new AbortablePromiseCache({
    // @ts-expect-error
    cache: new QuickLRU({ maxSize: 50 }),
    // @ts-expect-error
    fill: async (
      { nextEntry, firstEntry, runLengthEncodeBases },
      signal,
      statusCallback,
    ) => {
      const file = openLocation(this.getConf('tafGzLocation'))
      const response = await file.read(
        nextEntry.virtualOffset.blockPosition -
          firstEntry.virtualOffset.blockPosition,
        firstEntry.virtualOffset.blockPosition,
      )
      const buffer = await unzip(response)
      const slice = buffer.slice(firstEntry.virtualOffset.dataPosition)
      return this.getChunk(slice, runLengthEncodeBases, {
        statusCallback: statusCallback as (arg: string) => void,
        signal,
      })
    },
  })

  async getRefNames() {
    const { index } = await this.setup()
    return Object.keys(index)
  }

  async getChunk(
    buffer: Uint8Array,
    runLengthEncodeBases: boolean,
    opts?: BaseOptions,
  ) {
    const { statusCallback = () => {} } = opts || {}

    // Track rows by their position in the alignment
    const rows: RowState[] = []

    let j = 0
    let b = 0
    parseLineByLine(buffer, line => {
      if (j++ % 100 === 0) {
        statusCallback(
          `Processing ${toP(b / 1_000_000)}/${toP(buffer.length / 1_000_000)}Mb`,
        )
      }
      b += line.length
      if (line && !line.startsWith('#')) {
        // Split on ' ; ' to separate bases from coordinates
        const semicolonIndex = line.indexOf(' ; ')
        let basesAndTags: string
        let rowInstructions: string | undefined

        if (semicolonIndex !== -1) {
          basesAndTags = line.slice(0, semicolonIndex)
          rowInstructions = line.slice(semicolonIndex + 3)
        } else {
          basesAndTags = line
          rowInstructions = undefined
        }

        // Process coordinate instructions if present
        if (rowInstructions) {
          // Remove any tag section (after @)
          const atIndex = rowInstructions.indexOf(' @')
          const coordPart =
            atIndex !== -1 ? rowInstructions.slice(0, atIndex) : rowInstructions
          const instructions = parseRowInstructions(coordPart)

          for (const ins of instructions) {
            this.applyInstruction(rows, ins)
          }
        }

        // Remove any tags from the bases portion
        const atIndex = basesAndTags.indexOf(' @')
        const basesOnly =
          atIndex !== -1 ? basesAndTags.slice(0, atIndex) : basesAndTags

        // Parse bases for this column
        // In TAF, each line is a column with one base per row
        const basesStr = basesOnly.trim()
        const bases = this.parseBases(
          basesStr,
          rows.length,
          runLengthEncodeBases,
        )

        // Append each base to the corresponding row
        for (let i = 0; i < bases.length; i++) {
          const row = rows[i]
          if (row) {
            row.seq += bases[i]
          }
        }
      }
    })

    if (rows.length > 0) {
      // Build alignments object keyed by assembly name
      const alignments = {} as Record<string, OrganismRecord>

      for (const row of rows) {
        const { assemblyName, chr } = parseAssemblyAndChrSimple(
          row.sequenceName,
        )

        // Use the full sequence name as key to handle multiple chromosomes
        // from the same assembly
        alignments[assemblyName] = {
          chr,
          start: row.start,
          srcSize: row.sequenceLength,
          strand: row.strand,
          seq: row.seq,
        }
      }

      const row0 = rows[0]!
      const nonGapLength = countNonGapBases(row0.seq)

      return {
        uniqueId: `${row0.start}-${nonGapLength}`,
        start: row0.start,
        end: row0.start + nonGapLength,
        strand: row0.strand,
        alignments,
        seq: row0.seq,
      }
    }
    return undefined
  }

  // Apply a coordinate instruction to the rows array
  applyInstruction(rows: RowState[], ins: RowInstruction) {
    if (ins.type === 'i') {
      // Insert a new row at the specified position
      rows.splice(ins.row, 0, {
        sequenceName: ins.sequenceName,
        start: ins.start,
        strand: ins.strand,
        sequenceLength: ins.sequenceLength,
        seq: '',
      })
    } else if (ins.type === 's') {
      // Substitute/update coordinates for an existing row
      const row = rows[ins.row]
      if (row) {
        row.sequenceName = ins.sequenceName
        row.start = ins.start
        row.strand = ins.strand
        row.sequenceLength = ins.sequenceLength
      }
    } else if (ins.type === 'd') {
      // Delete a row at the specified position
      rows.splice(ins.row, 1)
    } else if (ins.type === 'g') {
      // Gap operation: increment the start coordinate by gap length
      // This handles unaligned regions between blocks
      const row = rows[ins.row]
      if (row) {
        row.start += ins.gapLength
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    else if (ins.type === 'G') {
      // Gap operation with explicit substring: increment start by substring length
      const row = rows[ins.row]
      if (row) {
        row.start += ins.gapSubstring.length
      }
    }
  }

  // Parse bases from a column line
  // Handles both run-length encoded and plain format
  parseBases(
    basesStr: string,
    expectedLength: number,
    runLengthEncodeBases: boolean,
  ) {
    if (runLengthEncodeBases) {
      // Run-length encoded: "A 3 T 2" means "AAATT"
      const tokens = basesStr.split(' ')
      let result = ''
      for (let i = 0; i < tokens.length; i += 2) {
        const base = tokens[i]!
        const count = parseInt(tokens[i + 1]!, 10)
        if (!isNaN(count) && base.length === 1) {
          result += base.repeat(count)
        }
      }
      return result
    }
    // Plain format: just return the string (one char per row)
    return basesStr
  }

  setupPre() {
    if (!this.setupP) {
      this.setupP = this.doSetup().catch((e: unknown) => {
        this.setupP = undefined
        throw e
      })
    }
    return this.setupP
  }

  setup(opts?: BaseOptions) {
    const { statusCallback = () => {} } = opts || {}
    return updateStatus('Downloading index', statusCallback, () =>
      this.setupPre(),
    )
  }

  async doSetup(): Promise<SetupData> {
    const [index, runLengthEncodeBases] = await Promise.all([
      this.readTaiFile(),
      this.readHeader(),
    ])
    return { index, runLengthEncodeBases }
  }

  // Read the TAF header to check for run_length_encode_bases flag
  async readHeader(): Promise<boolean> {
    try {
      const file = openLocation(this.getConf('tafGzLocation'))
      // Read first block to get header
      const response = await file.read(65536, 0)
      const buffer = await unzip(response)
      const decoder = new TextDecoder('ascii')
      const text = decoder.decode(buffer.slice(0, 1000))
      const firstLine = text.split('\n')[0] || ''
      if (firstLine.startsWith('#taf')) {
        return firstLine.includes('run_length_encode_bases:1')
      }
    } catch {
      // If we can't read the header, assume non-RLE
    }
    return false
  }

  async readTaiFile() {
    const text = await openLocation(this.getConf('taiLocation')).readFile(
      'utf8',
    )
    const lines = text
      .split('\n')
      .map(f => f.trim())
      .filter(line => !!line)
    const entries = {} as IndexData
    let lastChr = ''
    let lastChrStart = 0
    let lastRawVirtualOffset = 0
    for (const line of lines) {
      const [chr, chrStart, virtualOffset] = line.split('\t')

      // TAI format: when chr is '*', values are relative to previous entry
      // When chr is a name, values are absolute
      const isRelative = chr === '*'
      const currChr = isRelative ? lastChr : chr!.split('.').at(-1)!

      // Calculate absolute values
      const absVirtualOffset = isRelative
        ? lastRawVirtualOffset + +virtualOffset!
        : +virtualOffset!
      const absChrStart = isRelative ? lastChrStart + +chrStart! : +chrStart!

      // bgzip TAF files store virtual offsets in plaintext in the TAI file
      // virtual offset = (blockPosition << 16) | dataPosition
      // extract block position (bits 16+) and data position (bits 0-15)
      const blockPosition = Math.floor(absVirtualOffset / 65536)
      const dataPosition = absVirtualOffset % 65536
      const voff = new VirtualOffset(blockPosition, dataPosition)

      if (!entries[currChr]) {
        entries[currChr] = []
      }
      entries[currChr].push({
        chrStart: absChrStart,
        virtualOffset: voff,
      })
      lastChr = currChr
      lastChrStart = absChrStart
      lastRawVirtualOffset = absVirtualOffset
    }
    return entries
  }

  getFeatures(query: Region, opts?: BaseOptions) {
    const { statusCallback = () => {} } = opts || {}
    return ObservableCreate<Feature>(async observer => {
      try {
        const { index, runLengthEncodeBases } = await this.setup()
        const feat = await updateStatus(
          'Downloading alignments',
          statusCallback,
          () => this.getLines(query, index, runLengthEncodeBases),
        )
        if (feat) {
          observer.next(
            // @ts-expect-error
            new SimpleFeature({
              ...feat,
              refName: query.refName,
            }),
          )
        } else {
          console.error('no feature found')
        }

        statusCallback('')
        observer.complete()
      } catch (e) {
        observer.error(e)
      }
    })
  }

  async getSamples(_query: Region) {
    const nhLoc = this.getConf('nhLocation')
    const nh =
      nhLoc.uri === '/path/to/my.nh'
        ? undefined
        : await openLocation(nhLoc).readFile('utf8')

    return {
      samples: normalize(this.getConf('samples')),
      tree: nh ? parseNewick(nh) : undefined,
    }
  }

  async getLines(
    query: Region,
    byteRanges: IndexData,
    runLengthEncodeBases: boolean,
  ) {
    const records = byteRanges[query.refName]
    if (records && records.length > 0) {
      // Use binary search for better performance with large indexes
      const getKey = (r: (typeof records)[0]) => r.chrStart

      // Find first entry: the block containing or just before query.start
      const startIdx = lowerBound(records, query.start, getKey)
      const firstEntry = records[Math.max(startIdx - 1, 0)]

      // Find next entry: the block after query.end
      const endIdx = lowerBound(records, query.end, getKey)
      const nextEntry = records[endIdx + 1] ?? records.at(-1)

      // we NEED at least a firstEntry (validate behavior?) because otherwise
      // it fetches whole file when you request e.g. out of range region
      if (firstEntry && nextEntry) {
        // Use a simpler cache key
        const cacheKey = `${firstEntry.virtualOffset}:${nextEntry.virtualOffset}`
        return this.cache.get(cacheKey, {
          nextEntry,
          firstEntry,
          runLengthEncodeBases,
        })
      }
    }
    return undefined
  }

  freeResources(): void {}
}
