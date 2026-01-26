import { describe, expect, test } from 'vitest'

import { parseRowInstructions } from './rowInstructions'

describe('parseRowInstructions', () => {
  test('parses single insert instruction', () => {
    const result = parseRowInstructions('i 0 hg38.chr1 1000 + 248956422')
    expect(result).toEqual([
      {
        type: 'i',
        row: 0,
        sequenceName: 'hg38.chr1',
        start: 1000,
        strand: 1,
        sequenceLength: 248956422,
      },
    ])
  })

  test('parses insert with negative strand', () => {
    const result = parseRowInstructions('i 0 hg38.chr1 1000 - 248956422')
    expect(result).toEqual([
      {
        type: 'i',
        row: 0,
        sequenceName: 'hg38.chr1',
        start: 1000,
        strand: -1,
        sequenceLength: 248956422,
      },
    ])
  })

  test('parses multiple insert instructions', () => {
    const result = parseRowInstructions(
      'i 0 hg38.chr1 1000 + 248956422 i 1 mm10.chr1 500 + 195471971',
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      type: 'i',
      row: 0,
      sequenceName: 'hg38.chr1',
    })
    expect(result[1]).toMatchObject({
      type: 'i',
      row: 1,
      sequenceName: 'mm10.chr1',
    })
  })

  test('parses substitute instruction', () => {
    const result = parseRowInstructions('s 0 hg38.chr2 5000 + 242193529')
    expect(result).toEqual([
      {
        type: 's',
        row: 0,
        sequenceName: 'hg38.chr2',
        start: 5000,
        strand: 1,
        sequenceLength: 242193529,
      },
    ])
  })

  test('parses delete instruction', () => {
    const result = parseRowInstructions('d 2')
    expect(result).toEqual([
      {
        type: 'd',
        row: 2,
      },
    ])
  })

  test('parses gap instruction', () => {
    const result = parseRowInstructions('g 3 100')
    expect(result).toEqual([
      {
        type: 'g',
        row: 3,
        gapLength: 100,
      },
    ])
  })

  test('parses gap with substring instruction', () => {
    const result = parseRowInstructions('G 3 ACGTACGT')
    expect(result).toEqual([
      {
        type: 'G',
        row: 3,
        gapSubstring: 'ACGTACGT',
      },
    ])
  })

  test('parses mixed instructions from evolverMammals example', () => {
    const result = parseRowInstructions('g 3 1 g 7 1 g 8 1')
    expect(result).toEqual([
      { type: 'g', row: 3, gapLength: 1 },
      { type: 'g', row: 7, gapLength: 1 },
      { type: 'g', row: 8, gapLength: 1 },
    ])
  })

  test('parses delete followed by gap instructions', () => {
    const result = parseRowInstructions('d 3 d 6 d 6 g 5 1')
    expect(result).toEqual([
      { type: 'd', row: 3 },
      { type: 'd', row: 6 },
      { type: 'd', row: 6 },
      { type: 'g', row: 5, gapLength: 1 },
    ])
  })

  test('parses complex line with inserts and gaps', () => {
    const result = parseRowInstructions(
      'i 3 mr.mrrefChr1 178357 + 182340 g 6 6 i 7 simMouse_chr6.simMouse.chr6 630720 + 636262 i 8 simRat_chr6.simRat.chr6 642233 + 647215',
    )
    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({ type: 'i', row: 3 })
    expect(result[1]).toMatchObject({ type: 'g', row: 6, gapLength: 6 })
    expect(result[2]).toMatchObject({ type: 'i', row: 7 })
    expect(result[3]).toMatchObject({ type: 'i', row: 8 })
  })
})
