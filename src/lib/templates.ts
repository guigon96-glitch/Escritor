export type FieldType = 'text' | 'long' | 'select' | 'scale'
export interface FieldDef { key: string; label: string; type?: FieldType; options?: string[]; hint?: string }
export interface Section { title: string; fields: FieldDef[] }
export interface Template { key: string; name: string; icon: string; sections: Section[] }

export const CHARACTER_ROLES = ['Protagonista', 'Antagonista', 'Deuteragonista', 'Mentor', 'Aliado', 'Interesse amoroso', 'Alívio cômico', 'Guardião do limiar', 'Arauto', 'Camaleão', 'Coadjuvante', 'Figurante']

export const CHARACTER_TEMPLATE: Template = {
  key: 'character',
  name: 'Personagem',
  icon: '👤',
  sections: [
    {
      title: 'Identidade',
      fields: [
        { key: 'fullName', label: 'Nome completo' },
        { key: 'nickname', label: 'Apelidos / títulos' },
        { key: 'role', label: 'Papel na história', type: 'select', options: CHARACTER_ROLES },
        { key: 'importance', label: 'Importância', type: 'select', options: ['Principal', 'Secundário', 'Terciário', 'Menção'] },
        { key: 'age', label: 'Idade' },
        { key: 'birth', label: 'Nascimento (data/local)' },
        { key: 'gender', label: 'Gênero / pronomes' },
        { key: 'species', label: 'Espécie / raça / povo' },
        { key: 'nationality', label: 'Origem / nacionalidade' },
        { key: 'residence', label: 'Onde mora' },
        { key: 'occupation', label: 'Ocupação' },
        { key: 'social', label: 'Classe social / status' },
        { key: 'faction', label: 'Facções / organizações' },
        { key: 'concept', label: 'Conceito em uma frase', type: 'long', hint: 'Ex.: "Uma ladra arrependida que precisa roubar uma última vez para salvar a irmã."' }
      ]
    },
    {
      title: 'Aparência',
      fields: [
        { key: 'height', label: 'Altura / porte' },
        { key: 'build', label: 'Biotipo' },
        { key: 'skin', label: 'Pele' },
        { key: 'hair', label: 'Cabelo' },
        { key: 'eyes', label: 'Olhos' },
        { key: 'face', label: 'Rosto / traços marcantes' },
        { key: 'marks', label: 'Cicatrizes, tatuagens, marcas' },
        { key: 'clothing', label: 'Estilo de roupa' },
        { key: 'items', label: 'Objetos que sempre carrega' },
        { key: 'posture', label: 'Postura, gestos, maneirismos', type: 'long' },
        { key: 'firstImpression', label: 'Primeira impressão que causa', type: 'long' }
      ]
    },
    {
      title: 'Personalidade',
      fields: [
        { key: 'traits', label: 'Traços principais', type: 'long' },
        { key: 'virtues', label: 'Virtudes', type: 'long' },
        { key: 'flaws', label: 'Defeitos', type: 'long' },
        { key: 'temperament', label: 'Temperamento', type: 'select', options: ['Sanguíneo', 'Colérico', 'Melancólico', 'Fleumático'] },
        { key: 'mbti', label: 'MBTI', type: 'select', options: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'] },
        { key: 'enneagram', label: 'Eneagrama', type: 'select', options: ['1 – Perfeccionista', '2 – Prestativo', '3 – Realizador', '4 – Individualista', '5 – Investigador', '6 – Leal', '7 – Entusiasta', '8 – Desafiador', '9 – Pacificador'] },
        { key: 'alignment', label: 'Alinhamento moral', type: 'select', options: ['Leal e bom', 'Neutro e bom', 'Caótico e bom', 'Leal e neutro', 'Neutro', 'Caótico e neutro', 'Leal e mau', 'Neutro e mau', 'Caótico e mau'] },
        { key: 'introExtro', label: 'Introversão ↔ Extroversão', type: 'scale' },
        { key: 'emotionReason', label: 'Emoção ↔ Razão', type: 'scale' },
        { key: 'caution', label: 'Cautela ↔ Impulsividade', type: 'scale' },
        { key: 'optimism', label: 'Pessimismo ↔ Otimismo', type: 'scale' },
        { key: 'humor', label: 'Senso de humor', type: 'long' },
        { key: 'habits', label: 'Hábitos e manias', type: 'long' },
        { key: 'likes', label: 'Gosta de', type: 'long' },
        { key: 'dislikes', label: 'Não suporta', type: 'long' },
        { key: 'fears', label: 'Medos', type: 'long' },
        { key: 'secrets', label: 'Segredos', type: 'long' },
        { key: 'values', label: 'Valores e crenças', type: 'long' },
        { key: 'underPressure', label: 'Como reage sob pressão', type: 'long' }
      ]
    },
    {
      title: 'Motivação e arco',
      fields: [
        { key: 'want', label: 'Desejo (o que quer)', type: 'long', hint: 'Objetivo externo e consciente.' },
        { key: 'need', label: 'Necessidade (o que precisa)', type: 'long', hint: 'Mudança interna, muitas vezes inconsciente.' },
        { key: 'lie', label: 'A mentira em que acredita', type: 'long' },
        { key: 'ghost', label: 'Ferida / fantasma do passado', type: 'long' },
        { key: 'stakes', label: 'O que tem a perder', type: 'long' },
        { key: 'arcType', label: 'Tipo de arco', type: 'select', options: ['Positivo (mudança)', 'Plano (testemunha/muda os outros)', 'Negativo (desilusão)', 'Negativo (corrupção)', 'Negativo (queda)'] },
        { key: 'arcStart', label: 'Quem é no início', type: 'long' },
        { key: 'arcMiddle', label: 'Ponto de virada / crise', type: 'long' },
        { key: 'arcEnd', label: 'Quem se torna no fim', type: 'long' },
        { key: 'conflictInternal', label: 'Conflito interno', type: 'long' },
        { key: 'conflictExternal', label: 'Conflito externo', type: 'long' }
      ]
    },
    {
      title: 'Passado',
      fields: [
        { key: 'childhood', label: 'Infância', type: 'long' },
        { key: 'family', label: 'Família (pais, irmãos, filhos)', type: 'long' },
        { key: 'education', label: 'Educação / formação', type: 'long' },
        { key: 'keyEvents', label: 'Eventos marcantes', type: 'long' },
        { key: 'pastLoves', label: 'Relacionamentos passados', type: 'long' },
        { key: 'beforeStory', label: 'Onde está quando a história começa', type: 'long' }
      ]
    },
    {
      title: 'Voz e habilidades',
      fields: [
        { key: 'speech', label: 'Jeito de falar', type: 'long', hint: 'Vocabulário, ritmo, sotaque, palavrões, formalidade.' },
        { key: 'catchphrases', label: 'Bordões / frases típicas', type: 'long' },
        { key: 'languages', label: 'Idiomas' },
        { key: 'skills', label: 'Habilidades e talentos', type: 'long' },
        { key: 'weaknesses', label: 'Fraquezas / limitações', type: 'long' },
        { key: 'powers', label: 'Poderes / magia / tecnologia', type: 'long' },
        { key: 'combat', label: 'Estilo de luta / armas' },
        { key: 'health', label: 'Saúde, condições, deficiências', type: 'long' }
      ]
    },
    {
      title: 'Na história',
      fields: [
        { key: 'introduction', label: 'Primeira aparição / como é apresentado', type: 'long' },
        { key: 'theme', label: 'Ligação com o tema do livro', type: 'long' },
        { key: 'fate', label: 'Destino final', type: 'long' },
        { key: 'inspirations', label: 'Inspirações (pessoas, atores, referências)', type: 'long' }
      ]
    }
  ]
}

export const WORLD_TEMPLATES: Template[] = [
  {
    key: 'location', name: 'Lugar', icon: '🏰',
    sections: [
      { title: 'Geral', fields: [
        { key: 'type', label: 'Tipo', type: 'select', options: ['Planeta', 'Continente', 'Reino / país', 'Região', 'Cidade', 'Vila', 'Bairro', 'Construção', 'Cômodo', 'Ponto natural', 'Outro'] },
        { key: 'region', label: 'Fica em' },
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'population', label: 'População' },
        { key: 'ruler', label: 'Governante / dono' }
      ] },
      { title: 'Sentidos', fields: [
        { key: 'sight', label: 'O que se vê', type: 'long' },
        { key: 'sound', label: 'Sons', type: 'long' },
        { key: 'smell', label: 'Cheiros', type: 'long' },
        { key: 'climate', label: 'Clima e estações', type: 'long' },
        { key: 'mood', label: 'Atmosfera / sensação', type: 'long' }
      ] },
      { title: 'Detalhes', fields: [
        { key: 'geography', label: 'Geografia', type: 'long' },
        { key: 'economy', label: 'Economia e recursos', type: 'long' },
        { key: 'landmarks', label: 'Pontos notáveis', type: 'long' },
        { key: 'dangers', label: 'Perigos', type: 'long' },
        { key: 'history', label: 'História', type: 'long' },
        { key: 'secrets', label: 'Segredos', type: 'long' },
        { key: 'storyRole', label: 'Importância na história', type: 'long' }
      ] }
    ]
  },
  {
    key: 'culture', name: 'Povo / cultura', icon: '🧑‍🤝‍🧑',
    sections: [
      { title: 'Geral', fields: [
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'homeland', label: 'Terra natal' },
        { key: 'population', label: 'População' },
        { key: 'language', label: 'Idioma(s)' },
        { key: 'appearance', label: 'Aparência típica', type: 'long' }
      ] },
      { title: 'Sociedade', fields: [
        { key: 'government', label: 'Governo / hierarquia', type: 'long' },
        { key: 'family', label: 'Família e casamento', type: 'long' },
        { key: 'gender', label: 'Papéis de gênero', type: 'long' },
        { key: 'law', label: 'Leis e punições', type: 'long' },
        { key: 'economy', label: 'Economia e comércio', type: 'long' },
        { key: 'war', label: 'Guerra e defesa', type: 'long' }
      ] },
      { title: 'Costumes', fields: [
        { key: 'religion', label: 'Religião e crenças', type: 'long' },
        { key: 'customs', label: 'Tradições e rituais', type: 'long' },
        { key: 'festivals', label: 'Festas e feriados', type: 'long' },
        { key: 'food', label: 'Culinária', type: 'long' },
        { key: 'clothing', label: 'Vestimenta', type: 'long' },
        { key: 'arts', label: 'Arte, música, literatura', type: 'long' },
        { key: 'taboos', label: 'Tabus', type: 'long' },
        { key: 'greetings', label: 'Cumprimentos e etiqueta', type: 'long' },
        { key: 'names', label: 'Padrões de nomes', type: 'long' }
      ] },
      { title: 'Relações', fields: [
        { key: 'allies', label: 'Aliados', type: 'long' },
        { key: 'enemies', label: 'Inimigos', type: 'long' },
        { key: 'stereotypes', label: 'Como são vistos pelos outros', type: 'long' }
      ] }
    ]
  },
  {
    key: 'religion', name: 'Religião / mito', icon: '⛩️',
    sections: [
      { title: 'Crença', fields: [
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'deities', label: 'Divindades / entidades', type: 'long' },
        { key: 'cosmology', label: 'Cosmologia e criação', type: 'long' },
        { key: 'afterlife', label: 'Pós-vida', type: 'long' },
        { key: 'commandments', label: 'Mandamentos / dogmas', type: 'long' }
      ] },
      { title: 'Prática', fields: [
        { key: 'clergy', label: 'Clero e hierarquia', type: 'long' },
        { key: 'rituals', label: 'Rituais e orações', type: 'long' },
        { key: 'holyPlaces', label: 'Lugares sagrados', type: 'long' },
        { key: 'symbols', label: 'Símbolos', type: 'long' },
        { key: 'heresies', label: 'Heresias e cismas', type: 'long' },
        { key: 'followers', label: 'Seguidores / alcance', type: 'long' }
      ] }
    ]
  },
  {
    key: 'magic', name: 'Sistema de magia / tecnologia', icon: '✨',
    sections: [
      { title: 'Regras', fields: [
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'hardness', label: 'Tipo', type: 'select', options: ['Rígido (regras claras)', 'Flexível (misterioso)', 'Misto'] },
        { key: 'source', label: 'Fonte do poder', type: 'long' },
        { key: 'howWorks', label: 'Como funciona', type: 'long' },
        { key: 'cost', label: 'Custo / preço', type: 'long' },
        { key: 'limits', label: 'Limitações', type: 'long' },
        { key: 'whoCan', label: 'Quem pode usar', type: 'long' },
        { key: 'learning', label: 'Como se aprende', type: 'long' }
      ] },
      { title: 'Impacto', fields: [
        { key: 'society', label: 'Efeito na sociedade', type: 'long' },
        { key: 'laws', label: 'Leis e proibições', type: 'long' },
        { key: 'history', label: 'Origem e história', type: 'long' },
        { key: 'examples', label: 'Exemplos de uso', type: 'long' },
        { key: 'unknown', label: 'O que ninguém sabe ainda', type: 'long' }
      ] }
    ]
  },
  {
    key: 'organization', name: 'Organização / facção', icon: '🛡️',
    sections: [
      { title: 'Geral', fields: [
        { key: 'type', label: 'Tipo', type: 'select', options: ['Governo', 'Exército', 'Guilda', 'Ordem religiosa', 'Sociedade secreta', 'Empresa', 'Família / casa nobre', 'Gangue', 'Escola', 'Outro'] },
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'leader', label: 'Líder' },
        { key: 'hq', label: 'Sede' },
        { key: 'members', label: 'Membros notáveis', type: 'long' },
        { key: 'size', label: 'Tamanho' }
      ] },
      { title: 'Funcionamento', fields: [
        { key: 'goals', label: 'Objetivos', type: 'long' },
        { key: 'methods', label: 'Métodos', type: 'long' },
        { key: 'hierarchy', label: 'Hierarquia e ranks', type: 'long' },
        { key: 'joining', label: 'Como se entra', type: 'long' },
        { key: 'resources', label: 'Recursos', type: 'long' },
        { key: 'symbols', label: 'Símbolos, cores, lema', type: 'long' },
        { key: 'allies', label: 'Aliados', type: 'long' },
        { key: 'enemies', label: 'Inimigos', type: 'long' },
        { key: 'history', label: 'História', type: 'long' },
        { key: 'secrets', label: 'Segredos', type: 'long' }
      ] }
    ]
  },
  {
    key: 'creature', name: 'Criatura / espécie', icon: '🐉',
    sections: [
      { title: 'Biologia', fields: [
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'appearance', label: 'Aparência', type: 'long' },
        { key: 'size', label: 'Tamanho' },
        { key: 'habitat', label: 'Habitat', type: 'long' },
        { key: 'diet', label: 'Alimentação' },
        { key: 'lifespan', label: 'Expectativa de vida' },
        { key: 'reproduction', label: 'Reprodução', type: 'long' },
        { key: 'intelligence', label: 'Inteligência', type: 'select', options: ['Animal', 'Astuta', 'Senciente', 'Superior'] }
      ] },
      { title: 'Comportamento', fields: [
        { key: 'behavior', label: 'Comportamento', type: 'long' },
        { key: 'abilities', label: 'Habilidades', type: 'long' },
        { key: 'weaknesses', label: 'Fraquezas', type: 'long' },
        { key: 'danger', label: 'Nível de perigo', type: 'select', options: ['Inofensiva', 'Baixo', 'Moderado', 'Alto', 'Mortal'] },
        { key: 'folklore', label: 'Lendas e folclore', type: 'long' },
        { key: 'uses', label: 'Usos (domesticação, partes, etc.)', type: 'long' }
      ] }
    ]
  },
  {
    key: 'item', name: 'Objeto / artefato', icon: '🗝️',
    sections: [
      { title: 'Objeto', fields: [
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'appearance', label: 'Aparência', type: 'long' },
        { key: 'origin', label: 'Origem / criador', type: 'long' },
        { key: 'owner', label: 'Dono atual' },
        { key: 'location', label: 'Onde está' },
        { key: 'powers', label: 'Propriedades / poderes', type: 'long' },
        { key: 'value', label: 'Valor', type: 'long' },
        { key: 'history', label: 'Histórico de donos', type: 'long' },
        { key: 'storyRole', label: 'Papel na história', type: 'long' }
      ] }
    ]
  },
  {
    key: 'language', name: 'Idioma', icon: '🗣️',
    sections: [
      { title: 'Idioma', fields: [
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'speakers', label: 'Falantes', type: 'long' },
        { key: 'sound', label: 'Sonoridade', type: 'long' },
        { key: 'writing', label: 'Sistema de escrita', type: 'long' },
        { key: 'grammar', label: 'Gramática básica', type: 'long' },
        { key: 'vocabulary', label: 'Vocabulário (palavra = significado)', type: 'long' },
        { key: 'phrases', label: 'Expressões comuns', type: 'long' },
        { key: 'dialects', label: 'Dialetos', type: 'long' }
      ] }
    ]
  },
  {
    key: 'event', name: 'Evento histórico', icon: '📜',
    sections: [
      { title: 'Evento', fields: [
        { key: 'date', label: 'Data / era' },
        { key: 'place', label: 'Local' },
        { key: 'summary', label: 'O que aconteceu', type: 'long' },
        { key: 'causes', label: 'Causas', type: 'long' },
        { key: 'participants', label: 'Envolvidos', type: 'long' },
        { key: 'consequences', label: 'Consequências', type: 'long' },
        { key: 'versions', label: 'Versões contadas / mitos', type: 'long' }
      ] }
    ]
  },
  {
    key: 'lore', name: 'Conceito livre', icon: '📘',
    sections: [
      { title: 'Conteúdo', fields: [
        { key: 'summary', label: 'Resumo', type: 'long' },
        { key: 'details', label: 'Detalhes', type: 'long' }
      ] }
    ]
  }
]

export const templateFor = (key: string): Template | undefined =>
  key === 'character' ? CHARACTER_TEMPLATE : WORLD_TEMPLATES.find(t => t.key === key)

export const RELATION_TYPES = ['Família', 'Pai/Mãe de', 'Filho(a) de', 'Irmão(ã)', 'Cônjuge', 'Amor', 'Ex', 'Amigo(a)', 'Melhor amigo(a)', 'Mentor de', 'Aliado', 'Rival', 'Inimigo', 'Chefe de', 'Subordinado de', 'Trabalham juntos', 'Desconhecidos (ainda)', 'Outro']

export const SCENE_TEMPLATE_HTML = `<p><em>Objetivo da cena:</em> </p><p><em>Conflito:</em> </p><p><em>Desfecho / virada:</em> </p><p>${'* * *'}</p><p></p>`
