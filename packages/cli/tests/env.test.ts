import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarEnvVaultFileSchema } from '@myinst/shared';
import { abrirEnvVaultRecoveryEnvelope } from '@myinst/shared/env-vault';
import {
  buscarEnvVaultFile,
  baixarEnvVaultFile,
  deletarEnvVaultFile,
  prepararEnvVaultPush,
} from '../src/commands/env.js';

const CONFIG = {
  server: 'https://api.myinst.test',
  apiKey: 'myinst_test',
};
const SEGREDO = 'segredo-local-do-usuario-com-entropia';

describe('Env Vault CLI', () => {
  it('prepara push criptografando localmente sem enviar plaintext', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-env-push-'));
    const caminho = join(dir, '.env.local');
    await writeFile(caminho, 'DATABASE_URL=postgresql://local\nTOKEN=abc123456\n', 'utf-8');

    const payload = await prepararEnvVaultPush({
      file: caminho,
      name: 'local',
      environment: 'development',
      segredo: SEGREDO,
    });

    const serializado = JSON.stringify(payload.body);
    expect(payload.body.name).toBe('local');
    expect(payload.body.sourcePath).toBe('.env.local');
    expect(payload.body.metadata.ciphertextByteLength).toBeGreaterThan(0);
    expect(criarEnvVaultFileSchema.parse(payload.body)).toEqual(payload.body);
    expect(serializado).not.toContain('postgresql://local');
    expect(serializado).not.toContain('abc123456');
    expect(serializado).not.toContain('byteLength');

    await rm(dir, { recursive: true, force: true });
  });

  it('prepara envelope de recuperação sem enviar segredo local', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-env-recovery-'));
    const caminho = join(dir, '.env.local');
    await writeFile(caminho, 'DATABASE_URL=postgresql://local\n', 'utf-8');

    const payload = await prepararEnvVaultPush({
      file: caminho,
      name: 'local',
      segredo: SEGREDO,
      createRecoveryKey: true,
    });

    expect(payload.generatedRecoveryKey).toMatch(/^myinst-env-rk_/);
    expect(payload.body.recoveryEnvelopes).toHaveLength(1);
    expect(criarEnvVaultFileSchema.parse(payload.body)).toEqual(payload.body);
    expect(JSON.stringify(payload.body)).not.toContain(SEGREDO);
    await expect(abrirEnvVaultRecoveryEnvelope({
      envelope: payload.body.recoveryEnvelopes![0],
      segredoRecuperacao: payload.generatedRecoveryKey!,
    })).resolves.toBe(SEGREDO);

    await rm(dir, { recursive: true, force: true });
  });

  it('baixa e descriptografa criando backup quando destino existe', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-env-pull-'));
    const origem = join(dir, '.env');
    const destino = join(dir, '.env.local');
    await writeFile(origem, 'DATABASE_URL=postgresql://novo\n', 'utf-8');
    await writeFile(destino, 'DATABASE_URL=postgresql://antigo\n', 'utf-8');
    const preparado = await prepararEnvVaultPush({ file: origem, name: 'local', segredo: SEGREDO });

    const urls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      urls.push(String(input));

      if (urls.length === 1) {
        return new Response(JSON.stringify({
          data: [{ id: 'env-1', name: 'local', sourcePath: '.env.local' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        data: {
          id: 'env-1',
          name: 'local',
          encryptedPayload: preparado.body.encryptedPayload,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const resultado = await baixarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      output: destino,
      segredo: SEGREDO,
      fetchImpl,
    });

    await expect(readFile(destino, 'utf-8')).resolves.toBe('DATABASE_URL=postgresql://novo\n');
    expect(resultado.backupPath).toBe(`${destino}.bak`);
    await expect(readFile(`${destino}.bak`, 'utf-8')).resolves.toBe('DATABASE_URL=postgresql://antigo\n');
    expect(urls).toEqual([
      'https://api.myinst.test/api/v1/workspaces/default/projects/myinst/env-files',
      'https://api.myinst.test/api/v1/workspaces/default/projects/myinst/env-files/env-1',
    ]);

    if (process.platform !== 'win32') {
      expect((await stat(destino)).mode & 0o777).toBe(0o600);
      expect((await stat(`${destino}.bak`)).mode & 0o777).toBe(0o600);
    }

    await rm(dir, { recursive: true, force: true });
  });

  it('envia headers de 2FA ao baixar payload sensível', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-env-step-up-'));
    const origem = join(dir, '.env');
    const destino = join(dir, '.env.local');
    await writeFile(origem, 'DATABASE_URL=postgresql://novo\n', 'utf-8');
    const preparado = await prepararEnvVaultPush({ file: origem, name: 'local', segredo: SEGREDO });
    const headersDetalhe: Record<string, string> = {};

    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/env-files')) {
        return new Response(JSON.stringify({
          data: [{ id: 'env-1', name: 'local', sourcePath: '.env.local' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      Object.assign(headersDetalhe, init?.headers);

      return new Response(JSON.stringify({
        data: {
          id: 'env-1',
          name: 'local',
          encryptedPayload: preparado.body.encryptedPayload,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    await baixarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      output: destino,
      segredo: SEGREDO,
      stepUp: { twoFactorCode: '123456' },
      fetchImpl,
    });

    expect(headersDetalhe).toMatchObject({
      Authorization: 'Bearer myinst_test',
      'x-myinst-2fa-code': '123456',
    });

    await rm(dir, { recursive: true, force: true });
  });

  it('não grava destino quando segredo está incorreto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-env-wrong-secret-'));
    const origem = join(dir, '.env');
    const destino = join(dir, '.env.local');
    await writeFile(origem, 'DATABASE_URL=postgresql://novo\n', 'utf-8');
    await writeFile(destino, 'DATABASE_URL=postgresql://antigo\n', 'utf-8');
    const preparado = await prepararEnvVaultPush({ file: origem, name: 'local', segredo: SEGREDO });

    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/env-files')) {
        return new Response(JSON.stringify({
          data: [{ id: 'env-1', name: 'local', sourcePath: '.env.local' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        data: {
          id: 'env-1',
          name: 'local',
          encryptedPayload: preparado.body.encryptedPayload,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    await expect(baixarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      output: destino,
      segredo: 'segredo-incorreto-local',
      fetchImpl,
    })).rejects.toThrow('Não foi possível descriptografar o Env Vault.');

    await expect(readFile(destino, 'utf-8')).resolves.toBe('DATABASE_URL=postgresql://antigo\n');
    expect(existsSync(`${destino}.bak`)).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it('exige output explicito para não confiar em sourcePath remoto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-env-no-output-'));
    const origem = join(dir, '.env');
    await writeFile(origem, 'DATABASE_URL=postgresql://novo\n', 'utf-8');
    const preparado = await prepararEnvVaultPush({ file: origem, name: 'local', segredo: SEGREDO });

    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/env-files')) {
        return new Response(JSON.stringify({
          data: [{ id: 'env-1', name: 'local', sourcePath: '/tmp/servidor/.env' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        data: {
          id: 'env-1',
          name: 'local',
          encryptedPayload: preparado.body.encryptedPayload,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    await expect(baixarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      segredo: SEGREDO,
      fetchImpl,
    })).rejects.toThrow('Informe --output para materializar um env localmente.');

    await rm(dir, { recursive: true, force: true });
  });

  it('busca env pelo nome sem expor valores', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      data: [
        { id: 'env-1', name: 'local', sourcePath: '.env.local', metadata: { ciphertextByteLength: 100 } },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const envFile = await buscarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      fetchImpl,
    });

    expect(envFile).toEqual(expect.objectContaining({ id: 'env-1', name: 'local' }));
    expect(JSON.stringify(envFile)).not.toContain('DATABASE_URL');
  });

  it('exige environment quando nome do env é ambiguo', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({
      data: [
        { id: 'env-local', name: 'local', environment: 'local', sourcePath: '.env.local' },
        { id: 'env-prod', name: 'local', environment: 'production', sourcePath: '.env.production' },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    await expect(buscarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      fetchImpl,
    })).rejects.toThrow('Informe --environment');

    await expect(buscarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      environment: 'production',
      fetchImpl,
    })).resolves.toEqual(expect.objectContaining({ id: 'env-prod' }));
  });

  it('deleta env por nome usando rota dedicada', async () => {
    const urls: Array<{ url: string; method?: string; recoveryCode?: string }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      urls.push({
        url: String(input),
        method: init?.method,
        recoveryCode: headers?.['x-myinst-recovery-code'],
      });

      if (!init?.method) {
        return new Response(JSON.stringify({
          data: [{ id: 'env-1', name: 'local', sourcePath: '.env' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(null, { status: 204 });
    };

    await deletarEnvVaultFile({
      config: CONFIG,
      workspace: 'default',
      project: 'myinst',
      name: 'local',
      stepUp: { recoveryCode: 'myinst-2fa-recuperacao' },
      fetchImpl,
    });

    expect(urls.at(-1)).toEqual({
      url: 'https://api.myinst.test/api/v1/workspaces/default/projects/myinst/env-files/env-1',
      method: 'DELETE',
      recoveryCode: 'myinst-2fa-recuperacao',
    });
  });
});
