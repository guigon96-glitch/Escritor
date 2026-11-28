import { useState } from 'react'
import AiWriter from './AiWriter'
import AiSync from './AiSync'
import AiChapters from './AiChapters'
import { db, now } from '../lib/db'
import { useWS } from '../lib/ctx'
import { LazyText } from './ui'

const RULES_HINT = `Exemplos do que escrever aqui:
- Narrador: 3ª pessoa limitada, passado, foco na Lúcia.
- Tom: sombrio, cru, sem eufemismos; violência mostrada sem rodeios.
- Diálogos com travessão; nada de aspas.
- Frases curtas nas cenas de ação; longas e sensoriais nas de atmosfera.
- Evitar: clichês como "o sangue gelou", adjetivos em sequência, explicar o que o personagem sente.
- Vocabulário: português brasileiro, palavrões permitidos, gírias da época (anos 1890).
- Cole aqui um parágrafo seu como modelo de estilo.`

// Convenções do gênero: dizem à IA o que é escolha do livro, não erro.
export const GENRES: Record<string, string> = {
  'Grimdark / fantasia sombria': `Grimdark / fantasia sombria. Neste livro é ESPERADO e não é erro:
- Personagens cruéis, egoístas, frios ou moralmente ambíguos, inclusive mentores, autoridades e família. Ninguém precisa ter compaixão, punir o "certo" ou dar lição de moral.
- Violência gráfica, ferimentos graves e sofrimento mostrados sem consequência moral ou punição.
- Público, nobres e instituições que se divertem com a dor, apostam em lutas e abandonam os seus.
- Finais sem justiça, sem redenção e sem consolo; o mal pode vencer.
- Curandeiros, guardas e serviçais posicionados para o espetáculo, não para a segurança.
Não aponte nada disso como inconsistência, problema de caráter ou falta de realismo. Só aponte quando contradiz um fato do próprio texto ou das fichas.`,
  'Fantasia épica': 'Fantasia épica: mundo amplo, política e magia com regras. Avalie coerência com as regras do mundo que o próprio texto estabelece.',
  'Terror': 'Terror: medo, ameaça e finais sombrios são esperados; personagens podem agir de forma irracional sob pânico.',
  'Romance': 'Romance: o foco é a relação; avalie tensão emocional e química, não só o enredo.'
}

function Rules() {
  const { project } = useWS()
  const s = project.settings
  return <div className="ai-body">
    <p className="muted">Escreva como você quer que a IA escreva e revise este livro: estilo, tom, ponto de vista, regras e proibições. A IA recebe isto em toda conversa do Chat, e estas regras valem mais que as do modo escolhido. Fica salvo no livro e sincroniza com o Drive.</p>
    <LazyText value={s.aiRules || ''} rows={12} placeholder={RULES_HINT} onCommit={v => db.projects.update(project.id, { settings: { ...s, aiRules: v }, updatedAt: now() })} />
    <h4>Gênero e convenções</h4>
    <p className="muted">O que é normal neste tipo de livro. A análise de capítulos e o chat não apontam isso como erro. Escolha um modelo e edite à vontade.</p>
    <select aria-label="Modelo de gênero" value="" onChange={e => e.target.value && db.projects.update(project.id, { settings: { ...s, aiGenre: GENRES[e.target.value] }, updatedAt: now() })} style={{ width: 'auto' }}>
      <option value="">Usar um modelo…</option>
      {Object.keys(GENRES).map(g => <option key={g}>{g}</option>)}
    </select>
    <LazyText value={s.aiGenre || ''} rows={9} placeholder="Ex.: grimdark; crueldade e finais sem justiça são intencionais." onCommit={v => db.projects.update(project.id, { settings: { ...s, aiGenre: v }, updatedAt: now() })} />
  </div>
}

/** Painel de IA ao lado do texto (como a Consulta). As duas abas ficam montadas para não perder a conversa. */
export default function AiPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'chat' | 'fichas' | 'capitulos' | 'regras'>('chat')
  return <div className="ai-panel">
    <div className="browser-bar">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>💬 Chat</button>
        <button role="tab" aria-selected={tab === 'fichas'} className={tab === 'fichas' ? 'on' : ''} onClick={() => setTab('fichas')}>🔄 Fichas</button>
        <button role="tab" aria-selected={tab === 'capitulos'} className={tab === 'capitulos' ? 'on' : ''} onClick={() => setTab('capitulos')}>🔍 Capítulos</button>
        <button role="tab" aria-selected={tab === 'regras'} className={tab === 'regras' ? 'on' : ''} onClick={() => setTab('regras')}>📜 Regras</button>
      </div>
      <span style={{ flex: 1 }} />
      <button type="button" title="Fechar IA" onClick={onClose}>✕</button>
    </div>
    <div style={{ display: tab === 'chat' ? 'contents' : 'none' }}><AiWriter /></div>
    <div style={{ display: tab === 'fichas' ? 'contents' : 'none' }}><AiSync /></div>
    <div style={{ display: tab === 'capitulos' ? 'contents' : 'none' }}><AiChapters /></div>
    {tab === 'regras' && <Rules />}
  </div>
}
