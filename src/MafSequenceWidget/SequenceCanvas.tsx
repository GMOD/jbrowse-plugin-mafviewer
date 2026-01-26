import React, { useCallback, useEffect, useRef } from 'react'

import { alpha, useTheme } from '@mui/material'

import { getBaseColor, getContrastText } from './baseColors'
import { CHAR_WIDTH, FONT, ROW_HEIGHT } from './constants'

import type { Sample } from '../LinearMafDisplay/types'

interface SequenceCanvasProps {
  samples: Sample[]
  sequences: string[]
  colorBackground: boolean
  hoveredCol?: number
  onHover: (
    col: number | undefined,
    row: number | undefined,
    clientX: number,
    clientY: number,
  ) => void
  onLeave: () => void
}

export default function SequenceCanvas({
  samples,
  sequences,
  colorBackground,
  hoveredCol,
  onHover,
  onLeave,
}: SequenceCanvasProps) {
  const theme = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const seqLength = sequences[0]?.length || 0
  const canvasWidth = seqLength * CHAR_WIDTH
  const canvasHeight = samples.length * ROW_HEIGHT

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = theme.palette.background.paper
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    ctx.font = FONT
    ctx.textBaseline = 'top'

    for (let rowIdx = 0; rowIdx < samples.length; rowIdx++) {
      const seq = sequences[rowIdx] || ''
      const y = rowIdx * ROW_HEIGHT

      for (let colIdx = 0; colIdx < seq.length; colIdx++) {
        const char = seq[colIdx]!
        const x = colIdx * CHAR_WIDTH

        if (colorBackground && char !== '-' && char !== '.') {
          ctx.fillStyle = getBaseColor(char, theme)
          ctx.fillRect(x, y, CHAR_WIDTH, ROW_HEIGHT)
        }

        if (colIdx === hoveredCol) {
          const highlight = (theme.palette as any).highlight as
            | { main: string }
            | undefined
          const highlightColor = highlight?.main ?? '#FFB11D'
          ctx.fillStyle = alpha(highlightColor, 0.5)
          ctx.fillRect(x, y, CHAR_WIDTH, ROW_HEIGHT)
        }

        if (char === '-') {
          ctx.fillStyle = theme.palette.grey[400]
        } else if (char === '.') {
          ctx.fillStyle = theme.palette.grey[500]
        } else if (colorBackground) {
          ctx.fillStyle = getContrastText(char, theme)
        } else {
          ctx.fillStyle = getBaseColor(char, theme)
        }
        ctx.fillText(char, x + 2, y + 2)
      }
    }
  }, [
    samples,
    sequences,
    canvasWidth,
    canvasHeight,
    hoveredCol,
    colorBackground,
    theme,
  ])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const col = Math.floor(x / CHAR_WIDTH)
      const row = Math.floor(y / ROW_HEIGHT)

      const validCol = col >= 0 && col < seqLength ? col : undefined
      const validRow = row >= 0 && row < samples.length ? row : undefined

      onHover(validCol, validRow, e.clientX, e.clientY)
    },
    [seqLength, samples.length, onHover],
  )

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={onLeave}
    />
  )
}
