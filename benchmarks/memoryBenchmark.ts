/**
 * Memory benchmark comparing streaming vs non-streaming approaches
 *
 * This demonstrates the memory benefits of streaming feature processing
 * vs collecting all features into an array before processing.
 *
 * Run with:
 *   node --expose-gc --experimental-strip-types benchmarks/memoryBenchmark.ts
 *
 * The --expose-gc flag enables manual garbage collection for accurate measurements.
 */

// Configuration - adjust these to test different scenarios
const CONFIG = {
  numFeatures: 100, // Number of MAF alignment blocks
  numOrganisms: 200, // Number of species/organisms per block
  seqLength: 10000, // Sequence length in base pairs
}

// Parse command line args for custom config
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]!
  if (arg.startsWith('--features=')) {
    CONFIG.numFeatures = parseInt(arg.split('=')[1]!, 10)
  } else if (arg.startsWith('--organisms=')) {
    CONFIG.numOrganisms = parseInt(arg.split('=')[1]!, 10)
  } else if (arg.startsWith('--seqLength=')) {
    CONFIG.seqLength = parseInt(arg.split('=')[1]!, 10)
  }
}

// Generate organism names
function generateOrgNames(count: number): string[] {
  const baseOrgs = [
    'hg38',
    'mm10',
    'rn6',
    'canFam3',
    'felCat8',
    'bosTau8',
    'oviAri3',
    'susScr11',
    'equCab2',
    'galGal5',
    'danRer10',
    'xenTro9',
    'latCha1',
  ]
  const orgs: string[] = []
  for (let i = 0; i < count; i++) {
    orgs.push(i < baseOrgs.length ? baseOrgs[i]! : `org${i}`)
  }
  return orgs
}

interface SimulatedFeature {
  id: string
  start: number
  end: number
  seq: string
  alignments: Record<string, { chr: string; start: number; seq: string }>
}

// Generate a realistic feature with alignments (similar to MAF block)
function generateFeature(
  featureIndex: number,
  numOrganisms: number,
  seqLength: number,
): SimulatedFeature {
  const orgs = generateOrgNames(numOrganisms)
  const bases = ['A', 'C', 'G', 'T', '-']
  const alignments: Record<
    string,
    { chr: string; start: number; seq: string }
  > = {}

  const refSeq = Array.from(
    { length: seqLength },
    () => bases[Math.floor(Math.random() * bases.length)],
  ).join('')

  for (let i = 0; i < numOrganisms; i++) {
    const org = orgs[i]!
    const seq = Array.from(
      { length: seqLength },
      () => bases[Math.floor(Math.random() * bases.length)],
    ).join('')
    alignments[org] = {
      chr: 'chr1',
      start: featureIndex * seqLength + i * 100,
      seq,
    }
  }

  return {
    id: `feature-${featureIndex}`,
    start: featureIndex * seqLength,
    end: (featureIndex + 1) * seqLength,
    seq: refSeq,
    alignments,
  }
}

// Simulate processing a feature (like rendering to canvas)
function processFeature(feature: SimulatedFeature): number {
  let result = 0
  for (const [_org, alignment] of Object.entries(feature.alignments)) {
    for (let i = 0; i < alignment.seq.length; i++) {
      if (alignment.seq[i] === feature.seq[i]) {
        result++
      }
    }
  }
  return result
}

function forceGC(): void {
  if ((globalThis as Record<string, unknown>).gc) {
    ;(globalThis as Record<string, unknown>).gc?.()
  }
}

function getMemoryMB(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
}

function formatMemory(mb: number): string {
  return `${mb.toFixed(2)} MB`
}

function formatTime(ms: number): string {
  return `${Math.round(ms)} ms`
}

