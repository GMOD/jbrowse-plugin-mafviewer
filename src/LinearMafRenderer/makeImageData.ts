import { RenderArgsDeserialized } from '@jbrowse/core/pluggableElementTypes/renderers/BoxRendererType'
import { createJBrowseTheme } from '@jbrowse/core/ui'
import { Feature } from '@jbrowse/core/util'
import Flatbush from 'flatbush'

import {
  FONT_CONFIG,
  RenderingContext,
  Sample,
  processFeatureAlignment,
} from './rendering'
import { getCharWidthHeight, getColorBaseMap, getContrastBaseMap } from './util'

interface RenderArgs extends RenderArgsDeserialized {
  samples: Sample[]
  rowHeight: number
  rowProportion: number
  showAllLetters: boolean
  mismatchRendering: boolean
  features: Map<string, Feature>
  statusCallback?: (arg: string) => void
  showAsUpperCase: boolean
}

export function makeImageData({
  ctx,
  renderArgs,
}: {
  ctx: CanvasRenderingContext2D
  renderArgs: RenderArgs
}) {
  const {
    regions,
    bpPerPx,
    rowHeight,
    showAllLetters,
    theme: configTheme,
    mismatchRendering,
    samples,
    rowProportion,
    features,
    showAsUpperCase,
  } = renderArgs

  const region = regions[0]!
  const canvasWidth = (region.end - region.start) / bpPerPx
  const h = rowHeight * rowProportion
  const theme = createJBrowseTheme(configTheme)
  const colorForBase = getColorBaseMap(theme)
  const contrastForBase = getContrastBaseMap(theme)
  const sampleToRowMap = new Map(samples.map((s, i) => [s.id, i]))
  const scale = 1 / bpPerPx
  const hp2 = h / 2
  const offset = (rowHeight - h) / 2
  const { charWidth, charHeight } = getCharWidthHeight()

  ctx.font = FONT_CONFIG

  const renderingContext: RenderingContext = {
    ctx,
    scale,
    bpPerPx,
    canvasWidth,
    rowHeight,
    h,
    hp2,
    offset,
    colorForBase,
    contrastForBase,
    showAllLetters,
    mismatchRendering,
    showAsUpperCase,
    charWidth,
    charHeight,
    spatialIndex: [],
    spatialIndexCoords: [],
    lastInsertedXPerRow: new Map(), // Track per-row to ensure each row has spatial index entries
  }

  for (const feature of features.values()) {
    processFeatureAlignment(
      feature,
      region,
      bpPerPx,
      sampleToRowMap,
      renderingContext,
    )
  }
  const flatbush = new Flatbush(renderingContext.spatialIndex.length || 1)
  if (renderingContext.spatialIndex.length === 0) {
    flatbush.add(0, 0, 1, 1)
  } else {
    for (
      let i = 0, l = renderingContext.spatialIndexCoords.length;
      i < l;
      i += 4
    ) {
      flatbush.add(
        renderingContext.spatialIndexCoords[i]!,
        renderingContext.spatialIndexCoords[i + 1]!,
        renderingContext.spatialIndexCoords[i + 2],
        renderingContext.spatialIndexCoords[i + 3],
      )
    }
  }
  flatbush.finish()
  return {
    flatbush: flatbush.data,
    items: renderingContext.spatialIndex,
    samples,
  }
}
