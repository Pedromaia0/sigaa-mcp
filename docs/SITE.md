# How SIGAA (web) works

Reverse-engineering notes for the UFRN SIGAA **web interface** — the HTML site a
browser uses at `https://sigaa.ufrn.br`. This is the surface `sigaa-mcp` scrapes;
it is deliberately **not** the official mobile/OAuth API. Findings are dated and
taken from live pages.

> Last verified: 2026-10-27 against `sigaa.ufrn.br` (node `sigaa12-producao`).

## Stack

| Layer | What it is | Evidence |
|---|---|---|
| Connector | **Apache-Coyote/1.1** | `Server:` response header |
| App server | **JBoss 5.0 / JBossWeb 2.1**, Servlet 2.5 | `X-Powered-By: Servlet 2.5; JBoss-5.0/JBossWeb-2.1` |
| View framework | **JSF** (JavaServer Faces, Sun Mojarra) | `com.sun.faces` ids, `javax.faces.ViewState`, `.jsf` URLs |
| AJAX/components | **RichFaces / a4j** + a **PrimeFaces** reference | `richfaces`, `a4j`, `primefaces` tokens in markup/resources |
| Security hint | `X-XSS-Protection: 1; mode=block` | response header |

The stack is old (JBoss 5 / Servlet 2.5 / Mojarra), which is why everything is
server-rendered HTML with form postbacks rather than JSON.

## Authentication — CAS SSO

SIGAA delegates login to a **CAS** (Central Authentication Service) server at
`https://autenticacao.ufrn.br`. The web login is a classic CAS handshake:

1. `GET autenticacao…/sso-server/login?service=<sigaa cas callback>`
   → HTML login form carrying hidden fields `lt` and `execution`.
2. `POST` the same URL with `username`, `password`, `lt`, `execution`,
   `_eventId=submit` → **302** whose `Location` has `?ticket=ST-…`.
3. `GET` that ticket URL (`sigaa…/sigaa/login/cas?ticket=ST-…`) → SIGAA
   validates the ticket and issues its session cookies.

Cookies observed after a successful login:

| Cookie | Set by | Role |
|---|---|---|
| `JSESSIONID` | both servers | servlet session (one per host) |
| `CASTGC` | CAS server | ticket-granting cookie (the SSO session) |
| `CASPRIVACY` | CAS server | CAS privacy flag |

> **Node stickiness.** SIGAA's `JSESSIONID` carries a node suffix, e.g.
> `…E65.sigaa12-producao`. The app is load-balanced and the session lives on one
> node. Reuse the **same cookie jar** for every request; a request routed to
> another node (or with the suffix stripped) loses the session. `SigaaSession`
> keeps one jar for the whole lifetime, which satisfies this.

`autenticacao.ufrn.br` also exposes an OAuth2 token endpoint used by the mobile
app. We intentionally do not use it here — this project is web-only.

## Navigation is POST-driven (the important part)

This is **not** a REST/GET site. Most "links" in SIGAA are JSF **command links**:
an `<a href="#" onclick="…jsfcljs(…)">` that submits a surrounding `<form>` by
POST to the current `.jsf` URL. The server advances the page based on:

- the **component id** of the clicked control (sent as a form parameter), and
- the form's **`javax.faces.ViewState`** token.

Example (opening a virtual classroom from the portal):

```html
<form id="form_acessarTurmaVirtual" method="post" action="/sigaa/portais/discente/discente.jsf">
  <input type="hidden" name="form_acessarTurmaVirtual" value="form_acessarTurmaVirtual"/>
  <a onclick="jsfcljs(document.getElementById('form_acessarTurmaVirtual'),
       {'form_acessarTurmaVirtual:j_id…':'…','frontEndIdTurma':'3FB3BED08…'},'')">
    ARQUITETURA DE COMPUTADORES
  </a>
  <input type="hidden" name="javax.faces.ViewState" value="j_id2"/>
</form>
```

