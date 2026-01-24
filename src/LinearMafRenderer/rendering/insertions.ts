import { measureText } from '@jbrowse/core/util'

import { fillRect } from '../util'
import { addToSpatialIndex, shouldAddToSpatialIndex } from './spatialIndex'
import {
  CHAR_SIZE_WIDTH,
  HIGH_BP_PER_PX_THRESHOLD,
  HIGH_ZOOM_THRESHOLD,
  INSERTION_BORDER_HEIGHT,
  INSERTION_BORDER_WIDTH,
  INSERTION_LINE_WIDTH,
  INSERTION_PADDING,
  LARGE_INSERTION_THRESHOLD,
  MIN_ROW_HEIGHT_FOR_BORDERS,
} from './types'

import type { RenderingContext } from './types'

export function renderInsertions(
  context: RenderingContext,
  alignment: string,
  seq: string,
  leftPx: number,
  rowTop: number,
  bpPerPx: number,
  rowIndex: number,
  alignmentStart: number,
  chr: string,
) {
  const { ctx, scale, h, canvasWidth, rowHeight, charHeight } = context

  for (
    let i = 0, genomicOffset = 0, seqLength = alignment.length;
    i < seqLength;
    i++
  ) {
    let insertionSequence = ''
    while (seq[i] === '-') {
      if (alignment[i] !== '-' && alignment[i] !== ' ') {
        insertionSequence += alignment[i]
      }
      i++
    }
    if (insertionSequence.length > 0) {
      // Found an insertion
      const xPos = leftPx + scale * genomicOffset - INSERTION_LINE_WIDTH

      // Determine actual rendered width and position for spatial index
      let actualXPos: number
      let actualWidth: number

      // Large insertions: show count instead of individual bases
      if (insertionSequence.length > LARGE_INSERTION_THRESHOLD) {
        const lengthText = `${insertionSequence.length}`
        if (bpPerPx > HIGH_BP_PER_PX_THRESHOLD) {
          // Very zoomed out: simple line
          actualXPos = xPos - INSERTION_LINE_WIDTH
          actualWidth = INSERTION_BORDER_WIDTH
          fillRect(
            ctx,
            actualXPos,
            rowTop,
            actualWidth,
            h,
            canvasWidth,
            'purple',
          )
        } else if (h > charHeight) {
          // Medium zoom: show count in colored box
          const textWidth = measureText(lengthText, CHAR_SIZE_WIDTH)
          const padding = INSERTION_PADDING
          actualXPos = xPos - textWidth / 2 - padding
          actualWidth = textWidth + 2 * padding
          fillRect(
            ctx,
            actualXPos,
            rowTop,
            actualWidth,
            h,
            canvasWidth,
            'purple',
          )
          ctx.fillStyle = 'white'
          ctx.fillText(lengthText, xPos - textWidth / 2, rowTop + (h * 7) / 8)
        } else {
          const padding = INSERTION_PADDING
          actualXPos = xPos - padding
          actualWidth = 2 * padding
          fillRect(
            ctx,
            actualXPos,
            rowTop,
            actualWidth,
            h,
            canvasWidth,
            'purple',
          )
        }
      } else {
        // Small insertions: vertical line with optional border at high zoom
        actualXPos = xPos
        actualWidth = INSERTION_LINE_WIDTH
        fillRect(ctx, actualXPos, rowTop, actualWidth, h, canvasWidth, 'purple')

        // Always use a wider hit box for spatial index, even if visual is 1px
        const hitBoxPadding = 2
        actualXPos = xPos - hitBoxPadding
        actualWidth = INSERTION_LINE_WIDTH + 2 * hitBoxPadding

        if (
          bpPerPx < HIGH_ZOOM_THRESHOLD &&
          rowHeight > MIN_ROW_HEIGHT_FOR_BORDERS
        ) {
          // Add horizontal borders for visibility at high zoom
          fillRect(
            ctx,
            xPos - INSERTION_BORDER_WIDTH,
            rowTop,
            INSERTION_BORDER_HEIGHT,
            INSERTION_LINE_WIDTH,
            canvasWidth,
          )
          fillRect(
            ctx,
            xPos - INSERTION_BORDER_WIDTH,
            rowTop + h - INSERTION_LINE_WIDTH,
            INSERTION_BORDER_HEIGHT,
            INSERTION_LINE_WIDTH,
            canvasWidth,
          )
        }
      }

      // Add insertion to spatial index with actual rendered dimensions
      // Insertions always bypass distance filter
      const isLargeInsertion =
        insertionSequence.length > LARGE_INSERTION_THRESHOLD
      if (shouldAddToSpatialIndex(actualXPos, context, true)) {
        addToSpatialIndex(
          context,
          actualXPos,
          rowTop,
          actualXPos + actualWidth,
          rowTop + context.h,
          {
            pos: genomicOffset + alignmentStart,
            chr,
            base: insertionSequence,
            rowIndex,
            isInsertion: true,
            isLargeInsertion,
          },
        )
      }
    }
    genomicOffset++
  }
}
