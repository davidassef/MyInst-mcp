import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import {
  accountEnvVaultEnvelopes,
  users,
  apiKeys,
  plans,
  userRecoveryCodes,
  userTotpFactors,
} from '../db/schema.js';
import {
  API_KEY_PREFIX,
  criarApiKeySchema,
  desabilitarTotpSchema,
  loginSchema,
  registrarUsuarioSchema,
  salvarAccountEnvVaultEnvelopeSchema,
  verificarTotpLoginSchema,
  verificarTotpSetupSchema,
} from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { verificarLimiteApiKeys } from '../middleware/usage.js';
import { obterWorkspaceDefault } from '../lib/workspaces.js';
import { criptografarSegredoServidor, descriptografarSegredoServidor } from '../lib/secret-encryption.js';
import { contarRecoveryCodesDisponiveis, exigirTotpStepUp, obterTotpAtivo, validarSegundoFatorUsuario } from '../lib/step-up.js';
import { criarTotpUri, gerarSegredoTotp, verificarCodigoTotp } from '../lib/totp.js';

interface TwoFactorLoginPayload {
  id: string;
  email: string;
  displayName: string;
  purpose: 'two_factor_login';
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [validar(registrarUsuarioSchema)],
  }, async (request, reply) => {
    const { email, password, displayName } = request.body as { email: string; password: string; displayName: string };

    const [existente] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existente) {
      return reply.status(409).send({
        error: { code: 'EMAIL_EXISTS', message: 'Email já cadastrado', status: 409 },
      });
    }

    const [planoFree] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.name, 'free'))
      .limit(1);

    const passwordHash = await bcrypt.hash(password, 12);
    const [usuario] = await db.insert(users).values({
      email,
      displayName,
      passwordHash,
      planId: planoFree?.id ?? null,
    }).returning();

    await obterWorkspaceDefault(usuario.id);

    const token = app.jwt.sign(
      { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
      { expiresIn: '7d' },
    );

    return reply.status(201).send({
      data: {
        user: { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
        token,
      },
    });
  });

  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [validar(loginSchema)],
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [usuario] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!usuario || !usuario.passwordHash) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos', status: 401 },
      });
    }

    const senhaValida = await bcrypt.compare(password, usuario.passwordHash);
    if (!senhaValida) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos', status: 401 },
      });
    }

    await obterWorkspaceDefault(usuario.id);

    const fatorTotp = await obterTotpAtivo(usuario.id);
    if (fatorTotp) {
      const twoFactorToken = app.jwt.sign(
        {
          id: usuario.id,
          email: usuario.email,
          displayName: usuario.displayName,
          purpose: 'two_factor_login',
        },
        { expiresIn: '5m' },
      );

      return reply.send({
        data: {
          user: { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
          requiresTwoFactor: true,
          twoFactorToken,
        },
      });
    }

    const token = app.jwt.sign(
      { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
      { expiresIn: '7d' },
    );

    return reply.send({
      data: {
        user: { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
        token,
      },
    });
  });

  app.get('/security', { preHandler: [autenticar] }, async (request) => {
    const fatorTotp = await obterTotpAtivo(request.user.id);
    const envelopeCount = await contarAccountEnvVaultEnvelopes(request.user.id);

    return {
      data: {
        twoFactor: {
          enabled: !!fatorTotp,
          recoveryCodeCount: await contarRecoveryCodesDisponiveis(request.user.id),
        },
        envVault: {
          envelopeCount,
        },
      },
    };
  });

  app.post('/2fa/setup', { preHandler: [autenticar] }, async (request, reply) => {
    const fatorAtivo = await obterTotpAtivo(request.user.id);
    if (fatorAtivo) {
      return reply.status(409).send({
        error: { code: 'TOTP_ALREADY_ENABLED', message: '2FA já está ativo para esta conta.', status: 409 },
      });
    }

    const secret = gerarSegredoTotp();
    const secretEncrypted = criptografarSegredoServidor({
      plaintext: secret,
      secretServidor: app.configuracao.jwtSecret || 'dev-secret-local-only',
    });

    await db.transaction(async (transacao) => {
      await transacao
        .delete(userTotpFactors)
        .where(eq(userTotpFactors.userId, request.user.id));

      await transacao.insert(userTotpFactors).values({
        userId: request.user.id,
        secretEncrypted,
      });
    });

    return reply.status(201).send({
      data: {
        secret,
        otpauthUri: criarTotpUri({
          issuer: 'MyInst',
          accountName: request.user.email,
          secret,
        }),
      },
    });
  });

  app.post('/2fa/verify', {
    preHandler: [autenticar, validar(verificarTotpSetupSchema)],
  }, async (request, reply) => {
    const { code } = request.body as { code: string };
    const [fator] = await db
      .select()
      .from(userTotpFactors)
      .where(eq(userTotpFactors.userId, request.user.id))
      .limit(1);

    if (!fator || fator.enabledAt) {
      return reply.status(409).send({
        error: { code: 'TOTP_SETUP_NOT_PENDING', message: 'Não há setup de 2FA pendente.', status: 409 },
      });
    }

    const secret = descriptografarSegredoServidor({
      envelope: fator.secretEncrypted,
      secretServidor: app.configuracao.jwtSecret || 'dev-secret-local-only',
    });
    if (!verificarCodigoTotp({ secret, code })) {
      return reply.status(400).send({
        error: { code: 'INVALID_2FA_CODE', message: 'Código de segundo fator inválido.', status: 400 },
      });
    }

    const recoveryCodes = criarRecoveryCodes();
    await db.transaction(async (transacao) => {
      await transacao
        .delete(userRecoveryCodes)
        .where(eq(userRecoveryCodes.userId, request.user.id));

      await transacao.insert(userRecoveryCodes).values(await Promise.all(recoveryCodes.map(async (recoveryCode) => ({
        userId: request.user.id,
        codeHash: await bcrypt.hash(recoveryCode, 12),
      }))));

      await transacao
        .update(userTotpFactors)
        .set({ enabledAt: new Date(), lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(userTotpFactors.id, fator.id));
    });

    return reply.send({
      data: {
        enabled: true,
        recoveryCodes,
      },
    });
  });

  app.post('/2fa/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [validar(verificarTotpLoginSchema)],
  }, async (request, reply) => {
    const { twoFactorToken, code, recoveryCode } = request.body as {
      twoFactorToken: string;
      code?: string;
      recoveryCode?: string;
    };
    const payload = verificarTwoFactorLoginToken(app, twoFactorToken);
    if (!payload) {
      return reply.status(401).send({
        error: { code: 'INVALID_2FA_TOKEN', message: 'Token temporário inválido ou expirado.', status: 401 },
      });
    }

    const segundoFatorValido = await validarSegundoFatorUsuario({
      userId: payload.id,
      code,
      recoveryCode,
      secretServidor: app.configuracao.jwtSecret || 'dev-secret-local-only',
    });
    if (!segundoFatorValido) {
      return reply.status(401).send({
        error: { code: 'INVALID_2FA_CODE', message: 'Código de segundo fator inválido.', status: 401 },
      });
    }

    const token = app.jwt.sign(
      { id: payload.id, email: payload.email, displayName: payload.displayName },
      { expiresIn: '7d' },
    );

    return reply.send({
      data: {
        user: { id: payload.id, email: payload.email, displayName: payload.displayName },
        token,
      },
    });
  });

  app.post('/2fa/disable', {
    preHandler: [autenticar, validar(desabilitarTotpSchema)],
  }, async (request, reply) => {
    const { code, recoveryCode } = request.body as { code?: string; recoveryCode?: string };
    const segundoFatorValido = await validarSegundoFatorUsuario({
      userId: request.user.id,
      code,
      recoveryCode,
      secretServidor: app.configuracao.jwtSecret || 'dev-secret-local-only',
    });
    if (!segundoFatorValido) {
      return reply.status(403).send({
        error: { code: 'INVALID_2FA_CODE', message: 'Código de segundo fator inválido.', status: 403 },
      });
    }

    await db.transaction(async (transacao) => {
      await transacao.delete(userTotpFactors).where(eq(userTotpFactors.userId, request.user.id));
      await transacao.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, request.user.id));
    });

    return reply.status(204).send();
  });

  app.post('/env-vault/envelope', {
    preHandler: [autenticar, exigirTotpStepUp, validar(salvarAccountEnvVaultEnvelopeSchema)],
  }, async (request, reply) => {
    const fatorTotp = await obterTotpAtivo(request.user.id);
    if (!fatorTotp) {
      return reply.status(403).send({
        error: {
          code: 'TOTP_REQUIRED',
          message: 'Ative o 2FA antes de cadastrar o envelope do Env Vault da conta.',
          status: 403,
        },
      });
    }

    const { envelope } = request.body as {
      envelope: {
        method: string;
        label: string;
        encryptedVaultSecret: unknown;
        stepUpFactors: string[];
      };
    };

    await db.transaction(async (transacao) => {
      await transacao
        .delete(accountEnvVaultEnvelopes)
        .where(and(
          eq(accountEnvVaultEnvelopes.userId, request.user.id),
          eq(accountEnvVaultEnvelopes.label, envelope.label),
        ));

      await transacao.insert(accountEnvVaultEnvelopes).values({
        userId: request.user.id,
        method: envelope.method,
        label: envelope.label,
        encryptedVaultSecret: envelope.encryptedVaultSecret,
        stepUpFactors: envelope.stepUpFactors,
      });
    });

    return reply.status(201).send({
      data: {
        envelopeCount: await contarAccountEnvVaultEnvelopes(request.user.id),
      },
    });
  });

  app.get('/env-vault/envelope', {
    preHandler: [autenticar, exigirTotpStepUp],
  }, async (request) => {
    const envelopes = await db
      .select({
        id: accountEnvVaultEnvelopes.id,
        method: accountEnvVaultEnvelopes.method,
        label: accountEnvVaultEnvelopes.label,
        encryptedVaultSecret: accountEnvVaultEnvelopes.encryptedVaultSecret,
        stepUpFactors: accountEnvVaultEnvelopes.stepUpFactors,
        createdAt: accountEnvVaultEnvelopes.createdAt,
        updatedAt: accountEnvVaultEnvelopes.updatedAt,
      })
      .from(accountEnvVaultEnvelopes)
      .where(eq(accountEnvVaultEnvelopes.userId, request.user.id));

    return { data: envelopes };
  });

  app.get('/me', { preHandler: [autenticar] }, async (request) => {
    const [usuario] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, request.user.id))
      .limit(1);

    return { data: usuario };
  });

  app.post('/api-keys', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    preHandler: [autenticar, exigirTotpStepUp, validar(criarApiKeySchema), verificarLimiteApiKeys],
  }, async (request, reply) => {
    const { name, scopes, expiresAt } = request.body as { name: string; scopes: string[]; expiresAt?: string };

    const rawKey = `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
    const keyPrefix = rawKey.slice(0, 14);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const [apiKey] = await db.insert(apiKeys).values({
      userId: request.user.id,
      name,
      keyPrefix,
      keyHash,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    return reply.status(201).send({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
    });
  });

  app.get('/api-keys', { preHandler: [autenticar] }, async (request) => {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, request.user.id));

    return { data: keys };
  });

  app.delete('/api-keys/:id', { preHandler: [autenticar] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, request.user.id)))
      .returning({ id: apiKeys.id });

    if (!deleted) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'API key não encontrada', status: 404 },
      });
    }

    return reply.status(204).send();
  });
}

function criarRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () => `myinst-2fa-${randomBytes(16).toString('base64url')}`);
}

async function contarAccountEnvVaultEnvelopes(userId: string): Promise<number> {
  const envelopes = await db
    .select({ id: accountEnvVaultEnvelopes.id })
    .from(accountEnvVaultEnvelopes)
    .where(eq(accountEnvVaultEnvelopes.userId, userId));

  return envelopes.length;
}

function validarTwoFactorLoginPayload(payload: unknown): TwoFactorLoginPayload | null {
  if (!payload || typeof payload !== 'object') return null;

  const payloadParcial = payload as Partial<TwoFactorLoginPayload>;
  if (
    payloadParcial.purpose !== 'two_factor_login'
    || typeof payloadParcial.id !== 'string'
    || typeof payloadParcial.email !== 'string'
    || typeof payloadParcial.displayName !== 'string'
  ) {
    return null;
  }

  return {
    id: payloadParcial.id,
    email: payloadParcial.email,
    displayName: payloadParcial.displayName,
    purpose: 'two_factor_login',
  };
}

function verificarTwoFactorLoginToken(app: FastifyInstance, token: string): TwoFactorLoginPayload | null {
  try {
    return validarTwoFactorLoginPayload(app.jwt.verify(token));
  } catch {
    return null;
  }
}
