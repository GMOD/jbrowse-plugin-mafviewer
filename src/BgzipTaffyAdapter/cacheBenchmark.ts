/**
 * Benchmark to evaluate whether caching parsed TAF features is beneficial
 *
 * Run with:
 *   node --expose-gc --experimental-strip-types src/BgzipTaffyAdapter/cacheBenchmark.ts
 *
 * This tests:
 * 1. Memory impact of caching parsed features
 * 2. Speed benefit of cache hits vs re-parsing
 */

import { LocalFile } from 'generic-filehandle2'
import { unzip } from '@gmod/bgzf-filehandle'

// Simulate the parsing that happens in BgzipTaffyAdapter
function parseTafBlocks(buffer: Uint8Array): { alignments: Record<string, { seq: string }> }[] {
  const decoder = new TextDecoder('ascii')
  const text = decoder.decode(buffer)
  const lines = text.split('\n')
  const features: { alignments: Record<string, { seq: string }> }[] = []

  let currentAlignments: Record<string, { seq: string }> = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    // Simplified parsing - just extract sequences
    if (trimmed.includes(' ; ')) {
      // New block - save previous if exists
      if (Object.keys(currentAlignments).length > 0) {
        features.push({ alignments: currentAlignments })
        currentAlignments = {}
      }
    }

    // Simulate extracting alignment data
    const bases = trimmed.split(' ')[0] || ''
    if (bases.length > 0 && !bases.includes(';')) {
      currentAlignments[`org${features.length}`] = { seq: bases }
    }
  }

  if (Object.keys(currentAlignments).length > 0) {
    features.push({ alignments: currentAlignments })
  }

  return features
}

function forceGC(): void {
  if (typeof global !== 'undefined' && (global as any).gc) {
    ;(global as any).gc()
  }
}

function getMemoryMB(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100
}

async function runBenchmark() {
  console.log('='.repeat(70))
  console.log('CACHE BENCHMARK: BgzipTaffyAdapter')
  console.log('='.repeat(70))
  console.log('')

  // Check if we have a test file
  const testFile = 'test_data/celegans/chrI.taf.gz'
  let file: LocalFile
  try {
    file = new LocalFile(testFile)
    await file.stat()
  } catch {
    console.log(`Test file not found: ${testFile}`)
    console.log('Using synthetic data instead')
    await runSyntheticBenchmark()
    return
  }

  console.log(`Using test file: ${testFile}`)
  console.log('')

  // Read and decompress the file
  const compressedData = await file.readFile()
  const buffer = await unzip(compressedData)
  console.log(`Decompressed size: ${(buffer.length / 1024).toFixed(1)} KB`)

  // Benchmark parsing
  forceGC()
  const baselineMem = getMemoryMB()

  console.log('')
  console.log('-'.repeat(70))
  console.log('PARSING BENCHMARK')
  console.log('-'.repeat(70))

  // Parse once
  const parseStart = performance.now()
  const features = parseTafBlocks(buffer)
  const parseTime = performance.now() - parseStart
  const afterParseMem = getMemoryMB()

  console.log(`Parse time: ${parseTime.toFixed(1)} ms`)
  console.log(`Features parsed: ${features.length}`)
  console.log(`Memory after parse: ${afterParseMem} MB (+${(afterParseMem - baselineMem).toFixed(2)} MB)`)

  // Simulate cache hit (just accessing cached data)
  const cacheHitStart = performance.now()
  let sum = 0
  for (const f of features) {
    sum += Object.keys(f.alignments).length
  }
  const cacheHitTime = performance.now() - cacheHitStart
  console.log(`Cache hit iteration time: ${cacheHitTime.toFixed(3)} ms`)

  // Re-parse (simulating no cache)
  const reparseStart = performance.now()
  const features2 = parseTafBlocks(buffer)
  const reparseTime = performance.now() - reparseStart
  console.log(`Re-parse time: ${reparseTime.toFixed(1)} ms`)

  console.log('')
  console.log('-'.repeat(70))
  console.log('CACHE VS NO-CACHE ANALYSIS')
  console.log('-'.repeat(70))

  const cacheSpeedup = reparseTime / cacheHitTime
  console.log(`Cache speedup: ${cacheSpeedup.toFixed(0)}x faster for repeat access`)
  console.log(`Memory cost: ${(afterParseMem - baselineMem).toFixed(2)} MB per cached region`)

  // Simulate multiple regions cached
  console.log('')
  console.log('-'.repeat(70))
  console.log('MEMORY IMPACT OF CACHING MULTIPLE REGIONS')
  console.log('-'.repeat(70))

  forceGC()
  const beforeMultiCache = getMemoryMB()

  const cachedRegions: typeof features[] = []
  for (let i = 0; i < 10; i++) {
    cachedRegions.push(parseTafBlocks(buffer))
  }

  const afterMultiCache = getMemoryMB()
  console.log(`Memory with 10 cached regions: ${afterMultiCache} MB`)
  console.log(`Memory per region: ${((afterMultiCache - beforeMultiCache) / 10).toFixed(2)} MB`)
  console.log(`Total cache memory: ${(afterMultiCache - beforeMultiCache).toFixed(2)} MB`)

  // Clear cache
  cachedRegions.length = 0
  forceGC()
  await new Promise(r => setTimeout(r, 100))
  const afterClear = getMemoryMB()
  console.log(`Memory after clearing cache: ${afterClear} MB`)

  console.log('')
  console.log('='.repeat(70))
  console.log('CONCLUSION')
  console.log('='.repeat(70))
  console.log('')

  if (cacheSpeedup > 10 && (afterParseMem - baselineMem) < 50) {
    console.log('✓ Cache is beneficial: High speedup with reasonable memory cost')
  } else if (cacheSpeedup > 10) {
    console.log('! Cache provides speedup but with significant memory cost')
    console.log('  Consider limiting cache size or using streaming')
  } else {
    console.log('✗ Cache may not be worth the memory cost')
    console.log('  Consider removing cache and using streaming')
  }
}

