// MAF alignment iteration types
// Similar to forEachMismatch pattern in alignments plugin

// Base type constants for efficient comparison
export const MAF_MATCH = 0
export const MAF_MISMATCH = 1
export const MAF_GAP = 2
export const MAF_INSERTION = 3

/**
 * Callback for iterating over MAF alignment positions
 * @param type - MAF_MATCH, MAF_MISMATCH, MAF_GAP, or MAF_INSERTION
 * @param genomicOffset - Position relative to feature start (excludes ref gaps)
 * @param base - The base character (lowercase) or insertion sequence
 * @param origBase - Original base preserving case (for text display)
 */
export type MafBaseCallback = (
  type: number,
  genomicOffset: number,
  base: string,
  origBase: string,
) => void

/**
 * Callback for iterating over insertions only
 * @param genomicOffset - Position where insertion occurs
 * @param sequence - The insertion sequence
 */
export type MafInsertionCallback = (
  genomicOffset: number,
  sequence: string,
) => void
