import { createContext, useContext } from 'react'
import type { BNode, Project } from './db'

export type FolderView = 'corkboard' | 'outliner' | 'scrivenings' | 'kanban'
export type Tool = null | 'timeline' | 'relations' | 'stats' | 'compile' | 'search' | 'names' | 'settings' | 'backups' | 'grid' | 'structure' | 'style'
export const PANE_TOOLS: Tool[] = ['timeline', 'relations', 'stats', 'grid', 'structure', 'style']

export interface WS {
  project: Project
  nodes: BNode[]
  byId: Map<string, BNode>
  selectedId: string | null
  select: (id: string | null) => void
  folderView: FolderView
  setFolderView: (v: FolderView) => void
  tool: Tool
  setTool: (t: Tool) => void
  composition: boolean
  setComposition: (b: boolean) => void
  addNode: (parentId: string, kind: BNode['kind'], extra?: Partial<BNode>) => Promise<string>
  trashNode: (id: string) => Promise<void>
  recordWords: () => void
  openSearch: (q: string) => void
  searchQuery: string
}

export const WSContext = createContext<WS | null>(null)
export const useWS = () => {
  const w = useContext(WSContext)
  if (!w) throw new Error('WS context missing')
  return w
}
