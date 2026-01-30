import { getAdapter } from '@jbrowse/core/data_adapters/dataAdapterCache'
import { FeatureRendererType } from '@jbrowse/core/pluggableElementTypes'
import { RenderArgsDeserialized } from '@jbrowse/core/pluggableElementTypes/renderers/BoxRendererType'
import {
  Feature,
  Region,
  createCanvas,
  createImageBitmap,
} from '@jbrowse/core/util'

import {
  finalizeRendering,
  initRenderingContext,
  renderFeature,
} from './makeImageData'
import { subscribeToObservable } from '../util/observableUtils'

import type { Sample } from '../types'
import type { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'

interface RenderArgs extends RenderArgsDeserialized {
  samples: Sample[]
  rowHeight: number
  rowProportion: number
  showAllLetters: boolean
  mismatchRendering: boolean
  statusCallback?: (arg: string) => void
  showAsUpperCase: boolean
  highResolutionScaling?: number
}

export default class LinearMafRenderer extends FeatureRendererType {
  getExpandedRegion(region: Region) {
    const { start, end } = region
    const bpExpansion = 1

    return {
      // xref https://github.com/mobxjs/@jbrowse/mobx-state-tree/issues/1524 for Omit
      ...(region as Omit<typeof region, symbol>),
      start: Math.floor(Math.max(start - bpExpansion, 0)),
      end: Math.ceil(end + bpExpansion),
    }
  }

  async render(renderProps: RenderArgs) {
    const {
      regions,
      bpPerPx,
      samples,
      rowHeight,
      sessionId,
      adapterConfig,
      highResolutionScaling = 1,
    } = renderProps
    const region = regions[0]!
    const height = samples.length * rowHeight + 100
    const width = (region.end - region.start) / bpPerPx

    const scaledWidth = Math.ceil(width * highResolutionScaling)
    const scaledHeight = Math.ceil(height * highResolutionScaling)

    if (scaledWidth > 16384 || scaledHeight > 16384) {
      console.warn(
        '[LinearMafRenderer] Canvas dimensions may exceed browser limits:',
        {
          width,
          height,
          scaledWidth,
          scaledHeight,
          highResolutionScaling,
          bpPerPx,
          regionSize: region.end - region.start,
          samplesCount: samples.length,
          rowHeight,
        },
      )
    }

    // Create canvas with high resolution scaling support
    const canvas = createCanvas(scaledWidth, scaledHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get canvas context')
    }

    // Scale context for high resolution displays
    if (highResolutionScaling !== 1) {
      ctx.scale(highResolutionScaling, highResolutionScaling)
    }

    const {
      renderingContext,
      sampleToRowMap,
      region: expandedRegion,
    } = initRenderingContext(ctx, renderProps)

    // Get adapter and stream features directly to canvas
    // This renders each feature as it arrives, reducing peak memory
    const { dataAdapter } = await getAdapter(
      this.pluginManager,
      sessionId,
      adapterConfig,
    )
    const adapter = dataAdapter as BaseFeatureDataAdapter
    const queryRegion = this.getExpandedRegion(region)

    await subscribeToObservable(
      adapter.getFeatures(queryRegion, renderProps),
      (feature: Feature) => {
        if (this.featurePassesFilters(renderProps, feature)) {
          renderFeature(
            feature,
            expandedRegion,
            bpPerPx,
            sampleToRowMap,
            renderingContext,
          )
        }
      },
    )

    // Finalize rendering and build spatial index
    const { flatbush, items } = finalizeRendering(renderingContext, samples)

    // Note: We intentionally skip calling super.render() here because:
    // 1. FeatureRendererType.render() would call getFeatures() again with toArray()
    // 2. We've already rendered directly to canvas via streaming
    // 3. Canvas-based renderers return imageData directly, not React elements
    return {
      imageData: await createImageBitmap(canvas),
      flatbush,
      items,
      samples,
      features: new Map(),
      width,
      height,
      containsNoTransferables: true,
    }
  }
}
