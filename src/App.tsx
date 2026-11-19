import { useEffect, useState } from 'react'
import { db } from './lib/db'
import ProjectList from './components/ProjectList'
import Workspace from './components/Workspace'
import { Toaster } from './components/ui'
import { UpdateBanner } from './components/Updates'

export default function App() {
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    db.kv.get('lastProject').then(async kv => {
      const id = kv?.value as string | undefined
      if (id && (await db.projects.get(id))) setProjectId(id)
      else setProjectId(null)
    })
    navigator.storage?.persist?.()
  }, [])

  const open = (id: string | null) => {
    setProjectId(id)
    db.kv.put({ key: 'lastProject', value: id })
  }

  if (projectId === undefined) return null
  return <>
    {projectId ? <Workspace key={projectId} projectId={projectId} onExit={() => open(null)} /> : <ProjectList onOpen={open} />}
    <UpdateBanner />
    <Toaster />
  </>
}
