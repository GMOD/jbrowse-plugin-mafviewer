import VirtualOffset from './virtualOffset'
import type { EncodedSequence } from '../util/sequenceEncoding'

export interface OrganismRecord {
  chr: string
  start: number
  srcSize: number
  strand: number
  seq: EncodedSequence
}

export interface ByteRange {
  chrStart: number
  virtualOffset: VirtualOffset
}

export type IndexData = Record<string, ByteRange[]>
