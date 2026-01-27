/**
 * Benchmark comparing current BigMafAdapter parsing vs optimized approach
 *
 * Run with: npx vitest bench src/BigMafAdapter/benchmark.bench.ts
 */

import { bench, describe } from 'vitest'

import { encodeSequence } from '../util/sequenceEncoding'

import type { EncodedSequence } from '../util/sequenceEncoding'

// Generate organism names (up to 500)
function generateOrgNames(count: number): string[] {
  const baseOrgs = [
    'hg38', 'mm10', 'rn6', 'canFam3', 'felCat8', 'bosTau8', 'oviAri3',
    'susScr11', 'equCab2', 'galGal5', 'danRer10', 'xenTro9', 'latCha1',
    'oryLat2', 'gasAcu1', 'fr3', 'tetNig2', 'oreNil2', 'neoBri1', 'hapBur1',
  ]
  const orgs: string[] = []
  for (let i = 0; i < count; i++) {
    if (i < baseOrgs.length) {
      orgs.push(baseOrgs[i]!)
    } else {
      orgs.push(`org${i}`)
    }
  }
  return orgs
}

// Sample MAF block data - simulating what comes from BigBed
function generateMafBlock(numOrganisms: number, seqLength: number): string {
  const orgs = generateOrgNames(numOrganisms)
  const bases = ['A', 'C', 'G', 'T', '-']
  const blocks: string[] = []

  for (let i = 0; i < numOrganisms; i++) {
    const org = orgs[i]!
    const seq = Array.from(
      { length: seqLength },
      () => bases[Math.floor(Math.random() * bases.length)],
    ).join('')
    blocks.push(`s ${org}.chr1 ${i * 1000} ${seqLength} + 100000000 ${seq}`)
  }

  return blocks.join(';')
}

// Current approach types
interface OrganismRecordCurrent {
  chr: string
  start: number
  srcSize: number
  strand: number
  unknown: number
  seq: EncodedSequence
}

// Optimized approach types - minimal fields
interface OrganismRecordOptimized {
  chr: string
  start: number
  seq: EncodedSequence
}

// Current parsing approach (from BigMafAdapter)
function parseCurrentApproach(
  mafBlock: string,
): Record<string, OrganismRecordCurrent> {
  const WHITESPACE_REGEX = / +/
  const blocks = mafBlock.split(';')
  const alignments: Record<string, OrganismRecordCurrent> = {}

  for (const block of blocks) {
    if (block.startsWith('s')) {
      const parts = block.split(WHITESPACE_REGEX)
      const sequence = parts[6]!
      const organismChr = parts[1]!

      const encodedSeq = encodeSequence(sequence)

      const dotIndex = organismChr.indexOf('.')
      const org = dotIndex === -1 ? organismChr : organismChr.slice(0, dotIndex)
      const chr = dotIndex === -1 ? '' : organismChr.slice(dotIndex + 1)

      alignments[org] = {
        chr,
        start: +parts[2]!,
        srcSize: +parts[3]!,
        strand: parts[4] === '+' ? 1 : -1,
        unknown: +parts[5]!,
        seq: encodedSeq,
      }
    }
  }

  return alignments
}

