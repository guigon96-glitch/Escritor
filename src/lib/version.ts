/** Versão embutida no build (definida pelo GitHub Actions). Em desenvolvimento: 0.0.0. */
export const APP_VERSION: string = (import.meta.env.VITE_APP_VERSION as string) || '0.0.0'
export const REPO = 'guigon96-glitch/Escritor'

export interface ReleaseInfo { version: string; tag: string; notes: string; url: string; apkUrl?: string; exeUrl?: string; date: string }

/** "v0.3.12" / "0.3.12" → [0,3,12]; "versao-7" → [0,0,7] (versões antigas). */
export function parseVersion(v: string): number[] {
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/)
  if (m) return [+m[1], +m[2], +m[3]]
  const n = v.match(/(\d+)$/)
  return n ? [0, 0, +n[1]] : [0, 0, 0]
}

export function isNewer(remote: string, local: string): boolean {
  const a = parseVersion(remote), b = parseVersion(local)
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] }
  return false
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) return null
  const j = await r.json()
  const asset = (re: RegExp) => (j.assets || []).find((a: any) => re.test(a.name))?.browser_download_url
  return {
    version: parseVersion(j.tag_name).join('.'),
    tag: j.tag_name,
    notes: j.body || '',
    url: j.html_url,
    apkUrl: asset(/\.apk$/i),
    exeUrl: asset(/\.exe$/i),
    date: j.published_at
  }
}
