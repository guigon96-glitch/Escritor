import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { connectDrive, disconnectDrive, ensureSession, getClientId, getClientSecret, native } from '../lib/sync'
import { Modal, toast } from './ui'

const WEB_ORIGIN = 'https://guigon96-glitch.github.io'

export default function DriveSetup({ onClose }: { onClose: () => void }) {
  const desktop = native()?.platform === 'desktop'
  const android = native()?.platform === 'android'
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    getClientId().then(setId)
    getClientSecret().then(setSecret)
    ensureSession().then(setConnected)
  }, [])

  const save = async () => {
    await db.kv.put({ key: 'googleClientId', value: id.trim() })
    if (desktop) await db.kv.put({ key: 'googleClientSecret', value: secret.trim() })
  }
  const connect = async () => {
    try {
      await save()
      if (desktop) toast('Abrindo o navegador para você entrar na conta Google…')
      await connectDrive('consent')
      setConnected(true)
      toast('Conectado ao Google Drive')
    } catch (e: any) { toast(e.message, 'err') }
  }

  return <Modal title="Google Drive" onClose={onClose} wide>
    <p>O Tinteiro guarda tudo neste aparelho e sincroniza com uma pasta <b>Tinteiro</b> no seu Google Drive. Assim o tablet e o computador ficam iguais, e uma cópia de segurança datada é criada por dia (as últimas 30 ficam em <b>Tinteiro – Backups</b>).</p>
    {!android && <label>Client ID do Google
      <input value={id} onChange={e => setId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" />
    </label>}
    {desktop && <label>Client secret (da mesma credencial)
      <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="GOCSPX-…" type="password" />
    </label>}
    <div className="row">
      <button className="primary" onClick={connect}>{android ? (connected ? 'Reconectar' : 'Entrar com a conta Google do tablet') : connected ? 'Reconectar' : 'Salvar e conectar'}</button>
      {connected && <button onClick={async () => { await disconnectDrive(); setConnected(false) }}>Desconectar</button>}
      <span className={connected ? 'ok-text' : 'muted'}>{connected ? '● conectado' : '○ desconectado'}</span>
    </div>
    <details open={!id}>
      <summary>Como obter as credenciais (uma vez só, ~5 minutos)</summary>
      <ol className="steps">
        <li>Acesse <b>console.cloud.google.com</b> e crie um projeto (ex.: “Tinteiro”).</li>
        <li>Em <b>APIs e serviços → Biblioteca</b>, ative a <b>Google Drive API</b>.</li>
        <li>Em <b>Tela de permissão OAuth</b>: tipo <b>Externo</b>, preencha nome do app e seu e‑mail. Depois, em <b>Público-alvo</b>, clique em <b>Publicar app</b> (“Em produção”) — senão o Google desconecta você a cada 7 dias. Na hora de entrar, se aparecer “O Google não verificou este app”, clique em <b>Avançado → Acessar Tinteiro</b> (é o seu próprio app).</li>
        {android ? <>
          <li>Em <b>Credenciais → Criar credenciais → ID do cliente OAuth</b>, escolha <b>Android</b>.</li>
          <li>Nome do pacote: <code>io.github.guigon96.tinteiro</code></li>
          <li>Impressão digital SHA-1: <code style={{ wordBreak: 'break-all' }}>62:12:B2:02:7B:85:C4:4A:F0:50:EF:2E:81:30:B5:AD:E0:95:6C:98</code></li>
          <li>Salve. Não precisa copiar nada para cá — o tablet usa a sua conta Google diretamente.</li>
        </> : desktop ? <>
          <li>Em <b>Credenciais → Criar credenciais → ID do cliente OAuth</b>, escolha <b>App para computador</b>.</li>
          <li>Copie o <b>ID do cliente</b> e a <b>Chave secreta do cliente</b> e cole acima.</li>
        </> : <>
          <li>Em <b>Credenciais → Criar credenciais → ID do cliente OAuth</b>, escolha <b>Aplicativo da Web</b>.</li>
          <li>Em <b>Origens JavaScript autorizadas</b>, adicione <code>{WEB_ORIGIN}</code>{window.location.origin !== WEB_ORIGIN && <> e <code>{window.location.origin}</code></>}.</li>
          <li>Copie o <b>ID do cliente</b> e cole acima.</li>
        </>}
      </ol>
      <p className="muted">Cada versão usa uma credencial: <b>Android</b> no tablet, <b>App para computador</b> no Windows e <b>Aplicativo da Web</b> no navegador — todas no mesmo projeto do Google, então enxergam os mesmos arquivos. O app só tem acesso aos arquivos que ele mesmo cria (permissão “drive.file”).</p>
    </details>
  </Modal>
}