// Optimized approach: indexOf-based parsing, fewer fields, with filtering
function parseOptimizedIndexOf(
  mafBlock: string,
  sampleFilter?: Set<string>,
): Record<string, OrganismRecordOptimized> {
  const alignments: Record<string, OrganismRecordOptimized> = {}

  let idx = 0
  while (idx < mafBlock.length) {
    const semiIdx = mafBlock.indexOf(';', idx)
    const blockEnd = semiIdx === -1 ? mafBlock.length : semiIdx

    if (mafBlock[idx] === 's') {
      let pos = idx + 2

      const orgEnd = mafBlock.indexOf(' ', pos)
      const organismChr = mafBlock.slice(pos, orgEnd)
      pos = orgEnd + 1

      const dotIndex = organismChr.indexOf('.')
      const org = dotIndex === -1 ? organismChr : organismChr.slice(0, dotIndex)

      if (sampleFilter && !sampleFilter.has(org)) {
        idx = blockEnd + 1
        continue
      }

      const chr = dotIndex === -1 ? '' : organismChr.slice(dotIndex + 1)

      const startEnd = mafBlock.indexOf(' ', pos)
      const start = +mafBlock.slice(pos, startEnd)
      pos = startEnd + 1

      // Skip size, strand, srcSize
      pos = mafBlock.indexOf(' ', pos) + 1
      pos = mafBlock.indexOf(' ', pos) + 1
      pos = mafBlock.indexOf(' ', pos) + 1

      const sequence = mafBlock.slice(pos, blockEnd)
      const encodedSeq = encodeSequence(sequence)

      alignments[org] = { chr, start, seq: encodedSeq }
    }

    idx = blockEnd + 1
  }

  return alignments
}

// Optimized approach with array storage
interface OptimizedArrayResult {
  sampleNames: string[]
  alignments: (OrganismRecordOptimized | null)[]
}

function parseOptimizedArray(
  mafBlock: string,
  sampleFilter?: Set<string>,
  sampleToIndex?: Map<string, number>,
): OptimizedArrayResult {
  const sampleNames: string[] = []
  const alignments: (OrganismRecordOptimized | null)[] = sampleToIndex
    ? Array.from({ length: sampleToIndex.size }, () => null)
    : []

  let idx = 0
  while (idx < mafBlock.length) {
    const semiIdx = mafBlock.indexOf(';', idx)
    const blockEnd = semiIdx === -1 ? mafBlock.length : semiIdx

    if (mafBlock[idx] === 's') {
      let pos = idx + 2

      const orgEnd = mafBlock.indexOf(' ', pos)
      const organismChr = mafBlock.slice(pos, orgEnd)
      pos = orgEnd + 1

      const dotIndex = organismChr.indexOf('.')
      const org = dotIndex === -1 ? organismChr : organismChr.slice(0, dotIndex)

      if (sampleFilter && !sampleFilter.has(org)) {
        idx = blockEnd + 1
        continue
      }

      const chr = dotIndex === -1 ? '' : organismChr.slice(dotIndex + 1)

      const startEnd = mafBlock.indexOf(' ', pos)
      const start = +mafBlock.slice(pos, startEnd)
      pos = startEnd + 1

      pos = mafBlock.indexOf(' ', pos) + 1
      pos = mafBlock.indexOf(' ', pos) + 1
      pos = mafBlock.indexOf(' ', pos) + 1

      const sequence = mafBlock.slice(pos, blockEnd)
      const encodedSeq = encodeSequence(sequence)

      const record: OrganismRecordOptimized = { chr, start, seq: encodedSeq }

      if (sampleToIndex) {
        const sampleIdx = sampleToIndex.get(org)
        if (sampleIdx !== undefined) {
          alignments[sampleIdx] = record
        }
      } else {
        sampleNames.push(org)
        alignments.push(record)
      }
    }

    idx = blockEnd + 1
  }

  return { sampleNames, alignments }
}

// Test configurations - realistic sizes
const configs = [
  { name: '100 orgs, 10kb seq', organisms: 100, seqLength: 10000, features: 20 },
  { name: '500 orgs, 10kb seq', organisms: 500, seqLength: 10000, features: 10 },
  { name: '50 orgs, 100kb seq', organisms: 50, seqLength: 100000, features: 5 },
]

// Sample filter (viewing 10 samples out of 20)
const sampleFilter = new Set([
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
])

const sampleToIndex = new Map<string, number>()
let i = 0
for (const s of sampleFilter) {
  sampleToIndex.set(s, i++)
}

