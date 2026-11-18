# Tinteiro — escritório de escrita

App pessoal para escrever livros: manuscrito em capítulos/cenas, quadro de cartões, esboço em tabela,
texto contínuo, fichas completas de personagem, worldbuilding com mapas, linha do tempo, mapa de relações,
metas de escrita, snapshots de versões e exportação para Word/PDF. Funciona offline e sincroniza
tablet ⇄ computador pelo Google Drive.

## Como usar no dia a dia

| Onde | Como instalar |
|---|---|
| Computador (Windows/Mac/Linux) | Abra o endereço do app no Chrome ou Edge → ícone **Instalar** na barra de endereço. Vira um app com janela própria. |
| Tablet Android | Abra o endereço no Chrome → menu ⋮ → **Instalar app**. O Chrome gera e instala um APK automaticamente. |
| APK "de verdade" (.apk) | Em pwabuilder.com, cole o endereço do app → **Package for stores → Android** → baixe e instale o .apk no tablet. |

Os dados ficam no aparelho (funciona sem internet). O botão **☁ Sincronizar** junta as alterações dos dois
aparelhos no Drive (item por item, a edição mais recente vence) e cria um backup datado por dia
(últimos 30 ficam na pasta *Tinteiro – Backups*).

## Configurar o Google Drive (uma vez)

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
