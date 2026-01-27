/**
 * Profile TAF adapter to identify optimization opportunities
 *
 * Run with:
 *   node --cpu-prof --experimental-strip-types src/tafProfile.ts
 *
 * Then analyze the .cpuprofile file with Chrome DevTools or speedscope.app
 */

import { unzip } from '@gmod/bgzf-filehandle'
import { LocalFile } from 'generic-filehandle2'

const TEST_DATA_DIR = 'test_data/celegans'
const REGION = { refName: 'chrI', start: 100000, end: 200000 }

interface TaiEntry {
  chrStart: number
  blockPosition: number
  dataPosition: number
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

// Current parsing approach
function parseCurrentApproach(text: string): number {
  const lines = text.split('\n')
  let count = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.includes(' ; ')) {
      count++
      // Simulate parsing coordinate instructions
      const semicolonIndex = trimmed.indexOf(' ; ')
      const _coordPart = trimmed.slice(semicolonIndex + 3)
    }
  }

  return count
}

// Optimized: avoid trim(), use indexOf for newlines
function parseOptimizedNoTrim(buffer: Uint8Array): number {
  let count = 0
  let lineStart = 0

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 10) { // newline
      // Check if line contains ' ; '
      let hasSemicolon = false
      for (let j = lineStart; j < i - 2; j++) {
        if (buffer[j] === 32 && buffer[j + 1] === 59 && buffer[j + 2] === 32) {
          hasSemicolon = true
          break
        }
      }
      if (hasSemicolon) {
        count++
      }
      lineStart = i + 1
    }
  }

  return count
}

// Optimized: use TextDecoder with streaming
function parseWithIndexOf(text: string): number {
  let count = 0
  let pos = 0

  while (pos < text.length) {
    const newlinePos = text.indexOf('\n', pos)
    const lineEnd = newlinePos === -1 ? text.length : newlinePos

    // Check for ' ; ' without creating substring
    const semicolonPos = text.indexOf(' ; ', pos)
    if (semicolonPos !== -1 && semicolonPos < lineEnd) {
      // Skip comments
      if (text[pos] !== '#') {
        count++
      }
    }

    pos = lineEnd + 1
  }

  return count
}

async function runProfile() {
  console.log('='.repeat(60))
  console.log('TAF PROFILING')
  console.log('='.repeat(60))
  console.log('')

  // Read index
  console.time('Read index')
  const index = await readTaiIndex(`${TEST_DATA_DIR}/chrI.taf.gz.tai`)
  console.timeEnd('Read index')

  const records = index.get(REGION.refName)!
  const startIdx = lowerBound(records, REGION.start)
  const firstEntry = records[Math.max(startIdx - 1, 0)]!
  const endIdx = lowerBound(records, REGION.end)
  const nextEntry = records[endIdx + 1] ?? records.at(-1)!

  // Read compressed data
  console.time('Read file')
  const file = new LocalFile(`${TEST_DATA_DIR}/chrI.taf.gz`)
  const startBlock = firstEntry.blockPosition
  const endBlock = nextEntry.blockPosition
  const readLength = endBlock > startBlock ? endBlock - startBlock + 65536 : 65536
  const compressedData = await file.read(readLength, startBlock)
  console.timeEnd('Read file')

  console.log(`  Compressed size: ${(compressedData.length / 1024).toFixed(1)} KB`)

  // Decompress
  console.time('Decompress')
  const buffer = await unzip(compressedData)
  console.timeEnd('Decompress')

  console.log(`  Decompressed size: ${(buffer.length / 1024).toFixed(1)} KB`)

  // Slice to relevant portion
  const startOffset = firstEntry.dataPosition
  const endOffset =
    endBlock === startBlock && nextEntry.dataPosition > startOffset
      ? nextEntry.dataPosition
      : buffer.length
  const slice = buffer.slice(startOffset, endOffset)

  console.log(`  Slice size: ${(slice.length / 1024).toFixed(1)} KB`)

  // Decode to text
  console.time('Decode to text')
  const decoder = new TextDecoder('ascii')
  const text = decoder.decode(slice)
  console.timeEnd('Decode to text')

  // Current approach
  console.time('Parse (current - split/trim)')
  const count1 = parseCurrentApproach(text)
  console.timeEnd('Parse (current - split/trim)')
  console.log(`  Features: ${count1}`)

  // Optimized - indexOf on text
  console.time('Parse (indexOf on text)')
  const count2 = parseWithIndexOf(text)
  console.timeEnd('Parse (indexOf on text)')
  console.log(`  Features: ${count2}`)

  // Optimized - binary search on buffer
  console.time('Parse (binary on buffer)')
  const count3 = parseOptimizedNoTrim(slice)
  console.timeEnd('Parse (binary on buffer)')
  console.log(`  Features: ${count3}`)

  // Run multiple iterations for better timing
  console.log('')
  console.log('Running 10 iterations for average timing...')

  const iterations = 10

  let total1 = 0
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    parseCurrentApproach(text)
    total1 += performance.now() - start
  }
  console.log(`  Current (split/trim): ${(total1 / iterations).toFixed(2)} ms avg`)

  let total2 = 0
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    parseWithIndexOf(text)
    total2 += performance.now() - start
  }
  console.log(`  indexOf on text: ${(total2 / iterations).toFixed(2)} ms avg`)

  let total3 = 0
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    parseOptimizedNoTrim(slice)
    total3 += performance.now() - start
  }
  console.log(`  Binary on buffer: ${(total3 / iterations).toFixed(2)} ms avg`)

  console.log('')
  console.log(`Speedup (indexOf): ${(total1 / total2).toFixed(2)}x`)
  console.log(`Speedup (binary): ${(total1 / total3).toFixed(2)}x`)
}

runProfile().catch(console.error)