for (const config of configs) {
  describe(`Parsing: ${config.name}`, () => {
    // Pre-generate test data
    const mafBlocks: string[] = []
    for (let j = 0; j < config.features; j++) {
      mafBlocks.push(generateMafBlock(config.organisms, config.seqLength))
    }

    bench('Current approach (split + all fields)', () => {
      for (const block of mafBlocks) {
        parseCurrentApproach(block)
      }
    })

    bench('Optimized indexOf (no filter)', () => {
      for (const block of mafBlocks) {
        parseOptimizedIndexOf(block)
      }
    })

    bench('Optimized indexOf (with filter)', () => {
      for (const block of mafBlocks) {
        parseOptimizedIndexOf(block, sampleFilter)
      }
    })

    bench('Optimized array (with filter)', () => {
      for (const block of mafBlocks) {
        parseOptimizedArray(block, sampleFilter, sampleToIndex)
      }
    })
  })
}

// Additional benchmark: Just encoding (to see parsing vs encoding cost)
describe('Encoding cost isolation', () => {
  const seq1k = 'ACGT'.repeat(250)
  const seq10k = 'ACGT'.repeat(2500)
  const seq100k = 'ACGT'.repeat(25000)

  bench('Encode 1kb sequence', () => {
    encodeSequence(seq1k)
  })

  bench('Encode 10kb sequence', () => {
    encodeSequence(seq10k)
  })

  bench('Encode 100kb sequence', () => {
    encodeSequence(seq100k)
  })
})

// Test: What if we skip encoding entirely and just store strings?
// This isolates the cost of encoding vs string storage
describe('Encoding vs String storage (no filtering)', () => {
  const mafBlocks100x10k: string[] = []
  for (let i = 0; i < 20; i++) {
    mafBlocks100x10k.push(generateMafBlock(100, 10000))
  }

  // Parse and encode (current behavior)
  bench('Parse + Encode to 4-bit', () => {
    for (const block of mafBlocks100x10k) {
      parseCurrentApproach(block)
    }
  })

  // Parse but keep strings (no encoding)
  bench('Parse + Keep strings (no encoding)', () => {
    const WHITESPACE_REGEX = / +/
    for (const mafBlock of mafBlocks100x10k) {
      const blocks = mafBlock.split(';')
      const alignments: Record<string, { chr: string; start: number; seq: string }> = {}
      for (const block of blocks) {
        if (block.startsWith('s')) {
          const parts = block.split(WHITESPACE_REGEX)
          const sequence = parts[6]!
          const organismChr = parts[1]!
          const dotIndex = organismChr.indexOf('.')
          const org = dotIndex === -1 ? organismChr : organismChr.slice(0, dotIndex)
          const chr = dotIndex === -1 ? '' : organismChr.slice(dotIndex + 1)
          alignments[org] = {
            chr,
            start: +parts[2]!,
            seq: sequence, // Keep as string, no encoding
          }
        }
      }
    }
  })
})

// Test: Optimized encodeSequence using Uint8Array directly
// Encoding algorithm comparison - demonstrating the optimization now in place
// The old object lookup approach for reference
const ENCODE_MAP_OLD: Record<string, number> = {
  a: 0, c: 1, g: 2, t: 3, n: 4, '-': 5, ' ': 6,
  A: 7, C: 8, G: 9, T: 10, N: 11,
}

function encodeSequenceOldObjectLookup(seq: string): { data: Uint8Array; length: number } {
  const length = seq.length
  const data = new Uint8Array(Math.ceil(length / 2))
  for (let i = 0; i < length; i += 2) {
    const code1 = ENCODE_MAP_OLD[seq[i]!] ?? 12
    const code2 = i + 1 < length ? (ENCODE_MAP_OLD[seq[i + 1]!] ?? 12) : 0
    data[i >> 1] = (code1 << 4) | code2
  }
  return { data, length }
}

describe('Encoding algorithm comparison (100kb sequence)', () => {
  const seq100k = 'ACGT'.repeat(25000)

  bench('OLD: Object property lookup (before optimization)', () => {
    encodeSequenceOldObjectLookup(seq100k)
  })

  bench('NEW: Uint8Array lookup table (current implementation)', () => {
    encodeSequence(seq100k)
  })
})
