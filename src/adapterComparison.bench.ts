/**
 * Benchmark comparing all three MAF adapter implementations using indexed queries
 *
 * Run with:
 *   node --expose-gc --experimental-strip-types src/adapterComparison.bench.ts
 *
 * Tests both:
 * - C. elegans 7-way alignment (small organism count)
 * - Zoonomia 447-way alignment (large organism count)
 */

import { unzip } from '@gmod/bgzf-filehandle'
import { BigBed } from '@gmod/bbi'
import { LocalFile } from 'generic-filehandle2'

// Test datasets
interface Dataset {
  name: string
  dir: string
  taf: string
  tai: string
  bigMaf: string
  mafTabix: string | null
  regions: { name: string; refName: string; start: number; end: number }[]
}

const DATASETS: Record<string, Dataset> = {
  celegans: {
    name: 'C. elegans 7-way',
    dir: 'test_data/celegans',
    taf: 'chrI.taf.gz',
    tai: 'chrI.taf.gz.tai',
    bigMaf: 'chrI.bigMaf.bb',
    mafTabix: 'chrI.bed.gz',
    regions: [
      { name: 'small (1kb)', refName: 'chrI', start: 100000, end: 101000 },
      { name: 'medium (10kb)', refName: 'chrI', start: 100000, end: 110000 },
      { name: 'large (100kb)', refName: 'chrI', start: 100000, end: 200000 },
    ],
  },
  zoonomia: {
    name: 'Zoonomia 447-way',
    dir: 'test_data',
    taf: '447-mammalian-2022v1_hg38_chr22_22000000_22100000.anc.norm.taf.gz',
    tai: '447-mammalian-2022v1_hg38_chr22_22000000_22100000.anc.norm.taf.gz.tai',
    bigMaf: '447-mammalian.bigMaf.bb',
    mafTabix: null,
    regions: [
      { name: 'small (1kb)', refName: 'chr22', start: 22000000, end: 22001000 },
      { name: 'medium (10kb)', refName: 'chr22', start: 22000000, end: 22010000 },
      { name: 'large (100kb)', refName: 'chr22', start: 22000000, end: 22100000 },
    ],
  },
}

function forceGC(): void {
  if (typeof global !== 'undefined' && (global as any).gc) {
    ;(global as any).gc()
  }
}

function getMemoryMB(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
}

interface BenchmarkResult {
  dataset: string
  adapter: string
  region: string
  timeMs: number
  featureCount: number
  peakMemoryMB: number
}

// ============================================================================
// BigMaf benchmark using bbi-js
// ============================================================================

async function benchmarkBigMaf(
  dataset: Dataset,
  region: { refName: string; start: number; end: number },
): Promise<BenchmarkResult> {
  forceGC()
  await new Promise(r => setTimeout(r, 50))
  const baselineMem = getMemoryMB()
  let peakMem = baselineMem

  const startTime = performance.now()

  const file = new LocalFile(`${dataset.dir}/${dataset.bigMaf}`)
  const bb = new BigBed({ filehandle: file })

  const currentMem1 = getMemoryMB()
  if (currentMem1 > peakMem) peakMem = currentMem1

  const features = await bb.getFeatures(region.refName, region.start, region.end)

  const currentMem2 = getMemoryMB()
  if (currentMem2 > peakMem) peakMem = currentMem2

  let count = 0
  for (const feature of features) {
    count++
    const mafBlock = (feature as any).mafBlock as string | undefined
    if (mafBlock) {
      const blocks = mafBlock.split(';')
      for (const block of blocks) {
        if (block.startsWith('s')) {
          const parts = block.split(/ +/)
          const _seq = parts[6]
        }
      }
    }
    const currentMem = getMemoryMB()
    if (currentMem > peakMem) peakMem = currentMem
  }

  const endTime = performance.now()

  return {
    dataset: dataset.name,
    adapter: 'BigMaf',
    region: (region as any).name,
    timeMs: endTime - startTime,
    featureCount: count,
    peakMemoryMB: peakMem,
  }
}

// ============================================================================
// TAF benchmark using index
// ============================================================================

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

