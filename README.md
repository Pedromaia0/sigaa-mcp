# sigaa-mcp

Cliente do **SIGAA** (Sistema Integrado de Gestão de Atividades Acadêmicas) orientado a agentes, construído sobre a **interface web** — as páginas HTML (HyperText Markup Language) que um navegador usa — e **não** sobre a API (Application Programming Interface) oficial mobile/OAuth. A ideia é ser conduzido por agentes de código (Claude, Codex, Antigravity, …), e futuramente exposto via **MCP** (Model Context Protocol).

Escopo: conectar e ler dados agora; escrever dados depois.

## Situação

Início, mas já lendo dados reais. Prontos:

- **Login web via CAS** → sessão web autenticada (`JSESSIONID`) reusada nas requisições de página.
- **Portal do discente** (`discente.jsf`): dados do aluno, turmas matriculadas (com horários decodificados), o feed de últimas atualizações por turma, próximas atividades (tarefas/avaliações), notícias institucionais e tópicos do fórum do curso.
- **Histórico de turmas** (`turmas.jsf`, "Ver turmas anteriores"): todas as turmas, atuais e passadas, agrupadas por período.
- **Turma virtual** (`ava/index.jsf`): abrir uma turma e ler seus Tópicos de Aula com datas, conteúdo e materiais anexados.

Ainda não feito: download de materiais, as demais seções da AVA (notas, frequência, participantes), escrita de dados e o servidor MCP. Veja [`docs/SITE.md`](docs/SITE.md) para como o site funciona (stack, CAS, navegação por ViewState/POST do JSF, códigos de horário).

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

## Uso

```ts
import {
  SigaaSession,
  fetchPortal,
  fetchAllClasses,
  openTurmaVirtual,
} from "sigaa-mcp";

const session = new SigaaSession();
await session.login(process.env.SIGAA_USERNAME!, process.env.SIGAA_PASSWORD!);

const portal = await fetchPortal(session);
console.log(portal.student.name, portal.enrolledClasses.length);
console.log(portal.activities);        // próximas tarefas/avaliações
console.log(portal.news);              // notícias institucionais
console.log(portal.forum);             // tópicos do fórum do curso

const all = await fetchAllClasses(session);  // atuais + passadas, por período

// Abre a turma virtual de uma turma e lê seus tópicos de aula + materiais.
const turma = portal.enrolledClasses.find((c) => c.frontEndIdTurma);
if (turma?.frontEndIdTurma) {
  const ava = await openTurmaVirtual(session, turma.frontEndIdTurma);
  console.log(ava.header, ava.topics.length);
}
```

Os padrões apontam para a UFRN (`sigaa.ufrn.br` / `autenticacao.ufrn.br`); sobrescreva pelo construtor do `SigaaSession` ou pelas variáveis de ambiente `SIGAA_BASE_URL` / `SIGAA_AUTH_BASE_URL`.

## Requisitos

Node.js ≥ 20 (usa o `fetch` nativo com `Headers.getSetCookie()`). Uma dependência de runtime: [`node-html-parser`](https://www.npmjs.com/package/node-html-parser) para fazer o parsing do HTML do SIGAA.
