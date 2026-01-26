import { describe, expect, test } from 'vitest'

import {
  parseAssemblyAndChr,
  parseAssemblyAndChrSimple,
  selectReferenceSequence,
} from './parseAssemblyName'

describe('parseAssemblyAndChr (MafTabix format)', () => {
  test('no dot - entire string is assembly name', () => {
    const result = parseAssemblyAndChr('hg38')
    expect(result).toEqual({
      assemblyName: 'hg38',
      chr: '',
    })
  })

  test('single dot - simple assembly.chr format', () => {
    const result = parseAssemblyAndChr('hg38.chr1')
    expect(result).toEqual({
      assemblyName: 'hg38',
      chr: 'chr1',
    })
  })

  test('single dot - assembly.refName format with non-chr name', () => {
    const result = parseAssemblyAndChr('mm10.scaffold_1')
    expect(result).toEqual({
      assemblyName: 'mm10',
      chr: 'scaffold_1',
    })
  })

  test('two dots with numeric version - assembly.version.chr format', () => {
    const result = parseAssemblyAndChr('hg38.1.chr1')
    expect(result).toEqual({
      assemblyName: 'hg38.1',
      chr: 'chr1',
    })
  })

  test('two dots with multi-digit numeric version', () => {
    const result = parseAssemblyAndChr('GRCh38.123.chrX')
    expect(result).toEqual({
      assemblyName: 'GRCh38.123',
      chr: 'chrX',
    })
  })

  test('two dots with non-numeric middle - assembly.chr.more format', () => {
    const result = parseAssemblyAndChr('mm10.chr1.random')
    expect(result).toEqual({
      assemblyName: 'mm10',
      chr: 'chr1.random',
    })
  })

  test('two dots with non-numeric middle - chr_Un type naming', () => {
    const result = parseAssemblyAndChr('hg38.chrUn_gl000220')
    expect(result).toEqual({
      assemblyName: 'hg38',
      chr: 'chrUn_gl000220',
    })
  })

  test('three dots with numeric version - assembly.version.chr.more format', () => {
    const result = parseAssemblyAndChr('GRCh38.1.chr1.random')
    expect(result).toEqual({
      assemblyName: 'GRCh38.1',
      chr: 'chr1.random',
    })
  })

  test('empty string', () => {
    const result = parseAssemblyAndChr('')
    expect(result).toEqual({
      assemblyName: '',
      chr: '',
    })
  })

  test('just a dot', () => {
    const result = parseAssemblyAndChr('.')
    expect(result).toEqual({
      assemblyName: '',
      chr: '',
    })
  })

  test('leading dot', () => {
    const result = parseAssemblyAndChr('.chr1')
    expect(result).toEqual({
      assemblyName: '',
      chr: 'chr1',
    })
  })

  test('trailing dot', () => {
    const result = parseAssemblyAndChr('hg38.')
    expect(result).toEqual({
      assemblyName: 'hg38',
      chr: '',
    })
  })

  test('real world example - UCSC style', () => {
    const result = parseAssemblyAndChr('hg19.chr6_ssto_hap7')
    expect(result).toEqual({
      assemblyName: 'hg19',
      chr: 'chr6_ssto_hap7',
    })
  })

  test('real world example - Ensembl style with numeric', () => {
    const result = parseAssemblyAndChr('GRCh37.1.1')
    expect(result).toEqual({
      assemblyName: 'GRCh37.1',
      chr: '1',
    })
  })
})

describe('parseAssemblyAndChrSimple (BigMaf format)', () => {
  test('no dot - entire string is assembly name', () => {
    const result = parseAssemblyAndChrSimple('hg38')
    expect(result).toEqual({
      assemblyName: 'hg38',
      chr: '',
    })
  })

  test('single dot - simple org.chr format', () => {
    const result = parseAssemblyAndChrSimple('hg38.chr1')
    expect(result).toEqual({
      assemblyName: 'hg38',
      chr: 'chr1',
    })
  })

  test('multiple dots - only splits on first dot', () => {
    const result = parseAssemblyAndChrSimple('mm10.chr1.random')
    expect(result).toEqual({
      assemblyName: 'mm10',
      chr: 'chr1.random',
    })
  })

  test('empty string', () => {
    const result = parseAssemblyAndChrSimple('')
    expect(result).toEqual({
      assemblyName: '',
      chr: '',
    })
  })
})

