# Deploy MyInst

## Infraestrutura

| Item | Valor |
|------|-------|
| VPS IP | `16.52.85.33` |
| Usuario SSH | `ubuntu` |
| Chave SSH | `~/.ssh/LightsailDefaultKey-ca-central-1-vps2.pem` |
| Projeto na VPS | `/home/ubuntu/myinst` |
| Dominio API | `https://api-myinst.lotoscore.com.br` |
| Dominio Frontend | `https://myinst.lotoscore.com.br` (Vercel) |

## Fluxo de deploy

Nunca copiamos arquivos manualmente para a VPS. Sempre via `git push` + `git pull`.

### 1. Verificar status da producao

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ca-central-1-vps2.pem ubuntu@16.52.85.33 \
  "cd ~/myinst && git log --oneline -3 && echo '---' && git rev-list --count HEAD..origin/main && echo 'commits behind'"
```

Se `commits behind` for 0, a VPS esta atualizada.

### 2. Fazer deploy completo

Conecte na VPS e execute:

```bash
ssh -i ~/.ssh/LightsailDefaultKey-ca-central-1-vps2.pem ubuntu@16.52.85.33
cd ~/myinst
git pull origin main
pnpm deploy:vps-api
```

O comando `pnpm deploy:vps-api` executa:
1. Sobe shared-infra (Postgres + Redis)
2. Aplica schema no banco
3. Sobe a API com rebuild via Docker

### 3. Deploy apenas do frontend

O frontend na Vercel publica automaticamente ao fazer push na branch `main`. Nao requer acao manual.