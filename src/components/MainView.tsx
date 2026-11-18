import { useWS } from '../lib/ctx'
import { roleOf } from '../lib/util'
import Editor from './Editor'
import FolderViews from './FolderViews'
import CharacterSheet from './CharacterSheet'
import WorldEntry from './WorldEntry'
import MapView from './MapView'
import Gallery from './Gallery'

export default function MainView() {
  const { selectedId, byId, nodes } = useWS()
  const n = selectedId ? byId.get(selectedId) : undefined
  if (!n || n.deleted) return <div className="empty">Selecione um item na estrutura à esquerda.</div>
  const role = roleOf(nodes, n)
  if (n.kind === 'text' || n.kind === 'note' || n.kind === 'research') return <Editor key={n.id} node={n} />
  if (n.kind === 'character') return <CharacterSheet key={n.id} node={n} />
  if (n.kind === 'world') return <WorldEntry key={n.id} node={n} />
  if (n.kind === 'map') return <MapView key={n.id} node={n} />
  if ((role === 'characters' || role === 'world') && (n.kind === 'root' || n.kind === 'folder')) return <Gallery key={n.id} node={n} />
  return <FolderViews key={n.id} node={n} />
}
