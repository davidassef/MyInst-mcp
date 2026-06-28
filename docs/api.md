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

Deleta projeto. Não permite deletar o projeto default.

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
  "project": "default",
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
