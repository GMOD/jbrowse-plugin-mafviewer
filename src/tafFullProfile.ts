/**
 * Full profile of BgzipTaffyAdapter to identify all bottlenecks
 */

import { unzip } from '@gmod/bgzf-filehandle'
import { LocalFile } from 'generic-filehandle2'

const TEST_DATA_DIR = 'test_data/celegans'
const REGION = { refName: 'chrI', start: 100000, end: 200000 }

// Copied from BgzipTaffyAdapter
interface TaiEntry {
  chrStart: number
  blockPosition: number
  dataPosition: number
}

interface RowState {
  sequenceName: string
  start: number
  strand: number
  sequenceLength: number
  bases: string
  length: number
}

interface AlignmentBlock {
  rows: RowState[]
  columnNumber: number
}

interface RowInstruction {
  type: 'i' | 's' | 'd' | 'g' | 'G'
  row: number
  sequenceName: string
  start: number
  strand: number
  sequenceLength: number
  gapLength: number
  gapSubstring: string
}

function parseRowInstructions(str: string): RowInstruction[] {
  const instructions: RowInstruction[] = []
  const parts = str.split(' ')

  let i = 0
  while (i < parts.length) {
    const type = parts[i]
    if (type === 'i' || type === 's') {
      instructions.push({
        type: type as 'i' | 's',
        row: parseInt(parts[i + 1]!, 10),
        sequenceName: parts[i + 2]!,
        start: parseInt(parts[i + 3]!, 10),
        strand: parts[i + 4] === '+' ? 1 : -1,
        sequenceLength: parseInt(parts[i + 5]!, 10),
        gapLength: 0,
        gapSubstring: '',
      })
      i += 6
    } else if (type === 'd') {
      instructions.push({
        type: 'd',
        row: parseInt(parts[i + 1]!, 10),
        sequenceName: '',
        start: 0,
        strand: 0,
        sequenceLength: 0,
        gapLength: 0,
        gapSubstring: '',
      })
      i += 2
    } else if (type === 'g') {
      instructions.push({
        type: 'g',
        row: parseInt(parts[i + 1]!, 10),
        sequenceName: '',
        start: 0,
        strand: 0,
        sequenceLength: 0,
        gapLength: parseInt(parts[i + 2]!, 10),
        gapSubstring: '',
      })
      i += 3
    } else if (type === 'G') {
      instructions.push({
        type: 'G',
        row: parseInt(parts[i + 1]!, 10),
        sequenceName: '',
        start: 0,
        strand: 0,
        sequenceLength: 0,
        gapLength: 0,
        gapSubstring: parts[i + 2]!,
      })
      i += 3
    } else {
      i++
    }
  }

  return instructions
}

function filterFirstLineInstructions(instructions: RowInstruction[]): RowInstruction[] {
  return instructions
    .filter(ins => ins.type === 'i' || ins.type === 's')
    .map(ins => (ins.type === 's' ? { ...ins, type: 'i' as const } : ins))
}

function parseCoordinatesAndEstablishBlock(
  pBlock: AlignmentBlock | undefined,
  instructions: RowInstruction[],
): AlignmentBlock {
  const block: AlignmentBlock = { rows: [], columnNumber: 0 }

  if (pBlock) {
    for (const pRow of pBlock.rows) {
      block.rows.push({
        sequenceName: pRow.sequenceName,
        start: pRow.start + pRow.length,
        strand: pRow.strand,
        sequenceLength: pRow.sequenceLength,
        bases: '',
        length: 0,
      })
    }
  }

  for (const ins of instructions) {
    if (ins.type === 'i') {
      block.rows.splice(ins.row, 0, {
        sequenceName: ins.sequenceName,
        start: ins.start,
        strand: ins.strand,
        sequenceLength: ins.sequenceLength,
        bases: '',
        length: 0,
      })
    } else if (ins.type === 's') {
      const row = block.rows[ins.row]
      if (row) {
        row.sequenceName = ins.sequenceName
        row.start = ins.start
        row.strand = ins.strand
        row.sequenceLength = ins.sequenceLength
      }
    } else if (ins.type === 'd') {
      if (block.rows[ins.row]) {
        block.rows.splice(ins.row, 1)
      }
    } else if (ins.type === 'g') {
      const row = block.rows[ins.row]
      if (row) {
        row.start += ins.gapLength
      }
    } else if (ins.type === 'G') {
      const row = block.rows[ins.row]
      if (row) {
        row.start += ins.gapSubstring.length
      }
    }
  }

  return block
}