describe('selectReferenceSequence', () => {
  const alignments = {
    hg38: { seq: 'ACGTACGT' },
    mm10: { seq: 'TGCATGCA' },
    panTro6: { seq: 'GGGGGGGG' },
  }

  test('uses refAssemblyName when provided and exists', () => {
    const result = selectReferenceSequence(
      alignments,
      'mm10',
      'hg38',
      'panTro6',
    )
    expect(result).toBe('TGCATGCA')
  })

  test('falls back to queryAssemblyName when refAssemblyName is empty', () => {
    const result = selectReferenceSequence(alignments, '', 'hg38', 'panTro6')
    expect(result).toBe('ACGTACGT')
  })

  test('falls back to queryAssemblyName when refAssemblyName is undefined', () => {
    const result = selectReferenceSequence(
      alignments,
      undefined,
      'hg38',
      'panTro6',
    )
    expect(result).toBe('ACGTACGT')
  })

  test('falls back to firstAssemblyNameFound when queryAssemblyName does not match', () => {
    const result = selectReferenceSequence(
      alignments,
      undefined,
      'galGal6', // not in alignments
      'hg38',
    )
    expect(result).toBe('ACGTACGT')
  })

  test('falls back to firstAssemblyNameFound when both config values are empty', () => {
    const result = selectReferenceSequence(alignments, '', '', 'panTro6')
    expect(result).toBe('GGGGGGGG')
  })

  test('returns undefined when refAssemblyName does not exist in alignments', () => {
    const result = selectReferenceSequence(
      alignments,
      'nonexistent',
      undefined,
      undefined,
    )
    expect(result).toBeUndefined()
  })

  test('returns undefined when no matches and all params undefined', () => {
    const result = selectReferenceSequence(
      alignments,
      undefined,
      undefined,
      undefined,
    )
    expect(result).toBeUndefined()
  })

  test('returns undefined for empty alignments object', () => {
    const result = selectReferenceSequence({}, 'hg38', 'mm10', 'panTro6')
    expect(result).toBeUndefined()
  })

  test('skips refAssemblyName when it does not exist and uses queryAssemblyName', () => {
    const result = selectReferenceSequence(
      alignments,
      'galGal6', // not in alignments
      'hg38',
      'panTro6',
    )
    expect(result).toBe('ACGTACGT')
  })

  test('skips both refAssemblyName and queryAssemblyName when neither exists', () => {
    const result = selectReferenceSequence(
      alignments,
      'galGal6', // not in alignments
      'rn6', // not in alignments
      'mm10',
    )
    expect(result).toBe('TGCATGCA')
  })
})

describe('assembly name lookup integration scenarios', () => {
  test('refAssemblyName config takes precedence over query.assemblyName', () => {
    const alignments = {
      hg38: { seq: 'REFERENCE_SEQ' },
      mm10: { seq: 'QUERY_SEQ' },
    }
    const result = selectReferenceSequence(alignments, 'hg38', 'mm10', 'mm10')
    expect(result).toBe('REFERENCE_SEQ')
  })

  test('query.assemblyName works when refAssemblyName not configured', () => {
    const alignments = {
      hg38: { seq: 'QUERY_SEQ' },
      mm10: { seq: 'OTHER_SEQ' },
    }
    const result = selectReferenceSequence(alignments, '', 'hg38', 'mm10')
    expect(result).toBe('QUERY_SEQ')
  })

  test('firstAssemblyNameFound is used as last resort fallback', () => {
    const alignments = {
      panTro6: { seq: 'FIRST_FOUND' },
      mm10: { seq: 'OTHER_SEQ' },
    }
    // When query assemblyName does not match any alignment
    const result = selectReferenceSequence(alignments, '', 'hg38', 'panTro6')
    expect(result).toBe('FIRST_FOUND')
  })
})

describe('real-world MAF format parsing', () => {
  test('ce10.chrI from UCSC 7-way alignment', () => {
    const result = parseAssemblyAndChr('ce10.chrI')
    expect(result).toEqual({
      assemblyName: 'ce10',
      chr: 'chrI',
    })
  })

  test('caePb3.Scfld02_18 scaffold format', () => {
    const result = parseAssemblyAndChr('caePb3.Scfld02_18')
    expect(result).toEqual({
      assemblyName: 'caePb3',
      chr: 'Scfld02_18',
    })
  })

  test('caeRem4.Crem_Contig16 contig format', () => {
    const result = parseAssemblyAndChr('caeRem4.Crem_Contig16')
    expect(result).toEqual({
      assemblyName: 'caeRem4',
      chr: 'Crem_Contig16',
    })
  })

  test('cb4.chrI C. briggsae format', () => {
    const result = parseAssemblyAndChr('cb4.chrI')
    expect(result).toEqual({
      assemblyName: 'cb4',
      chr: 'chrI',
    })
  })

  test('multiple assemblies from same MAF block produce correct lookup', () => {
    const alignments = {
      ce10: { seq: 'TCTTTTAGTATTTGTAA' },
      caePb3: { seq: 'tcTTTTCGC-TTTATAA' },
    }

    // When querying with ce10 assembly
    expect(selectReferenceSequence(alignments, '', 'ce10', 'ce10')).toBe(
      'TCTTTTAGTATTTGTAA',
    )

    // When refAssemblyName is configured to override
    expect(selectReferenceSequence(alignments, 'caePb3', 'ce10', 'ce10')).toBe(
      'tcTTTTCGC-TTTATAA',
    )
  })
})

describe('refName renaming compatibility', () => {
  test('parseAssemblyAndChr extracts chr correctly for refName alias matching', () => {
    // When a file uses "chrI" but assembly has alias "I" -> "chrI"
    // The chr portion extracted here should match what renameRegionsIfNeeded expects
    const { chr } = parseAssemblyAndChr('ce10.chrI')
    expect(chr).toBe('chrI')
  })

  test('parseAssemblyAndChrSimple extracts chr correctly for refName alias matching', () => {
    const { chr } = parseAssemblyAndChrSimple('ce10.chrI')
    expect(chr).toBe('chrI')
  })

  test('assembly name is isolated from chr for assembly-based lookups', () => {
    // The assembly name (e.g., "ce10") is used to look up reference sequence
    // It should not include the chr portion
    const { assemblyName } = parseAssemblyAndChr('ce10.chrI')
    expect(assemblyName).toBe('ce10')
  })
})
