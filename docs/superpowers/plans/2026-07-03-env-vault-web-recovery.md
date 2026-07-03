# Env Vault Web Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o desbloqueio web do Env Vault compreensível e utilizável, com recovery key cadastrável por env existente sem enviar segredo ou plaintext ao backend.

**Architecture:** O backend continua zero-knowledge e armazena somente `env_vault_recovery_envelopes` já criptografados no cliente. O frontend pode desbloquear usando o segredo direto do Env Vault ou abrir um recovery envelope com recovery key, sempre descriptografando no navegador.

**Tech Stack:** TypeScript, React 19, Fastify, Drizzle, Zod, Vitest, `@myinst/shared/env-vault`.

## Global Constraints

- Não usar senha da conta MyInst como chave de descriptografia.
- Não persistir segredo do Env Vault, recovery key ou plaintext no backend.
- Não adicionar DDL nesta rodada; a tabela `env_vault_recovery_envelopes` já existe.
- Não usar emojis em UI, logs, docs ou commits.
- Commits em Conventional Commits pt-BR, sem co-author.

---

### Task 1: Contrato de recovery envelope em API e frontend

**Files:**
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `backend/src/routes/env-vault.ts`
- Modify: `backend/tests/api.test.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/api.test.ts`

**Interfaces:**
- Produces: `adicionarEnvVaultRecoveryEnvelopeSchema`
- Produces: `AdicionarEnvVaultRecoveryEnvelopeInput`
- Produces: `api.envVault.adicionarRecoveryEnvelope(workspaceSlug, projetoSlug, envId, body)`
- Produces: `POST /api/v1/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId/recovery-envelopes`

- [ ] **Step 1: Write failing backend and API client tests**

Expected behavior:
- `POST /env-files/:envId/recovery-envelopes` accepts one encrypted recovery envelope.
- It appends the envelope to an existing env owned by the authenticated user.
- It returns the updated env summary with `recoveryEnvelopeCount`.
- It rejects unknown fields and does not accept plaintext.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
corepack pnpm --filter @myinst/backend test -- env
corepack pnpm --filter @myinst/frontend test -- api
```

- [ ] **Step 3: Implement schema, route and API client**

Use `envVaultRecoveryEnvelopeSchema` from shared. Insert into `envVaultRecoveryEnvelopes` only after resolving workspace/project and confirming the env belongs to that project.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
corepack pnpm --filter @myinst/backend test
corepack pnpm --filter @myinst/frontend test
```

### Task 2: Browser unlock with recovery key

**Files:**
- Modify: `frontend/src/lib/envVaultViewer.ts`
- Modify: `frontend/src/lib/envVaultViewer.test.ts`

**Interfaces:**
- Produces: `desbloquearEnvVaultComRecoveryKeyParaVisualizacao({ encryptedPayload, recoveryEnvelope, recoveryKey })`
- Produces: `prepararRecoveryEnvelopeEnvVaultWeb({ vaultSecret, recoveryKey, label })`

- [ ] **Step 1: Write failing tests**

Expected behavior:
- Recovery key opens the encrypted vault secret and then decrypts the env payload.
- Wrong recovery key fails without returning plaintext.
- Preparing a web recovery envelope does not expose `vaultSecret` in JSON.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
corepack pnpm --filter @myinst/frontend test -- envVaultViewer
```

- [ ] **Step 3: Implement helper functions**

Use `abrirEnvVaultRecoveryEnvelope`, `criarEnvVaultRecoveryEnvelope`, `gerarRecoveryKeyEnvVault` and `desbloquearEnvVaultParaVisualizacao` from the existing shared crypto contract.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
corepack pnpm --filter @myinst/frontend test -- envVaultViewer
```

### Task 3: Env Vault panel setup flow

**Files:**
- Modify: `frontend/src/pages/Projeto.tsx`
- Modify: `docs/env-vault.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `api.envVault.adicionarRecoveryEnvelope`
- Consumes: `desbloquearEnvVaultComRecoveryKeyParaVisualizacao`
- Consumes: `prepararRecoveryEnvelopeEnvVaultWeb`

- [ ] **Step 1: Add UI copy and flow**

The panel must explain:
- “Não é sua senha da conta MyInst.”
- “Use o segredo do Env Vault criado no push/pull.”
- “Se tiver recovery key, desbloqueie por recovery.”
- “Para cadastrar recovery key neste env, informe o segredo atual uma vez; o backend receberá só um envelope cifrado.”

- [ ] **Step 2: Add configuration action**

For each env, add `Configurar recovery`:
- Input: current Env Vault secret.
- Button: `Gerar recovery key`.
- On success: display the generated recovery key once and offer copy.
- Update local `recoveryEnvelopeCount`.

- [ ] **Step 3: Add unlock mode**

For each env, allow:
- `Segredo do Env Vault`
- `Recovery key`

When `Recovery key` is selected and no envelopes exist, show a clear message to configure recovery first.

- [ ] **Step 4: Run focused frontend validation**

Run:
```bash
corepack pnpm --filter @myinst/frontend test
corepack pnpm --filter @myinst/frontend build
```

### Task 4: Gates, deploy and smoke

**Files:**
- No code files expected beyond tasks above.

**Interfaces:**
- Produces: commit pushed to `origin/main`.
- Produces: Vercel production deployment with updated frontend.
- Produces: public smoke evidence.

- [ ] **Step 1: Run gates**

Run:
```bash
corepack pnpm --filter @myinst/shared test
corepack pnpm --filter @myinst/backend test
corepack pnpm --filter @myinst/frontend test
corepack pnpm --filter @myinst/frontend build
corepack pnpm compose:check
git diff --check
```

- [ ] **Step 2: Commit and push**

Run:
```bash
git add .
git commit -m "feat: adiciona recovery web ao env vault"
git push origin main
```

- [ ] **Step 3: Verify deploy**

Verify:
- GitHub CI success.
- Vercel deployment success.
- `https://myinst.lotoscore.com.br` returns 200.
- Public bundle contains `Recovery key` and `Configurar recovery`.

## Self-Review

- Spec coverage: cobre a origem do segredo, ausência de senha da conta como chave, cadastro de recovery e desbloqueio web.
- Placeholder scan: sem passos `TBD` ou implementação indefinida.
- Type consistency: nomes de funções e endpoints aparecem primeiro nas interfaces e são consumidos nas tarefas seguintes.