function finalizeBlock(block: AlignmentBlock, columns: string[]) {
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

interface TafFeature {
  start: number
  end: number
  alignmentCount: number
}

function* parseTafBlocksFull(text: string): Generator<TafFeature> {
  const lines = text.split('\n')

  let pBlock: AlignmentBlock | undefined
  let currentBlock: AlignmentBlock | undefined
  let columns: string[] = []
  let isFirstCoordLine = true

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) continue

    const semicolonIndex = trimmedLine.indexOf(' ; ')
    const hasCoordinates = semicolonIndex !== -1

    if (hasCoordinates) {
      if (currentBlock && columns.length > 0) {
        finalizeBlock(currentBlock, columns)
        const row0 = currentBlock.rows[0]
        if (row0) {
          yield {
            start: row0.start,
            end: row0.start + row0.length,
            alignmentCount: currentBlock.rows.length,
          }
        }
        pBlock = currentBlock
      }

      const basesAndTags = trimmedLine.slice(0, semicolonIndex)
      let rowInstructions = trimmedLine.slice(semicolonIndex + 3)

      const atIndex = rowInstructions.indexOf(' @')
      if (atIndex !== -1) {
        rowInstructions = rowInstructions.slice(0, atIndex)
      }

      let instructions = parseRowInstructions(rowInstructions)

      if (isFirstCoordLine) {
        instructions = filterFirstLineInstructions(instructions)
        isFirstCoordLine = false
      }

      currentBlock = parseCoordinatesAndEstablishBlock(pBlock, instructions)
      columns = []

      const basesAtIndex = basesAndTags.indexOf(' @')
      const basesOnly = basesAtIndex !== -1 ? basesAndTags.slice(0, basesAtIndex) : basesAndTags
      const bases = basesOnly.trim()
      if (bases.length > 0) {
        columns.push(bases)
      }
    } else if (currentBlock) {
      const basesAtIndex = trimmedLine.indexOf(' @')
      const basesOnly = basesAtIndex !== -1 ? trimmedLine.slice(0, basesAtIndex) : trimmedLine
      const bases = basesOnly.trim()
      if (bases.length > 0) {
        columns.push(bases)
      }
    }
  }

  if (currentBlock && columns.length > 0) {
    finalizeBlock(currentBlock, columns)
    const row0 = currentBlock.rows[0]
    if (row0) {
      yield {
        start: row0.start,
        end: row0.start + row0.length,
        alignmentCount: currentBlock.rows.length,
      }
    }
  }
}

async function readTaiIndex(path: string): Promise<Map<string, TaiEntry[]>> {
  const fs = await import('fs/promises')
  const text = await fs.readFile(path, 'utf8')
  const lines = text.split('\n').filter(l => l.trim())

  const index = new Map<string, TaiEntry[]>()
  let lastChr = ''
  let lastChrStart = 0
  let lastRawOffset = 0

  for (const line of lines) {
    const [chr, chrStartStr, offsetStr] = line.split('\t')
    const isRelative = chr === '*'
    const currChr = isRelative ? lastChr : chr!.split('.').at(-1)!

    const absOffset = isRelative ? lastRawOffset + +offsetStr! : +offsetStr!
    const absChrStart = isRelative ? lastChrStart + +chrStartStr! : +chrStartStr!

    const blockPosition = Math.floor(absOffset / 65536)
    const dataPosition = absOffset % 65536

    if (!index.has(currChr)) {
      index.set(currChr, [])
    }
    index.get(currChr)!.push({ chrStart: absChrStart, blockPosition, dataPosition })

    lastChr = currChr
    lastChrStart = absChrStart
    lastRawOffset = absOffset
  }

  return index
}

function lowerBound(arr: TaiEntry[], target: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid]!.chrStart < target) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

