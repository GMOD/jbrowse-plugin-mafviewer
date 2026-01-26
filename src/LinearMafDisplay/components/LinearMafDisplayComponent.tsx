import React, { useRef } from 'react'

import { Menu } from '@jbrowse/core/ui'
import {
  getContainingView,
  getEnv,
  getSession,
  isSessionModelWithWidgets,
} from '@jbrowse/core/util'
import { useTheme } from '@mui/material'
import { observer } from 'mobx-react'

import Crosshairs from './Crosshairs'
import MAFTooltip from './MAFTooltip'
import MsaHighlightOverlay from './MsaHighlightOverlay'
import YScaleBars from './Sidebar/YScaleBars'
import { useDragSelection } from './useDragSelection'

import type { LinearMafDisplayModel } from '../stateModel'
import type { LinearGenomeViewModel } from '@jbrowse/plugin-linear-genome-view'

const LinearMafDisplay = observer(function (props: {
  model: LinearMafDisplayModel
}) {
  const { model } = props
  const { pluginManager } = getEnv(model)
  const { height, scrollTop, samples: sources } = model
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const session = getSession(model)

  const LinearGenomePlugin = pluginManager.getPlugin(
    'LinearGenomeViewPlugin',
  ) as import('@jbrowse/plugin-linear-genome-view').default
  const { BaseLinearDisplayComponent } = LinearGenomePlugin.exports

  const {
    isDragging,
    dragStartX,
    dragEndX,
    showSelectionBox,
    mouseX,
    mouseY,
    contextCoord,
    setContextCoord,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    clearSelectionBox,
  } = useDragSelection(ref)

  const view = getContainingView(model) as LinearGenomeViewModel
  const { width } = view

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={() => {
        if (showSelectionBox) {
          clearSelectionBox()
        }
      }}
      onMouseLeave={handleMouseLeave}
    >
      <BaseLinearDisplayComponent {...props} />
      {model.showSidebar ? <YScaleBars model={model} /> : null}
      <MsaHighlightOverlay model={model} view={view} height={height} />
      {mouseY !== undefined &&
      mouseX !== undefined &&
      sources &&
      !contextCoord ? (
        <div style={{ position: 'relative' }}>
          <Crosshairs
            width={width}
            height={height}
            scrollTop={scrollTop}
            mouseX={mouseX}
            mouseY={mouseY}
          />
          <MAFTooltip
            model={model}
            mouseX={mouseX}
            origMouseX={isDragging ? dragStartX : undefined}
          />
        </div>
      ) : null}
      {(isDragging || showSelectionBox) &&
      dragStartX !== undefined &&
      dragEndX !== undefined ? (
        <div
          style={{
            position: 'absolute',
            left: Math.min(dragStartX, dragEndX),
            top: 0,
            width: Math.abs(dragEndX - dragStartX),
            height,
            backgroundColor: 'rgba(0, 0, 255, 0.2)',
            border: '1px solid rgba(0, 0, 255, 0.5)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <Menu
        open={Boolean(contextCoord)}
        onMenuItemClick={(_, callback) => {
          callback()
          setContextCoord(undefined)
        }}
        onClose={() => {
          setContextCoord(undefined)
        }}
        slotProps={{
          transition: {
            onExit: () => {
              setContextCoord(undefined)
            },
          },
        }}
        anchorReference="anchorPosition"
        anchorPosition={
          contextCoord
            ? { top: contextCoord.coord[1], left: contextCoord.coord[0] }
            : undefined
        }
        style={{
          zIndex: theme.zIndex.tooltip,
        }}
        menuItems={[
          {
            label: 'View subsequence',
            onClick: () => {
              if (!contextCoord) {
                return
              }

              const { refName, assemblyName } = view.displayedRegions[0]!
              const [s, e] = [
                Math.min(contextCoord.dragStartX, contextCoord.dragEndX),
                Math.max(contextCoord.dragStartX, contextCoord.dragEndX),
              ]

              if (isSessionModelWithWidgets(session)) {
                const widget = session.addWidget(
                  'MafSequenceWidget',
                  'mafSequence',
                  {
                    adapterConfig: model.adapterConfig,
                    samples: model.samples,
                    regions: [
                      {
                        refName,
                        start: view.pxToBp(s).coord - 1,
                        end: view.pxToBp(e).coord,
                        assemblyName,
                      },
                    ],
                    connectedViewId: view.id,
                  },
                )
                session.showWidget(widget)
              }
              setContextCoord(undefined)
            },
          },
        ]}
      />
    </div>
  )
})

export default LinearMafDisplay
