import React, { useEffect, useState } from 'react'

import {
  CascadingMenuButton,
  ErrorMessage,
  LoadingEllipses,
} from '@jbrowse/core/ui'
import { getSession, useLocalStorage } from '@jbrowse/core/util'
import { Button, Paper, TextField } from '@mui/material'
import {
  ContentCopy as CopyIcon,
  Difference as DifferenceIcon,
  Download as DownloadIcon,
  KeyboardArrowDown,
  OpenInNew as OpenInNewIcon,
  PlaylistAdd as InsertionsIcon,
  Subject as AllLettersIcon,
  TableRows as TableRowsIcon,
} from '@mui/icons-material'
import { observer } from 'mobx-react'
import { makeStyles } from 'tss-react/mui'

import { copyToClipboard, downloadAsFile } from '../util/clipboard'

import type { MenuItem } from '@jbrowse/core/ui'
import type { MafSequenceWidgetModel } from './stateModelFactory'

function hasMsaViewPlugin() {
  // @ts-expect-error
  return globalThis.JBrowsePluginMsaView !== undefined
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
    overflowY: 'auto',
  },
  textField: {
    '& .MuiInputBase-root': {
      overflow: 'auto',
    },
    '& textarea': {
      overflow: 'auto !important',
    },
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

  const [showAllLetters, setShowAllLetters] = useLocalStorage(
    'mafSequenceWidget-showAllLetters',
    true,
  )
  const [includeInsertions, setIncludeInsertions] = useLocalStorage(
    'mafSequenceWidget-includeInsertions',
    false,
  )
  const [singleLineFormat, setSingleLineFormat] = useLocalStorage(
    'mafSequenceWidget-singleLineFormat',
    false,
  )
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

        let formattedSequence: string
        if (singleLineFormat) {
          const maxLabelLength = Math.max(...samples.map(s => s.label.length))
          formattedSequence = fastaSequence
            .map((r, idx) => {
              const label = samples[idx]!.label
              const padding = ' '.repeat(maxLabelLength - label.length + 2)
              return `>${label}${padding}${r}`
            })
            .join('\n')
        } else {
          formattedSequence = fastaSequence
            .map((r, idx) => `>${samples[idx]!.label}\n${r}`)
            .join('\n')
        }

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
    singleLineFormat,
    session,
  ])

  const sequenceTooLarge = sequence ? sequence.length > 5_000_000 : false

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
        <CascadingMenuButton
          menuItems={
            [
              {
                label: 'Show all letters',
                icon: AllLettersIcon,
                type: 'radio',
                checked: showAllLetters,
                onClick: () => {
                  setShowAllLetters(true)
                },
              },
              {
                label: 'Show only differences',
                icon: DifferenceIcon,
                type: 'radio',
                checked: !showAllLetters,
                onClick: () => {
                  setShowAllLetters(false)
                },
              },
              {
                label: 'Include insertions',
                icon: InsertionsIcon,
                type: 'checkbox',
                checked: includeInsertions,
                onClick: () => {
                  setIncludeInsertions(!includeInsertions)
                },
              },
              {
                label: 'Single line format',
                icon: TableRowsIcon,
                type: 'checkbox',
                checked: singleLineFormat,
                onClick: () => {
                  setSingleLineFormat(!singleLineFormat)
                },
              },
              { type: 'divider' },
              {
                label: 'Copy to clipboard',
                icon: CopyIcon,
                disabled: loading || !sequence,
                onClick: () => {
                  copyToClipboard(
                    sequence,
                    () => {
                      session.notify('Sequence copied to clipboard', 'info')
                    },
                    e => {
                      session.notifyError(`${e}`, e)
                    },
                  ).catch((e: unknown) => {
                    console.error(e)
                  })
                },
              },
              {
                label: 'Download as FASTA',
                icon: DownloadIcon,
                disabled: loading || !sequence,
                onClick: () => {
                  downloadAsFile(
                    sequence,
                    'sequence.fasta',
                    () => {
                      session.notify('Sequence downloaded', 'info')
                    },
                    e => {
                      session.notifyError(`${e}`, e)
                    },
                  )
                },
              },
              {
                label: 'Open in MSA View',
                icon: OpenInNewIcon,
                disabled: loading || !sequence || !msaViewAvailable,
                subLabel: !msaViewAvailable
                  ? 'Install jbrowse-plugin-msaview'
                  : undefined,
                onClick: () => {
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  ;(async () => {
                    try {
                      const region = regions[0]
                      const refSample = samples[0]

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
                          .map((r, idx) => `>${samples[idx]!.label}\n${r}`)
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
                        },
                      })
                    } catch (e) {
                      console.error(e)
                      session.notifyError(`${e}`, e)
                    }
                  })()
                },
              },
            ] as MenuItem[]
          }
          ButtonComponent={props => (
            <Button
              {...props}
              variant="contained"
              size="small"
              endIcon={<KeyboardArrowDown />}
            >
              Actions
            </Button>
          )}
        />
      </div>

      {error ? (
        <ErrorMessage error={error} />
      ) : (
        <>
          {loading ? (
            <LoadingEllipses />
          ) : (
            <TextField
              variant="outlined"
              multiline
              minRows={5}
              maxRows={15}
              disabled={sequenceTooLarge}
              fullWidth
              className={classes.textField}
              value={
                sequenceTooLarge
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
          )}
        </>
      )}
    </Paper>
  )
})

export default MafSequenceWidget
