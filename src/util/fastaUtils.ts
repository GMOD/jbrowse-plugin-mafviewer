import {
  CODE_GAP,
  CODE_SPACE,
  decodeBaseLower,
  getBaseCode,
  getLowerCode,
} from './sequenceEncoding'
import { Sample } from '../LinearMafDisplay/types'

import type { EncodedSequence } from './sequenceEncoding'
import type { AlignmentRecord } from '../LinearMafRenderer/rendering'
import type { Feature, Region } from '@jbrowse/core/util'

interface InsertionInfo {
  sequence: string
  sampleIndex: number
}

/**
 * Process features into FASTA format
 * @param features - The features to process
 * @param selectedRegion - Optional region to extract
 * @returns FASTA formatted text
 */
export function processFeaturesToFasta({
  regions,
  showAllLetters,
  samples,
  features,
  includeInsertions,
}: {
  regions: Region[]
  samples: Sample[]
  showAsUpperCase?: boolean
  mismatchRendering?: boolean
  showAllLetters?: boolean
  includeInsertions?: boolean
  features: Map<string, Feature>
}) {
  const region = regions[0]!
  const sampleToRowMap = new Map(samples.map((s, i) => [s.id, i]))
  const rlen = region.end - region.start

  // Use character arrays instead of strings for O(1) mutations
  const outputRowsArrays = samples.map(() => new Array(rlen).fill('-'))

  // Track insertions at each position if includeInsertions is enabled
  // Key is the reference position (0-based relative to region), value is array of insertions
  const insertionsAtPosition = new Map<number, InsertionInfo[]>()

  for (const feature of features.values()) {
    const leftCoord = feature.get('start')
    const vals = feature.get('alignments') as Record<string, AlignmentRecord>
    const seq = feature.get('seq') as EncodedSequence

    for (const [sample, val] of Object.entries(vals)) {
      const alignment = val.seq
      const row = sampleToRowMap.get(sample)
      if (row === undefined) {
        continue
      }

      const rowArray = outputRowsArrays[row]!

      for (let i = 0, o = 0, l = alignment.length; i < l; i++) {
        const seqCode = getBaseCode(seq, i)
        if (seqCode !== CODE_GAP) {
          const alignCode = getBaseCode(alignment, i)
          const pos = leftCoord + o - region.start

          if (pos >= 0 && pos < rlen) {
            if (alignCode === CODE_GAP) {
              rowArray[pos] = '-'
            } else if (alignCode !== CODE_SPACE) {
              const c = decodeBaseLower(alignment, i)
              if (showAllLetters) {
                rowArray[pos] = c
              } else if (getLowerCode(seqCode) === getLowerCode(alignCode)) {
                rowArray[pos] = '.'
              } else {
                rowArray[pos] = c
              }
            }
          }
          o++
        } else if (includeInsertions) {
          let insertionSequence = ''
          while (i < alignment.length && getBaseCode(seq, i) === CODE_GAP) {
            const alignCode = getBaseCode(alignment, i)
            insertionSequence +=
              alignCode !== CODE_GAP && alignCode !== CODE_SPACE
                ? decodeBaseLower(alignment, i)
                : '-'
            i++
          }
          i--

          if (insertionSequence.length > 0) {
            const insertPos = leftCoord + o - region.start
            if (insertPos >= 0 && insertPos <= rlen) {
              const existing = insertionsAtPosition.get(insertPos) || []
              existing.push({ sequence: insertionSequence, sampleIndex: row })
              insertionsAtPosition.set(insertPos, existing)
            }
          }
        }
      }
    }
  }

  if (includeInsertions && insertionsAtPosition.size > 0) {
    return expandWithInsertions(
      outputRowsArrays,
      insertionsAtPosition,
      samples.length,
    )
  }

  // Convert character arrays back to strings
  return outputRowsArrays.map(arr => arr.join(''))
}

/**
 * Expand sequences to include insertions
 * At each position with insertions, find the max insertion length,
 * then expand all sequences by that amount
 */
function expandWithInsertions(
  outputRowsArrays: string[][],
  insertionsAtPosition: Map<number, InsertionInfo[]>,
  numSamples: number,
) {
  // Sort insertion positions in descending order so we can insert from right to left
  // without affecting earlier positions
  const sortedPositions = [...insertionsAtPosition.keys()].sort((a, b) => b - a)

  for (const pos of sortedPositions) {
    const insertions = insertionsAtPosition.get(pos)!

    // Find max insertion length at this position
    let maxLen = 0
    for (const ins of insertions) {
      if (ins.sequence.length > maxLen) {
        maxLen = ins.sequence.length
      }
    }

    // Create a map from sample index to insertion sequence
    const sampleInsertions = new Map<number, string>()
    for (const ins of insertions) {
      sampleInsertions.set(ins.sampleIndex, ins.sequence)
    }

    // Insert characters at this position for each sample
    for (let sampleIdx = 0; sampleIdx < numSamples; sampleIdx++) {
      const rowArray = outputRowsArrays[sampleIdx]!
      const insertionSeq = sampleInsertions.get(sampleIdx)

      if (insertionSeq) {
        // This sample has an insertion - add it, padded with gaps if needed
        const paddedInsertion = insertionSeq.padEnd(maxLen, '-')
        // Insert after position `pos`
        rowArray.splice(pos, 0, ...paddedInsertion.split(''))
      } else {
        // No insertion for this sample - fill with gaps
        const gaps = new Array(maxLen).fill('-')
        rowArray.splice(pos, 0, ...gaps)
      }
    }
  }

  // Convert character arrays back to strings
  return outputRowsArrays.map(arr => arr.join(''))
}