async function runSyntheticBenchmark() {
  console.log('')
  console.log('Generating synthetic TAF-like data...')

  // Generate synthetic data similar to TAF format
  const numOrganisms = 100
  const seqLength = 10000
  const numBlocks = 50

  const bases = ['A', 'C', 'G', 'T', '-']
  let syntheticData = '#taf version:1\n'

  for (let block = 0; block < numBlocks; block++) {
    const seq = Array.from({ length: seqLength }, () =>
      bases[Math.floor(Math.random() * bases.length)]
    ).join('')
    syntheticData += `${seq} ; i 0 org0.chr1 ${block * seqLength} + 100000000\n`

    for (let org = 1; org < numOrganisms; org++) {
      const orgSeq = Array.from({ length: seqLength }, () =>
        bases[Math.floor(Math.random() * bases.length)]
      ).join('')
      syntheticData += `${orgSeq}\n`
    }
  }

  const buffer = new TextEncoder().encode(syntheticData)
  console.log(`Synthetic data size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)
  console.log(`Config: ${numBlocks} blocks, ${numOrganisms} organisms, ${seqLength} bp`)

  forceGC()
  const baselineMem = getMemoryMB()

  console.log('')
  console.log('-'.repeat(70))
  console.log('PARSING BENCHMARK')
  console.log('-'.repeat(70))

  const parseStart = performance.now()
  const features = parseTafBlocks(buffer)
  const parseTime = performance.now() - parseStart
  const afterParseMem = getMemoryMB()

  console.log(`Parse time: ${parseTime.toFixed(1)} ms`)
  console.log(`Features parsed: ${features.length}`)
  console.log(`Memory for parsed features: ${(afterParseMem - baselineMem).toFixed(2)} MB`)

  // Cache hit simulation
  const cacheHitStart = performance.now()
  let sum = 0
  for (const f of features) {
    sum += Object.keys(f.alignments).length
  }
  const cacheHitTime = performance.now() - cacheHitStart

  // Re-parse
  const reparseStart = performance.now()
  parseTafBlocks(buffer)
  const reparseTime = performance.now() - reparseStart

  console.log('')
  console.log('-'.repeat(70))
  console.log('ANALYSIS')
  console.log('-'.repeat(70))

  const cacheSpeedup = reparseTime / cacheHitTime
  console.log(`Cache hit time: ${cacheHitTime.toFixed(3)} ms`)
  console.log(`Re-parse time: ${reparseTime.toFixed(1)} ms`)
  console.log(`Cache speedup: ${cacheSpeedup.toFixed(0)}x`)
  console.log(`Memory cost: ${(afterParseMem - baselineMem).toFixed(2)} MB`)

  console.log('')
  console.log('='.repeat(70))
  console.log('STREAMING VS CACHING TRADEOFF')
  console.log('='.repeat(70))
  console.log('')
  console.log('With CACHING:')
  console.log(`  - First access: ${parseTime.toFixed(1)} ms + ${(afterParseMem - baselineMem).toFixed(1)} MB memory`)
  console.log(`  - Repeat access: ${cacheHitTime.toFixed(3)} ms (${cacheSpeedup.toFixed(0)}x faster)`)
  console.log('')
  console.log('With STREAMING (no cache):')
  console.log(`  - Every access: ${parseTime.toFixed(1)} ms, minimal memory overhead`)
  console.log(`  - Memory freed immediately after processing`)
  console.log('')

  if (afterParseMem - baselineMem > 20) {
    console.log('RECOMMENDATION: Consider streaming for memory-sensitive scenarios')
    console.log('  The cache uses significant memory that could cause issues with')
    console.log('  large files or many simultaneous views.')
  }
}

runBenchmark().catch(console.error)
