import { describe, expect, it } from 'vitest';
import {
  criarEnvVaultRecoveryEnvelope,
  criptografarEnvVault,
  gerarRecoveryKeyEnvVault,
  gerarSegredoVaultEnvVault,
} from '../src/env-vault.js';
import {
  criarEnvVaultFileSchema,
  desabilitarTotpSchema,
  resumirChatSessionSchema,
  salvarAccountEnvVaultEnvelopeSchema,
  verificarTotpLoginSchema,
  verificarTotpSetupSchema,
} from '../src/schemas/index.js';

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

  it('valida contratos de 2FA com codigo de seis digitos', () => {
    expect(verificarTotpSetupSchema.parse({ code: '123456' })).toEqual({ code: '123456' });
    expect(() => verificarTotpSetupSchema.parse({ code: '12345' })).toThrow();
    expect(() => verificarTotpSetupSchema.parse({ code: '1234567' })).toThrow();
    expect(() => verificarTotpSetupSchema.parse({ code: 'abcdef' })).toThrow();

    expect(verificarTotpLoginSchema.parse({
      twoFactorToken: 'token-temporario-com-tamanho-suficiente',
      code: '654321',
    })).toEqual({
      twoFactorToken: 'token-temporario-com-tamanho-suficiente',
      code: '654321',
    });

    expect(verificarTotpLoginSchema.parse({
      twoFactorToken: 'token-temporario-com-tamanho-suficiente',
      recoveryCode: 'myinst-2fa-abcdef',
    })).toEqual({
      twoFactorToken: 'token-temporario-com-tamanho-suficiente',
      recoveryCode: 'myinst-2fa-abcdef',
    });

    expect(() => verificarTotpLoginSchema.parse({
      twoFactorToken: 'token-temporario-com-tamanho-suficiente',
    })).toThrow();

    expect(desabilitarTotpSchema.parse({ recoveryCode: 'myinst-2fa-abcdef' })).toEqual({
      recoveryCode: 'myinst-2fa-abcdef',
    });
  });

  it('aceita envelope de env vault da conta sem plaintext', async () => {
    const envelope = await criarEnvVaultRecoveryEnvelope({
      vaultSecret: gerarSegredoVaultEnvVault(),
      segredoRecuperacao: 'senha-forte-do-env-vault-com-entropia',
      method: 'passphrase',
      label: 'Senha do Env Vault',
      stepUpFactors: ['totp'],
    });

    const parsed = salvarAccountEnvVaultEnvelopeSchema.parse({ envelope });

    expect(parsed.envelope.method).toBe('passphrase');
    expect(parsed.envelope.stepUpFactors).toEqual(['totp']);
    expect(JSON.stringify(parsed)).not.toContain('senha-forte-do-env-vault-com-entropia');
    expect(() => salvarAccountEnvVaultEnvelopeSchema.parse({
      envelope,
      vaultSecret: 'segredo-em-claro',
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

  it('rejeita caminho local absoluto em sourcePath do env vault', async () => {
    const encryptedPayload = await criptografarEnvVault({
      plaintext: 'DATABASE_URL=postgresql://local',
      segredo: 'segredo-local-do-usuario-com-entropia',
    });

    expect(() => criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: 'C:\\Users\\usuario\\projeto\\.env.local',
      encryptedPayload,
      metadata: {
        ciphertextByteLength: 128,
      },
    })).toThrow();

    expect(() => criarEnvVaultFileSchema.parse({
      name: 'local',
      sourcePath: 'config/.env.local',
      encryptedPayload,
      metadata: {
        ciphertextByteLength: 128,
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
