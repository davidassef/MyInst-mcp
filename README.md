# MyInst

MyInst é um vault open source para armazenar, versionar e sincronizar contexto agentic entre projetos, workspaces, dispositivos e clientes MCP.

Ele centraliza `skills`, `instructions`, `agents`, `hooks`, `memory`, `snippets` e configurações de clientes em um backend próprio, com interface web, API, CLI e MCP server local.

Também preserva continuidade de trabalho por projeto com Project State: memórias revisadas, decisões técnicas, resumos seguros de sessões e histórico de chats importado com opt-in explícito.

## O que o MyInst resolve

Equipes pequenas e usuários avançados costumam espalhar contexto em:

- `.claude/`
- `.codex/`
- `.cursor/`
- `.kimi-code/`
- `AGENTS.md`
- `GEMINI.md`
- `.mcp.json`
- regras locais por projeto

O resultado é previsível: duplicação, divergência entre máquinas, dificuldade para restaurar contexto e muito trabalho manual para manter agentes consistentes.

O MyInst resolve isso com:

- vault central versionado
- organização por `workspace -> projeto -> pasta -> conteúdo`
- sync local-first via MCP
- importação de estruturas conhecidas de clientes
- busca, diff e restore
- API key única por conta

## Para quem é

- quem usa agentes de código em múltiplos projetos
- quem quer manter instruções versionadas e sincronizadas
- quem precisa self-hosting e controle sobre o backend
- quem quer um vault pessoal, não um marketplace público de prompts

## Instale o MCP via npm

O jeito mais rápido de conectar o MyInst ao seu cliente MCP é instalar o servidor local pelo npm:

```bash
npm install -g @myinst/mcp-server
```

Depois configure o cliente:

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp"
    }
  }
}
```

Na primeira execução, o MCP abrirá automaticamente o browser para você fazer login e vincular sua conta. As credenciais são salvas localmente em `~/.myinst/credentials.json`.

### Configuração manual (alternativo)

Se preferir usar variáveis de ambiente:

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_API_KEY": "{{MYINST_API_KEY}}",
        "MYINST_SERVER": "https://api-myinst.lotoscore.com.br"
      }
    }
  }
}
```

Nunca cole chaves reais na documentação ou config de exemplo.  
Use placeholders e aplique valores reais apenas no ambiente local, em um arquivo de configuração privado.

Referências:

- [docs/mcp-server.md](./docs/mcp-server.md)
- [packages/mcp-server/README.md](./packages/mcp-server/README.md)

## Como funciona

```mermaid
flowchart LR
  A["Usuário cria conteúdo no web"] --> B["Vault MyInst"]
  C["Cliente MCP local"] --> D["myinst-mcp"]
  D --> B
  D --> E["Arquivos locais do projeto"]
  E --> D
```

Fluxo operacional recomendado:

1. `myinst_pull` materializa o vault localmente.
2. O agente trabalha sobre arquivos reais no projeto.
3. `myinst_push` sincroniza mudanças de volta.
4. `myinst_search` fica como ferramenta auxiliar de descoberta.

Pré-requisito antes de `myinst_push`:

- conteúdo revisado manualmente
- sem segredos em texto plano
- placeholders sensíveis preenchidos localmente

## Componentes do produto

| Componente | Papel |
|------------|-------|
| `frontend` | Painel web para workspaces, projetos, conteúdo e API keys |
| `backend` | API Fastify com auth, busca, sync, versionamento e persistência |
| `packages/cli` | CLI para login, listagem, status, pull, push e chats fora do fluxo MCP |
| `packages/mcp-server` | Servidor MCP local que conecta o cliente ao vault |
| `packages/shared` | Schemas Zod, tipos e contratos compartilhados |

## Compatibilidade de clientes

O MyInst agora trabalha com adapters em camadas de suporte.

