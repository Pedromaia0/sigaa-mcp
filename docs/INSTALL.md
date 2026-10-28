# Instalação do servidor MCP

Guia para conectar o **sigaa-mcp** nos principais agentes/harnesses: Claude
Code, Claude Desktop, Codex, Cursor, Antigravity, opencode, Windsurf, Zed e
qualquer outro cliente **MCP** (Model Context Protocol) por stdio.

## Pré-requisitos

- **Node.js ≥ 20** (usa o `fetch` nativo com `Headers.getSetCookie()`).
- Suas credenciais do SIGAA (o mesmo login/senha do CAS da UFRN).

As credenciais são lidas **apenas de variáveis de ambiente**
(`SIGAA_USERNAME` / `SIGAA_PASSWORD`), passadas pela configuração do harness.
Nunca ficam escritas no repositório.

## Como o servidor é executado

Há duas formas de apontar para o servidor nas configurações abaixo. Escolha uma
e use o mesmo `command`/`args` em qualquer harness:

- **Via npm (recomendado, depois de publicado):**
  `command: "npx"`, `args: ["-y", "sigaa-mcp"]`
- **Local, a partir do clone (antes de publicar, ou para desenvolvimento):**
  `command: "node"`, `args: ["/caminho/absoluto/para/sigaa-mcp/dist/mcp.js"]`
  (rode `npm install && npm run build` uma vez para gerar o `dist/`).

Variáveis de ambiente aceitas: `SIGAA_USERNAME`, `SIGAA_PASSWORD` (obrigatórias),
`SIGAA_BASE_URL`, `SIGAA_AUTH_BASE_URL`, `SIGAA_DOWNLOAD_DIR` (opcionais).

---

## Claude Code (CLI)

```bash
claude mcp add sigaa \
  -e SIGAA_USERNAME=seu.login -e SIGAA_PASSWORD=sua-senha \
  -- npx -y sigaa-mcp
```

Local, sem publicar:

```bash
claude mcp add sigaa \
  -e SIGAA_USERNAME=seu.login -e SIGAA_PASSWORD=sua-senha \
  -- node /caminho/para/sigaa-mcp/dist/mcp.js
```

Verifique com `claude mcp list` e use `/mcp` dentro do Claude Code.

## Claude Desktop

Edite o arquivo de configuração:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

Reinicie o Claude Desktop depois de salvar.

## Codex (CLI da OpenAI)

Edite `~/.codex/config.toml` (formato TOML):

```toml
[mcp_servers.sigaa]
command = "npx"
args = ["-y", "sigaa-mcp"]
env = { SIGAA_USERNAME = "seu.login", SIGAA_PASSWORD = "sua-senha" }
```

## Cursor

Global em `~/.cursor/mcp.json`, ou por projeto em `.cursor/mcp.json`:

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

Em **Settings → MCP** o servidor aparece; habilite-o se necessário.

## Antigravity (Google)

Abra as configurações de MCP do Antigravity (painel/aba **MCP**, opção de
editar o arquivo de configuração — "View raw config" / `mcp_config.json`) e use
o mesmo formato `mcpServers`:

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

## opencode

Em `opencode.json` (global em `~/.config/opencode/opencode.json` ou por
projeto). O opencode usa a chave `mcp` com servidores do tipo `local`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "sigaa": {
      "type": "local",
      "command": ["npx", "-y", "sigaa-mcp"],
      "environment": {
        "SIGAA_USERNAME": "seu.login",
        "SIGAA_PASSWORD": "sua-senha"
      },
      "enabled": true
    }
  }
}
```

## Windsurf

Em `~/.codeium/windsurf/mcp_config.json` (ou pelo painel **Cascade → MCP
Servers → Manage**), mesmo formato `mcpServers`:

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

## Zed

Nas configurações (`settings.json`), o Zed usa `context_servers`:

```json
{
  "context_servers": {
    "sigaa": {
      "command": {
        "path": "npx",
        "args": ["-y", "sigaa-mcp"],
        "env": {
          "SIGAA_USERNAME": "seu.login",
          "SIGAA_PASSWORD": "sua-senha"
        }
      }
    }
  }
}
```

## Qualquer outro cliente MCP (stdio)

O servidor fala MCP por **stdio**. O denominador comum é sempre:

- **comando:** `npx -y sigaa-mcp` (ou `node /caminho/para/sigaa-mcp/dist/mcp.js`)
- **variáveis de ambiente:** `SIGAA_USERNAME`, `SIGAA_PASSWORD`

Adapte para o formato de configuração do seu cliente.

---

## Ferramentas expostas

Depois de conectado, o servidor oferece 7 ferramentas (somente leitura):

| Ferramenta | O que faz | Argumentos |
|---|---|---|
| `get_portal` | Portal do discente: dados do aluno, turmas matriculadas (com `frontEndIdTurma`), atualizações, atividades, notícias, fórum | — |
| `get_all_classes` | Todas as turmas, atuais e passadas, por período | — |
| `get_turma` | Tudo de uma turma: tópicos, participantes, notas, frequência, tarefas, avaliações, notícias, fóruns, referências, arquivos, questionários, enquetes, plano | `frontEndIdTurma` |
| `get_news_detail` | Texto completo de uma notícia da turma | `frontEndIdTurma`, `newsId` |
| `get_participant_profile` | Perfil de um participante | `frontEndIdTurma`, `personId` |
| `download_participant_photo` | Baixa a foto de um participante | `frontEndIdTurma`, `personId` |
| `download_file` | Baixa um material/arquivo da turma | `frontEndIdTurma`, `fileId` |

Os ids (`frontEndIdTurma`, `news[].id`, `participants[].personId`,
`files[].fileId`) vêm das respostas de `get_portal` / `get_turma` e são usados
para buscar cada item sob demanda.
