# sigaa-mcp

Agent-oriented client for **SIGAA** (Sistema Integrado de Gestão de Atividades Acadêmicas), built on the **web interface** — the HTML pages a browser uses — not the official mobile/OAuth API. It is meant to be driven by coding agents (Claude, Codex, Antigravity, …), eventually exposed over **MCP** (Model Context Protocol).

Scope: connect and fetch data now; write data later.

## Status

Early. The first building block is in place: **CAS web login**, which gives an authenticated web session (a `JSESSIONID` cookie) to reuse for page requests. Data fetching and the MCP server are not built yet.

## How login works

Standard **CAS** (Central Authentication Service) handshake against UFRN's auth server:

1. `GET` the CAS login form → read hidden `lt` and `execution` fields.
2. `POST` `username` / `password` / `lt` / `execution` → receive a `ticket=ST-…`.
3. Follow the ticket to SIGAA → SIGAA validates it and sets a `JSESSIONID` session cookie.

The `SigaaSession` object then carries that cookie jar for subsequent requests.

## Try the login

```bash
npm install
cp .env.example .env     # fill in SIGAA_USERNAME / SIGAA_PASSWORD
npm run login
```

Credentials are read from environment variables only. **Never commit `.env`** — it is gitignored.

## Usage

```ts
import { SigaaSession } from "sigaa-mcp";

const session = new SigaaSession();
await session.login(process.env.SIGAA_USERNAME!, process.env.SIGAA_PASSWORD!);

const res = await session.get("/sigaa/verPortalDiscente.do");
const html = await res.text();
```

Defaults target UFRN (`sigaa.ufrn.br` / `autenticacao.ufrn.br`); override via the
`SigaaSession` constructor or the `SIGAA_BASE_URL` / `SIGAA_AUTH_BASE_URL` env vars.

## Requirements

Node.js ≥ 20 (uses native `fetch` with `Headers.getSetCookie()`). No runtime dependencies.
