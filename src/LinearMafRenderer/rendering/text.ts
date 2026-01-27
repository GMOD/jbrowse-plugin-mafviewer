import { CHAR_SIZE_WIDTH, VERTICAL_TEXT_OFFSET } from './types'
import {
  CODE_GAP,
  decodeBase,
  decodeBaseLower,
  getBaseCode,
  getLowerCode,
} from '../../util/sequenceEncoding'

import type { RenderingContext } from './types'
import type { EncodedSequence } from '../../util/sequenceEncoding'

/**
 * Renders text labels for bases when zoom level is sufficient
 */
export function renderText(
  context: RenderingContext,
  alignment: EncodedSequence,
  seq: EncodedSequence,
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
      const refCode = getBaseCode(seq, i)
      if (refCode !== CODE_GAP) {
        const xPos = leftPx + scale * genomicOffset
        const textOffset = (scale - CHAR_SIZE_WIDTH) / 2 + 1
        const alignCode = getBaseCode(alignment, i)
        if (
          (showAllLetters ||
            getLowerCode(refCode) !== getLowerCode(alignCode)) &&
          alignCode !== CODE_GAP
        ) {
          const baseLower = decodeBaseLower(alignment, i)
          ctx.fillStyle = mismatchRendering
            ? (contrastForBase[baseLower] ?? 'white')
            : 'black'
          if (rowHeight > charHeight) {
            const displayChar = showAsUpperCase
              ? decodeBase(alignment, i).toUpperCase()
              : decodeBase(alignment, i)
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
