import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { criarApp } from '../src/app.js';
import { carregarAmbiente } from '../src/env.js';
import { seedPlans } from '../src/db/seed.js';
import { db } from '../src/db/index.js';
import { plans, users } from '../src/db/schema.js';
import { montarUrlOAuthErro, montarUrlOAuthSucesso } from '../src/routes/oauth.js';
import { gerarCodigoTotp } from '../src/lib/totp.js';

describe('MyInst API', () => {
  let app: Awaited<ReturnType<typeof criarApp>>;
  let token: string;
  let apiKey: string;
  let apiKeyId: string;
  const workspaceSecundarioSlug = 'cliente-acme';
  const workspaceRenomeavelSlug = 'workspace-renomeavel';

  beforeAll(async () => {
    app = await criarApp(carregarAmbiente({
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      CORS_ORIGIN: 'http://localhost:5173',
    }));
    await seedPlans();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /health retorna status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty('status', 'ok');
    });

    it('CORS aceita origem configurada', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'GET',
        },
      });

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('CORS permite preflight de DELETE autenticado', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/api-keys/test-id',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'DELETE',
          'access-control-request-headers': 'authorization,content-type',
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-methods']).toContain('DELETE');
      expect(res.headers['access-control-allow-headers']).toContain('Authorization');
    });

    it('CORS rejeita origem não configurada', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'GET',
        },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Ambiente', () => {
    it('rejeita JWT_SECRET placeholder em produção', () => {
      expect(() => carregarAmbiente({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/myinst',
        JWT_SECRET: 'troque-por-um-secret-seguro-em-producao',
        APP_URL: 'https://myinst.dev',
        API_PUBLIC_URL: 'https://myinst.dev',
        CORS_ORIGIN: 'https://myinst.dev',
      })).toThrow('JWT_SECRET não pode usar valor placeholder');
    });
  });

  describe('OAuth', () => {
    it('monta URL de sucesso para retorno ao frontend', () => {
      const url = montarUrlOAuthSucesso('https://myinst.dev/login', 'token-teste');
      expect(url).toBe('https://myinst.dev/login?token=token-teste');
    });

    it('monta URL de erro para retorno ao frontend', () => {
      const url = montarUrlOAuthErro('https://myinst.dev/login');
      expect(url).toBe('https://myinst.dev/login?oauth_error=1');
    });
  });

  describe('Auth', () => {
    const email = `test-${Date.now()}@myinst.dev`;

    it('POST /auth/register cria usuário e retorna token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'senha12345', displayName: 'Teste Vitest' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.user.email).toBe(email);
      expect(body.data.token).toBeDefined();
      token = body.data.token;
    });

    it('POST /auth/register rejeita email duplicado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'outrasenha', displayName: 'Outro' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /auth/login retorna token válido', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'senha12345' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.token).toBeDefined();
    });

    it('POST /auth/login rejeita senha errada', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'errada' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /auth/me retorna perfil do usuário', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.email).toBe(email);
    });

    it('POST /auth/api-keys gera API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Test Key', scopes: ['read', 'write'] },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.key).toMatch(/^myinst_/);
      apiKeyId = body.data.id;
      apiKey = body.data.key;
    });

    it('GET /workspaces lista o workspace default criado no cadastro', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );
    });

    it('GET /auth/api-keys lista keys do usuário', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('DELETE /auth/api-keys/:id não remove chave de outro usuário', async () => {
      const outroEmail = `outro-${Date.now()}@myinst.dev`;
      const registro = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: outroEmail, password: 'senha12345', displayName: 'Outro Usuário' },
      });
      const outroToken = registro.json().data.token;

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/auth/api-keys/${apiKeyId}`,
        headers: { authorization: `Bearer ${outroToken}` },
      });

      expect(deleteRes.statusCode).toBe(404);

      const lista = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
      });
      const ids = lista.json().data.map((key: { id: string }) => key.id);
      expect(ids).toContain(apiKeyId);
    });

    it('DELETE /auth/api-keys/:id remove chave do próprio usuário', async () => {
      const criarRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Key Para Excluir', scopes: ['read', 'write'] },
      });

      expect(criarRes.statusCode).toBe(201);
      const keyIdParaExcluir = criarRes.json().data.id as string;

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/auth/api-keys/${keyIdParaExcluir}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(deleteRes.statusCode).toBe(204);

      const lista = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
      });

      const ids = lista.json().data.map((key: { id: string }) => key.id);
      expect(ids).not.toContain(keyIdParaExcluir);
    });

    it('autenticação via API key funciona', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('JWT com usuário inexistente retorna 401', async () => {
      const tokenOrfao = app.jwt.sign({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'orfao@local.dev',
        displayName: 'Órfão',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${tokenOrfao}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('ativa 2FA TOTP, exige segundo fator no login e aceita recovery code uma única vez', async () => {
      const email2fa = `totp-${Date.now()}@myinst.dev`;
      const registro = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: email2fa, password: 'senha12345', displayName: 'Usuário 2FA' },
      });
      const token2fa = registro.json().data.token as string;

      const setup = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/setup',
        headers: { authorization: `Bearer ${token2fa}` },
      });

      expect(setup.statusCode).toBe(201);
      expect(setup.json().data.secret).toMatch(/^[A-Z2-7]+=*$/);
      expect(setup.json().data.otpauthUri).toContain('otpauth://totp/MyInst');

      const code = gerarCodigoTotp(setup.json().data.secret);
      const verify = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/verify',
        headers: { authorization: `Bearer ${token2fa}` },
        payload: { code },
      });

      expect(verify.statusCode).toBe(200);
      expect(verify.json().data.recoveryCodes).toHaveLength(8);
      expect(JSON.stringify(verify.json())).not.toContain(setup.json().data.secret);

      const security = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/security',
        headers: { authorization: `Bearer ${token2fa}` },
      });
      expect(security.statusCode).toBe(200);
      expect(security.json().data.twoFactor.enabled).toBe(true);
      expect(security.json().data.twoFactor.recoveryCodeCount).toBe(8);

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: email2fa, password: 'senha12345' },
      });

      expect(login.statusCode).toBe(200);
      expect(login.json().data.requiresTwoFactor).toBe(true);
      expect(login.json().data.twoFactorToken).toBeDefined();
      expect(login.json().data.token).toBeUndefined();

      const login2fa = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/login',
        payload: {
          twoFactorToken: login.json().data.twoFactorToken,
          code: gerarCodigoTotp(setup.json().data.secret),
        },
      });

      expect(login2fa.statusCode).toBe(200);
      expect(login2fa.json().data.token).toBeDefined();

      const loginRecovery = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: email2fa, password: 'senha12345' },
      });
      const recoveryCode = verify.json().data.recoveryCodes[0] as string;
      const recoveryOk = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/login',
        payload: {
          twoFactorToken: loginRecovery.json().data.twoFactorToken,
          recoveryCode,
        },
      });

      expect(recoveryOk.statusCode).toBe(200);
      expect(recoveryOk.json().data.token).toBeDefined();

      const recoveryReutilizado = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/login',
        payload: {
          twoFactorToken: loginRecovery.json().data.twoFactorToken,
          recoveryCode,
        },
      });

      expect(recoveryReutilizado.statusCode).toBe(401);
      expect(recoveryReutilizado.json().error.code).toBe('INVALID_2FA_CODE');
    });

    it('exige step-up TOTP para criar API key quando 2FA está ativo', async () => {
      const email2fa = `stepup-${Date.now()}@myinst.dev`;
      const registro = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: email2fa, password: 'senha12345', displayName: 'Usuário Step Up' },
      });
      const token2fa = registro.json().data.token as string;
      const setup = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/setup',
        headers: { authorization: `Bearer ${token2fa}` },
      });
      const secret = setup.json().data.secret as string;
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/verify',
        headers: { authorization: `Bearer ${token2fa}` },
        payload: { code: gerarCodigoTotp(secret) },
      });

      const bloqueado = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token2fa}` },
        payload: { name: 'Sem Step Up', scopes: ['read', 'write'] },
      });

      expect(bloqueado.statusCode).toBe(403);
      expect(bloqueado.json().error.code).toBe('STEP_UP_REQUIRED');

      const permitido = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: {
          authorization: `Bearer ${token2fa}`,
          'x-myinst-2fa-code': gerarCodigoTotp(secret),
        },
        payload: { name: 'Com Step Up', scopes: ['read', 'write'] },
      });

      expect(permitido.statusCode).toBe(201);
      expect(permitido.json().data.key).toMatch(/^myinst_/);
    });

    it('exige step-up TOTP em Env Vault mesmo quando a chamada usa API key', async () => {
      const email2fa = `env-api-key-stepup-${Date.now()}@myinst.dev`;
      const registro = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: email2fa, password: 'senha12345', displayName: 'Usuário Env API Key' },
      });
      const token2fa = registro.json().data.token as string;
      const setup = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/setup',
        headers: { authorization: `Bearer ${token2fa}` },
      });
      const secret = setup.json().data.secret as string;
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/verify',
        headers: { authorization: `Bearer ${token2fa}` },
        payload: { code: gerarCodigoTotp(secret) },
      });

      const apiKeyCriada = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: {
          authorization: `Bearer ${token2fa}`,
          'x-myinst-2fa-code': gerarCodigoTotp(secret),
        },
        payload: { name: 'CLI Env Vault', scopes: ['read', 'write'] },
      });
      const apiKey2fa = apiKeyCriada.json().data.key as string;

      const bloqueado = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/env-files',
        headers: { authorization: `Bearer ${apiKey2fa}` },
        payload: {
          name: '.env.local',
          sourcePath: '.env.local',
          encryptedPayload: criarPayloadCriptografadoFake('env-api-key-stepup'),
          metadata: criarMetadataEnvVault(42),
        },
      });

      expect(bloqueado.statusCode).toBe(403);
      expect(bloqueado.json().error.code).toBe('STEP_UP_REQUIRED');

      const permitido = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/env-files',
        headers: {
          authorization: `Bearer ${apiKey2fa}`,
          'x-myinst-2fa-code': gerarCodigoTotp(secret),
        },
        payload: {
          name: '.env.local',
          sourcePath: '.env.local',
          encryptedPayload: criarPayloadCriptografadoFake('env-api-key-stepup-ok'),
          metadata: criarMetadataEnvVault(43),
        },
      });

      expect(permitido.statusCode).toBe(201);
      const envId = permitido.json().data.id as string;

      const detalheBloqueado = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envId}`,
        headers: { authorization: `Bearer ${apiKey2fa}` },
      });

      expect(detalheBloqueado.statusCode).toBe(403);
      expect(detalheBloqueado.json().error.code).toBe('STEP_UP_REQUIRED');

      const detalhePermitido = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envId}`,
        headers: {
          authorization: `Bearer ${apiKey2fa}`,
          'x-myinst-2fa-code': gerarCodigoTotp(secret),
        },
      });

      expect(detalhePermitido.statusCode).toBe(200);
      expect(detalhePermitido.json().data.encryptedPayload).toBeDefined();
    });

    it('salva envelope de Env Vault da conta sem aceitar segredo em claro', async () => {
      const emailConta = `vault-conta-${Date.now()}@myinst.dev`;
      const registro = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: emailConta, password: 'senha12345', displayName: 'Usuário Vault Conta' },
      });
      const tokenConta = registro.json().data.token as string;
      const setup = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/setup',
        headers: { authorization: `Bearer ${tokenConta}` },
      });
      const secret = setup.json().data.secret as string;
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/2fa/verify',
        headers: { authorization: `Bearer ${tokenConta}` },
        payload: { code: gerarCodigoTotp(secret) },
      });

      const envelope = {
        method: 'passphrase',
        label: 'Senha do Env Vault',
        encryptedVaultSecret: criarPayloadCriptografadoFake('account-vault'),
        stepUpFactors: ['totp'],
      };

      const rejeitado = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/env-vault/envelope',
        headers: {
          authorization: `Bearer ${tokenConta}`,
          'x-myinst-2fa-code': gerarCodigoTotp(secret),
        },
        payload: {
          envelope,
          vaultSecret: 'segredo-em-claro-nao-pode',
        },
      });

      expect(rejeitado.statusCode).toBe(400);
      expect(rejeitado.json().error.code).toBe('VALIDATION_ERROR');

      const salvo = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/env-vault/envelope',
        headers: {
          authorization: `Bearer ${tokenConta}`,
          'x-myinst-2fa-code': gerarCodigoTotp(secret),
        },
        payload: { envelope },
      });

      expect(salvo.statusCode).toBe(201);
      expect(salvo.json().data.envelopeCount).toBe(1);
      expect(JSON.stringify(salvo.json())).not.toContain('segredo-em-claro');

      const consulta = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/env-vault/envelope',
        headers: {
          authorization: `Bearer ${tokenConta}`,
          'x-myinst-2fa-code': gerarCodigoTotp(secret),
        },
      });

      expect(consulta.statusCode).toBe(200);
      expect(consulta.json().data).toEqual([
        expect.objectContaining({
          method: 'passphrase',
          label: 'Senha do Env Vault',
        }),
      ]);
    });
  });

  describe('Projects', () => {
    it('GET /projects lista projetos (inclui default)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const projetos = res.json().data;
      expect(projetos.length).toBeGreaterThan(0);
      expect(projetos.some((p: any) => p.isDefault)).toBe(true);
    });

    it('POST /projects cria novo projeto', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'Meu SaaS', slug: 'meu-saas', description: 'Projeto teste' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('meu-saas');
    });

    it('POST /projects rejeita slug duplicado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'Outro', slug: 'meu-saas' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('PATCH /projects/:slug permite renomear projeto do workspace default', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/projects/meu-saas',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: 'Meu SaaS Renomeado',
          slug: 'meu-saas-renomeado',
          description: 'Projeto teste atualizado',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe('Meu SaaS Renomeado');
      expect(res.json().data.slug).toBe('meu-saas-renomeado');
    });

    it('PATCH /projects/:slug retorna 409 quando o slug já existe no mesmo workspace', async () => {
      const criarRes = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'Projeto Colisão', slug: 'projeto-colisao' },
      });
      expect(criarRes.statusCode).toBe(201);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/projects/projeto-colisao',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { slug: 'meu-saas-renomeado' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('SLUG_EXISTS');
    });

    it('DELETE /projects/:slug não permite deletar default', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/projects/default',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Workspaces', () => {
    it('POST /workspaces cria novo workspace e projeto default', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: 'Cliente Acme',
          slug: workspaceSecundarioSlug,
          description: 'Workspace de teste',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe(workspaceSecundarioSlug);

      const projetosRes = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(projetosRes.statusCode).toBe(200);
      expect(projetosRes.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );
    });

    it('POST /workspaces cria workspace dedicado para teste de rename', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: 'Workspace Renomeável',
          slug: workspaceRenomeavelSlug,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe(workspaceRenomeavelSlug);
    });

    it('PATCH /workspaces/:workspaceSlug permite renomear workspace', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${workspaceRenomeavelSlug}`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: 'Workspace Renomeado',
          slug: 'workspace-renomeado',
          description: 'Workspace atualizado',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe('Workspace Renomeado');
      expect(res.json().data.slug).toBe('workspace-renomeado');
    });

    it('PATCH /workspaces/:workspaceSlug retorna 409 quando o slug já existe', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/workspaces/workspace-renomeado',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { slug: workspaceSecundarioSlug },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('SLUG_EXISTS');
    });

    it('permite o mesmo slug de projeto em workspaces diferentes', async () => {
      const projetosDefaultRes = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(projetosDefaultRes.statusCode).toBe(200);
      expect(projetosDefaultRes.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );

      const projetosWorkspaceRes = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(projetosWorkspaceRes.statusCode).toBe(200);
      expect(projetosWorkspaceRes.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );
    });

    it('PATCH /workspaces/:workspaceSlug/projects/:slug permite renomear projeto em workspace explícito', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects/default`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: 'Projeto Default Acme',
          slug: 'acme-default',
          description: 'Projeto default renomeado',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe('Projeto Default Acme');
      expect(res.json().data.slug).toBe('acme-default');
    });

    it('PATCH /workspaces/:workspaceSlug/projects/:slug retorna 409 em colisão no mesmo workspace', async () => {
      const [planoExpandido] = await db.insert(plans).values({
        name: `test-projects-${Date.now()}`,
        maxItems: 1000,
        maxProjects: 1000,
        maxApiKeys: 1000,
        rateLimit: 60,
      }).returning();

      const decoded = app.jwt.decode(token) as { id: string };
      await db
        .update(users)
        .set({ planId: planoExpandido.id })
        .where(eq(users.id, decoded.id));

      const criarRes = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: 'Projeto Acme',
          slug: 'acme-secundario',
        },
      });
      expect(criarRes.statusCode).toBe(201);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects/acme-secundario`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { slug: 'acme-default' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('SLUG_EXISTS');

      const [planoFree] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.name, 'free'))
        .limit(1);

      await db
        .update(users)
        .set({ planId: planoFree.id })
        .where(eq(users.id, decoded.id));
    });
  });

  describe('Tags', () => {
    it('POST /tags cria tag', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tags',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'claude-sonnet', category: 'model', color: '#3B82F6' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.name).toBe('claude-sonnet');
    });

    it('GET /tags lista tags', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tags',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });
  });

  describe('Content', () => {
    it('POST /projects/:slug/content cria skill', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'skill',
          title: 'Debug Skill',
          slug: 'debug-skill',
          body: 'Use debugging sistematico.',
          metadata: {},
          tags: ['claude-sonnet'],
          isActive: true,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('debug-skill');
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/content cria skill isolada em outro workspace', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects/acme-default/content`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'skill',
          title: 'Acme Skill',
          slug: 'acme-skill',
          body: 'Skill exclusiva do workspace Acme.',
          metadata: {},
          tags: ['claude-sonnet'],
          isActive: true,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('acme-skill');
    });

    it('GET /projects/:slug/content lista conteúdos', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('PATCH /projects/:slug/content/:contentSlug atualiza e versiona', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/projects/default/content/debug-skill',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { body: 'Use debugging sistematico v2.' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.version).toBe(2);
    });

    it('GET /versions retorna histórico', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content/debug-skill/versions',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBe(1);
      expect(res.json().data[0].version).toBe(1);
    });

    it('GET /diff retorna alterações entre versões', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content/debug-skill/diff?v1=1&v2=2',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.v1).toBe(1);
      expect(body.data.v2).toBe(2);
      expect(body.data.changes.length).toBeGreaterThan(0);
      const tipos = body.data.changes.map((c: any) => c.type);
      expect(tipos.some((t: string) => t === 'added' || t === 'removed')).toBe(true);
    });

    it('GET /diff com v2 omitido compara com versão atual', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content/debug-skill/diff?v1=1',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.v1).toBe(1);
      expect(body.data.v2).toBe(2);
      expect(body.data.changes.length).toBeGreaterThan(0);
    });

    it('POST /restore reverte para versão anterior e incrementa versão', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content/debug-skill/restore',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { version: 1 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.version).toBe(3);
      expect(body.data.body).toBe('Use debugging sistematico.');
    });

    it('POST /restore com versão inválida retorna 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content/debug-skill/restore',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { version: 999 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Sync', () => {
    it('POST /sync/pull retorna todos os itens do projeto', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'default' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.syncToken).toBeDefined();
      expect(body.serverTime).toBeDefined();
    });

    it('POST /sync/pull filtra por tag', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'default', tags: ['claude-sonnet'] },
      });
      expect(res.statusCode).toBe(200);
      const items = res.json().data.items;
      items.forEach((item: any) => {
        expect(item.tags).toContain('claude-sonnet');
      });
    });

    it('POST /sync/pull com tag inexistente retorna vazio', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'default', tags: ['modelo-inexistente'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.items).toHaveLength(0);
    });

    it('POST /sync/pull com projeto inexistente retorna 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'nao-existe' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /sync/pull usa workspace explícito quando informado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { workspace: workspaceSecundarioSlug, project: 'acme-default' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'acme-skill',
          }),
        ]),
      );
    });

    it('POST /sync/push rejeita segredo provável em item de projeto', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/push',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          project: 'default',
          items: [{
            type: 'skill',
            title: 'Leak',
            slug: 'leak',
            body: 'Use MYINST_API_KEY=myinst_12345678901234567890',
            metadata: {},
            tags: [],
          }],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SECRET_DETECTED');
    });

    it('POST /sync/push rejeita segredo provável em item global', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/push',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          scope: 'global',
          clientId: 'codex',
          items: [{
            type: 'mcp_config',
            title: 'Codex Config',
            slug: 'codex-config',
            body: 'MYINST_API_KEY=myinst_12345678901234567890',
            metadata: {},
            tags: [],
          }],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SECRET_DETECTED');
    });
  });

  describe('Search', () => {
    it('GET /search retorna resultados pelo título', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].title).toContain('Debug');
    });

    it('GET /search retorna resultados pelo body', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=sistematico',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('GET /search retorna vazio para termo sem correspondência', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=xyzinexistente999',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it('GET /search filtra por projeto', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug&project=default',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      body.data.forEach((item: any) => {
        expect(item.project_slug).toBe('default');
      });
    });

    it('GET /search filtra por tipo', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug&type=skill',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      body.data.forEach((item: any) => {
        expect(item.type).toBe('skill');
      });
    });

    it('GET /search retorna 400 sem parâmetro q', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /search inclui tags nos resultados', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].tags).toBeDefined();
      expect(Array.isArray(body.data[0].tags)).toBe(true);
    });

    it('GET /search não vaza conteúdo de outro workspace no modo legado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Acme',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it('GET /search encontra conteúdo quando workspace é informado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/search?q=Acme&workspace=${workspaceSecundarioSlug}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'acme-skill',
          }),
        ]),
      );
    });
  });

  describe('Client Profiles', () => {
    it('GET /client-profiles lista clientes globais suportados da conta', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/client-profiles',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            clientId: 'codex',
            slug: 'codex',
            itemCount: 0,
            isConfigured: false,
          }),
        ]),
      );
    });

    it('POST /client-profiles/:clientId/items cria item global', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/client-profiles/codex/items',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'instruction',
          title: 'Infra Local',
          slug: 'infra-local-global',
          body: 'instrução global do codex',
          metadata: { source: 'teste' },
          tags: ['global', 'codex'],
          isActive: true,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('infra-local-global');
      expect(res.json().data.tags).toEqual(['global', 'codex']);
    });

    it('POST /client-profiles/:clientId/items aceita tipos globais novos', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/client-profiles/claude/items',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'command',
          title: 'Commit',
          slug: 'commit-global',
          body: 'Comando global do Claude.',
          metadata: {
            myinstSourcePath: '.claude/commands/commit.md',
            myinstRequiresLocalSecrets: false,
          },
          tags: ['claude'],
          isActive: true,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.type).toBe('command');
      expect(res.json().data.metadata.myinstSourcePath).toBe('.claude/commands/commit.md');
    });

    it('POST /client-profiles/:clientId/items cria instruction global do claude para replicação', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/client-profiles/claude/items',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'instruction',
          title: 'Claude Base',
          slug: 'claude-base',
          body: 'Instrução base do Claude.',
          metadata: { source: 'teste-replicacao' },
          tags: ['claude'],
          isActive: true,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.type).toBe('instruction');
    });

    it('GET /client-profiles/:clientId/items retorna apenas itens globais do cliente', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/client-profiles/codex/items',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'infra-local-global',
            type: 'instruction',
          }),
        ]),
      );
    });

    it('GET /client-profiles/:clientId/items com active=true não vaza itens de outro cliente', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/client-profiles/codex/items?active=true',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      const slugs = res.json().data.map((perfilItem: { slug: string }) => perfilItem.slug);

      expect(slugs).toContain('infra-local-global');
      expect(slugs).not.toContain('commit-global');
      expect(slugs).not.toContain('claude-base');
    });

    it('GET /client-profiles reflete quantidade de itens por cliente', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/client-profiles',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            clientId: 'codex',
            itemCount: 1,
            isConfigured: true,
          }),
        ]),
      );
    });

    it('POST /sync/pull com scope=global retorna itens do client profile', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          scope: 'global',
          clientId: 'codex',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'infra-local-global',
          }),
        ]),
      );
    });

    it('GET /search com scope=global encontra conteúdo sem depender de projeto', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=global&scope=global&clientId=codex',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'infra-local-global',
            source_scope: 'global',
            client_id: 'codex',
          }),
        ]),
      );
    });

    it('GET /search com scope=global encontra novos tipos globais e preserva origem no metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Commit&scope=global&clientId=claude&type=command',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'commit-global',
            type: 'command',
            source_scope: 'global',
            client_id: 'claude',
            metadata: expect.objectContaining({
              myinstSourcePath: '.claude/commands/commit.md',
            }),
          }),
        ]),
      );
    });

    it('POST /state/memories rejeita API key sem revisão explícita', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/state/memories',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'memory',
          title: 'Stack do projeto',
          slug: 'stack-do-projeto',
          body: 'Projeto usa Fastify.',
          metadata: { reviewed: false },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('REVIEW_REQUIRED');
    });

    it('POST /state/memories cria memória revisada do projeto', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/state/memories',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'memory',
          title: 'Stack do projeto',
          slug: 'stack-do-projeto',
          body: 'Projeto usa Fastify e Drizzle.',
          metadata: { reviewed: true },
          sourceClient: 'codex',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data).toEqual(expect.objectContaining({
        type: 'memory',
        slug: 'stack-do-projeto',
        sourceClient: 'codex',
      }));
    });

    it('POST /state/sessions cria resumo seguro de sessão', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/state/sessions',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'session',
          title: 'Sessão inicial',
          slug: 'sessao-inicial',
          summary: 'Resumo seguro da sessão.',
          body: 'Sem transcript bruto.',
          metadata: { reviewed: true },
          touchedFiles: ['backend/src/app.ts'],
          toolsUsed: ['myinst_state_capture'],
          status: 'reviewed',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data).toEqual(expect.objectContaining({
        type: 'session',
        slug: 'sessao-inicial',
        summary: 'Resumo seguro da sessão.',
      }));
    });

    it('DELETE /state/memories/:stateSlug remove memória revisada do projeto', async () => {
      const criarRes = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/state/memories',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'memory',
          title: 'Memória para remover',
          slug: 'memoria-para-remover',
          body: 'Conteúdo temporário.',
          metadata: { reviewed: true },
        },
      });
      expect(criarRes.statusCode).toBe(201);

      const removerRes = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workspaces/default/projects/default/state/memories/memoria-para-remover',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(removerRes.statusCode).toBe(204);

      const listarRes = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/state/memories',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(listarRes.statusCode).toBe(200);
      expect(listarRes.json().data).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ slug: 'memoria-para-remover' }),
        ]),
      );
    });

    it('DELETE /state/sessions/:stateSlug retorna 404 para item inexistente', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workspaces/default/projects/default/state/sessions/sessao-inexistente',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });

    it('GET /search com scope=state encontra Project State sem conteúdo global', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Fastify&scope=state&workspace=default&project=default',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'stack-do-projeto',
            source_scope: 'state',
            workspace_slug: 'default',
            project_slug: 'default',
          }),
        ]),
      );
    });

    it('POST /client-profiles/:sourceClient/replicate/:targetClient faz dry run com itens compatíveis e ignorados', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/client-profiles/claude/replicate/opencode',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          dryRun: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.compatible).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'claude-base',
            type: 'instruction',
          }),
        ]),
      );
      expect(res.json().data.ignoredIncompatible).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'commit-global',
            type: 'command',
          }),
        ]),
      );
    });

    it('POST /client-profiles/:sourceClient/replicate/:targetClient replica itens compatíveis para o destino', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/client-profiles/codex/replicate/opencode',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.toCreate).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'infra-local-global',
            type: 'instruction',
          }),
        ]),
      );

      const itensDestino = await app.inject({
        method: 'GET',
        url: '/api/v1/client-profiles/opencode/items',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(itensDestino.statusCode).toBe(200);
      expect(itensDestino.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'infra-local-global',
            type: 'instruction',
            metadata: expect.objectContaining({
              myinstReplicatedFromClient: 'codex',
              myinstReplicatedFromSlug: 'infra-local-global',
              myinstReplicationVersion: 'v1',
            }),
          }),
        ]),
      );
    });

    it('POST /client-profiles/:sourceClient/replicate/:targetClient retorna erro claro para par não suportado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/client-profiles/cursor/replicate/opencode',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          dryRun: true,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('REPLICATION_NOT_SUPPORTED');
    });
  });

  describe('Chats', () => {
    let chatId: string;

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/chats cria sessão com retenção padrão', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/chats',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          client: 'codex',
          session: 'codex-session-1',
          title: 'Correção sync multi-client',
          summary: 'Sessão validou pull nativo do Codex.',
          startedAt: '2026-07-01T10:00:00.000Z',
          updatedAt: '2026-07-01T10:05:00.000Z',
          messages: [
            { role: 'user', content: 'Corrija o pull do Codex.', tokenCount: 8, metadata: { source: 'test' } },
            { role: 'assistant', content: 'Ajustei o adapter nativo.', tokenCount: 10 },
          ],
          metadata: { importedFrom: 'arquivo-json', tags: ['release'] },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.client).toBe('codex');
      expect(body.data.externalSessionId).toBe('codex-session-1');
      expect(body.data.messageCount).toBe(2);
      expect(body.data.retentionUntil).toBeDefined();
      chatId = body.data.id;
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/chats lista sessões filtrando por client', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/chats?client=codex&q=sync',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: chatId,
            client: 'codex',
            messageCount: 2,
          }),
        ]),
      );
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/chats filtra por texto da mensagem, tag e data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/chats?q=adapter&tag=release&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-02T00%3A00%3A00.000Z',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: chatId,
            externalSessionId: 'codex-session-1',
            messageCount: 2,
          }),
        ]),
      );
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/chats filtra por id externo da sessão', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/chats?q=codex-session-1',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: chatId,
            externalSessionId: 'codex-session-1',
          }),
        ]),
      );
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId retorna mensagens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/chats/${chatId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'Corrija o pull do Codex.',
          }),
        ]),
      );
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId aceita id externo', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/chats/codex-session-1',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.id).toBe(chatId);
      expect(res.json().data.messageCount).toBe(2);
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId pagina mensagens sem dividir sessão', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/chats/codex-session-1?messageLimit=1&messageOffset=1',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.messageCount).toBe(2);
      expect(res.json().data.messageLimit).toBe(1);
      expect(res.json().data.messageOffset).toBe(1);
      expect(res.json().data.messages).toEqual([
        expect.objectContaining({
          role: 'assistant',
          content: 'Ajustei o adapter nativo.',
        }),
      ]);
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId/export retorna markdown', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/chats/${chatId}/export?format=markdown`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.body).toContain('# Correção sync multi-client');
      expect(res.body).toContain('## user');
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId/summarize atualiza resumo', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/chats/codex-session-1/summarize',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.summary).toContain('Corrija o pull do Codex.');
    });

    it('DELETE /workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId remove sessão importada', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/workspaces/default/projects/default/chats/codex-session-1',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(204);

      const consulta = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/chats/codex-session-1',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(consulta.statusCode).toBe(404);
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/chats rejeita segredo provável antes de persistir', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/chats',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          client: 'codex',
          session: 'codex-session-leak',
          title: 'Sessão com segredo',
          messages: [
            { role: 'user', content: 'MYINST_API_KEY=myinst_12345678901234567890' },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SECRET_DETECTED');
    });
  });

  describe('Env Vault', () => {
    let envVaultFileId: string;
    const primeiroPayloadCriptografado = criarPayloadCriptografadoFake('primeiro');
    const segundoPayloadCriptografado = criarPayloadCriptografadoFake('segundo');

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/env-files cria arquivo criptografado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/env-files',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: '.env.local',
          sourcePath: '.env.local',
          encryptedPayload: primeiroPayloadCriptografado,
          metadata: criarMetadataEnvVault(42),
          recoveryEnvelopes: [
            {
              method: 'recovery_key',
              label: 'Recovery key principal',
              encryptedVaultSecret: criarPayloadCriptografadoFake('recovery'),
              stepUpFactors: ['email', 'totp'],
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const responseBody = res.json();
      expect(responseBody.data).toEqual(expect.objectContaining({
        name: '.env.local',
        sourcePath: '.env.local',
        environment: 'default',
        version: 1,
        recoveryEnvelopeCount: 1,
      }));
      expect(responseBody.data.encryptedPayload).toBeUndefined();
      envVaultFileId = responseBody.data.id;
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/env-files lista sem payload criptografado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/env-files',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: envVaultFileId,
            name: '.env.local',
            version: 1,
            recoveryEnvelopeCount: 1,
          }),
        ]),
      );
      expect(res.json().data[0].encryptedPayload).toBeUndefined();
      expect(res.json().data[0].recoveryEnvelopes).toBeUndefined();
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId retorna versão atual criptografada', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envVaultFileId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.encryptedPayload).toEqual(primeiroPayloadCriptografado);
      expect(res.json().data.recoveryEnvelopes).toHaveLength(1);
      expect(res.json().data.recoveryEnvelopes[0]).toEqual(expect.objectContaining({
        method: 'recovery_key',
        label: 'Recovery key principal',
        stepUpFactors: ['email', 'totp'],
      }));
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/env-files versiona arquivo existente', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/env-files',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: '.env.local',
          sourcePath: '.env.local',
          encryptedPayload: segundoPayloadCriptografado,
          metadata: criarMetadataEnvVault(51),
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.id).toBe(envVaultFileId);
      expect(res.json().data.version).toBe(2);

      const consulta = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envVaultFileId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(consulta.statusCode).toBe(200);
      expect(consulta.json().data.version).toBe(2);
      expect(consulta.json().data.encryptedPayload).toEqual(segundoPayloadCriptografado);
      expect(consulta.json().data.recoveryEnvelopeCount).toBe(1);
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId/recovery-envelopes adiciona recovery sem plaintext', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envVaultFileId}/recovery-envelopes`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          method: 'recovery_key',
          label: 'Recovery key web',
          encryptedVaultSecret: criarPayloadCriptografadoFake('recovery-web'),
          stepUpFactors: ['password'],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data).toEqual(expect.objectContaining({
        id: envVaultFileId,
        recoveryEnvelopeCount: 2,
      }));
      expect(JSON.stringify(res.json())).not.toContain('segredo');
      expect(res.json().data.encryptedPayload).toBeUndefined();

      const consulta = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envVaultFileId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(consulta.statusCode).toBe(200);
      expect(consulta.json().data.recoveryEnvelopes).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'Recovery key web' }),
      ]));
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId/recovery-envelopes rejeita plaintext', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envVaultFileId}/recovery-envelopes`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          method: 'recovery_key',
          label: 'Recovery vazado',
          encryptedVaultSecret: criarPayloadCriptografadoFake('recovery-vazado'),
          stepUpFactors: ['password'],
          vaultSecret: 'segredo-em-claro-nao-pode',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/env-files rejeita plaintext e campos desconhecidos', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces/default/projects/default/env-files',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: '.env.vazado',
          sourcePath: '.env',
          encryptedPayload: segundoPayloadCriptografado,
          metadata: criarMetadataEnvVault(51),
          plaintext: 'DATABASE_URL=postgresql://usuario:senha@localhost:5432/app',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /workspaces/:workspaceSlug/projects/:projectSlug/env-files isola arquivos por usuário', async () => {
      const cadastro = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `outro-env-${Date.now()}@myinst.dev`,
          password: 'senha12345',
          displayName: 'Outro Env',
        },
      });
      const outroToken = cadastro.json().data.token;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces/default/projects/default/env-files',
        headers: { authorization: `Bearer ${outroToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([]);
    });

    it('DELETE /workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId remove arquivo e versões', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envVaultFileId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(204);

      const consulta = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/default/projects/default/env-files/${envVaultFileId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(consulta.statusCode).toBe(404);
    });
  });

  describe('Profiles', () => {
    let perfilId: string;

    it('POST /profiles cria perfil de modelo', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'Claude Opus', modelPattern: 'claude-opus.*', tags: ['claude-opus'] },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.name).toBe('Claude Opus');
      expect(body.data.tags).toContain('claude-opus');
      perfilId = body.data.id;
    });

    it('GET /profiles lista perfis do usuário', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('GET /profiles/match encontra perfil pelo padrão', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/match?model=claude-opus-4',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe('Claude Opus');
      expect(res.json().data.tags).toContain('claude-opus');
    });

    it('GET /profiles/match retorna 404 quando não há correspondência', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/match?model=gpt-4o',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /profiles/match respeita o workspace informado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/match?model=claude-opus-4&workspace=${workspaceSecundarioSlug}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /profiles/:id atualiza perfil', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/profiles/${perfilId}`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { tags: ['claude-opus', 'premium'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.tags).toContain('premium');
    });

    it('DELETE /profiles/:id remove perfil', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/profiles/${perfilId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(204);
    });
  });

  describe('Usage & Limits', () => {
    it('GET /usage retorna informações do plano e contagens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/usage',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.plan).toBe('open');
      expect(body.data.limitsEnabled).toBe(false);
      expect(body.data.usage.items).toHaveProperty('current');
      expect(body.data.usage.items).toHaveProperty('max');
      expect(body.data.usage.items.max).toBeNull();
      expect(body.data.usage.projects).toHaveProperty('current');
      expect(body.data.usage.projects).toHaveProperty('max');
      expect(body.data.usage.projects.max).toBeNull();
      expect(body.data.usage.apiKeys).toHaveProperty('current');
      expect(body.data.usage.apiKeys).toHaveProperty('max');
      expect(body.data.usage.apiKeys.max).toBeNull();
    });

    it('criar conteúdo não é bloqueado mesmo com plano restritivo quando limites estão desligados', async () => {
      const [planoRestrito] = await db.insert(plans).values({
        name: `test-limit-${Date.now()}`,
        maxItems: 0,
        maxProjects: 0,
        maxApiKeys: 0,
        rateLimit: 60,
      }).returning();

      const decoded = app.jwt.decode(token) as { id: string };
      await db
        .update(users)
        .set({ planId: planoRestrito.id })
        .where(eq(users.id, decoded.id));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'skill',
          title: 'Blocked Skill',
          slug: `blocked-${Date.now()}`,
          body: 'Deveria ser bloqueado.',
          metadata: {},
          tags: [],
          isActive: true,
        },
      });
      expect(res.statusCode).toBe(201);

      const [planoFree] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.name, 'free'))
        .limit(1);

      await db
        .update(users)
        .set({ planId: planoFree.id })
        .where(eq(users.id, decoded.id));
    });
  });
});

function criarPayloadCriptografadoFake(sufixo: string) {
  return {
    version: 'env-vault-v1',
    algorithm: 'AES-GCM',
    kdf: {
      algorithm: 'pbkdf2-sha256',
      iterations: 210000,
      keyLength: 32,
      digest: 'sha256',
    },
    salt: codificarBase64Url(criarBufferEnvVaultFake(`salt-${sufixo}`, 16)),
    iv: codificarBase64Url(criarBufferEnvVaultFake(`iv-${sufixo}`, 12)),
    authTag: codificarBase64Url(criarBufferEnvVaultFake(`tag-${sufixo}`, 16)),
    ciphertext: codificarBase64Url(Buffer.from(`ciphertext-${sufixo}`)),
  };
}

function criarMetadataEnvVault(ciphertextByteLength: number) {
  return {
    ciphertextByteLength,
    ciphertextSha256: 'a'.repeat(64),
  };
}

function codificarBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function criarBufferEnvVaultFake(valor: string, tamanho: number): Buffer {
  return Buffer.from(valor.padEnd(tamanho, '.').slice(0, tamanho));
}