To replay such a navigation programmatically you must POST to the form's `action`
with: every hidden input in that form, the clicked component id as a parameter,
any extra params from the `jsfcljs({...})` object (e.g. `frontEndIdTurma`,
`idTurma`), and the **current** `javax.faces.ViewState`.

Consequences:

- **ViewState is per-response and mandatory.** Each rendered page has one (or
  more) `javax.faces.ViewState` values; POSTing a stale one yields a
  `ViewExpired` error. Always read the ViewState from the page you're acting on.
- **State is server-side and sequential.** Some pages only make sense after
  visiting a prior page in the same session (it sets server-side context). E.g.
  `turmas.jsf` expects the discente portal to have been loaded first — so
  `fetchAllClasses()` hits `discente.jsf` before `turmas.jsf`.
- **Some content is plain GET.** A few links are ordinary hrefs — e.g.
  "Ver turmas anteriores" → `GET /sigaa/portais/discente/turmas.jsf`.

`src/util/jsf.ts` has `extractViewState()` and `parseJsfLink()` for exactly this,
ready for the write features later.

## The discente portal — `/sigaa/portais/discente/discente.jsf`

The landing page after login. ~90 KB of HTML with several panels. Parsed by
`src/portal/parse-portal.ts`:

| Panel / selector | Data |
|---|---|
| `#info-usuario` | name (`.usuario span`), current semester (`.periodo-atual strong`), center (`.unidade`) |
| "Dados Institucionais" (label:value `tr`s) | Matrícula, Curso, Status, Entrada |
| `td.descricao` rows | enrolled classes: name (+ open-turma postback), `td.info` location, `td.info center` schedule code |
| `#atualizacoes-turma` | per-class "Últimas Atualizações" feed — rows **in pairs**: `dd/mm/yyyy - CLASS (period)` then a title line like `Novo Tópico de Aula: …` |
| `#formAtividades` | "Minhas atividades" upcoming — rows of `icon · due date (N dias) · CLASS <br> Kind: Title`. Task titles are `<a>` links; exam ("Avaliação") titles are plain text |
| `#forum-portal` | course forum topics: title (`a[id*=mostrarForumMensagem]`), author, replies, datetime |
| `#noticias-portal` | **AJAX-loaded** — server HTML only has `scroller-portal.js` + a `var portal="<hash>"` token; the news items are fetched client-side, so they are not in the initial HTML (TODO: replay that request) |

## Class history — `/sigaa/portais/discente/turmas.jsf`

"Ver turmas anteriores". A single table listing **all** enrolled classes, current
and past, grouped by period. Parsed by `src/portal/parse-turmas.ts`:

- A **period separator** row is a lone cell `YYYY.P` (e.g. `2026.1`); classes
  below it belong to that period until the next separator.
- A **class** row: `CODE - NAME` (e.g. `DIM0127 - ARQUITETURA DE COMPUTADORES`),
  turma number, workload (`60h`), and the schedule code.

## Schedule codes

SIGAA encodes class times compactly, e.g. `246M12 (02/03/2026 - 06/03/2026)`:

- `246` — weekdays, SIGAA numbering **1=Sun, 2=Mon, … 7=Sat** (so `246` = Mon/Wed/Fri).
- `M` — shift: `M` manhã, `T` tarde, `N` noite.
- `12` — slot numbers within the shift.
- `(…)` — optional date range; many blocks omit it and inherit the semester window.

A string may hold several blocks separated by commas/spaces/nothing. The slot
clock times (e.g. `M3` = 08:55–09:45) and the decoder live in
`src/util/schedule.ts`, ported from the Campus app's web scraper (no API code).

## Open questions / TODO

- Replay the `#noticias-portal` AJAX call to capture news items.
- Map the turma-virtual pages (frequência, notas, tópicos de aula, tarefas).
- Catalogue which actions are plain GET vs JSF postbacks (for the write phase).
- Confirm session lifetime / `tempoSessao` behavior and re-login strategy.
