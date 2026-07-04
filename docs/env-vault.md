# Env Vault

Env Vault é o fluxo dedicado para armazenar arquivos `.env` por projeto sem misturá-los com instruções, skills, chats, Project State ou configurações de clientes.

O objetivo é resolver troca de máquina sem transformar o backend em um cofre capaz de ler segredos. O backend deve armazenar somente envelopes criptografados e metadados seguros; descriptografia acontece localmente na CLI, em clientes locais autorizados ou no navegador do usuário quando ele informa o segredo do Env Vault.

> Status: disponível via CLI, API própria e painel web com consulta zero-knowledge.

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

## 2FA e envelope da conta

O fluxo principal para consulta pelo painel fica em `Conta > Segurança`:

1. ative o 2FA com aplicativo autenticador;
2. guarde os códigos de recuperação exibidos uma única vez;
3. cadastre uma senha local do Env Vault;
4. informe o código TOTP para salvar o envelope da conta.

O painel gera um segredo de vault no navegador e o cifra com a senha local informada. O backend armazena apenas o envelope cifrado em `account_env_vault_envelopes`. O 2FA é usado como step-up para ações sensíveis, mas não descriptografa `.env` sozinho.

Operações sensíveis feitas pelo painel com JWT exigem `x-myinst-2fa-code` quando a conta tem 2FA ativo. Chamadas com API key continuam válidas para CLI/MCP, pois a API key já é o fator operacional local.

## CLI

Execute os comandos na raiz do projeto que contém o arquivo `.env`. A pasta atual define o arquivo local lido por `--file` ou escrito por `--output`; o projeto remoto é definido por `--workspace` e `--project`.

```powershell
cd D:\Documentos\Projetos\MyInst
myinst env push --workspace meus-projetos --project myinst --file .env --name local --environment local
myinst env push --workspace meus-projetos --project myinst --file .env --name local --environment local --create-recovery-key
myinst env pull --workspace meus-projetos --project myinst --name local --environment local --output .env

myinst env list --workspace meus-projetos --project myinst
myinst env show --workspace meus-projetos --project myinst --name local --environment local
myinst env delete --workspace meus-projetos --project myinst --name local --environment local
```

`--workspace` e `--project` devem ser informados explicitamente neste beta. O MyInst ainda não infere automaticamente o projeto remoto pelo diretório atual, por nome de pasta ou por Git remote. Isso evita gravar segredos no projeto errado. Um manifesto local como `.myinst/project.json` pode ser adotado no futuro, mas não deve ser assumido no fluxo atual.

`--project` é obrigatório para impedir gravação em projeto genérico. O segredo pode vir do envelope da conta no painel, de uma recovery key por env, de `MYINST_ENV_VAULT_SECRET` ou do prompt local oculto conforme o client suportado. Prefira o prompt oculto para uso interativo. Use `MYINST_ENV_VAULT_SECRET` apenas em automação local controlada. Evite informar segredo na mesma linha do comando para não vazar em histórico, logs ou listagem de processos. Para criar envelope com uma recovery key já existente, use `MYINST_ENV_VAULT_RECOVERY_KEY`.

Se houver mais de um env com o mesmo `--name`, informe `--environment` em `pull`, `show` e `delete`. `sourcePath` é tratado como nome de arquivo seguro, não como caminho absoluto local.

## Painel web

O painel web lista somente metadados seguros do Env Vault por projeto:

- nome lógico;
- ambiente;
- arquivo de origem;
- versão;
- tamanho do ciphertext;
- quantidade de recovery envelopes;
- data de atualização.

Ao clicar em `Desbloquear`, o painel busca o `encryptedPayload` por rota dedicada e descriptografa no próprio navegador. Existem dois caminhos:

- `Segredo do Env Vault`: usa o segredo criado no `myinst env push/pull`. Esse segredo não é a senha da conta MyInst.
- `Recovery key`: usa um envelope de recuperação já cadastrado para aquele env.
- `Envelope da conta`: usa o envelope cadastrado em `Conta > Segurança`, exige 2FA ativo e senha local do Env Vault no navegador.

Para cadastrar uma recovery key pelo painel, abra o env, informe o segredo atual uma vez em `Configurar recovery key` e clique em `Gerar recovery key`. O navegador valida o segredo, gera a recovery key e envia ao backend somente o envelope cifrado do segredo de vault. A recovery key é exibida uma única vez; guarde fora do MyInst.

O segredo, a recovery key e o plaintext não são salvos em configuração, não são enviados ao backend e são limpos do estado após a tentativa. Os valores ficam mascarados por padrão, podem ser revelados ou copiados individualmente e são bloqueados manualmente ou por timeout local.

Use a visualização web para consulta pontual. Para materializar arquivo em disco, continue usando `myinst env pull --output ...` dentro da raiz do projeto. A interface também copia comandos seguros de `myinst env push` e `myinst env pull`, sem segredo embutido.

## Backend

As rotas ficam fora do sync genérico:

```text
POST   /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files
GET    /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files
GET    /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:id
POST   /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:id/recovery-envelopes
DELETE /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:id
GET    /api/v1/auth/security
POST   /api/v1/auth/2fa/setup
POST   /api/v1/auth/2fa/verify
POST   /api/v1/auth/2fa/login
POST   /api/v1/auth/2fa/disable
GET    /api/v1/auth/env-vault/envelope
POST   /api/v1/auth/env-vault/envelope
```

Requisitos mínimos:

- `POST` rejeita qualquer campo de plaintext.
- `GET /env-files` lista somente metadados.
- `GET /env-files/:id` retorna o payload criptografado.
- `POST /env-files/:id/recovery-envelopes` aceita somente envelope cifrado já gerado no cliente.
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
