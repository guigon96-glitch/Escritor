# Tinteiro — escritório de escrita

App pessoal para escrever livros: manuscrito em capítulos/cenas, quadro de cartões, esboço em tabela,
texto contínuo, fichas completas de personagem, worldbuilding com mapas, linha do tempo, mapa de relações,
metas de escrita, snapshots de versões e exportação para Word/PDF. Funciona offline e sincroniza
tablet ⇄ computador pelo Google Drive.

## Instalar

Baixe os instaladores na página **Releases** do repositório (https://github.com/guigon96-glitch/Escritor/releases):

| Onde | Arquivo | Observação |
|---|---|---|
| Windows | `Tinteiro-Setup-x.y.z.exe` | App completo, funciona offline. Se aparecer “O Windows protegeu o computador”: **Mais informações → Executar assim mesmo**. |
| Tablet Android | `Tinteiro.apk` | Abre o Tinteiro em tela cheia (usa o Chrome por baixo). Precisa do site publicado no GitHub Pages. |

Os instaladores são gerados automaticamente pelo GitHub (`.github/workflows/instaladores.yml`) a cada atualização
da branch `main`, ou manualmente em **Actions → Gerar instaladores → Run workflow**. A versão mais nova fica
sempre marcada como *Latest* na página Releases.

Os dados ficam no aparelho (funciona sem internet). O botão **☁ Sincronizar** junta as alterações dos dois
aparelhos no Drive (item por item, a edição mais recente vence) e cria um backup datado por dia
(últimos 30 ficam na pasta *Tinteiro – Backups*).

### Tirar a barra de endereço do app Android (opcional)

O Android só esconde a barra de endereço se o arquivo `assetlinks.json` estiver na raiz do domínio.
Crie um repositório chamado `guigon96-glitch.github.io`, com Pages ativado, contendo o arquivo
`.well-known/assetlinks.json` (cópia de `public/.well-known/assetlinks.json` deste projeto).

### Chave de assinatura do Android

O APK é assinado com `android/app/tinteiro.keystore` (incluída no repositório para manter as atualizações
compatíveis). Para usar uma chave privada, gere outra e cadastre em *Settings → Secrets → Actions* o segredo
`ANDROID_KEYSTORE_BASE64` (e, se mudar as senhas, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`).

## Atualizações

Cada envio para a branch `main` gera uma versão `v0.3.N` em Releases, com a lista de novidades.

- **Windows:** o app verifica ao abrir e a cada 4 h, baixa sozinho e mostra “Reiniciar e atualizar”.
- **Android:** o app avisa “Nova versão disponível” → **Baixar e instalar** abre o download do APK; toque em *Atualizar*.
- Em **Ajustes → Sobre e atualizações** dá para ver a versão e procurar atualização na hora.

## Ferramentas

Planejar: linha do tempo (vertical ou horizontal com faixas por personagem/lugar), grade de enredo (linhas narrativas × capítulos),
estrutura narrativa (Três atos, Save the Cat, Jornada do Herói, Sete pontos) e mapa de relações.
Analisar: metas/estatísticas e análise de estilo (repetições, frases longas, diálogo, advérbios).
Manuscrito: cartões, tabela, texto contínuo e quadro por status. Exporta Word, EPUB, PDF, Markdown e texto.
No editor, nomes de personagens e lugares ficam sublinhados — toque para ver a ficha.

## IA local (LM Studio)

O botão **🤖 IA** abre um painel ao lado do texto, como a Consulta. A IA roda no seu computador, pelo LM Studio, e nunca altera o texto do livro.

1. Instale o LM Studio (https://lmstudio.ai) e abra.
2. Na aba de busca (🔍 Discover), procure `bartowski/MN-12B-Mag-Mell-R1-GGUF` e baixe o arquivo `MN-12B-Mag-Mell-R1-Q3_K_M.gguf` (ou `IQ3_M`), com cerca de 6 GB.
3. Na aba **Developer** (ícone `>_`), clique em **Select a model to load** e escolha o Mag-Mell. Antes de carregar, ligue **Manually choose model load parameters** e ajuste:
   - **Context Length:** 8192 (até 12288 para cenas longas)
   - **GPU Offload:** o máximo
   - **K Cache / V Cache Quantization:** desligados
4. Ainda em **Developer**, abra **Settings** e ligue **Enable CORS**. Depois ligue a chave **Status: Running** (Start Server). A porta tem que ser **1234**.
5. Teste no navegador: `http://localhost:1234/v1/models` deve mostrar o modelo. O app espera o nome `mn-12b-mag-mell-r1`.
6. No Tinteiro, abra uma cena e clique em **🤖 IA**:
   - **💬 Chat:** selecione um trecho (ou nada, para a cena inteira), escolha o modo e envie. As respostas ficam no painel, com o botão **Copiar**.
   - **🔄 Fichas e linha do tempo:** **Analisar a cena aberta**, revise as sugestões e clique em **Aplicar**.

Se aparecer "Não consegui falar com o servidor de IA": o servidor não está ligado ou o CORS está desligado. Se aparecer "modelo não carregado": o nome em `/v1/models` é diferente; em desenvolvimento, ponha esse nome em `LLM_MODEL` no `.env` (veja `.env.example`). No Android a IA não funciona, porque `localhost` no celular é o próprio celular.

## Configurar o Google Drive (uma vez)

Você cria **duas credenciais no mesmo projeto do Google**: “Aplicativo da Web” (usada pelo tablet/site) e
“App para computador” (usada pelo app do Windows, que pede também a chave secreta). Como são do mesmo projeto,
enxergam os mesmos arquivos. Na *Tela de permissão OAuth*, clique em **Publicar app** (“Em produção”) para o
Google não desconectar a cada 7 dias.

1. console.cloud.google.com → crie um projeto → **APIs e serviços → Biblioteca** → ative **Google Drive API**.
2. **Tela de permissão OAuth**: tipo Externo; adicione seu e‑mail em *Usuários de teste*.
3. **Credenciais → ID do cliente OAuth → Aplicativo da Web**. Em *Origens JavaScript autorizadas* coloque o
   endereço onde o app está publicado (ex.: `https://SEU-USUARIO.github.io`) e `http://localhost:5173` se for testar no PC.
4. Copie o Client ID e cole em **Ajustes → Configurar Google Drive** (ou defina a variável `GOOGLE_CLIENT_ID`
   no repositório, em *Settings → Secrets and variables → Actions → Variables*, para já vir preenchido).

O app usa a permissão `drive.file`: só enxerga os arquivos que ele mesmo criou.

## Publicar (GitHub Pages)

1. Crie um repositório no GitHub e envie este código para a branch `main`.
2. No repositório: **Settings → Pages → Source: GitHub Actions**.
3. A cada push, o workflow `.github/workflows/deploy.yml` publica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Rodar no computador (desenvolvimento)

```bash
npm install
npm run dev
```

## Atalhos

- `Ctrl+S` salvar agora (o app já salva sozinho) · `Ctrl+F` buscar/substituir no documento
- `F11` ou `Ctrl+Shift+Enter` modo composição (tela cheia) · `Esc` sai
- Digitar `- ` no início do parágrafo vira travessão de diálogo (—)
- Clique direito (ou ⋯) em qualquer item da estrutura: renomear, mover, duplicar, lixeira
