# sigaa-mcp

Cliente do **SIGAA** (Sistema Integrado de Gestão de Atividades Acadêmicas) orientado a agentes, construído sobre a **interface web** — as páginas HTML (HyperText Markup Language) que um navegador usa — e **não** sobre a API (Application Programming Interface) oficial mobile/OAuth. A ideia é ser conduzido por agentes de código (Claude, Codex, Antigravity, …), e futuramente exposto via **MCP** (Model Context Protocol).

Escopo: conectar e ler dados agora; escrever dados depois.

## Situação

Início, mas já lendo dados reais. Prontos:

- **Login web via CAS** → sessão web autenticada (`JSESSIONID`) reusada nas requisições de página.
- **Portal do discente** (`discente.jsf`): dados do aluno, turmas matriculadas (com horários decodificados), o feed de últimas atualizações por turma, próximas atividades (tarefas/avaliações), notícias institucionais e tópicos do fórum do curso.
- **Histórico de turmas** (`turmas.jsf`, "Ver turmas anteriores"): todas as turmas, atuais e passadas, agrupadas por período.
- **Turma virtual** (`ava/index.jsf`): abrir uma turma e ler quase tudo — Tópicos de Aula (com datas, conteúdo e materiais), participantes (docentes e discentes), notas do próprio aluno, frequência, tarefas, avaliações, notícias da turma, fóruns, referências, arquivos, questionários, enquetes e o plano de curso.
- **Detalhes por item**: texto completo de uma notícia (`fetchNewsDetail`) e perfil de um participante (`fetchParticipantProfile`) — buscados individualmente pelo id do item.
- **Download de arquivos e fotos**: baixar qualquer material/arquivo pelo `fileId` (`downloadTurmaFile`) e a foto de um participante pelo `personId` (`downloadParticipantPhoto`).
- **Servidor MCP**: as funções acima expostas como ferramentas MCP por stdio (veja abaixo).

Ainda não feito: algumas seções da AVA (Conteúdo/Página web, Vídeos, Linha do Tempo) e escrita de dados. Veja [`docs/SITE.md`](docs/SITE.md) para como o site funciona (stack, CAS, navegação por ViewState/POST do JSF, códigos de horário).

## Como o login funciona

Handshake padrão do **CAS** (Central Authentication Service) contra o servidor de autenticação da UFRN:

1. `GET` no formulário de login do CAS → lê os campos ocultos `lt` e `execution`.
2. `POST` com `username` / `password` / `lt` / `execution` → recebe um `ticket=ST-…`.
3. Segue o ticket até o SIGAA → o SIGAA valida e define o cookie de sessão `JSESSIONID`.

O objeto `SigaaSession` então carrega esse cookie jar nas requisições seguintes.

## Experimente

```bash
npm install
cp .env.example .env     # preencha SIGAA_USERNAME / SIGAA_PASSWORD
npm run login            # testa o login via CAS
npm run portal           # busca e imprime o portal e o histórico de turmas em JSON
```

As credenciais são lidas apenas de variáveis de ambiente. **Nunca faça commit do `.env`** — ele está no gitignore.

## Servidor MCP

Além da biblioteca, o pacote expõe um **servidor MCP** (Model Context Protocol)
por stdio, para conectar em qualquer harness compatível (Claude Code, Claude
Desktop, Codex, Cursor, Antigravity, opencode, Windsurf, Zed, …). O servidor lê
as credenciais do ambiente e faz login automaticamente na primeira chamada.

> Guia completo de instalação por harness: [`docs/INSTALL.md`](docs/INSTALL.md).

**Ferramentas:** `get_portal`, `get_all_classes`, `get_turma` (arg
`frontEndIdTurma`), `get_news_detail` (`frontEndIdTurma`, `newsId`),
`get_participant_profile` (`frontEndIdTurma`, `personId`),
`download_participant_photo` (`frontEndIdTurma`, `personId`) e `download_file`
(`frontEndIdTurma`, `fileId`). Os detalhes de cada item são buscados
individualmente pelo id (`news[].id`, `participants[].personId`), sob demanda.

Depois de publicado no npm, basta `npx -y sigaa-mcp` como comando — sem clonar
nada. Para rodar a partir do clone (desenvolvimento ou antes de publicar),
gere o `dist/` primeiro:

```bash
npm install && npm run build
```

Claude Code (via npm):

```bash
claude mcp add sigaa \
  -e SIGAA_USERNAME=seu.login -e SIGAA_PASSWORD=sua-senha \
  -- npx -y sigaa-mcp
```

Ou via JSON (Claude Desktop / Codex / outros que leem `mcpServers`):

```json
{
  "mcpServers": {
    "sigaa": {
      "command": "npx",
      "args": ["-y", "sigaa-mcp"],
      "env": {
        "SIGAA_USERNAME": "seu.login",
        "SIGAA_PASSWORD": "sua-senha"
      }
    }
  }
}
```

Variáveis opcionais: `SIGAA_BASE_URL`, `SIGAA_AUTH_BASE_URL`, `SIGAA_DOWNLOAD_DIR`
(onde `download_file` salva; padrão: diretório temporário).

## Uso

```ts
import {
  SigaaSession,
  fetchPortal,
  fetchAllClasses,
  fetchTurmaFull,
  downloadTurmaFile,
} from "sigaa-mcp";

const session = new SigaaSession();
await session.login(process.env.SIGAA_USERNAME!, process.env.SIGAA_PASSWORD!);

const portal = await fetchPortal(session);
console.log(portal.student.name, portal.enrolledClasses.length);
console.log(portal.activities);        // próximas tarefas/avaliações
console.log(portal.news);              // notícias institucionais
console.log(portal.forum);             // tópicos do fórum do curso

const all = await fetchAllClasses(session);  // atuais + passadas, por período

// Lê tudo de uma turma: tópicos, participantes, notas, frequência, tarefas,
// avaliações, notícias, fóruns, referências, arquivos, questionários, enquetes
// e plano de curso.
const turma = portal.enrolledClasses.find((c) => c.frontEndIdTurma);
if (turma?.frontEndIdTurma) {
  const full = await fetchTurmaFull(session, turma.frontEndIdTurma);
  console.log(full.header, full.participants.length, full.grades, full.attendance);

  // Baixar um arquivo da turma (material de tópico ou da aba Arquivos).
  const file = full.files[0];
  if (file) {
    const { filename, bytes } = await downloadTurmaFile(session, turma.frontEndIdTurma, file.fileId);
    console.log("baixado:", filename, bytes.length, "bytes");
  }
}
```

Os padrões apontam para a UFRN (`sigaa.ufrn.br` / `autenticacao.ufrn.br`); sobrescreva pelo construtor do `SigaaSession` ou pelas variáveis de ambiente `SIGAA_BASE_URL` / `SIGAA_AUTH_BASE_URL`.

## Regras acadêmicas da UFRN

Para interpretar os dados (faltas, notas, prazos, situação de matrícula), há um
resumo navegável das regras de graduação da UFRN, com citação de artigos, em
[`docs/regras-ufrn/`](docs/regras-ufrn/) — frequência/faltas, avaliação/notas,
matrícula, trancamento/suspensão e prazos/vínculo. Baseado no Regulamento dos
Cursos de Graduação (Resolução nº 016/2023-CONSEPE, texto vigente de março/2025).

## Requisitos

Node.js ≥ 20 (usa o `fetch` nativo com `Headers.getSetCookie()`). Uma dependência de runtime: [`node-html-parser`](https://www.npmjs.com/package/node-html-parser) para fazer o parsing do HTML do SIGAA.