async function runMemoryBenchmark() {
  const { numFeatures, numOrganisms, seqLength } = CONFIG

  console.log('='.repeat(70))
  console.log('MEMORY BENCHMARK: Streaming vs Non-Streaming')
  console.log('='.repeat(70))
  console.log('')
  console.log('Configuration:')
  console.log(`  Features:   ${numFeatures}`)
  console.log(`  Organisms:  ${numOrganisms}`)
  console.log(`  Seq Length: ${seqLength} bp`)
  console.log('')
  console.log('This simulates the MAF viewer rendering pipeline:')
  console.log(
    '  - Non-streaming: collect all features, then render (old approach)',
  )
  console.log(
    '  - Streaming: render each feature as it arrives (current approach)',
  )
  console.log('')

  // Check if GC is available
  if (typeof (globalThis as Record<string, unknown>).gc !== 'function') {
    console.log(
      'WARNING: Run with --expose-gc for accurate memory measurements',
    )
    console.log('')
  }

  // Warmup
  forceGC()
  await new Promise(r => setTimeout(r, 100))

  // =========================================================================
  // Test 1: Non-streaming (collect all features first)
  // =========================================================================
  console.log('-'.repeat(70))
  console.log('NON-STREAMING (collect all features, then process)')
  console.log('-'.repeat(70))
  forceGC()
  await new Promise(r => setTimeout(r, 100))

  const baselineNonStream = getMemoryMB()
  let peakMemoryNonStream = baselineNonStream
  const startTimeNonStream = performance.now()

  // Step 1: Collect all features (simulating toArray())
  const collected: SimulatedFeature[] = []
  for (let i = 0; i < numFeatures; i++) {
    collected.push(generateFeature(i, numOrganisms, seqLength))
    const currentMem = getMemoryMB()
    if (currentMem > peakMemoryNonStream) {
      peakMemoryNonStream = currentMem
    }
  }

  // Step 2: Process all collected features
  let totalNonStream = 0
  for (const f of collected) {
    totalNonStream += processFeature(f)
    const currentMem = getMemoryMB()
    if (currentMem > peakMemoryNonStream) {
      peakMemoryNonStream = currentMem
    }
  }

  const endTimeNonStream = performance.now()
  const finalMemNonStream = getMemoryMB()

  console.log(`  Baseline:     ${formatMemory(baselineNonStream)}`)
  console.log(`  Peak:         ${formatMemory(peakMemoryNonStream)}`)
  console.log(`  Final:        ${formatMemory(finalMemNonStream)}`)
  console.log(
    `  Time:         ${formatTime(endTimeNonStream - startTimeNonStream)}`,
  )
  console.log('')

  // Clear and GC
  collected.length = 0
  forceGC()
  await new Promise(r => setTimeout(r, 500))

  // =========================================================================
  // Test 2: Streaming (process each feature immediately)
  // =========================================================================
  console.log('-'.repeat(70))
  console.log('STREAMING (process each feature as it arrives)')
  console.log('-'.repeat(70))
  forceGC()
  await new Promise(r => setTimeout(r, 100))

  const baselineStream = getMemoryMB()
  let peakMemoryStream = baselineStream
  const startTimeStream = performance.now()

  // Generate and process one at a time
  let totalStream = 0
  for (let i = 0; i < numFeatures; i++) {
    const feature = generateFeature(i, numOrganisms, seqLength)
    totalStream += processFeature(feature)
    // Feature can now be GC'd

    const currentMem = getMemoryMB()
    if (currentMem > peakMemoryStream) {
      peakMemoryStream = currentMem
    }

    // Periodically force GC to simulate real-world conditions
    if (i % 20 === 0) {
      forceGC()
    }
  }

  const endTimeStream = performance.now()
  forceGC()
  await new Promise(r => setTimeout(r, 100))
  const finalMemStream = getMemoryMB()

  console.log(`  Baseline:     ${formatMemory(baselineStream)}`)
  console.log(`  Peak:         ${formatMemory(peakMemoryStream)}`)
  console.log(`  Final:        ${formatMemory(finalMemStream)}`)
  console.log(`  Time:         ${formatTime(endTimeStream - startTimeStream)}`)
  console.log('')

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log('')

  const memoryReduction =
    ((peakMemoryNonStream - peakMemoryStream) / peakMemoryNonStream) * 100
  const timeDiff =
    endTimeStream - startTimeStream - (endTimeNonStream - startTimeNonStream)
  const timeRatio =
    (endTimeNonStream - startTimeNonStream) / (endTimeStream - startTimeStream)

  console.log('Peak Memory:')
  console.log(`  Non-streaming: ${formatMemory(peakMemoryNonStream)}`)
  console.log(`  Streaming:     ${formatMemory(peakMemoryStream)}`)
  if (memoryReduction > 0) {
    console.log(
      `  Reduction:     ${memoryReduction.toFixed(1)}% less memory with streaming`,
    )
  }
  console.log('')

  console.log('Execution Time:')
  console.log(
    `  Non-streaming: ${formatTime(endTimeNonStream - startTimeNonStream)}`,
  )
  console.log(`  Streaming:     ${formatTime(endTimeStream - startTimeStream)}`)
  console.log(
    `  Difference:    ${timeDiff > 0 ? '+' : ''}${formatTime(timeDiff)}`,
  )
  console.log('')

  console.log('Conclusion:')
  if (memoryReduction > 10) {
    console.log(
      `  ✓ Streaming reduces peak memory by ${memoryReduction.toFixed(0)}%`,
    )
    console.log(
      `  ✓ This is significant for large MAF files with many organisms`,
    )
    if (timeRatio < 1) {
      console.log(
        `  ✓ Streaming is also ${((1 / timeRatio - 1) * 100).toFixed(0)}% faster`,
      )
    } else if (timeRatio > 1.1) {
      console.log(
        `  ! Streaming is ${((timeRatio - 1) * 100).toFixed(0)}% slower (GC overhead)`,
      )
      console.log(
        `    This tradeoff is worthwhile for memory-constrained scenarios`,
      )
    }
  } else {
    console.log(
      `  Memory difference is minimal (${memoryReduction.toFixed(1)}%)`,
    )
    console.log(`  Run with --expose-gc for accurate measurements`)
  }
  console.log('')
}

runMemoryBenchmark().catch(console.error)
