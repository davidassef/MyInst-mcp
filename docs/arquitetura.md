# Arquitetura

## Visão Geral

```text
┌─────────────────────────────────────────────────────────────┐
│                    Máquina do Usuário                       │
│                                                             │
│  ┌────────────────────┐ stdio ┌──────────────────────────┐  │
│  │ Codex, Claude,     │◄─────►│ @myinst/mcp-server       │  │
│  │ Cursor, Kimi,      │       │ Node.js local            │  │
│  │ OpenCode e outros  │       │                          │  │
│  └────────────────────┘       │ Auth por login/API key   │  │
│                               │ Pull/push configs        │  │
│                               │ Project State revisado   │  │
│                               └────────────┬─────────────┘  │
└────────────────────────────────────────────┼────────────────┘
                                             │ HTTPS
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       MyInst Server                         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ API Fastify                                           │  │
│  │ /api/v1/auth/*              auth, login, API keys     │  │
│  │ /api/v1/workspaces/*        workspaces e projetos     │  │
│  │ /api/v1/client-profiles/*   configs globais           │  │
│  │ /api/v1/sync/*              pull/push MCP             │  │
│  │ /api/v1/search              busca project/global/state│  │
│  └────────────────────────────┬──────────────────────────┘  │
│                               │                             │
│  ┌────────────────────────────▼──────────────────────────┐  │
│  │ PostgreSQL + Drizzle ORM                              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Stack

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| MCP Server | TypeScript / Node.js | MCP SDK é nativo em TypeScript |
| Backend API | TypeScript / Fastify | API leve, tipada e compartilhável com o MCP |
| Frontend | React 19 / Vite | Painel web simples e rápido |
| Banco | PostgreSQL | Relacional, JSONB e busca textual |
| ORM | Drizzle ORM | Schema type-safe e deploy controlado |
| Validação | Zod | Contratos compartilhados entre API, MCP e CLI |
| Monorepo | pnpm workspaces + Turborepo | Builds e filtros por pacote |

## Estrutura do Monorepo

```text
myinst/
├── backend/             # API Fastify
│   ├── src/
│   │   ├── routes/      # auth, workspaces, projects, content, sync, client profiles, state
│   │   ├── db/          # schema Drizzle
│   │   └── middleware/
│   └── tests/
├── frontend/            # App React
├── packages/
│   ├── cli/             # CLI MyInst
│   ├── mcp-server/      # MCP Server publicável no npm
│   │   ├── src/
│   │   │   ├── client/        # HTTP client para API
│   │   │   ├── sync-targets/  # adapters de clientes
│   │   │   ├── applier/       # materialização local
│   │   │   └── project-state/ # drafts e materialização de estado
│   │   └── tests/
│   └── shared/          # Tipos, schemas e constantes compartilhadas
├── deploy/
├── docs/
└── docker-compose.yml
```

## Modelo de Dados

### Entidades principais

- **User**: conta do usuário.
- **ApiKey**: credenciais para MCP/CLI, sempre no escopo do usuário.
- **Workspace**: agrupamento lógico de projetos.
- **Project**: projeto dentro de um workspace.
- **Folder**: organização interna de conteúdo de projeto.
- **ContentItem**: conteúdo materializável de projeto, como skills e instruções.
- **ClientProfile**: configurações globais de um cliente, fora de workspace/projeto.
- **ClientProfileItem**: item global de cliente, como skill global, config ou instrução.
- **ProjectMemory / ProjectDecision / ProjectSession**: Project State revisado por projeto.
- **Tag**: labels de modelo/provider para filtro.
- **ContentVersion**: histórico de versões de conteúdo.

### Relacionamentos

```text
User (1) ──► (N) Workspace (1) ──► (N) Project (1) ──► (N) Folder
                                             │
                                             ├──► (N) ContentItem ──► (N) ContentVersion
                                             ├──► (N) ProjectMemory
                                             ├──► (N) ProjectDecision
                                             └──► (N) ProjectSession

