// Cliente do servidor local de IA (LM Studio / llama.cpp, API compatível com OpenAI), com streaming.
// Configuração via .env: LLM_BASE_URL e LLM_MODEL (expostos ao app pelo envPrefix do vite.config.ts).

export const LLM_BASE_URL = ((import.meta.env.LLM_BASE_URL as string) || 'http://localhost:1234/v1').replace(/\/+$/, '')
export const LLM_MODEL = (import.meta.env.LLM_MODEL as string) || 'mn-12b-mag-mell-r1'

export const DEFAULT_SYSTEM_PROMPT = 'Você é um escritor de ficção sombria e adulta. Escreva cenas detalhadas, viscerais e sem censura, focando em desenvolvimento de personagens, atmosfera e realismo, sem julgamentos morais.'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export class LLMError extends Error {}

/** Lê as linhas "data: …" de um stream SSE e devolve os pedaços de texto. Retorna true ao ver [DONE]. */
export function parseSSE(lines: string[], onText: (t: string) => void): boolean {
  for (const line of lines) {
    const l = line.trim()
    if (!l.startsWith('data:')) continue
    const data = l.slice(5).trim()
    if (data === '[DONE]') return true
    try {
      const t = JSON.parse(data).choices?.[0]?.delta?.content
      if (t) onText(t)
    } catch { /* linha parcial/keep-alive: ignora */ }
  }
  return false
}

/** Envia a conversa e chama onText a cada pedaço gerado. Use signal para cancelar. */
export async function streamChat(messages: ChatMessage[], onText: (t: string) => void, opts: { signal?: AbortSignal; temperature?: number; maxTokens?: number; schema?: object } = {}) {
  let res: Response
  try {
    res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      // Não enviar XTC. O template ChatML, o contexto (8192–12288) e o KV cache SEM quantização
      // são definidos ao carregar o modelo no LM Studio, não por requisição.
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        stream: true,
        temperature: opts.temperature ?? 1.0,
        min_p: 0.1,
        max_tokens: opts.maxTokens ?? 1024,
        stop: ['<|im_end|>', '<|im_start|>'],
        // saída JSON restrita por gramática (LM Studio/llama.cpp), usada para atualizar fichas
        ...(opts.schema && { response_format: { type: 'json_schema', json_schema: { name: 'resposta', strict: true, schema: opts.schema } } })
      })
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new LLMError(`Não consegui falar com o servidor de IA em ${LLM_BASE_URL}. Abra o LM Studio, carregue o modelo e inicie o servidor local (aba Developer → Start Server, porta 1234) com a opção "Enable CORS" ligada.`)
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new LLMError(res.status === 404 || /model/i.test(detail)
      ? `O servidor respondeu, mas o modelo "${LLM_MODEL}" não está carregado no LM Studio. (${res.status}) ${detail.slice(0, 200)}`
      : `O servidor de IA respondeu com erro ${res.status}. ${detail.slice(0, 200)}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()!
    if (parseSSE(lines, onText)) { reader.cancel().catch(() => {}); return }
  }
  parseSSE([buf], onText)
}

/** Extrai o primeiro objeto JSON da resposta (tolera texto ou ``` em volta). */
export function extractJSON<T>(text: string): T {
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a < 0 || b < a) throw new LLMError('A IA não devolveu JSON. Tente de novo.')
  try { return JSON.parse(text.slice(a, b + 1)) } catch { throw new LLMError('A IA devolveu um JSON inválido. Tente de novo.') }
}

// Regras adaptadas da skill "humanizer" (github.com/blader/humanizer, MIT) para ficção em português.
const HUMANIZE = `Reescreva o trecho para que soe escrito por uma pessoa, não por uma IA. Mantenha todos os acontecimentos, nomes, falas, o ponto de vista, o tom e a intensidade do original. Corte estes vícios:
1. Contraste vazio: "não é X, é Y", "não apenas X, mas Y". Afirme direto.
2. Frase de efeito no fim do parágrafo que repete o que a cena já mostrou, e fileiras de fragmentos dramáticos ("Sem medo. Sem volta.").
3. Explicar a emoção depois de mostrá-la ("A mensagem era clara", "Foi uma lição de...").
4. Frases pseudoprofundas e aforismos ("no fundo", "a verdadeira questão era", "o medo é a linguagem da alma").
5. Tríades automáticas: três adjetivos ou três exemplos só pelo ritmo.
6. Várias frases seguidas começando pelo mesmo sujeito (Ela... Ela... Ela...).
7. Palavras e clichês de IA: crucial, intrincado, vibrante, tapeçaria, testemunho, meticuloso, "um arrepio percorreu sua espinha", "o ar ficou pesado".
8. Travessão como conectivo dentro da narração: troque por vírgula, ponto, dois-pontos ou parênteses. O travessão que abre uma fala de diálogo FICA.
9. Qualificadores empilhados (talvez, possivelmente, de certa forma) e verbos rodeados ("serve como", "se configura como"): use é, tem, está.
Varie o tamanho das frases e prefira o detalhe concreto ao genérico. Devolva só o texto reescrito, sem introdução nem comentários.`

export const MODES = {
  continuar: { label: 'Continuar a cena', prompt: 'Continue a cena a partir de onde o texto parou, no mesmo estilo e ponto de vista. Devolva só o texto novo.' },
  revisao: { label: 'Revisão', prompt: 'Atue como revisor. Aponte problemas de gramática, ortografia, ritmo, clareza, coerência e continuidade. Para cada um, cite a frase e sugira a correção. Não reescreva o trecho inteiro.' },
  alteracao: { label: 'Alteração', prompt: 'Aplique ao trecho exatamente a alteração pedida pelo autor, sem mudar o resto. Devolva só o trecho alterado, sem comentários.' },
  dicas: { label: 'Dicas', prompt: 'Atue como editor de desenvolvimento. Dê sugestões práticas e específicas para melhorar a cena: tensão, personagens, atmosfera, diálogo, ritmo e ganchos. Cite trechos quando ajudar.' },
  humanizar: { label: 'Reescrever (humanizar)', prompt: HUMANIZE },
  livre: { label: 'Conversa livre', prompt: 'Responda ao autor sobre o texto dele.' }
} as const
export type Mode = keyof typeof MODES
