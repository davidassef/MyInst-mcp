import { describe, expect, it } from 'vitest';
import {
  calcularHashCiphertextEnvVault,
  descriptografarEnvVault,
  extrairMetadadosEnvSeguro,
  gerarRecoveryKeyEnvVault,
  criptografarEnvVault,
  validarPayloadEnvVault,
} from '../src/env-vault.js';

const SEGREDO_PRINCIPAL = 'segredo-local-do-usuario-com-entropia';
const ENV_COMPLETO = [
  '# Config local',
  'DATABASE_URL="postgresql://usuario:senha@localhost:5432/app"',
  'MYINST_API_KEY=myinst_12345678901234567890',
  'MULTILINE="linha 1\\nlinha 2"',
  'FEATURE_FLAG=true',
].join('\n');

describe('Env Vault', () => {
  it('criptografa e descriptografa um .env preservando o conteudo original', async () => {
    const payload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });

    const plaintext = await descriptografarEnvVault({
      payload,
      segredo: SEGREDO_PRINCIPAL,
    });

    expect(plaintext).toBe(ENV_COMPLETO);
    expect(payload.ciphertext).not.toContain('DATABASE_URL');
    expect(JSON.stringify(payload)).not.toContain('postgresql://usuario');
  });

  it('falha com segredo incorreto sem retornar plaintext', async () => {
    const payload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });

    await expect(descriptografarEnvVault({
      payload,
      segredo: 'segredo-incorreto',
    })).rejects.toThrow('Não foi possível descriptografar o Env Vault.');
  });

  it('usa salt e iv diferentes para cada criptografia do mesmo conteudo', async () => {
    const primeiroPayload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });
    const segundoPayload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });

    expect(segundoPayload.salt).not.toBe(primeiroPayload.salt);
    expect(segundoPayload.iv).not.toBe(primeiroPayload.iv);
    expect(segundoPayload.ciphertext).not.toBe(primeiroPayload.ciphertext);
  });

  it('extrai metadados seguros sem nomes nem valores de variaveis por padrao', () => {
    const metadata = extrairMetadadosEnvSeguro(ENV_COMPLETO);

    expect('keyNames' in metadata).toBe(false);
    expect(metadata.byteLength).toBe(new TextEncoder().encode(ENV_COMPLETO).byteLength);
    expect('sha256' in metadata).toBe(false);
    expect(JSON.stringify(metadata)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(metadata)).not.toContain('postgresql://usuario');
    expect(JSON.stringify(metadata)).not.toContain('myinst_12345678901234567890');
  });

  it('extrai nomes de chaves apenas por opt-in local', () => {
    const metadata = extrairMetadadosEnvSeguro(ENV_COMPLETO, { incluirNomesChaves: true });

    expect(metadata.keyNames).toEqual([
      'DATABASE_URL',
      'MYINST_API_KEY',
      'MULTILINE',
      'FEATURE_FLAG',
    ]);
    expect(JSON.stringify(metadata)).not.toContain('postgresql://usuario');
    expect(JSON.stringify(metadata)).not.toContain('myinst_12345678901234567890');
  });

  it('calcula sha256 apenas sobre ciphertext operacional', async () => {
    const payload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });
    const hash = calcularHashCiphertextEnvVault(payload);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('postgresql://usuario');
  });

  it('gera recovery key com formato exportavel e sem depender do plaintext', () => {
    const recoveryKey = gerarRecoveryKeyEnvVault();

    expect(recoveryKey).toMatch(/^myinst-env-rk_[A-Za-z0-9_-]{43,}$/);
    expect(recoveryKey).not.toContain('DATABASE_URL');
  });

  it('valida payload recebido da rede antes de usar o KDF', async () => {
    const payload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });

    expect(() => validarPayloadEnvVault({
      ...payload,
      kdf: { ...payload.kdf, iterations: 999_999_999 },
    })).toThrow('Payload de Env Vault inválido.');

    await expect(descriptografarEnvVault({
      payload: {
        ...payload,
        kdf: { ...payload.kdf, iterations: 999_999_999 },
      },
      segredo: SEGREDO_PRINCIPAL,
    })).rejects.toThrow('Não foi possível descriptografar o Env Vault.');
  });

  it('rejeita payload com campos binarios malformados', async () => {
    const payload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });

    expect(() => validarPayloadEnvVault({ ...payload, salt: 'abc' })).toThrow('Payload de Env Vault inválido.');
    expect(() => validarPayloadEnvVault({ ...payload, iv: 'abc' })).toThrow('Payload de Env Vault inválido.');
    expect(() => validarPayloadEnvVault({ ...payload, authTag: 'abc' })).toThrow('Payload de Env Vault inválido.');
    expect(() => validarPayloadEnvVault({ ...payload, ciphertext: '' })).toThrow('Payload de Env Vault inválido.');
  });

  it('falha quando ciphertext ou authTag sao adulterados', async () => {
    const payload = await criptografarEnvVault({
      plaintext: ENV_COMPLETO,
      segredo: SEGREDO_PRINCIPAL,
    });

    await expect(descriptografarEnvVault({
      payload: { ...payload, ciphertext: payload.authTag },
      segredo: SEGREDO_PRINCIPAL,
    })).rejects.toThrow('Não foi possível descriptografar o Env Vault.');

    await expect(descriptografarEnvVault({
      payload: { ...payload, authTag: payload.iv },
      segredo: SEGREDO_PRINCIPAL,
    })).rejects.toThrow('Não foi possível descriptografar o Env Vault.');
  });
});
