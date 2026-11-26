import { useState } from 'react'
import AiWriter from './AiWriter'
import AiSync from './AiSync'

/** Painel de IA ao lado do texto (como a Consulta). As duas abas ficam montadas para não perder a conversa. */
export default function AiPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'chat' | 'fichas'>('chat')
  return <div className="ai-panel">
    <div className="browser-bar">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>💬 Chat</button>
        <button role="tab" aria-selected={tab === 'fichas'} className={tab === 'fichas' ? 'on' : ''} onClick={() => setTab('fichas')}>🔄 Fichas e linha do tempo</button>
      </div>
      <span style={{ flex: 1 }} />
      <button type="button" title="Fechar IA" onClick={onClose}>✕</button>
    </div>
    <div style={{ display: tab === 'chat' ? 'contents' : 'none' }}><AiWriter /></div>
    <div style={{ display: tab === 'fichas' ? 'contents' : 'none' }}><AiSync /></div>
  </div>
}
