import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { connectDrive, disconnectDrive, getClientId, isConnected } from '../lib/sync'
import { Modal, toast } from './ui'

export default function DriveSetup({ onClose }: { onClose: () => void }) {
  const [id, setId] = useState('')
  const [connected, setConnected] = useState(isConnected())
  useEffect(() => { getClientId().then(setId) }, [])

  const save = async () => { await db.kv.put({ key: 'googleClientId', value: id.trim() }); toast('Client ID salvo') }
  const connect = async () => {
    try { await save(); await connectDrive('consent'); setConnected(true); toast('Conectado ao Google Drive') } catch (e: any) { toast(e.message, 'err') }
  }

  return <Modal title="Google Drive" onClose={onClose} wide>
    <p>O Tinteiro guarda tudo neste aparelho e sincroniza com uma pasta <b>Tinteiro</b> no seu Google Drive. Assim o tablet e o computador ficam iguais, e uma cópia de segurança datada é criada por dia (as últimas 30 ficam guardadas em <b>Tinteiro – Backups</b>).</p>
    <label>Client ID do Google (OAuth)
      <input value={id} onChange={e => setId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" />
    </label>
    <div className="row">
      <button className="primary" onClick={connect}>{connected ? 'Reconectar' : 'Salvar e conectar'}</button>
      {connected && <button onClick={async () => { await disconnectDrive(); setConnected(false) }}>Desconectar</button>}
      <span className={connected ? 'ok-text' : 'muted'}>{connected ? '● conectado' : '○ desconectado'}</span>
    </div>
    <details>
      <summary>Como obter o Client ID (uma vez só, ~5 minutos)</summary>
      <ol className="steps">
        <li>Acesse <b>console.cloud.google.com</b> e crie um projeto (ex.: “Tinteiro”).</li>
        <li>Em <b>APIs e serviços → Biblioteca</b>, ative a <b>Google Drive API</b>.</li>
        <li>Em <b>Tela de permissão OAuth</b>: tipo <b>Externo</b>, preencha o nome do app e seu e‑mail, e adicione seu próprio e‑mail em <b>Usuários de teste</b>.</li>
        <li>Em <b>Credenciais → Criar credenciais → ID do cliente OAuth</b>, escolha <b>Aplicativo da Web</b>.</li>
        <li>Em <b>Origens JavaScript autorizadas</b>, adicione: <code>{window.location.origin}</code></li>
        <li>Copie o <b>ID do cliente</b> e cole acima. Use o mesmo ID no tablet e no computador.</li>
      </ol>
      <p className="muted">O app só pede acesso aos arquivos que ele mesmo cria (permissão “drive.file”) — ele não enxerga o resto do seu Drive.</p>
    </details>
  </Modal>
}
