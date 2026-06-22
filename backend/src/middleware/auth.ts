import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { apiKeys, users } from '../db/schema.js';
import { API_KEY_PREFIX } from '@myinst/shared';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authMethod?: 'jwt' | 'api_key';
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function autenticarApiKey(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'API key ausente', status: 401 },
    });
  }

  const key = authHeader.slice(7);
  if (!key.startsWith(API_KEY_PREFIX)) {
    return reply.status(401).send({
      error: { code: 'INVALID_KEY', message: 'Formato de API key inválido', status: 401 },
    });
  }

  const keyHash = hashApiKey(key);
  const [found] = await db
    .select({
      keyId: apiKeys.id,
      userId: apiKeys.userId,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      email: users.email,
      displayName: users.displayName,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!found) {
    return reply.status(401).send({
      error: { code: 'INVALID_KEY', message: 'API key inválida', status: 401 },
    });
  }

  if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
    return reply.status(401).send({
      error: { code: 'KEY_EXPIRED', message: 'API key expirada', status: 401 },
    });
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, found.keyId));

  request.user = {
    id: found.userId,
    email: found.email,
    displayName: found.displayName,
  };
  request.authMethod = 'api_key';
}

export async function autenticarJwt(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const payload = request.user as { id: string; email: string; displayName: string };
    const [usuario] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);

    if (!usuario) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Sessão inválida. Faça login novamente.', status: 401 },
      });
    }

    request.user = usuario;
    request.authMethod = 'jwt';
  } catch {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Token inválido ou expirado', status: 401 },
    });
  }
}

export async function autenticar(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária', status: 401 },
    });
  }

  if (authHeader.startsWith('Bearer myinst_')) {
    return autenticarApiKey(request, reply);
  }

  return autenticarJwt(request, reply);
}
