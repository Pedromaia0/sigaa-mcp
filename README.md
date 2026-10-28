# sigaa-mcp

Agent-oriented client for **SIGAA** (Sistema Integrado de Gestão de Atividades Acadêmicas), built on the **web interface** — the HTML pages a browser uses — not the official mobile/OAuth API. It is meant to be driven by coding agents (Claude, Codex, Antigravity, …), eventually exposed over **MCP** (Model Context Protocol).

Scope: connect and fetch data now; write data later.

## Status

Early, but reading real data. In place:

- **CAS web login** → authenticated web session (`JSESSIONID`) reused for page requests.
- **Discente portal** (`discente.jsf`): student info, enrolled classes (with decoded schedules), the per-class updates feed, upcoming activities (tasks/exams), and course-forum topics.
- **Class history** (`turmas.jsf`, "Ver turmas anteriores"): all classes, current and past, grouped by period.

Not built yet: news (AJAX-loaded), turma-virtual pages (grades, attendance), writes, and the MCP server. See [`docs/SITE.md`](docs/SITE.md) for how the site works (stack, CAS, JSF ViewState/POST navigation, schedule codes).

## How login works

Standard **CAS** (Central Authentication Service) handshake against UFRN's auth server:

1. `GET` the CAS login form → read hidden `lt` and `execution` fields.
2. `POST` `username` / `password` / `lt` / `execution` → receive a `ticket=ST-…`.
3. Follow the ticket to SIGAA → SIGAA validates it and sets a `JSESSIONID` session cookie.

The `SigaaSession` object then carries that cookie jar for subsequent requests.

## Try it

```bash
npm install
cp .env.example .env     # fill in SIGAA_USERNAME / SIGAA_PASSWORD
npm run login            # smoke-test the CAS login
npm run portal           # fetch + print portal and full class history as JSON
```

Credentials are read from environment variables only. **Never commit `.env`** — it is gitignored.

## Usage

```ts
import { SigaaSession, fetchPortal, fetchAllClasses } from "sigaa-mcp";

const session = new SigaaSession();
await session.login(process.env.SIGAA_USERNAME!, process.env.SIGAA_PASSWORD!);

const portal = await fetchPortal(session);
console.log(portal.student.name, portal.enrolledClasses.length);
console.log(portal.activities);        // upcoming tasks/exams
console.log(portal.forum);             // course forum topics

const all = await fetchAllClasses(session);  // current + past, by period
```

Defaults target UFRN (`sigaa.ufrn.br` / `autenticacao.ufrn.br`); override via the
`SigaaSession` constructor or the `SIGAA_BASE_URL` / `SIGAA_AUTH_BASE_URL` env vars.

## Requirements

Node.js ≥ 20 (uses native `fetch` with `Headers.getSetCookie()`). One runtime
dependency: [`node-html-parser`](https://www.npmjs.com/package/node-html-parser) for parsing SIGAA's HTML.
