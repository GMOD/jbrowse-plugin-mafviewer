// Re-export Sample from central types
export type { Sample } from '../types'

export interface NodeWithIds {
  id: string
  name: string
  children?: NodeWithIds[]
  length?: number
  noTree?: boolean
}

export interface NodeWithIdsAndLength {
  id: string
  name: string
  children?: NodeWithIdsAndLength[]
  noTree?: boolean
  length: number
}
