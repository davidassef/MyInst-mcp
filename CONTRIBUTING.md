# Contribuindo com o MyInst

Este é o guia canônico de contribuição do projeto.

## Objetivo do repositório

O MyInst é um vault open source para contexto agentic com:

- backend próprio
- frontend de gestão
- CLI
- MCP server
- adapters de sync para múltiplos clientes

Contribuições devem priorizar previsibilidade, legibilidade e compatibilidade entre superfícies.

## Setup local

```bash
git clone git@github.com:davidassef/MyInst-mcp.git
cd MyInst-mcp
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

## Estrutura do monorepo

| Caminho | Papel |
|---------|-------|
| `backend/` | API Fastify, auth, sync, busca, versionamento |
| `frontend/` | painel web |
| `packages/shared/` | tipos e schemas compartilhados |
| `packages/cli/` | CLI |
| `packages/mcp-server/` | MCP server e adapters de sync |
| `docs/` | documentação operacional e pública |
| `deploy/` | compose, exemplos de env e rotinas de deploy |

## Convenções de código

- resposta, documentação e comentários em pt-BR
- lógica de negócio em pt-BR; APIs/frameworks em EN
- nomes devem revelar intenção
- prefira early return
- evite `any`
- comente apenas o porquê

## Commits

Use Conventional Commits em pt-BR:

```text
feat: adiciona adapter do cursor para rules e mcp
fix: corrige colisão de slug ao renomear projeto
docs: reescreve guia de self-hosting
refactor: centraliza descoberta de clientes no mcp-server
```

## Fluxo de trabalho

1. sincronize sua branch
2. implemente a mudança com escopo claro
3. valide localmente
4. abra PR com contexto suficiente

## Testes obrigatórios

Para alterações relevantes, rode:

```bash
pnpm validate
pnpm compose:check
```

Se a mudança for focada em um pacote:

```bash
pnpm --filter @myinst/mcp-server lint
pnpm --filter @myinst/mcp-server test
pnpm --filter @myinst/mcp-server build

pnpm --filter @myinst/frontend lint
pnpm --filter @myinst/frontend build

pnpm --filter @myinst/backend test
```

## Como adicionar um novo adapter de cliente

Adapters vivem em `packages/mcp-server/src/sync-targets/`.

Cada adapter deve declarar:

- `id`
- `nome`
- `escopoSuportado`
- `nivelSuporte`
- `tiposSuportados`
- `detectar`
- `ler`
- `escrever`

Critérios:

- use apenas caminhos documentados oficialmente
- não sincronize caches, sessões, plugins empacotados ou runtime interno
- se o cliente não tiver estrutura estável para `skill`, não invente mapeamento
- suporte parcial é preferível a heurística agressiva

## Níveis de suporte

| Nível | Significado |
|-------|-------------|
| `full` | estrutura estável e round-trip confiável |
| `partial` | apenas parte do modelo do MyInst é mapeável com segurança |
| `experimental` | caminhos ou convenções ainda frágeis; requer aviso explícito |

## Compatibilidade e documentação

Toda mudança que altere contrato público deve atualizar:

- `README.md`
- `docs/mcp-server.md`, quando afetar o MCP
- `packages/mcp-server/README.md`, quando afetar uso/publicação do pacote

Se a mudança alterar comportamento real, a documentação não pode ficar para depois.

## Branding local

O projeto suporta marca privada local via:

- `frontend/public/brand.default/`
- `frontend/public/brand.local/` ignorado por git

Não suba assets privados ou específicos de deployment para o repositório público.

## Banco e schema

Mudanças DDL devem seguir fluxo explícito e cauteloso.

- não proponha nem execute alteração destrutiva sem autorização clara
- documente impacto
- valide localmente antes de qualquer deploy

## Deploy

Deploy é sempre via `git push` e `git pull`.

Não use fluxo de copiar arquivos manualmente para VPS.

## Licença

Ao contribuir, você concorda que o conteúdo seguirá sob AGPL-3.0.
