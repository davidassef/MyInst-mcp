# Env Vault

Env Vault é o fluxo dedicado para armazenar arquivos `.env` por projeto sem misturá-los com instruções, skills, chats, Project State ou configurações de clientes.

O objetivo é resolver troca de máquina sem transformar o backend em um cofre capaz de ler segredos. O backend deve armazenar somente envelopes criptografados e metadados seguros; descriptografia acontece localmente na CLI, MCP local ou navegador.

> Status: disponível via CLI e API própria. A publicação em produção depende dos gates, push, deploy por `git pull` e aplicação do schema no backend.

## Modelo de segurança

- `.env` continua bloqueado nos fluxos normais de `myinst push`, `myinst import`, chats, Project State e MCP sync.
- Env Vault nunca deve reutilizar `content_items`, `client_profile_items`, busca, diff, restore ou sync genérico.
- O backend não recebe plaintext, valores de variáveis, segredo de vault, recovery key em claro ou hash de plaintext.
- Metadados persistidos devem ser operacionais e seguros: tamanho do ciphertext, hash do ciphertext e datas.
- Nomes de variáveis só podem aparecer por opt-in local após unlock; não são persistidos por padrão.
- `env pull` exige `--output`, não confia em caminho retornado pelo servidor e nunca sobrescreve arquivo local silenciosamente.

## Criptografia

Cada arquivo `.env` é criptografado localmente antes de sair da máquina:

- algoritmo: `AES-GCM`;
- KDF: `PBKDF2-SHA256`;
- salt único por payload;
- IV único por payload;
- tag de autenticação separada;
- payload serializável por JSON.

O formato público do payload fica em `@myinst/shared/env-vault` e é validado antes de qualquer derivação de chave para evitar payload malformado ou KDF fora do padrão.

## Recuperação

Acesso à conta e acesso ao plaintext do `.env` são responsabilidades diferentes.

Email, senha e 2FA podem confirmar identidade e exigir step-up, mas não descriptografam `.env` sozinhos. A descriptografia precisa de material criptográfico local do usuário, como:

- segredo de vault;
- recovery key;
- dispositivo já autorizado;
- passphrase forte;
- passkey.

O backend pode armazenar envelopes de recuperação. Cada envelope contém somente o segredo de vault criptografado localmente por um método de recuperação. Fatores como `email`, `totp`, `password` e `passkey` entram como `stepUpFactors`, não como chave universal do servidor.

Se o usuário perder todos os fatores criptográficos, o backend não deve conseguir restaurar o plaintext. O caminho correto é resetar o Env Vault daquele projeto.

## CLI

Comandos previstos:

```bash
myinst env push --workspace meus-projetos --project myinst --file .env.local --name local
myinst env push --workspace meus-projetos --project myinst --file .env.local --name local --create-recovery-key
myinst env pull --workspace meus-projetos --project myinst --name local --environment local --output .env.local

myinst env list --workspace meus-projetos --project myinst
myinst env show --workspace meus-projetos --project myinst --name local
myinst env delete --workspace meus-projetos --project myinst --name local
```

`--project` é obrigatório para impedir gravação em projeto genérico. O segredo pode vir de `MYINST_ENV_VAULT_SECRET` ou do prompt local oculto. Evite informar segredo na mesma linha do comando para não vazar em histórico, logs ou listagem de processos. Para criar envelope com uma recovery key já existente, use `MYINST_ENV_VAULT_RECOVERY_KEY`.

Se houver mais de um env com o mesmo `--name`, informe `--environment` em `pull`, `show` e `delete`. `sourcePath` é tratado como nome de arquivo seguro, não como caminho absoluto local.

## Backend

As rotas ficam fora do sync genérico:

```text
POST   /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files
GET    /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files
GET    /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:id
DELETE /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:id
```

Requisitos mínimos:

- `POST` rejeita qualquer campo de plaintext.
- `GET /env-files` lista somente metadados.
- `GET /env-files/:id` retorna o payload criptografado.
- `DELETE` remove somente envs do projeto do usuário autenticado.
- isolamento por usuário, workspace e projeto.
- resposta nunca contém valores reais como `DATABASE_URL`, tokens ou segredos.

## Validação operacional

Antes de publicar:

```bash
corepack pnpm --filter @myinst/shared test
corepack pnpm --filter @myinst/backend test
corepack pnpm --filter @myinst/cli test
corepack pnpm --filter @myinst/frontend build
corepack pnpm validate
corepack pnpm compose:check
git diff --check
```

Depois dos gates verdes: push, deploy por `git pull`, aplicação de schema pelo fluxo do projeto, health público e smoke com `.env` dummy sem segredo real.
