import { describe, expect, it } from 'vitest';
import { criptografarEnvVault } from '@myinst/shared/env-vault';
import {
  desbloquearEnvVaultParaVisualizacao,
  mascararValorEnvVault,
  parsearEnvParaVisualizacao,
} from './envVaultViewer';

const SEGREDO_TESTE = 'segredo-local-para-env-vault';

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

  it('mascara valores sem expor tamanho exato quando o usuario ainda nao revelou', () => {
    expect(mascararValorEnvVault('token-local')).toBe('********');
    expect(mascararValorEnvVault('')).toBe('(vazio)');
  });
});
