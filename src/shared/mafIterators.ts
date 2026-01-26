// MAF alignment iterators
// Supports both string-based and encoded sequence storage

import {
  MAF_GAP,
  MAF_INSERTION,
  MAF_MATCH,
  MAF_MISMATCH,
  MafBaseCallback,
  MafInsertionCallback,
} from './mafIteratorTypes'

/**
 * Iterate over alignment positions using string-based sequences
 * This is the default for adapters that haven't been optimized yet
 */
export function forEachBaseString(
  alignment: string,
  refSeq: string,
  callback: MafBaseCallback,
) {
  const seqLength = alignment.length
  for (let i = 0, genomicOffset = 0; i < seqLength; i++) {
    const refChar = refSeq[i]
    if (refChar !== '-') {
      const alignChar = alignment[i]!
      const alignCharLower = alignChar.toLowerCase()

      if (alignChar === '-') {
        callback(MAF_GAP, genomicOffset, '-', '-')
      } else if (alignChar !== ' ') {
        const refCharLower = refChar!.toLowerCase()
        if (refCharLower === alignCharLower) {
          callback(MAF_MATCH, genomicOffset, alignCharLower, alignChar)
        } else {
          callback(MAF_MISMATCH, genomicOffset, alignCharLower, alignChar)
        }
      }
      genomicOffset++
    }
  }
}

/**
 * Iterate over insertions using string-based sequences
 */
export function forEachInsertionString(
  alignment: string,
  refSeq: string,
  callback: MafInsertionCallback,
) {
  const seqLength = alignment.length
  for (let i = 0, genomicOffset = 0; i < seqLength; i++) {
    let insertionSequence = ''
    while (refSeq[i] === '-') {
      const alignChar = alignment[i]
      if (alignChar !== '-' && alignChar !== ' ') {
        insertionSequence += alignChar
      }
      i++
    }
    if (insertionSequence.length > 0) {
      callback(genomicOffset, insertionSequence)
    }
    if (i < seqLength && refSeq[i] !== '-') {
      genomicOffset++
    }
  }
}

// Re-export types
export {
  MAF_GAP,
  MAF_INSERTION,
  MAF_MATCH,
  MAF_MISMATCH,
  MafBaseCallback,
  MafInsertionCallback,
} from './mafIteratorTypes'
