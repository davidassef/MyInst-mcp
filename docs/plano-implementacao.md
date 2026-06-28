# MyInst — Plano de Implementação (CONCLUÍDO)

## Fase 1: Preparar para Uso Real

### 1.1 Publicar no npm
- [x] Configurar `publishConfig` no shared e mcp-server
- [x] Preparar package.json com files, keywords, repository
- [ ] Criar organização `@myinst` no npmjs.com (manual)
- [ ] Publicar `@myinst/shared`
- [ ] Publicar `@myinst/mcp-server`
- [ ] Publicar `@myinst/cli`

### 1.2 Deploy do SaaS
- [x] Docker Compose para VPS (docker-compose.vps.yml)
- [x] Dockerfile multi-stage (API)
- [x] Dockerfile.web (frontend com Nginx)
- [x] Shared-infra padronizada (deploy/docker-compose.shared-infra.yml)
- [x] Guia de migração (deploy/MIGRACAO.md)
- [x] .env.production.example
- [x] Nginx config para SPA + proxy
- [ ] Comprar domínio (manual)
- [ ] Configurar DNS + Certbot (manual)
- [ ] Deploy na VPS (manual)

### 1.3 Configurar OAuth Real
- [x] Código OAuth implementado (Google + GitHub)
- [ ] Criar app no Google Cloud Console (manual)
- [ ] Criar app no GitHub Developer Settings (manual)
- [ ] Configurar redirect URIs (manual)

---

## Fase 2: Melhorar a Experiência ✅

### 2.1 Importação em Massa ✅
- [x] Tool `myinst_import` no MCP server
- [x] Leitura recursiva com detecção de tipo
- [x] Parsing de frontmatter YAML
- [x] Detecção de conflitos
- [x] 12 testes passando

### 2.2 Edição Inline na UI ✅
- [x] Editor com textarea monospace
- [x] Save com versionamento automático
- [x] Feedback visual (Salvo! / erro)
- [x] Filtro local por título

### 2.3 Busca Full-Text ✅
- [x] Endpoint GET /api/v1/search com tsvector/tsquery
- [x] Índice GIN para performance
- [x] Filtro por projeto e tipo
- [x] Ranking por relevância
- [x] 7 testes passando

### 2.4 Folders na UI ✅
- [x] Barra de pills para folders
- [x] Criar/deletar folders inline
- [x] Filtrar conteúdo por folder
- [x] Selecionar folder ao criar conteúdo

---

## Fase 3: Diferenciação ✅

### 3.1 Perfis por Modelo ✅
- [x] Tabela model_profiles
- [x] CRUD endpoints
- [x] Endpoint /match com regex
- [x] Auto-detect no MCP pull (env MYINST_MODEL)
- [x] 6 testes passando

### 3.2 Versionamento com Diff ✅
- [x] Endpoint GET /diff com diffLines
- [x] Endpoint POST /restore
- [x] API client (diff + restaurar)
- [x] 4 testes passando

### 3.3 CLI Standalone ✅
- [x] Package @myinst/cli com Commander.js
- [x] Comandos: login, list, status, pull, push
- [x] Config em ~/.myinst/config.json
- [x] Manifesto local em .myinst/sync-state.json para comparar local, remoto e último sync
- [x] 22 testes passando no pacote CLI

### 3.4 Rate Limiting + Planos ✅
- [x] @fastify/rate-limit integrado
- [x] Tabela plans (free/pro/unlimited)
- [x] Seed automático de planos
- [x] Middleware de verificação de limites
- [x] Endpoint GET /api/v1/usage
- [x] Plano free atribuído no registro
- [x] 2 testes passando

---

## Métricas Finais

| Métrica | Valor |
|---------|-------|
| Packages | 5 (@myinst/shared, backend, mcp-server, cli, frontend) |
| Testes automatizados | 73 |
| Endpoints API | 25+ |
| MCP Tools | 6 (list, pull, push, search, status, import) |
| CLI Commands | 5 (login, list, status, pull, push) |
| Tabelas no banco | 11 |
| Documentação | 7 arquivos |

## Pendente (ações manuais)

1. Criar org @myinst no npm e publicar pacotes
2. Comprar domínio
3. Configurar VPS (subir shared-infra + deploy)
4. Criar apps OAuth no Google/GitHub

## Referência operacional atual

- VPS de destino do MyInst: `16.52.85.33`
- O subdomínio do projeto deverá apontar para esse IP antes do go-live