async function benchmarkTaffy(
  dataset: Dataset,
  region: { refName: string; start: number; end: number },
): Promise<BenchmarkResult> {
  forceGC()
  await new Promise(r => setTimeout(r, 50))
  const baselineMem = getMemoryMB()
  let peakMem = baselineMem

  const startTime = performance.now()

  const index = await readTaiIndex(`${dataset.dir}/${dataset.tai}`)
  const records = index.get(region.refName)

  if (!records || records.length === 0) {
    return {
      dataset: dataset.name,
      adapter: 'TAF',
      region: (region as any).name,
      timeMs: performance.now() - startTime,
      featureCount: 0,
      peakMemoryMB: peakMem,
    }
  }

  const startIdx = lowerBound(records, region.start)
  const firstEntry = records[Math.max(startIdx - 1, 0)]!
  const endIdx = lowerBound(records, region.end)
  const nextEntry = records[endIdx + 1] ?? records.at(-1)!

  const file = new LocalFile(`${dataset.dir}/${dataset.taf}`)
  const startBlock = firstEntry.blockPosition
  const endBlock = nextEntry.blockPosition
  const readLength = endBlock > startBlock ? endBlock - startBlock + 65536 : 65536

  const compressedData = await file.read(readLength, startBlock)

  const currentMem1 = getMemoryMB()
  if (currentMem1 > peakMem) peakMem = currentMem1

  const buffer = await unzip(compressedData)

  const currentMem2 = getMemoryMB()
  if (currentMem2 > peakMem) peakMem = currentMem2

  const decoder = new TextDecoder('ascii')
  const startOffset = firstEntry.dataPosition
  const endOffset =
    endBlock === startBlock && nextEntry.dataPosition > startOffset
      ? nextEntry.dataPosition
      : buffer.length
  const text = decoder.decode(buffer.slice(startOffset, endOffset))
  const lines = text.split('\n')

  let count = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.includes(' ; ')) {
      count++
    }

    const currentMem = getMemoryMB()
    if (currentMem > peakMem) peakMem = currentMem
  }

  const endTime = performance.now()

  return {
    dataset: dataset.name,
    adapter: 'TAF',
    region: (region as any).name,
    timeMs: endTime - startTime,
    featureCount: count,
    peakMemoryMB: peakMem,
  }
}

// ============================================================================
// MafTabix benchmark
// ============================================================================

async function benchmarkMafTabix(
  dataset: Dataset,
  region: { refName: string; start: number; end: number },
): Promise<BenchmarkResult | null> {
  if (!dataset.mafTabix) return null

  forceGC()
  await new Promise(r => setTimeout(r, 50))
  const baselineMem = getMemoryMB()
  let peakMem = baselineMem

  const startTime = performance.now()

  const file = new LocalFile(`${dataset.dir}/${dataset.mafTabix}`)
  const compressedData = await file.readFile()

  const currentMem1 = getMemoryMB()
  if (currentMem1 > peakMem) peakMem = currentMem1

  const buffer = await unzip(compressedData)

  const currentMem2 = getMemoryMB()
  if (currentMem2 > peakMem) peakMem = currentMem2

  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(buffer)
  const lines = text.split('\n')

  let count = 0
  for (const line of lines) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const start = parseInt(parts[1]!, 10)
    const end = parseInt(parts[2]!, 10)

    if (end > region.start && start < region.end) {
      count++
      const mafData = parts[4]
      if (mafData) {
        const alignments = mafData.split(',')
        for (const _a of alignments) {
          // Parse
        }
      }
    }

    const currentMem = getMemoryMB()
    if (currentMem > peakMem) peakMem = currentMem
  }

  const endTime = performance.now()

  return {
    dataset: dataset.name,
    adapter: 'MafTabix',
    region: (region as any).name,
    timeMs: endTime - startTime,
    featureCount: count,
    peakMemoryMB: peakMem,
  }
}

// ============================================================================
// Main benchmark runner
// ============================================================================

