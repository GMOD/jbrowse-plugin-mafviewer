import { CHAR_SIZE_WIDTH, VERTICAL_TEXT_OFFSET } from './types'

import type { RenderingContext } from './types'

/**
 * Renders text labels for bases when zoom level is sufficient
 */
export function renderText(
  context: RenderingContext,
  alignment: string,
  seq: string,
  leftPx: number,
  rowTop: number,
) {
  const {
    ctx,
    scale,
    hp2,
    rowHeight,
    showAllLetters,
    mismatchRendering,
    contrastForBase,
    showAsUpperCase,
    charHeight,
  } = context

  if (scale >= CHAR_SIZE_WIDTH) {
    for (
      let i = 0, genomicOffset = 0, seqLength = alignment.length;
      i < seqLength;
      i++
    ) {
      const refChar = seq[i]!
      if (refChar !== '-') {
        const xPos = leftPx + scale * genomicOffset
        const textOffset = (scale - CHAR_SIZE_WIDTH) / 2 + 1
        const alignChar = alignment[i]!
        if (
          (showAllLetters ||
            refChar.toLowerCase() !== alignChar.toLowerCase()) &&
          alignChar !== '-'
        ) {
          const baseLower = alignChar.toLowerCase()
          ctx.fillStyle = mismatchRendering
            ? (contrastForBase[baseLower] ?? 'white')
            : 'black'
          if (rowHeight > charHeight) {
            const displayChar = showAsUpperCase
              ? alignChar.toUpperCase()
              : alignChar
            ctx.fillText(
              displayChar,
              xPos + textOffset,
              hp2 + rowTop + VERTICAL_TEXT_OFFSET,
            )
          }
        }
        genomicOffset++
      }
    }
  }
}
