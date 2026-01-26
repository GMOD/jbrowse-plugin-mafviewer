import type { Theme } from '@mui/material'

interface BasePalette {
  A: { main: string; contrastText: string }
  C: { main: string; contrastText: string }
  G: { main: string; contrastText: string }
  T: { main: string; contrastText: string }
}

function getBases(theme: Theme): BasePalette | undefined {
  // @ts-expect-error bases is a custom palette extension
  return theme.palette.bases as BasePalette | undefined
}

export function getBaseColor(base: string, theme: Theme): string {
  const bases = getBases(theme)

  switch (base.toUpperCase()) {
    case 'A':
      return bases?.A?.main ?? '#6dbf6d'
    case 'C':
      return bases?.C?.main ?? '#6c6cff'
    case 'G':
      return bases?.G?.main ?? '#ffb347'
    case 'T':
    case 'U':
      return bases?.T?.main ?? '#ff6b6b'
    default:
      return theme.palette.grey[500]
  }
}

export function getContrastText(base: string, theme: Theme): string {
  const bases = getBases(theme)

  switch (base.toUpperCase()) {
    case 'A':
      return bases?.A?.contrastText ?? '#fff'
    case 'C':
      return bases?.C?.contrastText ?? '#fff'
    case 'G':
      return bases?.G?.contrastText ?? '#000'
    case 'T':
    case 'U':
      return bases?.T?.contrastText ?? '#fff'
    default:
      return theme.palette.common.white
  }
}
