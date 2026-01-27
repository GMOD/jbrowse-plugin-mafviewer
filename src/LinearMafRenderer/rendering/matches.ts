import {
  CODE_GAP,
  CODE_SPACE,
  getBaseCode,
  getLowerCode,
} from '../../util/sequenceEncoding'
import { fillRect } from '../util'
import { GAP_STROKE_OFFSET } from './types'

import type { RenderingContext } from './types'
import type { EncodedSequence } from '../../util/sequenceEncoding'

export function renderMatches(
  context: RenderingContext,
  alignment: EncodedSequence,
  seq: EncodedSequence,
  leftPx: number,
  rowTop: number,
) {
  if (context.showAllLetters) {
    return
  }

  const { ctx, scale, h, canvasWidth } = context
  ctx.fillStyle = 'lightgrey'

  // Highlight matching bases with light grey background
  for (
    let i = 0, genomicOffset = 0, seqLength = alignment.length;
    i < seqLength;
    i++
  ) {
    const refCode = getBaseCode(seq, i)
    if (refCode !== CODE_GAP) {
      const alignCode = getBaseCode(alignment, i)
      if (
        getLowerCode(refCode) === getLowerCode(alignCode) &&
        alignCode !== CODE_SPACE
      ) {
        const xPos = leftPx + scale * genomicOffset
        fillRect(ctx, xPos, rowTop, scale + GAP_STROKE_OFFSET, h, canvasWidth)
      }
      genomicOffset++
    }
  }
}
