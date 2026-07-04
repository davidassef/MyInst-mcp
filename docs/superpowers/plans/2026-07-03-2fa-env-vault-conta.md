# 2FA e Env Vault da Conta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 2FA TOTP por aplicativo autenticador e um envelope de Env Vault associado à conta, sem armazenar segredo do vault ou plaintext no backend.

**Architecture:** O backend valida TOTP com segredo cifrado em repouso usando secret do servidor e armazena recovery codes apenas com hash bcrypt. O Env Vault da conta armazena somente um `EnvVaultRecoveryEnvelope` cifrado no navegador por senha do Env Vault ou passkey futura; CLI e painel podem baixar esse envelope e abrir localmente. 2FA é step-up de ações sensíveis, não chave criptográfica para `.env`.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, Zod, bcrypt, WebCrypto no shared/frontend, React/Vite.

## Global Constraints

- pt-BR em documentação, UI e mensagens.
- Zero emoji em código, logs, UI e commits.
- DDL autorizado pelo usuário: `AUTORIZO ALTERAÇÃO DE SCHEMA PARA 2FA E ENV VAULT DA CONTA`.
- Nunca armazenar segredo do Env Vault, recovery key ou plaintext no backend.
- 2FA confirma identidade e autoriza step-up; não descriptografa `.env`.
- Recovery codes de 2FA devem ser de uso único e armazenados apenas hasheados.
- `MYINST_ENV_VAULT_SECRET` permanece fallback de automação, não fluxo principal.

---

## File Structure

- `backend/src/db/schema.ts`: novas tabelas `user_totp_factors`, `user_recovery_codes`, `account_env_vault_envelopes`.
- `backend/src/lib/totp.ts`: geração/verificação TOTP RFC 6238 sem dependência externa.
- `backend/src/lib/secret-encryption.ts`: cifra/decifra segredo TOTP em repouso usando `JWT_SECRET` como material de servidor.
- `backend/src/lib/step-up.ts`: valida TOTP/recovery code para ações sensíveis quando a conta tem 2FA ativo.
- `backend/src/routes/auth.ts`: endpoints de setup/verify/disable/login 2FA, security status, recovery codes, envelope da conta.
- `packages/shared/src/schemas/index.ts`: schemas de 2FA, step-up e account env vault.
- `packages/shared/src/types/index.ts`: tipos inferidos dos novos schemas.
- `backend/tests/api.test.ts`: testes de fluxo de 2FA, login com segundo fator, recovery code e envelope de conta.
- `frontend/src/lib/api.ts`: contratos HTTP novos.
- `frontend/src/lib/envVaultViewer.ts`: helper para criar envelope de conta por senha do Env Vault.
- `frontend/src/pages/Security.tsx`: painel `Conta > Segurança`.
- `frontend/src/App.tsx` e `frontend/src/components/Layout.tsx`: rota e navegação.
- `README.md`, `docs/env-vault.md`, `docs/api.md`: documentação do fluxo novo.

## Task 1: Backend Security Contracts

**Files:**
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/types/index.ts`
- Test: `packages/shared/tests/schemas.test.ts`

**Interfaces:**
- Produces: `verificarTotpSetupSchema`, `verificarTotpLoginSchema`, `desabilitarTotpSchema`, `salvarAccountEnvVaultEnvelopeSchema`.
- Produces types: `VerificarTotpSetupInput`, `VerificarTotpLoginInput`, `DesabilitarTotpInput`, `SalvarAccountEnvVaultEnvelopeInput`.

- [ ] **Step 1: Write failing schema tests**

Add tests asserting:

```ts
expect(verificarTotpSetupSchema.parse({ code: '123456' })).toEqual({ code: '123456' });
expect(() => verificarTotpSetupSchema.parse({ code: '12345' })).toThrow();
expect(() => verificarTotpSetupSchema.parse({ code: '1234567' })).toThrow();
expect(salvarAccountEnvVaultEnvelopeSchema.parse({ envelope: envelopeValido }).envelope.method).toBe('passphrase');
expect(() => salvarAccountEnvVaultEnvelopeSchema.parse({ envelope: envelopeValido, vaultSecret: 'plaintext' })).toThrow();
```

- [ ] **Step 2: Run red**

Run: `corepack pnpm --filter @myinst/shared test`

Expected: fails because schemas are not exported.

- [ ] **Step 3: Implement schemas and types**

Add strict schemas for:

```ts
const codigoTotpSchema = z.string().regex(/^[0-9]{6}$/);
export const verificarTotpSetupSchema = z.object({ code: codigoTotpSchema }).strict();
export const verificarTotpLoginSchema = z.object({
  twoFactorToken: z.string().min(20),
  code: codigoTotpSchema.optional(),
  recoveryCode: z.string().min(8).max(80).optional(),
}).strict().refine((body) => Boolean(body.code || body.recoveryCode));
export const desabilitarTotpSchema = z.object({
  code: codigoTotpSchema.optional(),
  recoveryCode: z.string().min(8).max(80).optional(),
}).strict().refine((body) => Boolean(body.code || body.recoveryCode));
export const salvarAccountEnvVaultEnvelopeSchema = z.object({
  envelope: envVaultRecoveryEnvelopeSchema,
}).strict();
```

- [ ] **Step 4: Run green**

Run: `corepack pnpm --filter @myinst/shared test`

Expected: pass.

## Task 2: Backend 2FA and Account Envelope

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/lib/totp.ts`
- Create: `backend/src/lib/secret-encryption.ts`
- Create: `backend/src/lib/step-up.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/routes/env-vault.ts`
- Test: `backend/tests/api.test.ts`

