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
import { parseRowInstructions, filterFirstLineInstructions } from './rowInstructions'
import { countNonGapBases } from './util'
import { parseAssemblyAndChrSimple } from '../util/parseAssemblyName'
import { encodeSequence } from '../util/sequenceEncoding'

import type { RowInstruction } from './rowInstructions'
import type { IndexData, OrganismRecord } from './types'

// Represents a row in the alignment (like Alignment_Row in C)
interface RowState {
  sequenceName: string
  start: number
  strand: number
  sequenceLength: number
  bases: string // accumulated bases for this row in current block
  length: number // non-gap length
}

// Represents an alignment block (like Alignment in C)
interface AlignmentBlock {
  rows: RowState[]
  columnNumber: number
}

interface SetupData {
  index: IndexData
  runLengthEncodeBases: boolean
}

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

      const startBlock = firstEntry.virtualOffset.blockPosition
      const endBlock = nextEntry.virtualOffset.blockPosition

      // Read enough data to cover the range
      const MIN_BLOCK_SIZE = 65536
      const readLength =
        endBlock > startBlock
          ? endBlock - startBlock + MIN_BLOCK_SIZE
          : MIN_BLOCK_SIZE

      const response = await file.read(readLength, startBlock)
      const buffer = await unzip(response)

      const startOffset = firstEntry.virtualOffset.dataPosition
      const endOffset = endBlock === startBlock
        ? nextEntry.virtualOffset.dataPosition
        : buffer.length

      const slice = buffer.slice(startOffset, endOffset)

      // Parse TAF data into multiple alignment blocks (like taf_read_block)
      return await this.parseTafBlocks(slice, runLengthEncodeBases, {
        statusCallback: statusCallback as (arg: string) => void,
        signal,
      })
    },
  })

  async getRefNames() {
    const { index } = await this.setup()
    return Object.keys(index)
  }

  // Faithful translation of parse_coordinates_and_establish_block from taf.c
  // Creates a new block by copying from previous block and applying coordinate changes
  parseCoordinatesAndEstablishBlock(
    pBlock: AlignmentBlock | undefined,
    instructions: RowInstruction[],
  ): AlignmentBlock {
    const block: AlignmentBlock = {
      rows: [],
      columnNumber: 0,
    }

    // Copy rows from previous block (like the C code does)
    if (pBlock) {
      for (const pRow of pBlock.rows) {
        block.rows.push({
          sequenceName: pRow.sequenceName,
          start: pRow.start + pRow.length, // Start continues from previous end
          strand: pRow.strand,
          sequenceLength: pRow.sequenceLength,
          bases: '',
          length: 0,
        })
      }
    }

    // Apply coordinate instructions (like the C code)
    for (const ins of instructions) {
      if (ins.type === 'i') {
        // Insert new row at specified position
        block.rows.splice(ins.row, 0, {
          sequenceName: ins.sequenceName,
          start: ins.start,
          strand: ins.strand,
          sequenceLength: ins.sequenceLength,
          bases: '',
          length: 0,
        })
      } else if (ins.type === 's') {
        // Substitute coordinates for existing row
        const row = block.rows[ins.row]
        if (row) {
          row.sequenceName = ins.sequenceName
          row.start = ins.start
          row.strand = ins.strand
          row.sequenceLength = ins.sequenceLength
        }
      } else if (ins.type === 'd') {
        // Delete row at specified position
        if (block.rows[ins.row]) {
          block.rows.splice(ins.row, 1)
        }
      } else if (ins.type === 'g') {
        // Gap: increment start coordinate
        const row = block.rows[ins.row]
        if (row) {
          row.start += ins.gapLength
        }
      } else if (ins.type === 'G') {
        // Gap with substring: increment start by substring length
        const row = block.rows[ins.row]
        if (row) {
          row.start += ins.gapSubstring.length
        }
      }
    }

    return block
  }

  // Parse bases from a column (like get_bases in taf.c)
  parseBases(basesStr: string, expectedLength: number, runLengthEncodeBases: boolean): string {
    if (runLengthEncodeBases) {
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
    return basesStr
  }

  // Faithful translation of taf_read_block from taf.c
  // Parses TAF data into multiple alignment blocks
  async parseTafBlocks(
    buffer: Uint8Array,
    runLengthEncodeBases: boolean,
    opts?: BaseOptions,
  ) {
    const { statusCallback = () => {} } = opts || {}
    const features: Array<{
      uniqueId: string
      start: number
      end: number
      strand: number
      alignments: Record<string, OrganismRecord>
      seq: ReturnType<typeof encodeSequence>
    }> = []

    let pBlock: AlignmentBlock | undefined
    let currentBlock: AlignmentBlock | undefined
    let columns: string[] = []
    let isFirstCoordLine = true
    let lineNum = 0

    const decoder = new TextDecoder('ascii')
    const text = decoder.decode(buffer)
    const lines = text.split('\n')

    for (const line of lines) {
      lineNum++
      if (lineNum % 1000 === 0) {
        statusCallback(`Processing line ${lineNum}`)
      }

      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue
      }

      // Check if line has coordinates (contains ' ; ')
      const semicolonIndex = trimmedLine.indexOf(' ; ')
      const hasCoordinates = semicolonIndex !== -1

      if (hasCoordinates) {
        // If we have a current block with columns, finalize it
        if (currentBlock && columns.length > 0) {
          this.finalizeBlock(currentBlock, columns)
          const feature = this.blockToFeature(currentBlock)
          if (feature) {
            features.push(feature)
          }
          pBlock = currentBlock
        }

        // Parse the coordinate instructions
        const basesAndTags = trimmedLine.slice(0, semicolonIndex)
        let rowInstructions = trimmedLine.slice(semicolonIndex + 3)

        // Remove tag section if present
        const atIndex = rowInstructions.indexOf(' @')
        if (atIndex !== -1) {
          rowInstructions = rowInstructions.slice(0, atIndex)
        }

        let instructions = parseRowInstructions(rowInstructions)

        // On first line, filter instructions (like change_s_coordinates_to_i)
        if (isFirstCoordLine) {
          instructions = filterFirstLineInstructions(instructions)
          isFirstCoordLine = false
        }

        // Create new block from previous block + instructions
        currentBlock = this.parseCoordinatesAndEstablishBlock(pBlock, instructions)
        columns = []

        // Add bases from this line as first column
        const basesAtIndex = basesAndTags.indexOf(' @')
        const basesOnly = basesAtIndex !== -1 ? basesAndTags.slice(0, basesAtIndex) : basesAndTags
        const bases = this.parseBases(basesOnly.trim(), currentBlock.rows.length, runLengthEncodeBases)
        if (bases.length > 0) {
          columns.push(bases)
        }
      } else if (currentBlock) {
        // Line without coordinates - just bases
        const basesAtIndex = trimmedLine.indexOf(' @')
        const basesOnly = basesAtIndex !== -1 ? trimmedLine.slice(0, basesAtIndex) : trimmedLine
        const bases = this.parseBases(basesOnly.trim(), currentBlock.rows.length, runLengthEncodeBases)
        if (bases.length > 0) {
          columns.push(bases)
        }
      }
    }

    // Finalize last block
    if (currentBlock && columns.length > 0) {
      this.finalizeBlock(currentBlock, columns)
      const feature = this.blockToFeature(currentBlock)
      if (feature) {
        features.push(feature)
      }
    }

    return features
  }

  // Transpose columns into rows (like the end of taf_read_block)
  finalizeBlock(block: AlignmentBlock, columns: string[]) {
    block.columnNumber = columns.length

    for (let j = 0; j < block.rows.length; j++) {
      const row = block.rows[j]!
      let bases = ''
      let length = 0

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]!
        const base = col[j] ?? '-'
        bases += base
        if (base !== '-') {
          length++
        }
      }

      row.bases = bases
      row.length = length
    }
  }

  // Convert a block to a feature (like what BigMafAdapter returns)
  blockToFeature(block: AlignmentBlock) {
    if (block.rows.length === 0 || block.columnNumber === 0) {
      return undefined
    }

    const row0 = block.rows[0]!
    const alignments: Record<string, OrganismRecord> = {}

    for (const row of block.rows) {
      const { assemblyName, chr } = parseAssemblyAndChrSimple(row.sequenceName)
      alignments[assemblyName] = {
        chr,
        start: row.start,
        srcSize: row.sequenceLength,
        strand: row.strand,
        seq: encodeSequence(row.bases),
      }
    }

    const nonGapLength = countNonGapBases(row0.bases)

    return {
      uniqueId: `${row0.start}-${nonGapLength}`,
      start: row0.start,
      end: row0.start + nonGapLength,
      strand: row0.strand,
      alignments,
      seq: encodeSequence(row0.bases),
    }
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

  async readHeader(): Promise<boolean> {
    try {
      const file = openLocation(this.getConf('tafGzLocation'))
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
    const text = await openLocation(this.getConf('taiLocation')).readFile('utf8')
    const lines = text.split('\n').map(f => f.trim()).filter(line => !!line)
    const entries = {} as IndexData
    let lastChr = ''
    let lastChrStart = 0
    let lastRawVirtualOffset = 0

    for (const line of lines) {
      const [chr, chrStart, virtualOffset] = line.split('\t')
      const isRelative = chr === '*'
      const currChr = isRelative ? lastChr : chr!.split('.').at(-1)!

      const absVirtualOffset = isRelative
        ? lastRawVirtualOffset + +virtualOffset!
        : +virtualOffset!
      const absChrStart = isRelative ? lastChrStart + +chrStart! : +chrStart!

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
        const features = await updateStatus(
          'Downloading alignments',
          statusCallback,
          () => this.getLines(query, index, runLengthEncodeBases),
        )

        if (features && features.length > 0) {
          // Filter features that overlap with query region
          for (const feat of features) {
            if (feat.end > query.start && feat.start < query.end) {
              observer.next(
                new SimpleFeature({
                  id: feat.uniqueId,
                  data: {
                    start: feat.start,
                    end: feat.end,
                    refName: query.refName,
                    strand: feat.strand,
                    alignments: feat.alignments,
                    seq: feat.seq,
                  },
                }),
              )
            }
          }
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
      const getKey = (r: (typeof records)[0]) => r.chrStart

      const startIdx = lowerBound(records, query.start, getKey)
      const firstEntry = records[Math.max(startIdx - 1, 0)]

      const endIdx = lowerBound(records, query.end, getKey)
      const nextEntry = records[endIdx + 1] ?? records.at(-1)

      if (firstEntry && nextEntry) {
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
