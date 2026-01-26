import React, { useEffect, useRef } from 'react'

import { useTheme } from '@mui/material'

import { CHAR_WIDTH, FONT, LABEL_PADDING, ROW_HEIGHT } from './constants'

import type { Sample } from '../LinearMafDisplay/types'

interface LabelsCanvasProps {
  samples: Sample[]
  maxLabelLength: number
}

export default function LabelsCanvas({
  samples,
  maxLabelLength,
}: LabelsCanvasProps) {
  const theme = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const labelWidth = maxLabelLength * CHAR_WIDTH + LABEL_PADDING
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
    canvas.width = labelWidth * dpr
    canvas.height = canvasHeight * dpr
    canvas.style.width = `${labelWidth}px`
    canvas.style.height = `${canvasHeight}px`
    ctx.scale(dpr, dpr)

    ctx.fillStyle = theme.palette.background.paper
    ctx.fillRect(0, 0, labelWidth, canvasHeight)

    ctx.font = FONT
    ctx.textBaseline = 'top'

    for (let rowIdx = 0; rowIdx < samples.length; rowIdx++) {
      const sample = samples[rowIdx]!
      const y = rowIdx * ROW_HEIGHT

      ctx.fillStyle = theme.palette.text.secondary
      ctx.fillText(sample.label ?? sample.id, 2, y + 2)
    }
  }, [samples, labelWidth, canvasHeight, theme])

  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}