**Interfaces:**
- Produces API:
  - `GET /api/v1/auth/security`
  - `POST /api/v1/auth/2fa/setup`
  - `POST /api/v1/auth/2fa/verify`
  - `POST /api/v1/auth/2fa/login`
  - `POST /api/v1/auth/2fa/disable`
  - `POST /api/v1/auth/env-vault/envelope`
  - `GET /api/v1/auth/env-vault/envelope`

- [ ] **Step 1: Write failing backend tests**

Add tests for:

```ts
// setup returns base32 secret and otpauth URI, not enabled yet.
// verify with generated TOTP returns recovery codes once and enables 2FA.
// login after enabled returns requiresTwoFactor and no session token.
// 2FA login with current TOTP returns session token.
// one recovery code can log in once, second use fails.
// saving account env vault envelope rejects plaintext and returns no encrypted payload outside envelope.
// API key creation with enabled TOTP requires x-myinst-2fa-code.
```

- [ ] **Step 2: Run red**

Run: `corepack pnpm --filter @myinst/backend test -- auth`

Expected: fails with missing routes/tables/helpers.

- [ ] **Step 3: Implement schema**

Add:

```ts
export const userTotpFactors = pgTable('user_totp_factors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 120 }).default('Aplicativo autenticador').notNull(),
  secretEncrypted: jsonb('secret_encrypted').notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('user_totp_factors_user_idx').on(table.userId),
]);
```

Add `userRecoveryCodes` with `codeHash`, `usedAt`, `createdAt`, and `accountEnvVaultEnvelopes` with `method`, `label`, `encryptedVaultSecret`, `stepUpFactors`.

- [ ] **Step 4: Implement TOTP and encrypted-at-rest helpers**

Use HMAC-SHA1 with 30s period, 6 digits, ±1 window, base32 encode/decode. Use AES-256-GCM for server-side TOTP secret encryption from `JWT_SECRET`.

- [ ] **Step 5: Implement routes and step-up**

Login returns:

```json
{ "data": { "requiresTwoFactor": true, "twoFactorToken": "..." } }
```

when TOTP is enabled. `POST /auth/2fa/login` exchanges code or recovery code for normal JWT.

- [ ] **Step 6: Run green**

Run: `corepack pnpm --filter @myinst/backend test -- auth`

Expected: pass.

## Task 3: Frontend Security Panel

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/envVaultViewer.ts`
- Create: `frontend/src/pages/Security.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Test: `frontend/src/lib/api.test.ts`
- Test: `frontend/src/lib/envVaultViewer.test.ts`

**Interfaces:**
- Consumes: backend endpoints from Task 2.
- Produces: UI route `/security`.

- [ ] **Step 1: Write failing frontend tests**

Add API tests for setup/verify/envelope endpoints and helper test for account envelope creation by passphrase.

- [ ] **Step 2: Run red**

Run: `corepack pnpm --filter @myinst/frontend test -- api envVaultViewer`

Expected: fails because methods/helpers do not exist.

- [ ] **Step 3: Implement API and helper**

Add `api.auth.seguranca`, `api.auth.iniciarTotp`, `api.auth.verificarTotp`, `api.auth.desabilitarTotp`, `api.auth.salvarEnvVaultEnvelope`, `api.auth.obterEnvVaultEnvelope`. Add helper using `gerarSegredoVaultEnvVault` and `criarEnvVaultRecoveryEnvelope({ method: 'passphrase' })`.

- [ ] **Step 4: Implement panel**

Panel must show:
- status de 2FA;
- secret/otpauth URI for authenticator app setup;
- recovery codes after verify once;
- Env Vault da conta section with password field that creates a passphrase envelope locally.

- [ ] **Step 5: Run green**

Run: `corepack pnpm --filter @myinst/frontend test -- api envVaultViewer && corepack pnpm --filter @myinst/frontend build`

Expected: pass.

## Task 4: Docs, DDL, Gates, Deploy

**Files:**
- Modify: `README.md`
- Modify: `docs/env-vault.md`
- Modify: `docs/api.md`
- Modify: `packages/cli/README.md`

- [ ] **Step 1: Update docs**

Document:
- 2FA is account step-up only.
- Env Vault account passphrase stores encrypted envelope only.
- Support can reset 2FA, not decrypt envs.
- Existing envs without known secret must be reset from local plaintext.

- [ ] **Step 2: Run local gates**

Run:

```bash
corepack pnpm --filter @myinst/shared test
corepack pnpm --filter @myinst/backend test
corepack pnpm --filter @myinst/frontend test
corepack pnpm --filter @myinst/frontend build
$env:CI='true'; corepack pnpm validate
corepack pnpm compose:check
git diff --check
```

- [ ] **Step 3: Apply DDL locally**

Run: `corepack pnpm db:push`

Expected: Drizzle applies the three new tables.

- [ ] **Step 4: Commit, push, deploy**

Commit: `feat: adiciona 2fa e env vault da conta`

Push `main`, monitor CI, deploy API via VPS `git pull` and Docker compose, validate health and frontend deployment.

## Self-Review

- Spec coverage: covers 2FA authenticator app, support-reset semantics, account-level Env Vault envelope, and zero-knowledge boundary.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: route/schema/type names are consistent across tasks.
