import { GAP_STROKE_OFFSET } from './types'
import { CODE_GAP, getBaseCode } from '../../util/sequenceEncoding'

import type { RenderingContext } from './types'
import type { EncodedSequence } from '../../util/sequenceEncoding'

export function renderGaps(
  context: RenderingContext,
  alignment: EncodedSequence,
  seq: EncodedSequence,
  leftPx: number,
  rowTop: number,
) {
  const { ctx, scale } = context
  const h2 = context.rowHeight / 2

  ctx.beginPath()
  ctx.fillStyle = 'black'

  for (
    let i = 0, genomicOffset = 0, seqLength = alignment.length;
    i < seqLength;
    i++
  ) {
    if (getBaseCode(seq, i) !== CODE_GAP) {
      if (getBaseCode(alignment, i) === CODE_GAP) {
        const xPos = leftPx + scale * genomicOffset
        ctx.moveTo(xPos, rowTop + h2)
        ctx.lineTo(xPos + scale + GAP_STROKE_OFFSET, rowTop + h2)
      }
      genomicOffset++
    }
  }
  ctx.stroke()
}
