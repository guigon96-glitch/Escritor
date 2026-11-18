const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const BR_M = ['Miguel', 'Arthur', 'Heitor', 'Bernardo', 'Davi', 'Gabriel', 'Rafael', 'Lucas', 'Mateus', 'Pedro', 'Joaquim', 'Antônio', 'Benício', 'Caio', 'Otávio', 'Vicente', 'Lorenzo', 'Tomás', 'Henrique', 'Samuel', 'Raul', 'Augusto', 'Bento', 'Inácio', 'Fausto', 'Elias', 'Severino', 'Aurélio', 'Diogo', 'Ícaro']
const BR_F = ['Helena', 'Alice', 'Laura', 'Manuela', 'Valentina', 'Sofia', 'Isabela', 'Cecília', 'Luísa', 'Lívia', 'Beatriz', 'Mariana', 'Clara', 'Aurora', 'Olívia', 'Antonella', 'Lara', 'Yasmin', 'Celeste', 'Iracema', 'Dalva', 'Rosa', 'Inês', 'Teresa', 'Jandira', 'Marina', 'Glória', 'Elisa', 'Leonor', 'Joana']
const BR_LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas', 'Cardoso', 'Ramos', 'Teixeira', 'Correia', 'Cavalcanti', 'Albuquerque', 'Bragança', 'Valadares', 'Montenegro', 'Queiroz']

interface Style { name: string; start: string[]; mid: string[]; end: string[]; endF?: string[] }

const STYLES: Record<string, Style> = {
  elfico: { name: 'Fantasia – élfico / etéreo', start: ['Ae', 'El', 'Gal', 'Ith', 'Lae', 'Syl', 'Thal', 'Cael', 'Fae', 'Ilu', 'Nim', 'Ery', 'Lua', 'Ser'], mid: ['a', 'e', 'i', 'ari', 'ela', 'ion', 'ith', 'or', 'ya', 'li', 'ne'], end: ['dor', 'ion', 'ras', 'thil', 'wen', 'iel', 'mir', 'las', 'nor', 'ran'], endF: ['iel', 'wen', 'ra', 'lia', 'enne', 'ith', 'ys', 'ara'] },
  nordico: { name: 'Fantasia – nórdico / anão', start: ['Bjor', 'Thor', 'Grim', 'Hal', 'Ulf', 'Dur', 'Brok', 'Kar', 'Ra', 'Sig', 'Har', 'Tor', 'Ey', 'Vald'], mid: ['', 'a', 'i', 'o', 'un', 'gar'], end: ['n', 'rik', 'mund', 'grim', 'ulf', 'dar', 'stein', 'ak', 'vald', 'bjorn'], endF: ['a', 'hild', 'dis', 'run', 'gerd', 'veig', 'rid'] },
  latino: { name: 'Império antigo / latino', start: ['Aur', 'Cass', 'Luc', 'Mar', 'Oct', 'Sev', 'Val', 'Dec', 'Corn', 'Flav', 'Tib', 'Quin', 'Ser', 'Vit'], mid: ['', 'i', 'el', 'er', 'an', 'ent'], end: ['ius', 'us', 'ianus', 'ellus', 'ix', 'or', 'o'], endF: ['ia', 'a', 'ina', 'illa', 'ella', 'ana'] },
  sombrio: { name: 'Sombrio / vilanesco', start: ['Mor', 'Vex', 'Zar', 'Draz', 'Kael', 'Nyx', 'Mal', 'Xer', 'Vor', 'Sarn', 'Grav', 'Ob'], mid: ['', 'a', 'o', 'u', 'ra', 'ze', 'ka'], end: ['oth', 'gul', 'rax', 'zul', 'ak', 'mor', 'ith', 'goth', 'vyr', 'eth'], endF: ['a', 'yth', 'ra', 'ess', 'issa', 'ix'] },
  scifi: { name: 'Ficção científica', start: ['Ky', 'Zed', 'Ori', 'Nova', 'Jax', 'Tal', 'Rho', 'Vex', 'Ix', 'Cyr', 'Lyr', 'Aza'], mid: ['', 'a', 'e', 'o', 'ri', 'x', 'n'], end: ['on', 'is', 'ar', 'ex', 'ian', 'os', 'yx', 'el', '-7', 'ra'], endF: ['a', 'ia', 'is', 'yn', 'ra', 'ette'] },
  tupi: { name: 'Sonoridade tupi', start: ['Ara', 'Ita', 'Jaci', 'Ubi', 'Gua', 'Pira', 'Ibi', 'Ma', 'Tai', 'Ypi', 'Cau', 'Pe'], mid: ['', 'ra', 'ju', 'ti', 'pa', 'na', 'u'], end: ['ra', 'ci', 'tã', 'bá', 'ju', 'ê', 'una', 'aí', 'pora', 'guaçu'] }
}

const PLACE_START = ['Vale', 'Porto', 'Monte', 'Serra', 'Baía', 'Campo', 'Ponte', 'Forte', 'Lago', 'Rio', 'Pedra', 'Bosque', 'Torre', 'Vila']
const PLACE_END = ['das Brumas', 'do Corvo', 'Sombrio', 'Dourado', 'das Almas', 'do Norte', 'Velho', 'dos Ventos', 'de Prata', 'Esquecido', 'das Cinzas', 'da Aurora', 'do Lobo', 'Partido', 'de Ferro']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const NAME_STYLES = [{ key: 'brasileiro', name: 'Brasileiro (realista)' }, ...Object.entries(STYLES).map(([key, s]) => ({ key, name: s.name })), { key: 'lugar', name: 'Nomes de lugares' }]

export function generateName(style: string, gender: 'm' | 'f' | 'x', withSurname: boolean): string {
  if (style === 'brasileiro') {
    const g = gender === 'x' ? (Math.random() < 0.5 ? 'm' : 'f') : gender
    const first = pick(g === 'm' ? BR_M : BR_F)
    return withSurname ? `${first} ${pick(BR_LAST)}${Math.random() < 0.3 ? ' ' + pick(BR_LAST) : ''}` : first
  }
  if (style === 'lugar') {
    if (Math.random() < 0.5) return `${pick(PLACE_START)} ${pick(PLACE_END)}`
    const s = pick(Object.values(STYLES))
    return cap(pick(s.start) + pick(s.mid) + pick(s.end)).replace(/-7$/, '') + pick(['', 'heim', 'vale', 'ória', 'burgo', 'mar'])
  }
  const s = STYLES[style] || STYLES.elfico
  const make = () => {
    const endings = gender === 'f' && s.endF ? s.endF : s.end
    return cap((pick(s.start) + pick(s.mid) + pick(endings)).toLowerCase())
  }
  return withSurname ? `${make()} ${make()}` : make()
}
