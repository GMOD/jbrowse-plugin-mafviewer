import React, { useEffect, useRef, useMemo, useCallback } from 'react'

import { observer } from 'mobx-react'
import { makeStyles } from 'tss-react/mui'

import { buildColToGenomePos, findRefSampleIndex } from './colToGenomePos'

import type { MafSequenceWidgetModel } from './stateModelFactory'

const CHAR_WIDTH = 12
const ROW_HEIGHT = 16
const FONT = 'bold 12px monospace'
const LABEL_PADDING = 10

const useStyles = makeStyles()(theme => ({
  container: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'auto',
    maxHeight: 400,
    backgroundColor: theme.palette.background.paper,
  },
  canvas: {
    display: 'block',
  },
}))

interface SequenceDisplayProps {
  model: MafSequenceWidgetModel
  sequences: string[]
  singleLineFormat: boolean
  includeInsertions: boolean
  colorBackground: boolean
}

const SequenceDisplay = observer(function SequenceDisplay({
  model,
  sequences,
  colorBackground,
}: SequenceDisplayProps) {
  const { classes } = useStyles()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { samples, regions } = model
  const [hoveredCol, setHoveredCol] = React.useState<number | undefined>()

  const maxLabelLength = useMemo(
    () => (samples ? Math.max(...samples.map(s => s.label.length)) : 0),
    [samples],
  )

  const labelWidth = maxLabelLength * CHAR_WIDTH + LABEL_PADDING

  // Build mapping from sequence position to genomic position
  // Use the reference assembly's sequence (matching region.assemblyName), not just sequences[0]
  const colToGenomePos = useMemo(() => {
    if (!regions) {
      return []
    }
    const region = regions[0]
    if (!region) {
      return []
    }

    const refIdx = findRefSampleIndex(samples, region.assemblyName)
    const refSequence = sequences[refIdx] || ''
    return buildColToGenomePos(refSequence, region.start)
  }, [sequences, regions, samples])

  const seqLength = sequences[0]?.length || 0
  const canvasWidth = labelWidth + seqLength * CHAR_WIDTH
  const canvasHeight = (samples?.length || 0) * ROW_HEIGHT

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !samples) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    // Set up canvas for high DPI
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`
    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    ctx.font = FONT
    ctx.textBaseline = 'top'

    // Draw each row
    for (let rowIdx = 0; rowIdx < samples.length; rowIdx++) {
      const sample = samples[rowIdx]!
      const seq = sequences[rowIdx] || ''
      const y = rowIdx * ROW_HEIGHT

      // Draw label
      ctx.fillStyle = '#666'
      ctx.fillText(sample.label, 2, y + 2)

      // Draw sequence
      for (let colIdx = 0; colIdx < seq.length; colIdx++) {
        const char = seq[colIdx]!
        const x = labelWidth + colIdx * CHAR_WIDTH

        // Draw background color if enabled
        if (colorBackground && char !== '-' && char !== '.') {
          ctx.fillStyle = getBaseColor(char)
          ctx.fillRect(x, y, CHAR_WIDTH, ROW_HEIGHT)
        }

        // Highlight hovered column (on top of base color)
        if (colIdx === hoveredCol) {
          ctx.fillStyle = 'rgba(255, 200, 0, 0.5)'
          ctx.fillRect(x, y, CHAR_WIDTH, ROW_HEIGHT)
        }

        // Draw text
        if (char === '-') {
          ctx.fillStyle = '#ccc'
        } else if (char === '.') {
          ctx.fillStyle = '#999'
        } else if (colorBackground) {
          ctx.fillStyle = getContrastText(char)
        } else {
          ctx.fillStyle = getBaseColor(char)
        }
        ctx.fillText(char, x + 2, y + 2)
      }
    }
  }, [samples, sequences, canvasWidth, canvasHeight, labelWidth, hoveredCol, colorBackground])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || !regions) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const col = Math.floor((x - labelWidth) / CHAR_WIDTH)

      if (col >= 0 && col < seqLength) {
        setHoveredCol(col)

        const genomicPos = colToGenomePos[col]
        const region = regions[0]
        if (genomicPos !== undefined && region) {
          model.setHoverHighlight({
            refName: region.refName,
            start: genomicPos,
            end: genomicPos + 1,
            assemblyName: region.assemblyName,
          })
        } else {
          model.setHoverHighlight(undefined)
        }
      } else {
        setHoveredCol(undefined)
        model.setHoverHighlight(undefined)
      }
    },
    [labelWidth, seqLength, colToGenomePos, model, regions],
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredCol(undefined)
    model.setHoverHighlight(undefined)
  }, [model])

  if (!samples || !regions || sequences.length === 0) {
    return <div>No sequence data</div>
  }

  return (
    <div className={classes.container}>
      <canvas
        ref={canvasRef}
        className={classes.canvas}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  )
})

function getBaseColor(base: string): string {
  switch (base.toUpperCase()) {
    case 'A':
      return '#6dbf6d' // green
    case 'C':
      return '#6c6cff' // blue
    case 'G':
      return '#ffb347' // orange
    case 'T':
    case 'U':
      return '#ff6b6b' // red
    default:
      return '#888'
  }
}

function getContrastText(base: string): string {
  switch (base.toUpperCase()) {
    case 'A':
    case 'C':
    case 'T':
    case 'U':
      return '#fff'
    case 'G':
      return '#000'
    default:
      return '#fff'
  }
}

export default SequenceDisplay
