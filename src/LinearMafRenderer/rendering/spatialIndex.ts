import { GAP_STROKE_OFFSET, MIN_X_DISTANCE } from './types'

import type { RenderedBase, RenderingContext } from './types'

export function createRenderedBaseCoords(
  xPos: number,
  rowTop: number,
  context: RenderingContext,
) {
  return {
    minX: xPos,
    minY: rowTop,
    maxX: xPos + context.scale + GAP_STROKE_OFFSET,
    maxY: rowTop + context.h,
  }
}

export function shouldAddToSpatialIndex(
  xPos: number,
  rowIndex: number,
  context: RenderingContext,
  bypassDistanceFilter = false,
): boolean {
  if (bypassDistanceFilter) {
    return true
  }

  const lastInsertedX = context.lastInsertedXPerRow.get(rowIndex) ?? -Infinity

  // Zoom-aware distance threshold: scale threshold based on zoom level
  // At high zoom (small bpPerPx), use smaller threshold for more precision
  // At low zoom (large bpPerPx), use larger threshold to reduce index size
  // Items within 1px of each other in the same row are not added
  return (
    Math.abs(xPos - lastInsertedX) > MIN_X_DISTANCE * Math.max(1, context.bpPerPx)
  )
}

export function addToSpatialIndex(
  context: RenderingContext,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  rowIndex: number,
  renderedBase: RenderedBase,
) {
  context.spatialIndex.push(renderedBase)
  context.spatialIndexCoords.push(minX, minY, maxX, maxY)
  context.lastInsertedXPerRow.set(rowIndex, minX)
}