| Cliente | Suporte | Escopo | Tipos nativos |
|---------|---------|--------|---------------|
| Claude Code | `full` | projeto | `skill`, `instruction`, `mcp_config`, `agent`, `hook`, `memory`, `snippet` |
| Codex | `full` | projeto e global | `skill`, `instruction`, `mcp_config`, `setting` |
| Cursor | `partial` | projeto e global | `instruction`, `mcp_config` |
| Gemini CLI | `partial` | projeto e global | `instruction` |
| OpenCode | `partial` | projeto e global | `instruction`, `mcp_config` |
| Qwen Code | `partial` | projeto | `instruction` |
| Aider | `partial` | projeto e global | `instruction`, `mcp_config` |
| Antigravity | `experimental` | projeto e global | `instruction`, `mcp_config` |
| Kimi Code | `partial` | projeto e global | `skill`, `mcp_config` |

Observação:
- `full` significa preservação direta da estrutura principal do cliente.
- `partial` significa import/export apenas do que o cliente tem estrutura estável.
- `experimental` exige cautela e mensagens explícitas de instabilidade.

### Suporte Kimi Code

O suporte ao Kimi Code é parcial e focado em artefatos persistentes com mapeamento estável.

Estruturas detectadas:

- projeto: `.kimi-code/skills` e `.kimi-code/mcp.json`
- global: `~/.kimi-code/skills` e `~/.kimi-code/mcp.json`

Mapeamento:

- `.kimi-code/skills/<slug>/SKILL.md` vira `skill`
- `.kimi-code/skills/<slug>.md` vira `skill`
- `.kimi-code/mcp.json` vira `mcp_config`

Exemplos:

```text
myinst_list_sync_targets scope="all" clients=["kimi"]
myinst_import scope="global" clients=["kimi"]
myinst_pull targetFormat="native" scope="project" clients=["kimi"]
```

O MyInst não tenta sincronizar cache, histórico, sessões, runtime interno ou arquivos arbitrários do Kimi.

## Estrutura do repositório

```text
MyInst/
├── backend/
├── frontend/
├── packages/
│   ├── cli/
│   ├── mcp-server/
│   └── shared/
├── deploy/
├── docs/
├── docker-compose.yml
├── docker-compose.vps.yml
└── README.md
```

## Stack

- Linguagem: TypeScript
- Backend: Fastify
- Frontend: React 19 + Vite
- Banco: PostgreSQL + Drizzle ORM
- Validação: Zod
- Auth: JWT + API key + OAuth opcional
- Monorepo: pnpm workspaces + Turborepo
- Testes: Vitest
- MCP: `@modelcontextprotocol/sdk`

## Quick start local

### Requisitos

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+
- Docker Desktop para fluxos com compose e alguns testes integrados

### Instalação

```bash
git clone git@github.com:davidassef/MyInst-mcp.git
cd MyInst-mcp
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

Ambiente local:

- API: `http://localhost:3000`
- Frontend: `http://localhost:5173`

## Configuração do MCP

Instalação:

```bash
npm install -g @myinst/mcp-server
```

