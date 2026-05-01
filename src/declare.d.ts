declare module '*.json'

declare module '@mui/material/styles/createPalette' {
  interface Palette {
    bases?: Record<string, { main: string; contrastText: string }>
    highlight?: { main: string }
  }
}
