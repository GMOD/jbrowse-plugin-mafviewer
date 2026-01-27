import { fillRect } from '../util'
import { addToSpatialIndex, shouldAddToSpatialIndex } from './spatialIndex'
import { GAP_STROKE_OFFSET } from './types'

import type { RenderingContext } from './types'

/**
 * Renders colored rectangles for mismatches and matches (when showAllLetters is true)
 */
export function renderMismatches(
  context: RenderingContext,
  alignment: string,
  seq: string,
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
    const alignChar = alignment[i]!
    const refChar = seq[i]!
    if (refChar !== '-') {
      if (alignChar !== '-') {
        const xPos = leftPx + scale * genomicOffset
        const base = alignChar.toLowerCase()
        if (refChar.toLowerCase() !== base && alignChar !== ' ') {
          // Mismatch
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
