import React, { useCallback, useEffect, useMemo, useRef } from 'react'

import { observer } from 'mobx-react'
import { makeStyles } from 'tss-react/mui'

import LabelsCanvas from './LabelsCanvas'
import SequenceCanvas from './SequenceCanvas'
import SequenceTooltip from './SequenceTooltip'
import { buildColToGenomePos, findRefSampleIndex } from './colToGenomePos'

import type { MafSequenceWidgetModel } from './stateModelFactory'

const useStyles = makeStyles()(theme => ({
  container: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    maxHeight: 400,
    backgroundColor: theme.palette.background.paper,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  labelsContainer: {
    flexShrink: 0,
    borderRight: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    overflowY: 'auto',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': {
      display: 'none',
    },
  },
  sequenceContainer: {
    flex: 1,
    overflow: 'auto',
  },
}))

interface SequenceDisplayProps {
  model: MafSequenceWidgetModel
  sequences: string[]
  singleLineFormat: boolean
  includeInsertions: boolean
  colorBackground: boolean
  showSampleNames: boolean
}

const SequenceDisplay = observer(function SequenceDisplay({
  model,
  sequences,
  colorBackground,
  showSampleNames,
}: SequenceDisplayProps) {
  const { classes } = useStyles()
  const labelsContainerRef = useRef<HTMLDivElement>(null)
  const seqContainerRef = useRef<HTMLDivElement>(null)
  const { samples, regions } = model

  const [hoveredCol, setHoveredCol] = React.useState<number | undefined>()
  const [hoveredRow, setHoveredRow] = React.useState<number | undefined>()
  const [tooltipPos, setTooltipPos] = React.useState<
    { x: number; y: number } | undefined
  >()

  const maxLabelLength = useMemo(
    () =>
      samples ? Math.max(...samples.map(s => (s.label ?? s.id).length)) : 0,
    [samples],
  )

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

  // Sync vertical scroll between labels and sequences
  useEffect(() => {
    const labelsContainer = labelsContainerRef.current
    const seqContainer = seqContainerRef.current
    if (!labelsContainer || !seqContainer) {
      return
    }

    const handleSeqScroll = () => {
      labelsContainer.scrollTop = seqContainer.scrollTop
    }

    seqContainer.addEventListener('scroll', handleSeqScroll)
    return () => {
      seqContainer.removeEventListener('scroll', handleSeqScroll)
    }
  }, [])

  const handleHover = useCallback(
    (
      col: number | undefined,
      row: number | undefined,
      clientX: number,
      clientY: number,
    ) => {
      if (!regions) {
        return
      }

      setHoveredCol(col)
      setHoveredRow(row)
      setTooltipPos({ x: clientX, y: clientY })

      if (col !== undefined) {
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
        model.setHoverHighlight(undefined)
      }
    },
    [colToGenomePos, model, regions],
  )

  const handleLeave = useCallback(() => {
    setHoveredCol(undefined)
    setHoveredRow(undefined)
    setTooltipPos(undefined)
    model.setHoverHighlight(undefined)
  }, [model])

  if (!samples || !regions || sequences.length === 0) {
    return <div>No sequence data</div>
  }

  const hoveredSample =
    hoveredRow !== undefined ? samples[hoveredRow] : undefined
  const hoveredChar =
    hoveredRow !== undefined && hoveredCol !== undefined
      ? sequences[hoveredRow]?.[hoveredCol]
      : undefined
  const genomicPos =
    hoveredCol !== undefined ? colToGenomePos[hoveredCol] : undefined

  return (
    <div className={classes.container}>
      {showSampleNames && (
        <div ref={labelsContainerRef} className={classes.labelsContainer}>
          <LabelsCanvas samples={samples} maxLabelLength={maxLabelLength} />
        </div>
      )}
      <div ref={seqContainerRef} className={classes.sequenceContainer}>
        <SequenceCanvas
          samples={samples}
          sequences={sequences}
          colorBackground={colorBackground}
          hoveredCol={hoveredCol}
          onHover={handleHover}
          onLeave={handleLeave}
        />
      </div>
      {tooltipPos && hoveredSample && (
        <SequenceTooltip
          x={tooltipPos.x}
          y={tooltipPos.y}
          sample={hoveredSample}
          base={hoveredChar}
          genomicPos={genomicPos}
        />
      )}
    </div>
  )
})

export default SequenceDisplay
