import { describe, expect, test } from 'vitest'
import { toArray } from 'rxjs/operators'
import { firstValueFrom } from 'rxjs'

import { parseRowInstructions } from './rowInstructions'
import { countNonGapBases, parseLineByLine } from './util'

// Test the core parsing logic with sample TAF data
describe('TAF parsing', () => {
  test('parses simple TAF block', () => {
    // Sample TAF data (simplified from real file)
    const tafData = `#taf version:1
ACGT ; i 0 hg38.chr1 100 + 1000 i 1 mm10.chr1 200 + 2000
ACGT
ACGT
`
    const buffer = new TextEncoder().encode(tafData)

    interface RowState {
      sequenceName: string
      start: number
      strand: number
      sequenceLength: number
      seq: string
    }

    const rows: RowState[] = []

    parseLineByLine(buffer, line => {
      if (line && !line.startsWith('#')) {
        const semicolonIndex = line.indexOf(' ; ')
        let basesAndTags: string
        let rowInstructions: string | undefined

        if (semicolonIndex !== -1) {
          basesAndTags = line.slice(0, semicolonIndex)
          rowInstructions = line.slice(semicolonIndex + 3)
        } else {
          basesAndTags = line
          rowInstructions = undefined
        }

        if (rowInstructions) {
          const atIndex = rowInstructions.indexOf(' @')
          const coordPart =
            atIndex !== -1 ? rowInstructions.slice(0, atIndex) : rowInstructions
          const instructions = parseRowInstructions(coordPart)

          for (const ins of instructions) {
            if (ins.type === 'i') {
              rows.splice(ins.row, 0, {
                sequenceName: ins.sequenceName,
                start: ins.start,
                strand: ins.strand,
                sequenceLength: ins.sequenceLength,
                seq: '',
              })
            }
          }
        }

        const basesStr = basesAndTags.trim()
        for (let i = 0; i < basesStr.length; i++) {
          if (rows[i]) {
            rows[i].seq += basesStr[i]
          }
        }
      }
      return undefined
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      sequenceName: 'hg38.chr1',
      start: 100,
      strand: 1,
      sequenceLength: 1000,
    })
    expect(rows[0]!.seq).toBe('AAA')
    expect(rows[1]).toMatchObject({
      sequenceName: 'mm10.chr1',
      start: 200,
      strand: 1,
      sequenceLength: 2000,
    })
    expect(rows[1]!.seq).toBe('CCC')
  })

  test('handles gap operations', () => {
    const tafData = `#taf version:1
AC ; i 0 hg38.chr1 100 + 1000 i 1 mm10.chr1 200 + 2000
AC
AC ; g 1 50
`
    const buffer = new TextEncoder().encode(tafData)

    interface RowState {
      sequenceName: string
      start: number
      strand: number
      sequenceLength: number
      seq: string
    }

    const rows: RowState[] = []

    parseLineByLine(buffer, line => {
      if (line && !line.startsWith('#')) {
        const semicolonIndex = line.indexOf(' ; ')
        let basesAndTags: string
        let rowInstructions: string | undefined

        if (semicolonIndex !== -1) {
          basesAndTags = line.slice(0, semicolonIndex)
          rowInstructions = line.slice(semicolonIndex + 3)
        } else {
          basesAndTags = line
          rowInstructions = undefined
        }

        if (rowInstructions) {
          const atIndex = rowInstructions.indexOf(' @')
          const coordPart =
            atIndex !== -1 ? rowInstructions.slice(0, atIndex) : rowInstructions
          const instructions = parseRowInstructions(coordPart)

          for (const ins of instructions) {
            if (ins.type === 'i') {
              rows.splice(ins.row, 0, {
                sequenceName: ins.sequenceName,
                start: ins.start,
                strand: ins.strand,
                sequenceLength: ins.sequenceLength,
                seq: '',
              })
            } else if (ins.type === 'g') {
              const row = rows[ins.row]
              if (row) {
                row.start += ins.gapLength
              }
            }
          }
        }

        const basesStr = basesAndTags.trim()
        for (let i = 0; i < basesStr.length; i++) {
          if (rows[i]) {
            rows[i].seq += basesStr[i]
          }
        }
      }
      return undefined
    })

    expect(rows).toHaveLength(2)
    // Row 0 should still have start 100
    expect(rows[0]!.start).toBe(100)
    // Row 1 should have start 200 + 50 = 250 after gap operation
    expect(rows[1]!.start).toBe(250)
  })

  test('handles delete operations', () => {
    const tafData = `#taf version:1
ABC ; i 0 hg38.chr1 100 + 1000 i 1 mm10.chr1 200 + 2000 i 2 rn6.chr1 300 + 3000
ABC
AB ; d 2
`
    const buffer = new TextEncoder().encode(tafData)

    interface RowState {
      sequenceName: string
      start: number
      strand: number
      sequenceLength: number
      seq: string
    }

    const rows: RowState[] = []

    parseLineByLine(buffer, line => {
      if (line && !line.startsWith('#')) {
        const semicolonIndex = line.indexOf(' ; ')
        let basesAndTags: string
        let rowInstructions: string | undefined

        if (semicolonIndex !== -1) {
          basesAndTags = line.slice(0, semicolonIndex)
          rowInstructions = line.slice(semicolonIndex + 3)
        } else {
          basesAndTags = line
          rowInstructions = undefined
        }

        if (rowInstructions) {
          const atIndex = rowInstructions.indexOf(' @')
          const coordPart =
            atIndex !== -1 ? rowInstructions.slice(0, atIndex) : rowInstructions
          const instructions = parseRowInstructions(coordPart)

          for (const ins of instructions) {
            if (ins.type === 'i') {
              rows.splice(ins.row, 0, {
                sequenceName: ins.sequenceName,
                start: ins.start,
                strand: ins.strand,
                sequenceLength: ins.sequenceLength,
                seq: '',
              })
            } else if (ins.type === 'd') {
              rows.splice(ins.row, 1)
            }
          }
        }

        const basesStr = basesAndTags.trim()
        for (let i = 0; i < basesStr.length; i++) {
          if (rows[i]) {
            rows[i].seq += basesStr[i]
          }
        }
      }
      return undefined
    })

    // After delete, should only have 2 rows
    expect(rows).toHaveLength(2)
    expect(rows[0]!.seq).toBe('AAA')
    expect(rows[1]!.seq).toBe('BBB')
  })

  test('calculates non-gap length correctly', () => {
    expect(countNonGapBases('ACGT')).toBe(4)
    expect(countNonGapBases('AC-GT')).toBe(4)
    expect(countNonGapBases('--ACGT--')).toBe(4)
    expect(countNonGapBases('----')).toBe(0)
  })

  test('parses real TAF format from ce10 7-way', () => {
    // Real data from the ce10 chrI TAF file
    const tafData = `#taf version:1 scoring:roast.v3.3
Tt ; i 0 ce10.chrI 3725 + 15072423 i 1 caePb3.Scfld02_18 203084 + 1480539
Cc
TT
TT
TT
TT
AC
GG
TC
`
    const buffer = new TextEncoder().encode(tafData)

    interface RowState {
      sequenceName: string
      start: number
      strand: number
      sequenceLength: number
      seq: string
    }

    const rows: RowState[] = []

    parseLineByLine(buffer, line => {
      if (line && !line.startsWith('#')) {
        const semicolonIndex = line.indexOf(' ; ')
        let basesAndTags: string
        let rowInstructions: string | undefined

        if (semicolonIndex !== -1) {
          basesAndTags = line.slice(0, semicolonIndex)
          rowInstructions = line.slice(semicolonIndex + 3)
        } else {
          basesAndTags = line
          rowInstructions = undefined
        }

        if (rowInstructions) {
          const atIndex = rowInstructions.indexOf(' @')
          const coordPart =
            atIndex !== -1 ? rowInstructions.slice(0, atIndex) : rowInstructions
          const instructions = parseRowInstructions(coordPart)

          for (const ins of instructions) {
            if (ins.type === 'i') {
              rows.splice(ins.row, 0, {
                sequenceName: ins.sequenceName,
                start: ins.start,
                strand: ins.strand,
                sequenceLength: ins.sequenceLength,
                seq: '',
              })
            }
          }
        }

        const basesStr = basesAndTags.trim()
        for (let i = 0; i < basesStr.length; i++) {
          if (rows[i]) {
            rows[i].seq += basesStr[i]
          }
        }
      }
      return undefined
    })

    expect(rows).toHaveLength(2)

    // Row 0: ce10.chrI
    // Column-by-column: Tt, Cc, TT, TT, TT, TT, AC, GG, TC
    // Row 0 gets: T, C, T, T, T, T, A, G, T = "TCTTTAGT"
    expect(rows[0]).toMatchObject({
      sequenceName: 'ce10.chrI',
      start: 3725,
      strand: 1,
      sequenceLength: 15072423,
    })
    expect(rows[0]!.seq).toBe('TCTTTTAGT')

    // Row 1: caePb3.Scfld02_18
    // Row 1 gets: t, c, T, T, T, T, C, G, C = "tcTTTTCGC"
    expect(rows[1]).toMatchObject({
      sequenceName: 'caePb3.Scfld02_18',
      start: 203084,
      strand: 1,
      sequenceLength: 1480539,
    })
    expect(rows[1]!.seq).toBe('tcTTTTCGC')
  })
})
