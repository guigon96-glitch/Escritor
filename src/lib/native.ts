import { Capacitor, registerPlugin } from '@capacitor/core'

/** True dentro do APK Android (Capacitor). */
export const isAndroid = () => Capacitor.getPlatform() === 'android'

interface DriveAuthPlugin {
  authorize(opts: { interactive: boolean }): Promise<{ access_token: string; expires_in: number }>
}

/** Instala a ponte nativa usada por sync.ts (mesma interface do app do Windows). */
export function setupNative() {
  if (!isAndroid()) return
  document.documentElement.classList.add('native', 'android')
  const DriveAuth = registerPlugin<DriveAuthPlugin>('DriveAuth')
  window.tinteiroNative = {
    platform: 'android',
    driveLogin: () => DriveAuth.authorize({ interactive: true }),
    driveToken: () => DriveAuth.authorize({ interactive: false }).catch(() => null),
    driveLogout: async () => true
  }

  // Botão "voltar" do Android: fecha menus/janelas/modo foco antes de minimizar o app.
  import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', () => {
      const open = document.querySelector('.modal-back, .menu, .scrim, .composing, .findbar')
      if (open) {
        const scrim = document.querySelector<HTMLElement>('.scrim')
        if (scrim && !document.querySelector('.modal-back, .menu')) scrim.click()
        else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      } else App.minimizeApp()
    })
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

/** No Android não existe "download": grava o arquivo e abre o menu Compartilhar (Drive, Arquivos, e-mail…). */
export async function saveNative(name: string, blob: Blob) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const res = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache })
  await Share.share({ title: name, files: [res.uri], dialogTitle: 'Salvar ou enviar' })
}
