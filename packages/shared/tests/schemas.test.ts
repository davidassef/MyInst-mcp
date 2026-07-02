import { describe, expect, it } from 'vitest';
import {
  criarEnvVaultRecoveryEnvelope,
  criptografarEnvVault,
  gerarRecoveryKeyEnvVault,
  gerarSegredoVaultEnvVault,
} from '../src/env-vault.js';
import { criarEnvVaultFileSchema, resumirChatSessionSchema } from '../src/schemas/index.js';

describe('schemas', () => {
  it('aceita body ausente para resumo automatico de chat', () => {
    expect(resumirChatSessionSchema.parse(undefined)).toEqual({});
  });

  it('aceita envelope criptografado para arquivo de env vault sem plaintext', async () => {
    const encryptedPayload = await criptografarEnvVault({
      plaintext: 'DATABASE_URL=postgresql://local',
      segredo: 'segredo-local-do-usuario-com-entropia',
    });

    const parsed = criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: '.env.local',
      environment: 'development',
      encryptedPayload,
      metadata: {
        ciphertextByteLength: 128,
        ciphertextSha256: 'a'.repeat(64),
      },
    });

    expect(parsed.name).toBe('local');
    expect(JSON.stringify(parsed)).not.toContain('postgresql://local');
  });

  it('aceita envelopes de recuperação sem permitir email como chave criptografica', async () => {
    const encryptedPayload = await criptografarEnvVault({
      plaintext: 'DATABASE_URL=postgresql://local',
      segredo: 'segredo-local-do-usuario-com-entropia',
    });
    const recoveryEnvelope = await criarEnvVaultRecoveryEnvelope({
      vaultSecret: gerarSegredoVaultEnvVault(),
      segredoRecuperacao: gerarRecoveryKeyEnvVault(),
      method: 'recovery_key',
      label: 'Recovery key principal',
      stepUpFactors: ['email', 'totp'],
    });

    const parsed = criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: '.env.local',
      encryptedPayload,
      metadata: {
        ciphertextByteLength: 128,
      },
      recoveryEnvelopes: [recoveryEnvelope],
    });

    expect(parsed.recoveryEnvelopes?.[0]?.stepUpFactors).toEqual(['email', 'totp']);
    expect(() => criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: '.env.local',
      encryptedPayload,
      metadata: {
        ciphertextByteLength: 128,
      },
      recoveryEnvelopes: [{ ...recoveryEnvelope, method: 'email' }],
    })).toThrow();
  });

  it('rejeita plaintext e metadados sensiveis no contrato de env vault', async () => {
    const encryptedPayload = await criptografarEnvVault({
      plaintext: 'DATABASE_URL=postgresql://local',
      segredo: 'segredo-local-do-usuario-com-entropia',
    });

    expect(() => criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: '.env',
      encryptedPayload,
      plaintext: 'DATABASE_URL=postgresql://local',
      metadata: {
        ciphertextByteLength: 128,
      },
    })).toThrow();

    expect(() => criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: '.env',
      encryptedPayload,
      metadata: {
        ciphertextByteLength: 128,
        keyNames: ['DATABASE_URL'],
      },
    })).toThrow();
  });

  it('rejeita payload de env vault com KDF fora do padrao', async () => {
    const encryptedPayload = await criptografarEnvVault({
      plaintext: 'DATABASE_URL=postgresql://local',
      segredo: 'segredo-local-do-usuario-com-entropia',
    });

    expect(() => criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: '.env',
      encryptedPayload: {
        ...encryptedPayload,
        kdf: { ...encryptedPayload.kdf, iterations: 999_999_999 },
      },
      metadata: {
        ciphertextByteLength: 128,
      },
    })).toThrow();
  });
});
