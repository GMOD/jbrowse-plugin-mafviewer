import React from 'react'

import { observer } from 'mobx-react'

import RectBg from './RectBg'
import Tree from './Tree'

import type { LinearMafDisplayModel } from '../../stateModel'

const ColorLegend = observer(function ({
  model,
}: {
  model: LinearMafDisplayModel
}) {
  const {
    labelWidth,
    canDisplayLabel,
    totalHeight,
    treeWidth,
    sidebarWidth,
    samples = [],
    rowHeight,
    svgFontSize,
    sampleYPositions,
  } = model
  const boxHeight = Math.min(20, rowHeight)

  return (
    <>
      <RectBg y={0} x={0} width={sidebarWidth} height={totalHeight} />
      <g transform="translate(4,0)">
        <Tree model={model} />
      </g>
      <g transform={`translate(${treeWidth + 9},0)`}>
        {samples.map((sample, idx) => (
          <RectBg
            key={`${sample.id}-${idx}`}
            y={sampleYPositions[idx]! - rowHeight / 2}
            x={0}
            width={labelWidth + 5}
            height={boxHeight}
            color={sample.color}
          />
        ))}
        {canDisplayLabel
          ? samples.map((sample, idx) => (
              <text
                key={`${sample.id}-${idx}`}
                dominantBaseline="middle"
                fontSize={svgFontSize}
                x={2}
                y={sampleYPositions[idx]}
              >
                {sample.label}
              </text>
            ))
          : null}
      </g>
    </>
  )
})

export default ColorLegend
