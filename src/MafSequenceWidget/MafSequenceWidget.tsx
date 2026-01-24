import React, { useEffect, useState } from 'react'

import { ErrorMessage, LoadingEllipses } from '@jbrowse/core/ui'
import { getSession } from '@jbrowse/core/util'
import {
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material'
import { observer } from 'mobx-react'
import { makeStyles } from 'tss-react/mui'

import { copyToClipboard, downloadAsFile } from '../util/clipboard'

import type { MafSequenceWidgetModel } from './stateModelFactory'

function hasMsaViewPlugin() {
  // @ts-expect-error
  return typeof window.JBrowsePluginMsaView !== 'undefined'
}

const useStyles = makeStyles()(theme => ({
  root: {
    padding: theme.spacing(2),
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  textAreaInput: {
    fontFamily: 'monospace',
    whiteSpace: 'pre',
    overflowX: 'auto',
  },
  buttons: {
    display: 'flex',
    gap: theme.spacing(1),
    marginLeft: 'auto',
  },
}))

const MafSequenceWidget = observer(function MafSequenceWidget({
  model,
}: {
  model: MafSequenceWidgetModel
}) {
  const { classes } = useStyles()
  const session = getSession(model)
  const { adapterConfig, samples, regions, connectedViewId } = model

  const [showAllLetters, setShowAllLetters] = useState(true)
  const [includeInsertions, setIncludeInsertions] = useState(false)
  const [sequence, setSequence] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  const msaViewAvailable = hasMsaViewPlugin()

  useEffect(() => {
    if (!adapterConfig || !samples || !regions) {
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
      try {
        setLoading(true)
        setError(undefined)

        const { rpcManager } = session

        const fastaSequence = (await rpcManager.call(
          'MafSequenceWidget',
          'MafGetSequences',
          {
            sessionId: 'MafSequenceWidget',
            adapterConfig,
            samples,
            showAllLetters,
            includeInsertions,
            regions,
          },
        )) as string[]

        const formattedSequence = fastaSequence
          .map((r, idx) => `>${samples[idx]!.label}\n${r}`)
          .join('\n')

        setSequence(formattedSequence)
      } catch (e) {
        console.error(e)
        setError(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [
    adapterConfig,
    samples,
    regions,
    showAllLetters,
    includeInsertions,
    session,
  ])

  const sequenceTooLarge = sequence ? sequence.length > 1_000_000 : false

  if (!adapterConfig || !samples || !regions) {
    return (
      <Paper className={classes.root}>
        <div>No sequence data available</div>
      </Paper>
    )
  }

  return (
    <Paper className={classes.root}>
      <div className={classes.controls}>
        <ToggleButtonGroup
          value={showAllLetters}
          exclusive
          size="small"
          onChange={(_event, newDisplayMode) => {
            if (newDisplayMode !== null) {
              setShowAllLetters(newDisplayMode)
            }
          }}
        >
          <ToggleButton value={true}>Show All Letters</ToggleButton>
          <ToggleButton value={false}>Show Only Differences</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel
          control={
            <Checkbox
              checked={includeInsertions}
              onChange={event => {
                setIncludeInsertions(event.target.checked)
              }}
            />
          }
          label="Include insertions"
        />
        <div className={classes.buttons}>
          <Button
            variant="contained"
            color="primary"
            size="small"
            disabled={loading || !sequence}
            onClick={() => {
              copyToClipboard(
                sequence,
                () => session.notify('Sequence copied to clipboard', 'info'),
                e => session.notifyError(`${e}`, e),
              )
            }}
          >
            Copy
          </Button>
          <Button
            variant="contained"
            color="secondary"
            size="small"
            disabled={loading || !sequence}
            onClick={() => {
              downloadAsFile(
                sequence,
                'sequence.fasta',
                () => session.notify('Sequence downloaded', 'info'),
                e => session.notifyError(`${e}`, e),
              )
            }}
          >
            Download
          </Button>
          {msaViewAvailable ? (
            <Button
              variant="contained"
              size="small"
              disabled={loading || !sequence}
              onClick={async () => {
                try {
                  const region = regions?.[0]
                  const refSample = samples?.[0]

                  // Always fetch with showAllLetters=true for MSA view
                  // (dots don't work well with MSA color schemes)
                  let msaSequence = sequence
                  if (!showAllLetters) {
                    const { rpcManager } = session
                    const fastaSequence = (await rpcManager.call(
                      'MafSequenceWidget',
                      'MafGetSequences',
                      {
                        sessionId: 'MafSequenceWidget',
                        adapterConfig,
                        samples,
                        showAllLetters: true,
                        includeInsertions,
                        regions,
                      },
                    )) as string[]
                    msaSequence = fastaSequence
                      .map((r, idx) => `>${samples![idx]!.label}\n${r}`)
                      .join('\n')
                  }

                  session.addView('MsaView', {
                    type: 'MsaView',
                    displayName: region
                      ? `MAF MSA - ${region.refName}:${region.start + 1}-${region.end}`
                      : 'MAF MSA',
                    connectedViewId,
                    mafRegion: region,
                    querySeqName: refSample?.label,
                    init: {
                      msaData: msaSequence,
                      colorSchemeName: 'percent_identity',
                    },
                  })
                } catch (e) {
                  console.error(e)
                  session.notifyError(`${e}`, e)
                }
              }}
            >
              Open in MSA View
            </Button>
          ) : (
            <Tooltip title="Install jbrowse-plugin-msaview to enable this feature">
              <span>
                <Button variant="contained" size="small" disabled>
                  Open in MSA View
                </Button>
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <>
          {loading ? <LoadingEllipses /> : null}
          <TextField
            variant="outlined"
            multiline
            minRows={5}
            maxRows={15}
            disabled={sequenceTooLarge}
            fullWidth
            value={
              loading
                ? 'Loading...'
                : sequenceTooLarge
                  ? 'Reference sequence too large to display, use the Download button'
                  : sequence
            }
            slotProps={{
              input: {
                readOnly: true,
                classes: {
                  input: classes.textAreaInput,
                },
              },
            }}
          />
        </>
      )}
    </Paper>
  )
})

export default MafSequenceWidget
