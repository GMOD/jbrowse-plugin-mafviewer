import { Feature, SimpleFeature } from '@jbrowse/core/util'
import { expect, test } from 'vitest'

import { processFeaturesToFasta } from './fastaUtils'
import { encodeSequence } from './sequenceEncoding'

function makeMap(features: Feature[]) {
  return new Map(features.map(f => [f.id(), f]))
}
const mockFeature = new SimpleFeature({
  uniqueId: '123',
  refName: 'abc',
  start: 100,
  end: 110,
  seq: encodeSequence('ACGTACGTAC'),
  alignments: {
    assembly1: {
      chr: 'chr1',
      start: 100,
      seq: encodeSequence('ACGTACGTAC'),
      strand: 1,
    },
    assembly2: {
      chr: 'chr2',
      start: 200,
      seq: encodeSequence('AC-TTCGTAC'),
      strand: 1,
    },
  },
})
test('no showAllLetters', () => {
  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 105,
        assemblyName: 'assembly1',
      },
    ],
  })
  expect(result).toMatchSnapshot()
})

test('showAllLetters', () => {
  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    showAllLetters: true,
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 105,
        assemblyName: 'assembly1',
      },
    ],
  })
  expect(result).toMatchSnapshot()
})

test('gap in assembly1', () => {
  const mockFeature = new SimpleFeature({
    uniqueId: '123',
    refName: 'abc',
    start: 100,
    end: 110,
    seq: encodeSequence('AC-TACGTAC'),
    alignments: {
      assembly1: {
        chr: 'chr1',
        start: 100,
        seq: encodeSequence('AC-TACGTAC'),
        strand: 1,
      },
      assembly2: {
        chr: 'chr2',
        start: 200,
        seq: encodeSequence('ACGTTCGTAC'),
        strand: 1,
      },
    },
  })

  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 105,
        assemblyName: 'assembly1',
      },
    ],
  })
  expect(result).toMatchSnapshot()
})

test('includeInsertions - single insertion in one sample', () => {
  // Reference seq has a gap (insertion in assembly2)
  // seq:       AC--GTAC (reference with gap = insertion in aligned seq)
  // assembly1: AC--GTAC (no insertion, matches reference gap)
  // assembly2: ACTTGTAC (has TT insertion)
  const mockFeature = new SimpleFeature({
    uniqueId: '123',
    refName: 'abc',
    start: 100,
    end: 106, // 6 bp reference (AC GTAC without the gap)
    seq: encodeSequence('AC--GTAC'),
    alignments: {
      assembly1: {
        chr: 'chr1',
        start: 100,
        seq: encodeSequence('AC--GTAC'),
        strand: 1,
      },
      assembly2: {
        chr: 'chr2',
        start: 200,
        seq: encodeSequence('ACTTGTAC'),
        strand: 1,
      },
    },
  })

  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    includeInsertions: true,
    showAllLetters: true,
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 106,
        assemblyName: 'assembly1',
      },
    ],
  })
  // assembly1 should have gaps where the insertion is
  // assembly2 should have the TT insertion
  expect(result).toMatchSnapshot()
})

test('includeInsertions - insertions in multiple samples with different lengths', () => {
  // Reference has gap, different samples have different insertion lengths
  // seq:       AC---GTAC (reference with 3-bp gap)
  // assembly1: AC-T-GTAC (has T insertion, 1 bp)
  // assembly2: ACTTTGTAC (has TTT insertion, 3 bp)
  const mockFeature = new SimpleFeature({
    uniqueId: '123',
    refName: 'abc',
    start: 100,
    end: 106,
    seq: encodeSequence('AC---GTAC'),
    alignments: {
      assembly1: {
        chr: 'chr1',
        start: 100,
        seq: encodeSequence('AC-T-GTAC'),
        strand: 1,
      },
      assembly2: {
        chr: 'chr2',
        start: 200,
        seq: encodeSequence('ACTTTGTAC'),
        strand: 1,
      },
    },
  })

  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    includeInsertions: true,
    showAllLetters: true,
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 106,
        assemblyName: 'assembly1',
      },
    ],
  })
  // assembly1 should have T-- (padded to max insertion length 3)
  // assembly2 should have TTT
  expect(result).toMatchSnapshot()
})

test('includeInsertions - insertions at multiple positions', () => {
  // Reference has gaps at two positions
  // seq:       A-CG-TAC
  // assembly1: ATCGGTAC (T insertion at pos 1, G insertion at pos 4)
  // assembly2: A-CG-TAC (no insertions)
  const mockFeature = new SimpleFeature({
    uniqueId: '123',
    refName: 'abc',
    start: 100,
    end: 106,
    seq: encodeSequence('A-CG-TAC'),
    alignments: {
      assembly1: {
        chr: 'chr1',
        start: 100,
        seq: encodeSequence('ATCGGTAC'),
        strand: 1,
      },
      assembly2: {
        chr: 'chr2',
        start: 200,
        seq: encodeSequence('A-CG-TAC'),
        strand: 1,
      },
    },
  })

  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    includeInsertions: true,
    showAllLetters: true,
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 106,
        assemblyName: 'assembly1',
      },
    ],
  })
  expect(result).toMatchSnapshot()
})

test('includeInsertions=false ignores insertions', () => {
  const mockFeature = new SimpleFeature({
    uniqueId: '123',
    refName: 'abc',
    start: 100,
    end: 106,
    seq: encodeSequence('AC--GTAC'),
    alignments: {
      assembly1: {
        chr: 'chr1',
        start: 100,
        seq: encodeSequence('AC--GTAC'),
        strand: 1,
      },
      assembly2: {
        chr: 'chr2',
        start: 200,
        seq: encodeSequence('ACTTGTAC'),
        strand: 1,
      },
    },
  })

  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    includeInsertions: false,
    showAllLetters: true,
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 106,
        assemblyName: 'assembly1',
      },
    ],
  })
  // Without insertions, both should be 6 characters (no expansion)
  expect(result[0]).toHaveLength(6)
  expect(result[1]).toHaveLength(6)
  expect(result).toMatchSnapshot()
})

test('includeInsertions with no insertions present', () => {
  // No gaps in reference = no insertions
  const result = processFeaturesToFasta({
    features: makeMap([mockFeature]),
    samples: [{ id: 'assembly1' }, { id: 'assembly2' }],
    includeInsertions: true,
    showAllLetters: true,
    regions: [
      {
        refName: 'chr1',
        start: 100,
        end: 105,
        assemblyName: 'assembly1',
      },
    ],
  })
  // Should behave same as without includeInsertions since there are none
  expect(result).toMatchSnapshot()
})
