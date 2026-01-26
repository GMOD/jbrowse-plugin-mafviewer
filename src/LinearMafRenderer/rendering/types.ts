// Rendering constants
export const FONT_CONFIG = 'bold 10px Courier New,monospace'
export const CHAR_SIZE_WIDTH = 10
export const GAP_STROKE_OFFSET = 0.4
export const INSERTION_LINE_WIDTH = 1
export const INSERTION_BORDER_WIDTH = 2
export const INSERTION_PADDING = 2
export const VERTICAL_TEXT_OFFSET = 3
export const LARGE_INSERTION_THRESHOLD = 10
export const HIGH_ZOOM_THRESHOLD = 0.2
export const MIN_ROW_HEIGHT_FOR_BORDERS = 5
export const HIGH_BP_PER_PX_THRESHOLD = 10
export const INSERTION_BORDER_HEIGHT = 5
export const MIN_X_DISTANCE = 1

export type { Sample } from '../../LinearMafDisplay/types'

export interface GenomicRegion {
  start: number
  end: number
  refName: string
}

export interface RenderedBase {
  pos: number
  chr: string
  base: string
  rowIndex: number
  isInsertion?: boolean
  isLargeInsertion?: boolean
}

/**
 * Shared rendering context containing all necessary parameters for rendering operations
 */
export interface RenderingContext {
  ctx: CanvasRenderingContext2D
  scale: number
  bpPerPx: number
  canvasWidth: number
  rowHeight: number
  h: number
  hp2: number
  offset: number
  colorForBase: Record<string, string>
  contrastForBase: Record<string, string>
  showAllLetters: boolean
  mismatchRendering: boolean
  showAsUpperCase: boolean

  // Cached char dimensions
  charWidth: number
  charHeight: number

  // RBush spatial index for efficient spatial queries
  spatialIndex: RenderedBase[]
  spatialIndexCoords: number[]

  // Track last X position per row for spatial index optimization
  lastInsertedXPerRow: Map<number, number>
}

import type { EncodedSequence } from '../../util/sequenceEncoding'

export type { EncodedSequence } from '../../util/sequenceEncoding'

export interface AlignmentRecord {
  seq: EncodedSequence
  start: number
  strand: number
  chr: string
}