async function runBenchmarks() {
  console.log('='.repeat(80))
  console.log('ADAPTER FORMAT COMPARISON BENCHMARK')
  console.log('='.repeat(80))
  console.log('')

  if (typeof (global as any).gc !== 'function') {
    console.log('WARNING: Run with --expose-gc for accurate memory measurements')
    console.log('')
  }

  const fs = await import('fs/promises')
  const allResults: BenchmarkResult[] = []

  for (const [key, dataset] of Object.entries(DATASETS)) {
    console.log('='.repeat(80))
    console.log(`DATASET: ${dataset.name}`)
    console.log('='.repeat(80))
    console.log('')

    // Check file sizes
    try {
      const tafSize = (await fs.stat(`${dataset.dir}/${dataset.taf}`)).size
      const bbSize = (await fs.stat(`${dataset.dir}/${dataset.bigMaf}`)).size
      console.log('File sizes:')
      console.log(`  TAF:    ${(tafSize / 1024 / 1024).toFixed(2)} MB`)
      console.log(`  BigMaf: ${(bbSize / 1024 / 1024).toFixed(2)} MB`)
      if (dataset.mafTabix) {
        const bedSize = (await fs.stat(`${dataset.dir}/${dataset.mafTabix}`)).size
        console.log(`  MafTabix: ${(bedSize / 1024 / 1024).toFixed(2)} MB`)
      }
      console.log('')
    } catch {
      console.log('  (Could not read file sizes)')
      console.log('')
    }

    for (const region of dataset.regions) {
      console.log('-'.repeat(80))
      console.log(`Region: ${region.name} (${region.refName}:${region.start}-${region.end})`)
      console.log('-'.repeat(80))

      // BigMaf
      console.log('  BigMaf (indexed R-tree)...')
      try {
        const r = await benchmarkBigMaf(dataset, region)
        allResults.push(r)
        console.log(
          `    ${r.timeMs.toFixed(0)} ms, ${r.featureCount} features, ${r.peakMemoryMB.toFixed(1)} MB peak`,
        )
      } catch (e) {
        console.log(`    Error: ${e}`)
      }

      forceGC()
      await new Promise(r => setTimeout(r, 200))

      // TAF
      console.log('  TAF (indexed virtual offset)...')
      try {
        const r = await benchmarkTaffy(dataset, region)
        allResults.push(r)
        console.log(
          `    ${r.timeMs.toFixed(0)} ms, ${r.featureCount} features, ${r.peakMemoryMB.toFixed(1)} MB peak`,
        )
      } catch (e) {
        console.log(`    Error: ${e}`)
      }

      forceGC()
      await new Promise(r => setTimeout(r, 200))

      // MafTabix
      if (dataset.mafTabix) {
        console.log('  MafTabix (full file read)...')
        try {
          const r = await benchmarkMafTabix(dataset, region)
          if (r) {
            allResults.push(r)
            console.log(
              `    ${r.timeMs.toFixed(0)} ms, ${r.featureCount} features, ${r.peakMemoryMB.toFixed(1)} MB peak`,
            )
          }
        } catch (e) {
          console.log(`    Error: ${e}`)
        }
      }

      forceGC()
      await new Promise(r => setTimeout(r, 500))
      console.log('')
    }
  }

  // Summary
  console.log('='.repeat(80))
  console.log('SUMMARY BY DATASET')
  console.log('='.repeat(80))
  console.log('')

  for (const [_key, dataset] of Object.entries(DATASETS)) {
    console.log(`${dataset.name}:`)
    console.log('Region           | Format    | Time (ms) | Features | Peak Mem (MB)')
    console.log('-'.repeat(70))

    const datasetResults = allResults.filter(r => r.dataset === dataset.name)
    for (const region of dataset.regions) {
      const regionResults = datasetResults.filter(r => r.region === region.name)
      regionResults.sort((a, b) => a.timeMs - b.timeMs)
      for (const r of regionResults) {
        console.log(
          `${r.region.padEnd(16)} | ${r.adapter.padEnd(9)} | ` +
            `${r.timeMs.toFixed(0).padStart(9)} | ${r.featureCount.toString().padStart(8)} | ` +
            `${r.peakMemoryMB.toFixed(1).padStart(12)}`,
        )
      }
    }
    console.log('')
  }

  // Overall comparison
  console.log('='.repeat(80))
  console.log('KEY FINDINGS')
  console.log('='.repeat(80))
  console.log('')

  for (const [_key, dataset] of Object.entries(DATASETS)) {
    const datasetResults = allResults.filter(r => r.dataset === dataset.name)
    const largeResults = datasetResults.filter(r => r.region === 'large (100kb)')

    if (largeResults.length > 0) {
      const fastest = [...largeResults].sort((a, b) => a.timeMs - b.timeMs)[0]!
      const lowestMem = [...largeResults].sort((a, b) => a.peakMemoryMB - b.peakMemoryMB)[0]!

      console.log(`${dataset.name} (large 100kb query):`)
      console.log(`  Fastest:       ${fastest.adapter} (${fastest.timeMs.toFixed(0)} ms)`)
      console.log(`  Lowest memory: ${lowestMem.adapter} (${lowestMem.peakMemoryMB.toFixed(1)} MB)`)

      for (const r of largeResults) {
        if (r !== fastest) {
          const ratio = r.timeMs / fastest.timeMs
          console.log(`  ${r.adapter} is ${ratio.toFixed(1)}x slower than ${fastest.adapter}`)
        }
      }
      console.log('')
    }
  }
}

runBenchmarks().catch(console.error)