async function runProfile() {
  console.log('='.repeat(60))
  console.log('FULL TAF ADAPTER PROFILING')
  console.log('='.repeat(60))
  console.log('')

  const totalStart = performance.now()

  // Phase 1: Read index
  const indexStart = performance.now()
  const index = await readTaiIndex(`${TEST_DATA_DIR}/chrI.taf.gz.tai`)
  const indexTime = performance.now() - indexStart
  console.log(`1. Read index: ${indexTime.toFixed(1)} ms`)

  const records = index.get(REGION.refName)!
  const startIdx = lowerBound(records, REGION.start)
  const firstEntry = records[Math.max(startIdx - 1, 0)]!
  const endIdx = lowerBound(records, REGION.end)
  const nextEntry = records[endIdx + 1] ?? records.at(-1)!

  // Phase 2: Read compressed data
  const readStart = performance.now()
  const file = new LocalFile(`${TEST_DATA_DIR}/chrI.taf.gz`)
  const startBlock = firstEntry.blockPosition
  const endBlock = nextEntry.blockPosition
  const readLength = endBlock > startBlock ? endBlock - startBlock + 65536 : 65536
  const compressedData = await file.read(readLength, startBlock)
  const readTime = performance.now() - readStart
  console.log(`2. Read file: ${readTime.toFixed(1)} ms (${(compressedData.length / 1024).toFixed(1)} KB)`)

  // Phase 3: Decompress
  const decompressStart = performance.now()
  const buffer = await unzip(compressedData)
  const decompressTime = performance.now() - decompressStart
  console.log(`3. Decompress: ${decompressTime.toFixed(1)} ms (${(buffer.length / 1024).toFixed(1)} KB)`)

  // Phase 4: Slice
  const sliceStart = performance.now()
  const startOffset = firstEntry.dataPosition
  const endOffset =
    endBlock === startBlock && nextEntry.dataPosition > startOffset
      ? nextEntry.dataPosition
      : buffer.length
  const slice = buffer.slice(startOffset, endOffset)
  const sliceTime = performance.now() - sliceStart
  console.log(`4. Slice: ${sliceTime.toFixed(1)} ms (${(slice.length / 1024).toFixed(1)} KB)`)

  // Phase 5: Decode
  const decodeStart = performance.now()
  const decoder = new TextDecoder('ascii')
  const text = decoder.decode(slice)
  const decodeTime = performance.now() - decodeStart
  console.log(`5. Decode: ${decodeTime.toFixed(1)} ms`)

  // Phase 6: Full parsing with coordinate instructions
  const parseStart = performance.now()
  let count = 0
  let totalAlignments = 0
  for (const feat of parseTafBlocksFull(text)) {
    if (feat.end > REGION.start && feat.start < REGION.end) {
      count++
      totalAlignments += feat.alignmentCount
    }
  }
  const parseTime = performance.now() - parseStart
  console.log(`6. Parse (full): ${parseTime.toFixed(1)} ms`)
  console.log(`   Features: ${count}, Total alignments: ${totalAlignments}`)

  const totalTime = performance.now() - totalStart
  console.log('')
  console.log(`TOTAL: ${totalTime.toFixed(1)} ms`)

  // Breakdown
  console.log('')
  console.log('BREAKDOWN:')
  console.log(`  Index:      ${((indexTime / totalTime) * 100).toFixed(1)}%`)
  console.log(`  Read:       ${((readTime / totalTime) * 100).toFixed(1)}%`)
  console.log(`  Decompress: ${((decompressTime / totalTime) * 100).toFixed(1)}%`)
  console.log(`  Parse:      ${((parseTime / totalTime) * 100).toFixed(1)}%`)

  // What's the gap between this and the 1394ms in benchmark?
  console.log('')
  console.log('NOTE: Benchmark showed 1394ms for same region.')
  console.log('      This profile shows ~' + totalTime.toFixed(0) + 'ms.')
  console.log('      Difference likely due to:')
  console.log('        - Observable/subscription overhead')
  console.log('        - SimpleFeature object creation')
  console.log('        - Full alignment parsing (sequences, etc.)')
}

runProfile().catch(console.error)
