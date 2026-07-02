import { describe, expect, it, vi } from 'vitest';
import { obterAvisoAtualizacao } from '../src/update-check.js';

describe('update check', () => {
  it('avisa quando existe versão npm mais nova', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaRegistry('0.1.0-beta.10'));

    const aviso = await obterAvisoAtualizacao({
      currentVersion: '0.1.0-beta.9',
      fetchImpl,
      env: {},
    });

    expect(aviso).toBe('[WARN] Nova versão do MyInst CLI disponível: 0.1.0-beta.9 -> 0.1.0-beta.10. Atualize com: npm install -g @myinst/cli@latest');
    expect(fetchImpl).toHaveBeenCalledWith('https://registry.npmjs.org/@myinst%2Fcli/latest', expect.any(Object));
  });

  it('fica silencioso quando a versão local já é a latest', async () => {
    const aviso = await obterAvisoAtualizacao({
      currentVersion: '0.1.0-beta.9',
      fetchImpl: vi.fn().mockResolvedValue(respostaRegistry('0.1.0-beta.9')),
      env: {},
    });

    expect(aviso).toBeNull();
  });

  it('fica silencioso quando a checagem está desabilitada', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaRegistry('0.1.0-beta.10'));

    const aviso = await obterAvisoAtualizacao({
      currentVersion: '0.1.0-beta.9',
      fetchImpl,
      env: { MYINST_DISABLE_UPDATE_CHECK: '1' },
    });

    expect(aviso).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('não falha o comando quando o registry está indisponível', async () => {
    const aviso = await obterAvisoAtualizacao({
      currentVersion: '0.1.0-beta.9',
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
      env: {},
    });

    expect(aviso).toBeNull();
  });
});

function respostaRegistry(version: string) {
  return {
    ok: true,
    json: async () => ({ version }),
  };
}
