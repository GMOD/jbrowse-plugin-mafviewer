import React, { useState } from 'react'

import { Dialog } from '@jbrowse/core/ui'
import { Button, DialogActions, DialogContent, TextField } from '@mui/material'
import { observer } from 'mobx-react'
import { makeStyles } from 'tss-react/mui'

import { copyToClipboard } from '../../../util/clipboard'

const useStyles = makeStyles()({
  dialogContent: {
    width: '60em',
  },
  textAreaInput: {
    fontFamily: 'monospace',
    whiteSpace: 'pre',
    overflowX: 'auto',
  },
})

const InsertionSequenceDialog = observer(function ({
  onClose,
  model,
  insertionData,
}: {
  onClose: () => void
  model: {
    showAsUpperCase: boolean
  }
  insertionData: {
    sequence: string
    sampleLabel: string
    chr: string
    pos: number
  }
}) {
  const { classes } = useStyles()
  const [copied, setCopied] = useState(false)
  const { sequence, sampleLabel, chr, pos } = insertionData
  const { showAsUpperCase } = model
  const displaySequence = showAsUpperCase
    ? sequence.toUpperCase()
    : sequence.toLowerCase()

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Insertion Sequence (${sequence.length}bp)`}
      maxWidth="lg"
    >
      <DialogContent>
        <div style={{ marginBottom: 16 }}>
          <strong>Sample:</strong> {sampleLabel}
          <br />
          <strong>Position:</strong> {chr}:{pos.toLocaleString('en-US')}
          <br />
          <strong>Length:</strong> {sequence.length}bp
        </div>
        <TextField
          variant="outlined"
          multiline
          minRows={3}
          maxRows={10}
          className={classes.dialogContent}
          fullWidth
          value={displaySequence}
          slotProps={{
            input: {
              readOnly: true,
              classes: {
                input: classes.textAreaInput,
              },
            },
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            copyToClipboard(displaySequence, () => {
              setCopied(true)
              setTimeout(() => {
                setCopied(false)
              }, 1000)
            })
          }}
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </Button>
        <Button color="secondary" variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
})

export default InsertionSequenceDialog
