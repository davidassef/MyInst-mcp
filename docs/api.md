# API Reference

Base URL: `http://localhost:3000/api/v1`

## Autenticação

Todas as rotas (exceto register e login) requerem autenticação via:
- **JWT Token**: `Authorization: Bearer <jwt_token>` (obtido no login)
- **API Key**: `Authorization: Bearer myinst_xxxxx` (gerada via endpoint)

---

## Auth

### POST /auth/register

Cria uma nova conta.

**Body:**
```json
{
  "email": "usuario@email.com",
  "password": "minhasenha123",
  "displayName": "Meu Nome"
}
```

**Response (201):**
```json
{
  "data": {
    "user": { "id": "uuid", "email": "...", "displayName": "..." },
    "token": "jwt_token"
  }
}
```

### POST /auth/login

Autentica e retorna JWT.

**Body:**
```json
{
  "email": "usuario@email.com",
  "password": "minhasenha123"
}
```

**Response (200):**
```json
{
  "data": {
    "user": { "id": "uuid", "email": "...", "displayName": "..." },
    "token": "jwt_token"
  }
}
```

### GET /auth/me

Retorna perfil do usuário autenticado.

### POST /auth/api-keys

Gera nova API key.

**Body:**
```json
{
  "name": "MacBook Pro",
  "scopes": ["read", "write"],
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Response (201):**
```json
{
  "data": {
    "id": "uuid",
    "name": "MacBook Pro",
    "key": "myinst_xxxxxxxxxxxxxxxxxxxx",
    "keyPrefix": "myinst_xxxxxxx",
    "scopes": ["read", "write"],
    "expiresAt": null,
    "createdAt": "..."
  }
}
```

A key completa só é retornada uma vez. Guarde-a com segurança.

### GET /auth/api-keys

Lista API keys do usuário (mascaradas).

### DELETE /auth/api-keys/:id

Revoga uma API key.

---

## Projects

### GET /projects

Lista todos os projetos do usuário.

### POST /projects

Cria novo projeto.

**Body:**
```json
{
  "name": "Meu SaaS",
  "slug": "meu-saas",
  "description": "Projeto principal"
}
```

### GET /projects/:slug

Retorna detalhes de um projeto.

### PATCH /projects/:slug

Atualiza projeto (campos parciais).

### DELETE /projects/:slug

Deleta projeto. O backend pode bloquear projetos protegidos de compatibilidade.

### GET /projects/:slug/folders

Lista folders do projeto.

### POST /projects/:slug/folders

Cria folder.

**Body:**
```json
{
  "name": "Skills",
  "slug": "skills",
  "sortOrder": 0
}
```

### DELETE /projects/:slug/folders/:folderId

Deleta folder.

---

## Content

### GET /projects/:slug/content

Lista conteúdos do projeto.

**Query params:**
- `type` — Filtrar por tipo (skill, instruction, mcp_config, agent, hook, memory, snippet)
- `tag` — Filtrar por tag
- `active` — Filtrar por status (true/false)

### POST /projects/:slug/content

Cria item de conteúdo.

**Body:**
```json
{
  "type": "skill",
  "title": "TDD Workflow",
  "slug": "tdd-workflow",
  "description": "Skill de TDD",
  "body": "Conteúdo da skill aqui...",
  "folderId": "uuid (opcional)",
  "metadata": {},
  "tags": ["claude-opus", "claude-sonnet"],
  "isActive": true
}
```

### GET /projects/:slug/content/:contentSlug

Retorna item específico com tags.

### PATCH /projects/:slug/content/:contentSlug

Atualiza item. Cria versão anterior automaticamente.

### DELETE /projects/:slug/content/:contentSlug

Deleta item.

### GET /projects/:slug/content/:contentSlug/versions

Retorna histórico de versões do item.

---

## Tags

### GET /tags

Lista tags do usuário.

### POST /tags

Cria tag.

**Body:**
```json
{
  "name": "claude-opus",
  "category": "model",
  "color": "#6B46C1"
}
```

Categorias: `model`, `provider`, `custom`

### PATCH /tags/:id

Atualiza tag.

### DELETE /tags/:id

Deleta tag.

---

## Sync

### POST /sync/pull

Endpoint otimizado para o MCP server. Retorna todos os itens ativos de um projeto com filtros opcionais.

**Body:**
```json
{
  "workspace": "meus-projetos",
  "project": "myinst",
  "types": ["skill", "instruction"],
  "tags": ["claude-opus"],
  "since": "2025-01-01T00:00:00Z"
}
```

**Response (200):**
```json
{
  "data": {
    "items": [...],
    "syncToken": "base64_token",
    "serverTime": "2025-01-01T00:00:00Z"
  }
}
```

### GET /sync/status

Verifica o que mudou desde último sync.

**Query params:**
- `project` (obrigatório) — Slug do projeto
- `since` — Data ISO para verificar mudanças

Observação: o comando `myinst status` da CLI usa `/sync/pull` para buscar o snapshot remoto completo e compara esse snapshot com `.myinst/sync-state.json` e os arquivos locais. A identidade de diff da CLI inclui `{ clientId, scope, workspace, project, type, slug }`, permitindo separar itens equivalentes de clients diferentes. O endpoint `/sync/status` continua sendo uma consulta temporal simples do backend.

---

## Chats

Histórico de chats é opt-in e separado de `project_sessions`. Nenhuma rota entra em sync automático. Cada sessão deve ser enviada para o projeto que representa o repositório ou produto de origem.

Chats são identificados por `client` e `session`. Use `client` para registrar a origem da conversa (`codex`, `claude`, `cursor`, `kimi` ou outro identificador controlado pelo integrador) e `session` para o ID estável da sessão no client de origem. O backend não importa transcripts nativos automaticamente; a entrada deve chegar como JSON revisado pela CLI ou por chamada direta à API.

### POST /workspaces/:workspaceSlug/projects/:projectSlug/chats

Cria ou atualiza uma sessão importada explicitamente.

**Body:**
```json
{
  "client": "codex",
  "session": "sessao-1",
  "title": "Correção sync multi-client",
  "summary": "Resumo opcional",
  "metadata": { "tags": ["release"] },
  "messages": [
    { "role": "user", "content": "Corrija o pull.", "tokenCount": 8 },
    { "role": "assistant", "content": "Pull corrigido." }
  ]
}
```

`retentionUntil` é opcional; quando omitido, o backend aplica retenção padrão de 180 dias. A API rejeita segredos prováveis em mensagens ou metadata.

Roles aceitas em `messages`: `user`, `assistant`, `system`, `tool`.

### GET /workspaces/:workspaceSlug/projects/:projectSlug/chats

Lista sessões. Filtros opcionais: `client`, `q`, `tag`, `from`, `to`, `limit`, `offset`.

- `q` busca em título, resumo e conteúdo das mensagens.
- `tag` consulta `metadata.tags`.
- `from` e `to` filtram por `startedAt`.
- `limit` vai de 1 a 200; o padrão é 100.

### GET /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId

Retorna uma sessão única com mensagens paginadas. `sessionId` pode ser o UUID interno ou o ID externo informado no push.

Query params opcionais:
- `messageLimit` — quantidade de mensagens retornadas, de 1 a 500; padrão 100.
- `messageOffset` — deslocamento inicial das mensagens; padrão 0.

`messageCount` sempre informa o total da sessão. Não divida uma conversa longa em sessões `--part-*`; use paginação de mensagens.

### GET /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId/export?format=markdown

Exporta a sessão como Markdown.

### POST /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId/summarize

Atualiza o resumo. Se `summary` não for enviado, o backend gera um resumo local simples a partir das mensagens.

### DELETE /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId

Remove uma sessão de chat importada e suas mensagens. `sessionId` pode ser o UUID interno ou o ID externo informado no push.

---

## Env Vault

Env Vault armazena arquivos `.env` por projeto em um fluxo separado do sync comum. O backend nunca recebe plaintext, segredo local, recovery key em claro ou valores de variáveis; ele persiste apenas payloads criptografados e metadados seguros.

### POST /workspaces/:workspaceSlug/projects/:projectSlug/env-files

Cria um arquivo criptografado ou versiona um arquivo existente com o mesmo `name` e `environment` no projeto.

**Body:**
```json
{
  "name": ".env.local",
  "sourcePath": ".env.local",
  "environment": "local",
  "encryptedPayload": {
    "version": "env-vault-v1",
    "algorithm": "AES-GCM",
    "kdf": {
      "algorithm": "pbkdf2-sha256",
      "iterations": 210000,
      "keyLength": 32,
      "digest": "sha256"
    },
    "salt": "base64url",
    "iv": "base64url",
    "authTag": "base64url",
    "ciphertext": "base64url"
  },
  "metadata": {
    "ciphertextByteLength": 2048,
    "ciphertextSha256": "64_hex_chars"
  },
  "recoveryEnvelopes": []
}
```

Campos desconhecidos, como `plaintext`, são rejeitados por validação. Quando `environment` é omitido, a API usa `default`. `sourcePath` deve ser apenas um nome de arquivo seguro, sem caminho absoluto, barras ou diretórios locais.

### GET /workspaces/:workspaceSlug/projects/:projectSlug/env-files

Lista somente metadados seguros: `id`, `name`, `sourcePath`, `environment`, `metadata`, `version`, `recoveryEnvelopeCount`, `createdAt` e `updatedAt`.

A listagem não retorna `encryptedPayload` nem `recoveryEnvelopes`.

### GET /workspaces/:workspaceSlug/projects/:projectSlug/env-files/:id

Retorna o arquivo do projeto com a versão criptografada atual e envelopes de recuperação cifrados. A descriptografia continua acontecendo localmente no cliente: CLI, MCP local autorizado ou navegador do usuário após ele informar o segredo do Env Vault.

### DELETE /workspaces/:workspaceSlug/projects/:projectSlug/env-files/:id

Remove o arquivo do projeto, suas versões criptografadas e envelopes de recuperação.

---

## Erros

Formato padrão:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos",
    "status": 400
  }
}
```

Códigos comuns:
- `UNAUTHORIZED` (401)
- `INVALID_KEY` (401)
- `KEY_EXPIRED` (401)
- `NOT_FOUND` (404)
- `SLUG_EXISTS` / `EMAIL_EXISTS` / `TAG_EXISTS` (409)
- `VALIDATION_ERROR` (400)
- `CANNOT_DELETE_DEFAULT` (400)
