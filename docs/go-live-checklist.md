# Go-Live Checklist

Checklist para o primeiro deploy do MyInst em beta privado, saindo de localhost direto para produção.

## Ambiente alvo

- VPS de deploy atual: `16.52.85.33`
- Papel da VPS: hospedar API e shared-infra do MyInst
- Frontend pode ficar no Vercel em `myinst.lotoscore.com.br` e API no subdomínio `api-myinst.lotoscore.com.br`

## 1. Preflight local

Execute antes de qualquer deploy:

```bash
pnpm validate
pnpm compose:check
```

Para simular produção localmente, use:

```bash
pnpm prod:preflight
```

Esse comando sobe Postgres local, aplica schema, sobe API em modo produção e executa smoke test. Ele altera o banco local do compose.

## 2. DNS e domínio

- Frontend (Vercel): `https://myinst.lotoscore.com.br`
- API (VPS): `https://api-myinst.lotoscore.com.br`
- `api-myinst.lotoscore.com.br` deve apontar para `16.52.85.33`

## 3. Variáveis de produção

Na VPS `16.52.85.33`:

```bash
cp deploy/.env.production.example .env
```

Preencha:

```env
APP_URL=https://seudominio.com
API_PUBLIC_URL=https://seudominio.com
CORS_ORIGIN=https://seudominio.com
VITE_MYINST_API_BASE=https://api.seudominio.com
WEB_OAUTH_SUCCESS_URL=https://seudominio.com/login
OAUTH_CALLBACK_URL=https://seudominio.com
JWT_SECRET=secret-longo-gerado-com-openssl
DB_PASSWORD=senha-forte
POSTGRES_PASSWORD=senha-root-forte
REDIS_PASSWORD=senha-redis-forte
```

Importante:
- `VITE_MYINST_API_BASE` é obrigatória no Vercel em produção.
- Se ficar vazia, o frontend tenta usar rota relativa e o Vercel retorna erro (`405`) porque não expõe `/api/v1` para backend.

Exemplo para este projeto:
- `VITE_MYINST_API_BASE=https://api-myinst.lotoscore.com.br`

Gere secrets com:

```bash
openssl rand -base64 64
```

## 4. Deploy via Git

Nunca copie arquivos manualmente para a VPS. Use apenas `git pull`.

```bash
cd ~/MyInst
git pull origin main
docker compose --env-file .env -f deploy/docker-compose.shared-infra.yml up -d
MYINST_COMPOSE_FILE=deploy/docker-compose.vps-api-traefik.yml MYINST_ENV_FILE=.env pnpm db:deploy:schema
docker compose --env-file .env -f deploy/docker-compose.vps-api-traefik.yml up -d --build
```

Use `deploy/docker-compose.vps-api.yml` apenas quando a API for publicada por outro reverse proxy local na porta `127.0.0.1:3010`. O deploy público validado para `api-myinst.lotoscore.com.br` usa `deploy/docker-compose.vps-api-traefik.yml`.

No Vercel, configure `VITE_MYINST_API_BASE=https://api-myinst.lotoscore.com.br` para o projeto frontend (Root Directory: `frontend`).

## 5. Validação pós-deploy

```bash
curl https://api.seudominio.com/health
MYINST_SMOKE_BASE_URL=https://api.seudominio.com pnpm smoke
npx --yes @myinst/cli --version
```

Valide também:

- registro por email/senha;
- criação de API key;
- configuração do `myinst-mcp` com API key real;
- `myinst_pull`;
- `myinst_push`;
- `myinst_search`;
- `myinst chat list --project default --client codex`;
- versionamento no web.

## 6. Backup inicial

Antes de liberar uso real:

```bash
pnpm db:backup
```

Restore exige confirmação explícita:

```bash
MYINST_CONFIRM_RESTORE=CONFIRMO_RESTORE pnpm db:restore backups/arquivo.sql
```

## 7. OAuth

OAuth é opcional no beta privado. Se configurar:

- Google callback: `https://seudominio.com/api/v1/auth/oauth/google/callback`
- GitHub callback: `https://seudominio.com/api/v1/auth/oauth/github/callback`

Após o callback, o backend redireciona para `WEB_OAUTH_SUCCESS_URL` com o token.
