import React, { useCallback, useMemo, useRef, useState } from 'react'

import { PrerenderedCanvas } from '@jbrowse/core/ui'
import Flatbush from 'flatbush'
import { observer } from 'mobx-react'

import type { Sample } from '../../LinearMafDisplay/types'
import type { RenderedBase } from '../rendering'

interface DisplayModel {
  setHoveredInfo?: (info: Record<string, unknown> | undefined) => void
  setHighlightedRowNames?: (names: string[] | undefined) => void
  showInsertionSequenceDialog?: (data: {
    sequence: string
    sampleLabel: string
    chr: string
    pos: number
  }) => void
}

const LinearMafRendering = observer(function (props: {
  width: number
  height: number
  displayModel: DisplayModel
  flatbush: ArrayBuffer
  items: RenderedBase[]
  samples: Sample[]
}) {
  const { items, displayModel, height, samples, flatbush } = props
  const ref = useRef<HTMLDivElement>(null)
  const flatbush2 = useMemo(() => Flatbush.from(flatbush), [flatbush])
  const [isOverLargeInsertion, setIsOverLargeInsertion] = useState(false)

  const getFeatureUnderMouse = useCallback(
    (eventClientX: number, eventClientY: number) => {
      let offsetX = 0
      let offsetY = 0
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        offsetX = eventClientX - rect.left
        offsetY = eventClientY - rect.top
      }

      const hits = flatbush2.search(offsetX, offsetY, offsetX + 1, offsetY + 1)
      if (hits.length === 0) {
        return undefined
      }

      const insertionHit = hits.find(idx => items[idx]?.isInsertion)
      const hitIdx = insertionHit ?? hits[0]
      const item = hitIdx !== undefined ? items[hitIdx] : undefined
      if (!item) {
        return undefined
      }

      const sample = samples[item.rowIndex]
      return {
        ...item,
        sampleId: sample?.id ?? 'unknown',
        sampleLabel: sample?.label || sample?.id || 'unknown',
      }
    },
    [flatbush2, items, samples],
  )

  return (
    <div
      ref={ref}
      onClick={e => {
        const feature = getFeatureUnderMouse(e.clientX, e.clientY)
        if (feature?.isLargeInsertion) {
          displayModel.showInsertionSequenceDialog?.({
            sequence: feature.base,
            sampleLabel: feature.sampleLabel,
            chr: feature.chr,
            pos: feature.pos,
          })
        }
      }}
      onMouseMove={e => {
        const feature = getFeatureUnderMouse(e.clientX, e.clientY)
        displayModel.setHoveredInfo?.(feature)
        displayModel.setHighlightedRowNames?.(
          feature?.sampleId ? [feature.sampleId] : undefined,
        )
        setIsOverLargeInsertion(!!feature?.isLargeInsertion)
      }}
      onMouseLeave={() => {
        displayModel.setHoveredInfo?.(undefined)
        displayModel.setHighlightedRowNames?.(undefined)
        setIsOverLargeInsertion(false)
      }}
      style={{
        overflow: 'visible',
        position: 'relative',
        height,
        cursor: isOverLargeInsertion ? 'pointer' : 'default',
      }}
    >
      <PrerenderedCanvas
        {...props}
        style={{
          position: 'absolute',
          left: 0,
        }}
      />
    </div>
  )
})

export default LinearMafRendering
