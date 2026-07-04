import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { userRecoveryCodes, userTotpFactors } from '../db/schema.js';
import { descriptografarSegredoServidor } from './secret-encryption.js';
import { verificarCodigoTotp } from './totp.js';

export async function exigirTotpStepUp(request: FastifyRequest, reply: FastifyReply) {
  const fator = await obterTotpAtivo(request.user.id);
  if (!fator) return;

  const code = obterHeaderUnico(request.headers['x-myinst-2fa-code']);
  const recoveryCode = obterHeaderUnico(request.headers['x-myinst-recovery-code']);
  const segundoFatorValido = await validarSegundoFatorUsuario({
    userId: request.user.id,
    code,
    recoveryCode,
    secretServidor: request.server.configuracao.jwtSecret || 'dev-secret-local-only',
  });

  if (segundoFatorValido) return;

  return reply.status(code || recoveryCode ? 403 : 403).send({
    error: {
      code: code || recoveryCode ? 'INVALID_2FA_CODE' : 'STEP_UP_REQUIRED',
      message: code || recoveryCode
        ? 'Código de segundo fator inválido.'
        : 'Confirme o segundo fator para concluir esta ação.',
      status: 403,
    },
  });
}

export async function obterTotpAtivo(userId: string) {
  const [fator] = await db
    .select()
    .from(userTotpFactors)
    .where(and(eq(userTotpFactors.userId, userId), isNotNull(userTotpFactors.enabledAt)))
    .limit(1);

  return fator ?? null;
}

export async function contarRecoveryCodesDisponiveis(userId: string): Promise<number> {
  const codigos = await db
    .select({ id: userRecoveryCodes.id })
    .from(userRecoveryCodes)
    .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)));

  return codigos.length;
}

export async function validarSegundoFatorUsuario({
  userId,
  code,
  recoveryCode,
  secretServidor,
}: {
  userId: string;
  code?: string;
  recoveryCode?: string;
  secretServidor: string;
}): Promise<boolean> {
  if (code) {
    const fator = await obterTotpAtivo(userId);
    if (!fator) return false;

    const secret = descriptografarSegredoServidor({
      envelope: fator.secretEncrypted,
      secretServidor,
    });
    const codigoValido = verificarCodigoTotp({ secret, code });
    if (!codigoValido) return false;

    await db
      .update(userTotpFactors)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(userTotpFactors.id, fator.id));

    return true;
  }

  if (!recoveryCode) return false;

  const codigos = await db
    .select()
    .from(userRecoveryCodes)
    .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)));

  for (const codigo of codigos) {
    const codigoValido = await bcrypt.compare(recoveryCode, codigo.codeHash);
    if (!codigoValido) continue;

    await db
      .update(userRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(eq(userRecoveryCodes.id, codigo.id));

    return true;
  }

  return false;
}

function obterHeaderUnico(header: string | string[] | undefined): string | undefined {
  if (Array.isArray(header)) return header[0];
  return header;
}
