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
  It is **server-side state** — the value is a short key (e.g. `j_id2`), not a
  serialized tree — so you cannot fabricate or edit it. Verified empirically: a
  postback with a bogus `javax.faces.ViewState=j_id999` is rejected and bounced
  to the main menu, while the real token returns the requested page. Server-side
  state also keeps only a bounded number of logical views per session, which is
  why navigating many pages in a chain eventually fails (old views evicted).
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
| `#noticias-portal` | institutional news. The panel div only holds `scroller-portal.js`, but the items themselves are emitted **inline** as a JS array — `fcontent[n]="<p class='noticia'>…</p>"` — each with a title and description anchor `id="noticia_<id>"`. Parsed from the raw HTML, no extra request. (The "ver mais" popup at `/sigaa/noticias_comum.jsf?portal=<hash>` is the full ~10 MB archive — not used.) |

## Class history — `/sigaa/portais/discente/turmas.jsf`

"Ver turmas anteriores". A single table listing **all** enrolled classes, current
and past, grouped by period. Parsed by `src/portal/parse-turmas.ts`:

- A **period separator** row is a lone cell `YYYY.P` (e.g. `2026.1`); classes
  below it belong to that period until the next separator.
- A **class** row: `CODE - NAME` (e.g. `DIM0127 - ARQUITETURA DE COMPUTADORES`),
  turma number, workload (`60h`), and the schedule code.

## Virtual classroom (AVA) — `/sigaa/ava/index.jsf`

Opening a turma from the portal is a **JSF postback**, not a link: the portal's
`form_acessarTurmaVirtual` command link posts `frontEndIdTurma` + the component
id + ViewState back to `discente.jsf`, and the server responds with the virtual
classroom (AVA — Ambiente Virtual de Aprendizagem) at `/sigaa/ava/index.jsf`.

`openTurmaVirtual(session, frontEndIdTurma)` reproduces this: it re-fetches the
portal (fresh ViewState), finds the matching open link, replays the postback via
`buildFormBody`, and parses the result. `frontEndIdTurma` comes from the
`EnrolledClass` objects `fetchPortal` returns.

Parsed by `src/portal/parse-turma-virtual.ts`:

| Part | Data |
|---|---|
| header bar | `CODE - NAME (workload) (period)`, e.g. `DIM0127 - ARQUITETURA DE COMPUTADORES (60h) (2026.2)` |
| `.topico-aula` | one lesson topic: `.titulo` = title + `(dd/mm/yyyy - dd/mm/yyyy)` range; `.conteudotopico` = body text + materials |
| material links | `<a onclick="jsfcljs(…{'id':'<fileId>'}…,'_blank')">name</a>` — the download is itself a postback on `formAva` carrying that file `id`; we capture name + fileId + the form/component (actual download TODO) |

### AVA sections (left menu)

Each left-menu item is another `formMenu` postback. `fetchTurmaFull()` opens the
classroom once and then navigates each section **from that same opened page** —
its view stays valid for repeated menu postbacks within the session, whereas
chaining from each returned page proved unreliable (stale ViewState / component
ids). Parsed by `src/portal/parse-turma-sections.ts`:

| Menu item | Data parsed |
|---|---|
| Participantes | docentes + discentes: name, matrícula, usuário, e-mail, curso/formação, idPessoa |
| Ver Notas | the student's own grade row: column labels, values, faltas, situação (colspan layout kept as labels+values, not force-mapped) |
| Frequência | per-date presence (`Data`/`Situação`) + total faltas |
| Tarefas | title, delivery period, graded?, submission count |
| Avaliações | scheduled assessments: date, time code, description |
| Notícias | class news: title + date |
| Fóruns | forum list (title, date) — often empty |
| Referências | bibliographic/web references: name, type, URL, tópico |
| Arquivos | every file published in the turma: name, tópico, download id |
| Questionários | list; empty-detected via "Nenhum item foi encontrado" (populated shape unverified) |
| Enquetes | same as Questionários |
| Plano de Curso | label→value rows (Metodologia, Ementa, Procedimentos de Avaliação, …) from `table.listagem` where rows are `<th>Label:</th><td>value</td>` |

Parsing note: SIGAA wraps the real data table in layout tables and pads rows with
blank `<td>`s, so the parsers target **leaf tables** (no nested `<table>`) and
drop empty cells. Sections still not parsed: Conteúdo/Página web, Vídeos,
Situação dos Discentes, Linha do Tempo. **Mensagens is not a turma section** —
it's the per-person Caixa Postal (`Mensagem.show(...)`), not an AVA menu item.

### Per-item detail (recursive)

- **Notícias → Visualização de Notícia.** Each news row has a "Visualizar"
  command link in the listing form (`j_id…_297`) carrying the `idNoticia` as its
  `id` param. Posting it to `NoticiaTurma/listar.jsf` returns the full item
  (título, data+hora, texto). `fetchNewsDetail` / `get_news_detail`. Repeated
  drills from one listing page work (the server-side view stays live).
- **Participantes → Visualizar Perfil.** A **RichFaces A4J** call, not a plain
  postback: `A4J.AJAX.Submit('<form>', …, {parameters:{idPessoa:N,'<comp>':'<comp>'}, containerId:'<c>'})`.
  Replayed as a POST to `participantes.jsf` with the form fields plus
  `AJAXREQUEST=<containerId>`, `idPessoa=N` and `<comp>=<comp>`; the response is
  an XML partial-response whose `#basePanelPerfil` holds the profile (curso,
  matrícula, usuário, e-mail, descrição, Lattes). `fetchParticipantProfile` /
  `get_participant_profile`.
- **Participant photo.** Each row's `<img src>` is a **short-lived signed**
  `arquivos.info.ufrn.br/get?k=…` URL (or the default avatar); it expires within
  ~a minute, so `downloadParticipantPhoto` re-opens Participantes, reads the
  current URL for the `personId` and fetches it immediately. `download_participant_photo`.
- **Tarefas.** The per-row icon is `enviar_tarefa.png` — a submission (write)
  action, not a read view — so there is no read-only task detail beyond the
  listing. Avaliações likewise have no per-item detail.

Each of these is a per-item fetch keyed by the item's id (`news[].id`,
`participants[].personId`) from `get_turma` / `fetchTurmaFull` — fetch an item's
detail when you need it, rather than all at once.

### Downloading files

Both lesson-topic materials and Arquivos entries download by replaying their
`jsfcljs(... {'id':'<fileId>'} ...)` postback. `downloadTurmaFile(session,
frontEndIdTurma, fileId)` opens the turma for a fresh ViewState, finds the link
with that id (classroom page first, then the Arquivos listing), and POSTs to the
**form's own `action`** — `ava/index.jsf` for topic materials,
`ava/ArquivoTurma/listar_discente.jsf` for Arquivos. The response is the file
itself: `Content-Type` + `Content-Disposition: attachment; filename="…"`. Note
the two listings use different id spaces for the same file, so a given `fileId`
only resolves on the page it came from.

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

- Parse the remaining AVA sections (Conteúdo/Página web, Vídeos, Situação dos Discentes, Linha do Tempo).
- Validate Questionários/Enquetes parsing against a turma that actually has them.
- Catalogue which actions are plain GET vs JSF postbacks (for the write phase).
- Confirm session lifetime / `tempoSessao` behavior and re-login strategy.
