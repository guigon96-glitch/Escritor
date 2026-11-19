import { useSyncExternalStore } from 'react'
import { db } from './db'
import { APP_VERSION, fetchLatestRelease, isNewer, type ReleaseInfo } from './version'

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
export interface UpdateState { status: UpdateStatus; version?: string; percent?: number; message?: string; release?: ReleaseInfo; manual?: boolean; dismissed?: boolean }

let state: UpdateState = { status: 'idle' }
const subs = new Set<() => void>()
const set = (patch: Partial<UpdateState>) => { state = { ...state, ...patch }; subs.forEach(f => f()) }
export const useUpdate = () => useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => state)

const native = () => window.tinteiroNative
export const platformName = () => native()?.platform === 'desktop' ? 'Windows' : native()?.platform === 'android' ? 'Android' : 'Navegador'

export async function currentVersion(): Promise<string> {
  const n = native()
  if (n?.platform === 'desktop' && n.appVersion) return n.appVersion()
  return APP_VERSION
}

/** Busca novidades da versão mais recente (para mostrar o que mudou). */
async function loadRelease() {
  try { const r = await fetchLatestRelease(); if (r) set({ release: r }); return r } catch { return null }
}

export async function checkForUpdates(manual = false) {
  const n = native()
  set({ manual, dismissed: false })
  if (n?.platform === 'desktop' && n.updateCheck) {
    set({ status: 'checking' })
    loadRelease()
    await n.updateCheck()
    return
  }
  set({ status: 'checking' })
  const r = await loadRelease()
  if (!r) { set({ status: 'error', message: 'Sem conexão com o GitHub.' }); return }
  const mine = await currentVersion()
  if (isNewer(r.version, mine)) {
    const skipped = (await db.kv.get('skipVersion'))?.value
    set({ status: 'available', version: r.version, dismissed: !manual && skipped === r.version })
  } else set({ status: 'none', version: r.version })
}

export async function installUpdate() {
  const n = native()
  if (n?.platform === 'desktop' && n.updateInstall) { await n.updateInstall(); return }
  const url = state.release?.apkUrl || state.release?.url
  if (!url) return
  if (n?.platform === 'android') {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } else window.open(state.release?.url, '_blank')
}

export async function dismissUpdate() {
  if (state.version) await db.kv.put({ key: 'skipVersion', value: state.version })
  set({ dismissed: true })
}

let started = false
export function startUpdateWatcher() {
  if (started) return
  started = true
  const n = native()
  if (n?.platform === 'desktop' && n.onUpdate) {
    n.onUpdate((d: any) => set({ status: d.status, version: d.version ?? state.version, percent: d.percent, message: d.message }))
    loadRelease()
    return
  }
  if (n?.platform === 'android') {
    setTimeout(() => checkForUpdates(false), 6000)
    setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000)
  }
}