Exemplo recomendado com autenticação automática:

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_SERVER": "https://api-myinst.lotoscore.com.br"
      }
    }
  }
}
```

Se `MYINST_API_KEY` não for informada, o MCP abre o navegador, redireciona para login e gera a credencial automaticamente. Configurar uma API key manual continua disponível como fallback para ambientes sem navegador.

## Tools MCP

| Tool | Papel |
|------|-------|
| `myinst_list_workspaces` | lista workspaces do usuário |
| `myinst_create_workspace` | cria workspace |
| `myinst_update_workspace` | edita nome, slug ou descrição de workspace |
| `myinst_delete_workspace` | apaga workspace com confirmação explícita e proteções de compatibilidade |
| `myinst_list_projects` | lista projetos do workspace |
| `myinst_create_project` | cria projeto em um workspace |
| `myinst_update_project` | edita nome, slug ou descrição de projeto |
| `myinst_delete_project` | apaga projeto com confirmação explícita e proteções de compatibilidade |
| `myinst_list_sync_targets` | detecta clientes e estruturas sincronizáveis locais |
| `myinst_pull` | materializa o vault em formato canônico ou nativo |
| `myinst_push` | envia mudanças locais detectadas para o vault |
| `myinst_import` | importa estruturas locais para o vault |
| `myinst_create_client_profile_item` | cria item global em Client Profile |
| `myinst_update_client_profile_item` | edita item global em Client Profile |
| `myinst_delete_client_profile_item` | apaga item global com confirmação explícita |
| `myinst_replicate_client_profile` | replica configurações globais compatíveis entre clients suportados |
| `myinst_search` | descoberta pontual por busca |
| `myinst_status` | mudanças temporais no vault |
| `myinst_state_capture` | cria draft local revisável de memória, decisão ou resumo de sessão |
| `myinst_state_push` | salva Project State revisado no vault |
| `myinst_state_pull` | materializa Project State em `.myinst/state/` |
| `myinst_state_search` | busca memórias, decisões e sessões do projeto |

## Fluxos de uso

### 1. Fluxo canônico local-first

```text
myinst pull -> myinst status -> editar arquivos locais -> myinst status -> myinst push
```

A CLI mantém `.myinst/sync-state.json` como manifesto local do último snapshot remoto conhecido. `myinst status` compara manifesto, arquivos locais e vault remoto para separar pendências de pull, push e conflitos antes do envio.

`myinst st` é apenas um alias curto de `myinst status`. Use o comando completo em scripts e documentação formal; use `st` no terminal quando quiser inspecionar o estado mais rápido.

Por padrão, a CLI lê todos os clients detectados no projeto atual, não apenas `.claude`. O escopo global da home do usuário só entra com `--scope global` ou `--scope all`, para evitar envio acidental de configuração pessoal.

Estados do `myinst status`:

- `Pendente de pull`: o vault remoto mudou ou tem item ausente no disco.
- `Pendente de push`: o disco local mudou ou tem item ausente no vault.
- `Conflitos`: local e remoto mudaram desde o último manifesto.
- `Sincronizado`: local, remoto e manifesto estão equivalentes.

O `myinst push` bloqueia conflitos. O v1 não faz merge automático nem deleção automática.

Exemplos:

```bash
myinst st
myinst status myinst --workspace meus-projetos --client codex kimi
myinst push myinst --workspace meus-projetos --scope project --client codex
myinst status myinst --workspace meus-projetos --scope all --client codex
```

Fluxo de continuidade do projeto:

```text
myinst_state_capture -> revisão local -> myinst_state_push
```

Project State não sincroniza cache bruto nem transcripts completos por padrão. Chats só entram por import explícito de arquivo JSON/Markdown e nunca são varridos automaticamente.

Quando mais de um client local for detectado, informe `--client` explicitamente nos comandos de sync. Configurações com segredos reais devem usar placeholders como `{{MYINST_API_KEY}}`; o push bloqueia padrões prováveis de segredo antes de gravar no vault.

Na CLI, o fluxo equivalente é:

```bash
myinst state capture memory "Contexto do deploy" --body "Deploy ocorre por push e pull na VPS."
myinst state push .myinst/state/drafts/memory-contexto-do-deploy.json --reviewed
myinst state pull myinst --workspace meus-projetos
myinst state search "deploy" --workspace meus-projetos --project myinst
```

Histórico de chats é separado de `project_sessions`, tem retenção padrão de 180 dias e bloqueia padrões prováveis de segredo antes de persistir:

```bash
myinst chat push --workspace meus-projetos --project myinst --client codex --session sessao-1 --file chat.json
myinst chat list --workspace meus-projetos --project myinst --client codex --tag release
myinst chat show sessao-1 --workspace meus-projetos --project myinst
myinst chat export sessao-1 --workspace meus-projetos --project myinst --format markdown
myinst chat summarize sessao-1 --workspace meus-projetos --project myinst
```

### MyInst como contexto de agente

Inclua o MyInst no documento de contexto do projeto, como `AGENTS.md`, `CLAUDE.md` ou equivalente. O papel dele é diferente de uma fonte de documentação como `context7`: o MyInst é o vault versionado do seu contexto operacional, e deve materializar arquivos locais do projeto antes de virar base de trabalho recorrente.

Bloco recomendado:

```md
## Contexto via MyInst

