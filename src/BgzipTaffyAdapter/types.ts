import VirtualOffset from './virtualOffset'

export interface OrganismRecord {
  chr: string
  start: number
  srcSize: number
  strand: number
  seq: string
}

export interface ByteRange {
  chrStart: number
  virtualOffset: VirtualOffset
}

export type IndexData = Record<string, ByteRange[]>
