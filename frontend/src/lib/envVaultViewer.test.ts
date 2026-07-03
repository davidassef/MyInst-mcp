import { describe, expect, it } from 'vitest';
import { criarEnvVaultRecoveryEnvelope, criptografarEnvVault } from '@myinst/shared/env-vault';
import {
  desbloquearEnvVaultParaVisualizacao,
  desbloquearEnvVaultComRecoveryKeyParaVisualizacao,
  mascararValorEnvVault,
  parsearEnvParaVisualizacao,
  prepararRecoveryEnvelopeEnvVaultWeb,
} from './envVaultViewer';

const SEGREDO_TESTE = 'segredo-local-para-env-vault';
const RECOVERY_KEY_TESTE = 'recovery-key-local-para-env-vault';

describe('envVaultViewer', () => {
  it('parseia variaveis, comentarios e linhas nao suportadas sem executar interpolacao', () => {
    const visualizacao = parsearEnvParaVisualizacao([
      'DATABASE_URL="postgres://localhost:5432/myinst"',
      '# comentario operacional',
      "export API_KEY='abc123'",
      'REFERENCIA=${DATABASE_URL}',
      'linha sem igual',
      '',
    ].join('\n'));

    expect(visualizacao.variaveis).toEqual([
      {
        nome: 'DATABASE_URL',
        valor: 'postgres://localhost:5432/myinst',
        linha: 1,
      },
      {
        nome: 'API_KEY',
        valor: 'abc123',
        linha: 3,
      },
      {
        nome: 'REFERENCIA',
        valor: '${DATABASE_URL}',
        linha: 4,
      },
    ]);
    expect(visualizacao.linhasIgnoradas).toEqual([{ linha: 5, conteudo: 'linha sem igual' }]);
    expect(visualizacao.totalLinhas).toBe(6);
  });

  it('desbloqueia payload criptografado usando somente segredo local', async () => {
    const payloadCriptografado = await criptografarEnvVault({
      plaintext: 'API_URL=https://api.example.com\nTOKEN=token-local',
      segredo: SEGREDO_TESTE,
    });

    const visualizacao = await desbloquearEnvVaultParaVisualizacao({
      encryptedPayload: payloadCriptografado,
      secret: SEGREDO_TESTE,
    });

    expect(visualizacao.variaveis).toHaveLength(2);
    expect(visualizacao.variaveis[0]).toMatchObject({
      nome: 'API_URL',
      valor: 'https://api.example.com',
    });
  });

  it('desbloqueia payload criptografado usando recovery key sem expor segredo do vault', async () => {
    const payloadCriptografado = await criptografarEnvVault({
      plaintext: 'DATABASE_URL=postgres://localhost/myinst',
      segredo: SEGREDO_TESTE,
    });
    const recoveryEnvelope = await criarEnvVaultRecoveryEnvelope({
      vaultSecret: SEGREDO_TESTE,
      segredoRecuperacao: RECOVERY_KEY_TESTE,
      method: 'recovery_key',
      label: 'Recovery key web',
    });

    const visualizacao = await desbloquearEnvVaultComRecoveryKeyParaVisualizacao({
      encryptedPayload: payloadCriptografado,
      recoveryEnvelope,
      recoveryKey: RECOVERY_KEY_TESTE,
    });

    expect(visualizacao.variaveis).toEqual([
      {
        nome: 'DATABASE_URL',
        valor: 'postgres://localhost/myinst',
        linha: 1,
      },
    ]);
  });

  it('falha com recovery key incorreta sem retornar plaintext', async () => {
    const payloadCriptografado = await criptografarEnvVault({
      plaintext: 'TOKEN=token-local',
      segredo: SEGREDO_TESTE,
    });
    const recoveryEnvelope = await criarEnvVaultRecoveryEnvelope({
      vaultSecret: SEGREDO_TESTE,
      segredoRecuperacao: RECOVERY_KEY_TESTE,
      method: 'recovery_key',
      label: 'Recovery key web',
    });

    await expect(desbloquearEnvVaultComRecoveryKeyParaVisualizacao({
      encryptedPayload: payloadCriptografado,
      recoveryEnvelope,
      recoveryKey: 'recovery-key-incorreta-local',
    })).rejects.toThrow('Não foi possível descriptografar o Env Vault.');
  });

  it('prepara recovery envelope web sem serializar o segredo do vault', async () => {
    const recovery = await prepararRecoveryEnvelopeEnvVaultWeb({
      vaultSecret: SEGREDO_TESTE,
      label: 'Recovery key web',
    });

    expect(recovery.recoveryKey).toMatch(/^myinst-env-rk_/);
    expect(recovery.envelope.label).toBe('Recovery key web');
    expect(JSON.stringify(recovery)).not.toContain(SEGREDO_TESTE);
  });

  it('mascara valores sem expor tamanho exato quando o usuario ainda nao revelou', () => {
    expect(mascararValorEnvVault('token-local')).toBe('********');
    expect(mascararValorEnvVault('')).toBe('(vazio)');
  });
});
