import React, { useEffect, useRef } from 'react'

import { ResizeHandle } from '@jbrowse/core/ui'
import { getContainingView } from '@jbrowse/core/util'
import { isAlive } from '@jbrowse/mobx-state-tree'
import { autorun } from 'mobx'
import { observer } from 'mobx-react'
import { makeStyles } from 'tss-react/mui'

import type { LinearMafDisplayModel } from '../../stateModel'
import type { LinearGenomeViewModel } from '@jbrowse/plugin-linear-genome-view'

const useStyles = makeStyles()({
  resizeHandle: {
    position: 'absolute',
    top: 0,
    height: '100%',
    width: 4,
    zIndex: 1001,
    background: 'transparent',
    cursor: 'col-resize',
    '&:hover': {
      background: 'rgba(0,0,0,0.2)',
    },
  },
})

const SvgWrapper = observer(function ({
  children,
  model,
  exportSVG,
}: {
  model: LinearMafDisplayModel
  children: React.ReactNode
  exportSVG?: boolean
}) {
  const { classes } = useStyles()
  const mouseoverRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = mouseoverRef.current?.getContext('2d')
    return ctx
      ? autorun(() => {
          if (isAlive(model)) {
            const {
              totalHeight,
              leafMap,
              rowHeight,
              highlightedRowNames,
              hoveredTreeNode,
            } = model
            const { width: viewWidth } = getContainingView(
              model,
            ) as LinearGenomeViewModel

            ctx.resetTransform()
            ctx.clearRect(0, 0, viewWidth, totalHeight)

            if (highlightedRowNames) {
              ctx.fillStyle = 'rgba(255,165,0,0.2)'
              const halfRowHeight = rowHeight / 2
              for (const name of highlightedRowNames) {
                const leaf = leafMap.get(name)
                if (leaf) {
                  ctx.fillRect(0, leaf.x! - halfRowHeight, viewWidth, rowHeight)
                }
              }

              // Draw orange dot at hovered tree node
              if (hoveredTreeNode) {
                ctx.fillStyle = 'rgba(255,165,0,0.8)'
                ctx.beginPath()
                ctx.arc(hoveredTreeNode.y, hoveredTreeNode.x, 4, 0, 2 * Math.PI)
                ctx.fill()
                ctx.strokeStyle = 'rgba(255,140,0,1)'
                ctx.lineWidth = 1
                ctx.stroke()
              }
            }
          }
        })
      : undefined
  }, [model])

  if (exportSVG) {
    return <>{children}</>
  } else {
    const { totalHeight, treeWidth, hierarchy } = model
    const { width } = getContainingView(model) as LinearGenomeViewModel
    return (
      <>
        <svg
          style={{
            position: 'absolute',
            userSelect: 'none',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            height: totalHeight,
            width,
          }}
        >
          {children}
        </svg>
        <canvas
          ref={mouseoverRef}
          width={width}
          height={totalHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height: totalHeight,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        />
        {hierarchy ? (
          <div
            onMouseDown={e => {
              e.stopPropagation()
            }}
          >
            <ResizeHandle
              onDrag={distance => {
                model.setTreeAreaWidth(
                  Math.max(20, model.treeAreaWidth + distance),
                )
                return undefined
              }}
              className={classes.resizeHandle}
              style={{ left: treeWidth }}
              vertical
            />
          </div>
        ) : null}
      </>
    )
  }
})

export default SvgWrapper