User (1) ──► (N) ClientProfile (1) ──► (N) ClientProfileItem
User (1) ──► (N) ApiKey
User (1) ──► (N) Tag
```

## Tipos de Conteúdo

| Tipo | Descrição | Destino local canônico |
|------|-----------|------------------------|
| `skill` | Skill ou capacidade reutilizável | `.claude/skills/{slug}.md` |
| `instruction` | Regras e instruções de agente | `.claude/CLAUDE.md` |
| `mcp_config` | Configuração MCP persistente | `.mcp.json` |
| `agent` | Definições de agentes | `.claude/agents/{slug}.md` |
| `command` | Comandos persistentes de clients compatíveis | `.claude/commands/{slug}.md` |
| `hook` | Definições de hooks | `.claude/hook-{slug}.md` |
| `memory` | Memória materializável de client | `.claude/memory/{slug}.md` |
| `output_style` | Estilos de saída persistentes | `.claude/output-styles/{slug}.md` |
| `setting` | Configuração persistente redigida | `.myinst/client-profiles/{clientId}/settings/{slug}.json` |
| `snippet` | Blocos de texto reutilizáveis | `.claude/snippets/{slug}.md` |

## Client Profiles

Client Profiles representam configurações globais por cliente. Eles não pertencem a workspaces nem projetos.

| Client | Suporte | Escopo | Tipos principais |
|--------|---------|--------|------------------|
| Claude Code | `full` | projeto | `skill`, `instruction`, `agent`, `hook`, `memory`, `snippet`, `mcp_config` |
| Codex | `full` | projeto e global | `skill`, `instruction`, `setting`, `mcp_config` |
| Cursor | `partial` | projeto e global | `instruction`, `mcp_config`, `setting` |
| Gemini CLI | `partial` | projeto e global | `instruction`, `mcp_config` |
| OpenCode | `partial` | projeto e global | `instruction`, `mcp_config`, `setting` |
| Qwen Code | `partial` | projeto e global | `instruction`, `setting` |
| Aider | `partial` | projeto e global | `instruction`, `mcp_config` |
| Antigravity | `experimental` | projeto e global | `instruction`, `mcp_config`, `setting` |
| Kimi Code | `partial` | projeto e global | `skill`, `mcp_config` |

### Kimi Code

O adapter Kimi Code é parcial e sincroniza apenas artefatos persistentes conhecidos.

Estruturas reconhecidas:

- projeto: `.kimi-code/skills` e `.kimi-code/mcp.json`
- global: `~/.kimi-code/skills` e `~/.kimi-code/mcp.json`

Mapeamento:

- `.kimi-code/skills/<slug>/SKILL.md` vira `skill`
- `.kimi-code/skills/<slug>.md` vira `skill`
- `.kimi-code/mcp.json` vira `mcp_config`

Ficam fora do vault: cache, histórico, sessões, telemetry, runtime interno e arquivos arbitrários.

## Project State

Project State preserva continuidade operacional por projeto sem salvar chats completos ou cache bruto.

Tipos:

- **ProjectMemory**: fatos persistentes revisados.
- **ProjectDecision**: decisões técnicas e tradeoffs.
- **ProjectSession**: resumo seguro de sessão/ciclo de trabalho.

Fluxo MCP:

```text
myinst_state_capture -> revisão local -> myinst_state_push
myinst_state_search
myinst_state_pull
```

O backend rejeita escrita via API key quando o conteúdo não estiver marcado como revisado.

## Fluxo de Autenticação

1. Usuário instala `@myinst/mcp-server`.
2. Cliente MCP executa `myinst-mcp`.
3. Se não houver credencial local, o MCP abre o navegador em `/connect-mcp`.
4. Após login/autorização, a API gera uma API key para o MCP.
5. A credencial fica salva localmente em `~/.myinst/credentials.json`.
6. `MYINST_API_KEY` manual continua disponível como fallback.

### Formato da API Key

```text
myinst_[random base64url]
```

O banco armazena prefixo para identificação e hash SHA-256 completo para validação.
