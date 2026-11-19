// Tinteiro — app de desktop (Windows). Carrega os arquivos do app localmente (funciona offline)
// e faz o login do Google Drive pelo navegador do sistema (fluxo OAuth "app instalado" com PKCE).
const { app, BrowserWindow, protocol, net, ipcMain, shell, safeStorage, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { autoUpdater } = require('electron-updater')

const DIST = path.join(__dirname, '..', 'dist')
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

if (!app.requestSingleInstanceLock()) app.quit()

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 760,
    minHeight: 520,
    title: 'Tinteiro',
    backgroundColor: '#efe8da',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })
  win.webContents.session.setSpellCheckerLanguages(['pt-BR'])
  // Links externos abrem no navegador; a janela de impressão (PDF) abre dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 900, height: 1000 } }
  })
  // Menu de contexto com sugestões do corretor ortográfico.
  win.webContents.on('context-menu', (_e, p) => {
    const items = []
    for (const s of p.dictionarySuggestions.slice(0, 6)) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) })
    if (p.misspelledWord) items.push({ label: 'Adicionar ao dicionário', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' })
    if (p.isEditable) items.push({ role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' })
    else if (p.selectionText) items.push({ role: 'copy', label: 'Copiar' })
    if (items.length) Menu.buildFromTemplate(items).popup()
  })
  win.loadURL('app://tinteiro/index.html')
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  createWindow()
  setupUpdater()
})

/* ---------------- Atualização automática (GitHub Releases) ---------------- */
function sendUpdate(status, data = {}) {
  if (win && !win.isDestroyed()) win.webContents.send('update:status', { status, ...data })
}
function setupUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => sendUpdate('checking'))
  autoUpdater.on('update-available', i => sendUpdate('available', { version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes : '' }))
  autoUpdater.on('update-not-available', () => sendUpdate('none'))
  autoUpdater.on('download-progress', p => sendUpdate('downloading', { percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', i => sendUpdate('ready', { version: i.version }))
  autoUpdater.on('error', e => sendUpdate('error', { message: String(e && e.message || e) }))
  const check = () => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}) }
  setTimeout(check, 8000)
  setInterval(check, 4 * 60 * 60 * 1000)
}
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) { sendUpdate('none'); return false }
  try { await autoUpdater.checkForUpdates(); return true } catch (e) { sendUpdate('error', { message: e.message }); return false }
})
ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(false, true) })
ipcMain.handle('app:version', () => app.getVersion())

app.on('window-all-closed', () => app.quit())

/* ---------------- Google Drive (OAuth para app instalado) ---------------- */

const credFile = () => path.join(app.getPath('userData'), 'google.json')

function readCreds() {
  try {
    const raw = JSON.parse(fs.readFileSync(credFile(), 'utf8'))
    if (raw.refresh && safeStorage.isEncryptionAvailable()) raw.refresh = safeStorage.decryptString(Buffer.from(raw.refresh, 'base64'))
    return raw
  } catch { return null }
}

function writeCreds(c) {
  const out = { ...c }
  if (out.refresh && safeStorage.isEncryptionAvailable()) out.refresh = safeStorage.encryptString(out.refresh).toString('base64')
  fs.writeFileSync(credFile(), JSON.stringify(out))
}

async function tokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description || j.error || 'Falha no login do Google')
  return j
}

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function login(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(48))
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
    const state = b64url(crypto.randomBytes(16))
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1')
      if (u.pathname !== '/') { res.writeHead(404); res.end(); return }
      const page = msg => `<!doctype html><meta charset="utf-8"><title>Tinteiro</title><body style="font-family:system-ui;background:#efe8da;color:#2b2118;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1>${msg}</h1><p>Pode fechar esta aba e voltar ao Tinteiro.</p></div>`
      const finish = (err, val) => { clearTimeout(timer); server.close(); err ? reject(err) : resolve(val); if (win) { win.show(); win.focus() } }
      if (u.searchParams.get('state') !== state) { res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Pedido inválido')); return }
      const code = u.searchParams.get('code')
      if (!code) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Login cancelado')); finish(new Error('Login cancelado')); return }
      try {
        const port = server.address().port
        const t = await tokenRequest({ code, client_id: clientId, client_secret: clientSecret, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: `http://127.0.0.1:${port}` })
        const prev = readCreds() || {}
        writeCreds({ clientId, clientSecret, refresh: t.refresh_token || prev.refresh })
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('✓ Conectado ao Google Drive'))
        finish(null, { access_token: t.access_token, expires_in: t.expires_in })
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Erro: ' + e.message))
        finish(e)
      }
    })
    const timer = setTimeout(() => { server.close(); reject(new Error('Tempo esgotado esperando o login')) }, 5 * 60 * 1000)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: clientId, redirect_uri: `http://127.0.0.1:${port}`, response_type: 'code', scope: SCOPE,
        code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent'
      })
      shell.openExternal(url)
    })
  })
}

ipcMain.handle('drive:login', (_e, clientId, clientSecret) => {
  if (!clientId || !clientSecret) throw new Error('Preencha o Client ID e o Client secret (credencial do tipo "App para computador").')
  return login(clientId, clientSecret)
})

ipcMain.handle('drive:token', async () => {
  const c = readCreds()
  if (!c?.refresh) return null
  try {
    const t = await tokenRequest({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refresh, grant_type: 'refresh_token' })
    return { access_token: t.access_token, expires_in: t.expires_in }
  } catch { return null }
})

ipcMain.handle('drive:logout', async () => {
  const c = readCreds()
  if (c?.refresh) { try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(c.refresh), { method: 'POST' }) } catch { /* offline */ } }
  try { fs.unlinkSync(credFile()) } catch { /* none */ }
  return true
})
