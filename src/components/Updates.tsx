import { useEffect, useState } from 'react'
import { checkForUpdates, currentVersion, dismissUpdate, installUpdate, platformName, startUpdateWatcher, useUpdate } from '../lib/updates'
import { fmtDate } from '../lib/util'

export function ReleaseNotes({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).filter(l => !/^#+\s*Como instalar/i.test(l))
  const items = lines.filter(l => /^[-*•]\s/.test(l)).map(l => l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, ''))
  if (!items.length) return null
  return <ul className="release-notes">{items.slice(0, 12).map((l, i) => <li key={i}>{l}</li>)}</ul>
}

/** Faixa no topo avisando que há versão nova (Windows e Android). */
export function UpdateBanner() {
  const u = useUpdate()
  const [open, setOpen] = useState(false)
  useEffect(() => { startUpdateWatcher() }, [])
  if (u.dismissed) return null
  const desktop = window.tinteiroNative?.platform === 'desktop'
  if (u.status === 'available' && !desktop) return <div className="update-banner">
    <span>✨ Nova versão <b>{u.version}</b> disponível.</span>
    {u.release?.notes && <button className="linkish" onClick={() => setOpen(o => !o)}>{open ? 'Ocultar novidades' : 'Ver novidades'}</button>}
    <button className="primary" onClick={installUpdate}>Baixar e instalar</button>
    <button className="icon" title="Lembrar depois" onClick={dismissUpdate}>✕</button>
    {open && u.release && <div className="update-notes"><ReleaseNotes text={u.release.notes} /></div>}
  </div>
  if (desktop && (u.status === 'available' || u.status === 'downloading')) return <div className="update-banner subtle">
    <span>⬇ Baixando a versão {u.version || 'nova'}… {u.percent != null ? `${u.percent}%` : ''}</span>
  </div>
  if (desktop && u.status === 'ready') return <div className="update-banner">
    <span>✨ A versão <b>{u.version}</b> está pronta.</span>
    <button className="primary" onClick={installUpdate}>Reiniciar e atualizar</button>
    <button className="icon" title="Atualizar ao fechar o app" onClick={dismissUpdate}>✕</button>
  </div>
  if (u.manual && u.status === 'error') return <div className="update-banner err"><span>Não foi possível verificar atualizações: {u.message}</span><button className="icon" onClick={dismissUpdate}>✕</button></div>
  return null
}

/** Seção "Sobre e atualizações" (Ajustes e tela inicial). */
export function AboutUpdates() {
  const u = useUpdate()
  const [ver, setVer] = useState('')
  useEffect(() => { currentVersion().then(setVer) }, [])
  const busy = u.status === 'checking' || u.status === 'downloading'
  const msg: Record<string, string> = {
    idle: '', checking: 'Verificando…', none: 'Você está na versão mais recente.', available: `Versão ${u.version} disponível.`,
    downloading: `Baixando ${u.percent ?? 0}%…`, ready: `Versão ${u.version} pronta para instalar.`, error: `Erro: ${u.message}`
  }
  return <div className="about">
    <p><b>Tinteiro {ver}</b> · {platformName()}</p>
    <div className="row wrap">
      <button onClick={() => checkForUpdates(true)} disabled={busy}>🔄 Procurar atualizações</button>
      {(u.status === 'available' || u.status === 'ready') && <button className="primary" onClick={installUpdate}>{window.tinteiroNative?.platform === 'desktop' ? 'Reiniciar e atualizar' : 'Baixar e instalar'}</button>}
      <span className="muted">{msg[u.status]}</span>
    </div>
    {u.release && <details>
      <summary>Novidades da versão {u.release.version} {u.release.date ? `(${fmtDate(Date.parse(u.release.date))})` : ''}</summary>
      <ReleaseNotes text={u.release.notes} />
      <a href={u.release.url} target="_blank" rel="noreferrer">Ver no GitHub</a>
    </details>}
    {window.tinteiroNative?.platform === 'android' && <p className="muted small">No Android, o APK novo é baixado pelo navegador; toque nele e confirme “Atualizar”. Seus livros continuam no aparelho.</p>}
  </div>
}