- Use o MCP server `myinst` quando estiver disponível.
- Antes de alterar instruções, skills, agents, hooks, snippets, settings ou mcp_config, rode `myinst_list_sync_targets` para confirmar clients e escopos.
- Para trabalho recorrente, materialize contexto local com `myinst_pull targetFormat="native" scope="project" clients=["codex"]` no diretório deste repositório.
- Use sempre o projeto MyInst correspondente ao repositório atual. Não use o projeto `default` como depósito geral.
- Use `myinst_search` apenas para descoberta pontual; depois traga o conteúdo relevante para arquivos locais do projeto.
- Ao modificar contexto versionável, revise segredos e finalize com `myinst_push` com `clients` e `scope` explícitos.
```

### 2. Descoberta multi-cliente antes do sync

```text
myinst_list_sync_targets
myinst_import ou myinst_push com clients explícitos
```

### 3. Exportação nativa para clientes

```text
myinst_pull targetFormat="native" clients=["cursor"]
```

### 4. Replicação entre clients

No v1, a replicação entre clients atua apenas sobre `Client Profiles` globais e só expõe pares suportados explicitamente.

Exemplo:

```text
myinst_replicate_client_profile sourceClient="claude" targetClient="opencode" dryRun=true
```

Política padrão:

- copiar apenas itens ausentes
- não sobrescrever o destino por padrão
- ignorar e relatar tipos sem equivalente nativo claro

## Compatibilidade de replicação entre clients

| Origem | Destino | Estado no v1 | Observação |
|--------|---------|--------------|------------|
| Claude | OpenCode | `suportado` | replica apenas `instruction` |
| Codex | OpenCode | `suportado` | replica apenas `instruction` |
| Claude | Codex | `planejado` | fora do v1 |
| Codex | Claude | `planejado` | fora do v1 |
| OpenCode | Claude | `planejado` | fora do v1 |
| OpenCode | Codex | `planejado` | fora do v1 |
| Cursor | OpenCode | `não suportado no v1` | feature futura |
| Gemini | OpenCode | `não suportado no v1` | feature futura |
| Qwen | OpenCode | `não suportado no v1` | feature futura |
| Aider | OpenCode | `não suportado no v1` | feature futura |
| Antigravity | OpenCode | `não suportado no v1` | feature futura |
| Kimi | OpenCode | `não suportado no v1` | feature futura |

## Workspaces

O modelo atual é:

```text
usuário -> workspaces -> projetos -> pastas -> conteúdos
```

Padrões do sistema:

- API keys continuam no nível da conta
- rotas legadas mantêm fallback interno de compatibilidade, mas o fluxo público recomendado exige workspace e projeto explícitos
- o MCP pode acessar todos os workspaces da conta com uma única API key

## Branding local não versionado

O frontend suporta override local de marca sem afetar forks do projeto:

- base pública: `frontend/public/brand.default/`
- override local ignorado por git: `frontend/public/brand.local/`
- exemplo: `frontend/public/brand.local.example/manifest.example.json`

Se `brand.local/manifest.json` existir, ele vence o manifest padrão em:

- nome do app
- tagline
- logo lateral
- logo mark
- favicon

## Variáveis de ambiente

Consulte [`.env.example`](./.env.example).

Campos críticos para produção:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_URL`
- `API_PUBLIC_URL`
- `CORS_ORIGIN`
- `WEB_OAUTH_SUCCESS_URL`
- `VITE_MYINST_API_BASE`

## Comandos importantes

```bash
pnpm dev
pnpm lint
pnpm build
pnpm test
pnpm validate
pnpm compose:check
pnpm release:check
pnpm prod:preflight
```

## Self-hosting e deploy

Documentação principal:

- [docs/self-hosting.md](./docs/self-hosting.md)
- [docs/go-live-checklist.md](./docs/go-live-checklist.md)
- [docs/mcp-server.md](./docs/mcp-server.md)
- [docs/publicacao-npm.md](./docs/publicacao-npm.md)

Padrão de deploy do projeto:

- sempre via `git push` e `git pull`
- sem cópia manual de arquivos para VPS
- API exposta em `https://api-myinst.lotoscore.com.br`

## Contribuindo

Leia [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licença

AGPL-3.0.
