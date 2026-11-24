/** Temas prontos. `swatch` = [fundo, papel, texto, destaque] para a pré-visualização. */
export const THEMES = [
  { key: 'sepia', name: 'Sépia', swatch: ['#efe8da', '#fbf8f1', '#2b2118', '#8b5e34'] },
  { key: 'claro', name: 'Claro', swatch: ['#f1f2f4', '#ffffff', '#1d1f23', '#3d5afe'] },
  { key: 'papiro', name: 'Papiro', swatch: ['#d9c69c', '#eadbb4', '#3b2a17', '#8a4f1d'], texture: true },
  { key: 'papiro-escuro', name: 'Papiro noturno', swatch: ['#1c150d', '#2b2015', '#ead9b6', '#d19a4f'], texture: true },
  { key: 'floresta', name: 'Floresta', swatch: ['#e3eadf', '#f6f8f2', '#1f2b20', '#3d7a4a'] },
  { key: 'escuro', name: 'Escuro', swatch: ['#15161a', '#202127', '#e6e3dc', '#d1a067'] },
  { key: 'noite', name: 'Noite de Lyra', swatch: ['#0e1320', '#1a2133', '#dde4f0', '#6ea8ff'] },
  { key: 'grimdark', name: 'Grimdark', swatch: ['#110f0f', '#1b1717', '#e6dcd6', '#b23a3a'] },
  { key: 'contraste', name: 'Alto contraste', swatch: ['#000000', '#0a0a0a', '#ffffff', '#ffd400'] }
] as const

export type ThemeKey = typeof THEMES[number]['key']

/** Cores que o usuário pode trocar por cima do tema (viram variáveis CSS). */
export const CUSTOM_COLORS = [
  { key: 'accent', label: 'Destaque' },
  { key: 'bg', label: 'Fundo' },
  { key: 'paper', label: 'Página' },
  { key: 'ink', label: 'Texto' },
  { key: 'panel', label: 'Painéis' }
] as const

export type CustomColors = Partial<Record<typeof CUSTOM_COLORS[number]['key'], string>>
