// Re-export Sample from central types
export type { Sample } from '../types'

export interface NodeWithIds {
  id: string
  name: string
  children?: NodeWithIds[]
  length?: number
  noTree?: boolean
}
