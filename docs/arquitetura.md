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
│  │ /api/v1/.../chats           historico opt-in          │  │
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
- **ChatSession / ChatMessage**: histórico de chats importado por arquivo explícito, separado do Project State.
- **Tag**: labels de modelo/provider para filtro.
- **ContentVersion**: histórico de versões de conteúdo.

### Relacionamentos

```text
User (1) ──► (N) Workspace (1) ──► (N) Project (1) ──► (N) Folder
                                             │
                                             ├──► (N) ContentItem ──► (N) ContentVersion
                                             ├──► (N) ProjectMemory
                                             ├──► (N) ProjectDecision
                                             ├──► (N) ProjectSession
                                             └──► (N) ChatSession ──► (N) ChatMessage

User (1) ──► (N) ClientProfile (1) ──► (N) ClientProfileItem
User (1) ──► (N) ApiKey
User (1) ──► (N) Tag
```

## Tipos de Conteúdo

| Tipo | Descrição | Destino local canônico |
|------|-----------|------------------------|
| `skill` | Skill ou capacidade reutilizável | `.myinst/content/skills/{slug}.md` |
| `instruction` | Regras e instruções de agente | `.myinst/content/instructions/{slug}.md` |
| `mcp_config` | Configuração MCP persistente | `.myinst/content/mcp-config/{slug}.json` |
| `agent` | Definições de agentes | `.myinst/content/agents/{slug}.md` |
| `command` | Comandos persistentes de clients compatíveis | `.myinst/content/commands/{slug}.md` |
| `hook` | Definições de hooks | `.myinst/content/hooks/hook-{slug}.md` |
| `memory` | Memória materializável de client | `.myinst/content/memory/{slug}.md` |
| `output_style` | Estilos de saída persistentes | `.myinst/content/output-styles/{slug}.md` |
| `setting` | Configuração persistente redigida | `.myinst/client-profiles/{clientId}/settings/{slug}.json` |
| `snippet` | Blocos de texto reutilizáveis | `.myinst/content/snippets/{slug}.md` |

Use `targetFormat="native"` com `clients` explícitos quando quiser materializar no layout real do cliente, como `.codex/AGENTS.md` ou `.codex/skills/<namespace>/<slug>/SKILL.md`.

Arquivos nativos de configuração (`setting` e `mcp_config`) são tratados como específicos da máquina. O export nativo pode criar esses arquivos quando ausentes, mas preserva arquivos existentes para não sobrescrever credenciais, paths, providers, modelos ou outros ajustes locais. Conteúdo autoral como `instruction`, `skill`, `agent`, `command`, `memory` e `snippet` continua seguindo o fluxo normal de sync.

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

## Histórico de Chats

Chats ficam em tabelas próprias e não entram em sync automático. A origem inicial é arquivo explícito via CLI:

```text
myinst chat push --workspace meus-projetos --project myinst --client codex --session sessao-1 --file chat.json
myinst chat list --workspace meus-projetos --project myinst --client codex --q sync --tag release
myinst chat show sessao-1 --workspace meus-projetos --project myinst --message-limit 100 --message-offset 0
myinst chat export sessao-1 --workspace meus-projetos --project myinst --format markdown
myinst chat summarize sessao-1 --workspace meus-projetos --project myinst
```

A retenção padrão é de 180 dias. A API rejeita padrões prováveis de segredo em mensagens e metadata antes de persistir. Cada histórico deve ser salvo no projeto que representa o repositório ou produto de origem; não use um projeto genérico para agrupar chats de contextos diferentes.

Uma conversa longa continua sendo uma única `chat_session`; as mensagens são paginadas por `messageLimit` e `messageOffset`. Sessões `--part-*` são consideradas legado operacional e não devem ser criadas por adapters oficiais.

O histórico de chats não usa os adapters de arquivo de `myinst pull`/`myinst push`. Ele é indexado por `{ workspace, project, client, session }` e permite filtrar ou exportar sessões por client, como `codex`, `claude`, `cursor`, `kimi` ou outro identificador informado na CLI.

Nesta versão, o MyInst não varre automaticamente diretórios internos de clients, como `.codex/sessions`, `.claude/projects`, `history/**` ou caches locais. Para sincronizar chats, escolha a fonte explicitamente: normalize a sessão para JSON/Markdown revisado com `myinst chat push`, ou use `myinst chat import` quando houver adapter dedicado para o client e a categoria. O primeiro adapter dedicado cobre `codex/history`; cache permanece bloqueado até existir persistência segura por client.

## Sync Local da CLI

A CLI standalone usa o backend como vault remoto e mantém um manifesto local em `.myinst/sync-state.json`.

Fluxo recomendado:

```text
myinst pull -> myinst status -> editar arquivos locais -> myinst status -> myinst push
```

O manifesto registra o último snapshot remoto aplicado no projeto: workspace, projeto, horário do servidor e hashes de body, metadata e tags por `{ clientId, scope, workspace, project, type, slug }`. O comando `myinst status` busca o snapshot remoto atual por `/api/v1/sync/pull`, lê os arquivos locais reconhecidos pelos adapters compartilhados e classifica cada item em:

- **Pendente de pull**: remoto mudou ou existe só no vault.
- **Pendente de push**: local mudou ou existe só no disco.
- **Conflitos**: local e remoto mudaram desde o último manifesto.
- **Sincronizado**: local, remoto e manifesto equivalem.

O v1 não faz merge automático nem aplica deleção automática. Remoções aparecem como pendência manual para evitar perda de conteúdo.

A CLI usa os mesmos adapters multi-cliente do MCP, expostos em `@myinst/shared/sync-targets`. O padrão operacional é `scope=project`, lendo todos os clients detectados dentro do repositório. `scope=global` e `scope=all` precisam ser escolhidos explicitamente para incluir arquivos da home do usuário.

Quando mais de um client for detectado, informe `--client` explicitamente também em `scope=project`. O objetivo é impedir que conteúdo de Codex, Claude, Cursor ou Kimi seja aplicado no layout errado.

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
