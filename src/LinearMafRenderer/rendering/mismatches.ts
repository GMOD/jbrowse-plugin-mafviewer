import {
  CODE_GAP,
  CODE_SPACE,
  decodeBaseLower,
  getBaseCode,
  getLowerCode,
} from '../../util/sequenceEncoding'
import { fillRect } from '../util'
import { addToSpatialIndex, shouldAddToSpatialIndex } from './spatialIndex'
import { GAP_STROKE_OFFSET } from './types'

import type { RenderingContext } from './types'
import type { EncodedSequence } from '../../util/sequenceEncoding'

/**
 * Renders colored rectangles for mismatches and matches (when showAllLetters is true)
 */
export function renderMismatches(
  context: RenderingContext,
  alignment: EncodedSequence,
  seq: EncodedSequence,
  leftPx: number,
  rowTop: number,
  rowIndex: number,
  alignmentStart: number,
  chr: string,
) {
  const {
    ctx,
    scale,
    h,
    canvasWidth,
    showAllLetters,
    mismatchRendering,
    colorForBase,
  } = context

  for (
    let i = 0, genomicOffset = 0, seqLength = alignment.length;
    i < seqLength;
    i++
  ) {
    const alignCode = getBaseCode(alignment, i)
    const refCode = getBaseCode(seq, i)
    if (refCode !== CODE_GAP) {
      if (alignCode !== CODE_GAP) {
        const xPos = leftPx + scale * genomicOffset
        if (
          getLowerCode(refCode) !== getLowerCode(alignCode) &&
          alignCode !== CODE_SPACE
        ) {
          // Mismatch
          const base = decodeBaseLower(alignment, i)
          fillRect(
            ctx,
            xPos,
            rowTop,
            scale + GAP_STROKE_OFFSET,
            h,
            canvasWidth,
            mismatchRendering ? (colorForBase[base] ?? 'black') : 'orange',
          )

          if (shouldAddToSpatialIndex(xPos, rowIndex, context)) {
            addToSpatialIndex(
              context,
              xPos,
              rowTop,
              xPos + context.scale + GAP_STROKE_OFFSET,
              rowTop + context.h,
              rowIndex,
              { pos: genomicOffset + alignmentStart, chr, base, rowIndex },
            )
          }
        } else if (showAllLetters) {
          // Match (when showing all letters)
          const base = decodeBaseLower(alignment, i)
          fillRect(
            ctx,
            xPos,
            rowTop,
            scale + GAP_STROKE_OFFSET,
            h,
            canvasWidth,
            mismatchRendering ? (colorForBase[base] ?? 'black') : 'lightblue',
          )

          if (shouldAddToSpatialIndex(xPos, rowIndex, context)) {
            addToSpatialIndex(
              context,
              xPos,
              rowTop,
              xPos + context.scale + GAP_STROKE_OFFSET,
              rowTop + context.h,
              rowIndex,
              { pos: genomicOffset + alignmentStart, chr, base, rowIndex },
            )
          }
        }
      }
      genomicOffset++
    }
  }
}
