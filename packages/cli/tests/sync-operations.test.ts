import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executarPullSincronizado,
  executarPushSincronizado,
  lerManifestoSync,
  gravarManifestoSync,
  lerConteudoLocal,
} from '../src/sync/operations.js';
import { criarSnapshotManifesto } from '../src/sync/status.js';

const config = { server: 'http://myinst.local', apiKey: 'myinst_test' };

describe('sync operations', () => {
  const temporarios: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const dir of temporarios.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('grava e le manifesto local de sync', async () => {
    const dir = await criarDirTemp(temporarios);
    const manifesto = criarSnapshotManifesto({
      workspace: 'default',
      project: 'default',
      serverTime: '2026-06-27T00:00:00.000Z',
      remotos: [itemRemoto('skill', 'deploy', 'conteudo')],
    });

    await gravarManifestoSync(dir, manifesto);

    const lido = await lerManifestoSync(dir, 'default', 'default');
    expect(lido?.items).toHaveLength(1);
    expect(lido?.items[0]).toMatchObject({ type: 'skill', slug: 'deploy' });
  });

  it('pull aplica conteudo remoto e atualiza manifesto', async () => {
    const dir = await criarDirTemp(temporarios);
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [itemRemoto('skill', 'deploy', 'conteudo remoto')],
        serverTime: '2026-06-27T00:00:00.000Z',
      },
    }));

    await executarPullSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      fetchImpl: fetchMock,
    });

    const conteudo = await readFile(join(dir, '.claude', 'skills', 'deploy.md'), 'utf-8');
    const manifesto = await lerManifestoSync(dir, 'default', 'default');

    expect(conteudo).toBe('conteudo remoto');
    expect(manifesto?.items[0]).toMatchObject({ type: 'skill', slug: 'deploy' });
  });

  it('pull aplica conteudo remoto no formato nativo do client detectado', async () => {
    const dir = await criarDirTemp(temporarios);
    await mkdir(join(dir, '.codex'), { recursive: true });
    await writeFile(join(dir, '.codex', 'AGENTS.md'), 'Instrucoes antigas', 'utf-8');

    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [itemRemoto('instruction', 'agents', 'Instrucoes novas', { clientId: undefined })],
        serverTime: '2026-06-27T00:00:00.000Z',
      },
    }));

    await executarPullSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      clients: ['codex'],
      fetchImpl: fetchMock,
    });

    const conteudo = await readFile(join(dir, '.codex', 'AGENTS.md'), 'utf-8');

    expect(conteudo).toBe('Instrucoes novas');
  });

  it('pull exige --client quando múltiplos clients de projeto são detectados', async () => {
    const dir = await criarDirTemp(temporarios);
    await criarSkillLocal(dir, 'deploy', 'Skill Claude');
    await mkdir(join(dir, '.codex'), { recursive: true });
    await writeFile(join(dir, '.codex', 'AGENTS.md'), 'Instrucoes Codex', 'utf-8');

    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [],
        serverTime: '2026-06-27T00:00:00.000Z',
      },
    }));

    await expect(executarPullSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      fetchImpl: fetchMock,
    })).rejects.toThrow('Informe --client');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pull com client Codex explicito cria layout nativo mesmo sem estrutura previa', async () => {
    const dir = await criarDirTemp(temporarios);
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [itemRemoto('instruction', 'agents', 'Instrucoes novas', { clientId: undefined })],
        serverTime: '2026-06-27T00:00:00.000Z',
      },
    }));

    const resultado = await executarPullSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      clients: ['codex'],
      fetchImpl: fetchMock,
    });
    const manifesto = await lerManifestoSync(dir, 'default', 'default');
    const conteudo = await readFile(join(dir, '.codex', 'AGENTS.md'), 'utf-8');

    expect(conteudo).toBe('Instrucoes novas');
    expect(resultado.aplicados).toHaveLength(1);
    expect(manifesto?.items).toHaveLength(1);
    await expect(readFile(join(dir, '.claude', 'CLAUDE.md'), 'utf-8')).rejects.toThrow();
  });

  it('pull com client Claude explicito nao aplica itens Codex remotos', async () => {
    const dir = await criarDirTemp(temporarios);
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [
          itemRemoto('instruction', 'claude', 'Instrucoes Claude'),
          itemRemoto('instruction', 'agents', 'Instrucoes Codex', {
            clientId: undefined,
            metadata: { myinstClientId: 'codex', myinstSourceScope: 'project' },
          }),
        ],
        serverTime: '2026-06-27T00:00:00.000Z',
      },
    }));

    const resultado = await executarPullSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      clients: ['claude'],
      fetchImpl: fetchMock,
    });
    const conteudoClaude = await readFile(join(dir, '.claude', 'CLAUDE.md'), 'utf-8');

    expect(conteudoClaude).toBe('Instrucoes Claude');
    expect(resultado.aplicados).toHaveLength(1);
    await expect(readFile(join(dir, '.codex', 'AGENTS.md'), 'utf-8')).rejects.toThrow();
  });

  it('pull global com client Codex explicito cria layout nativo mesmo sem estrutura previa', async () => {
    const dir = await criarDirTemp(temporarios);
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [itemRemoto('setting', 'codex-config', 'sandbox_mode = "workspace-write"', { clientId: 'codex', scope: 'global' })],
        serverTime: '2026-06-27T00:00:00.000Z',
      },
    }));

    const resultado = await executarPullSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      scope: 'global',
      clients: ['codex'],
      fetchImpl: fetchMock,
      homeDir: dir,
    });
    const conteudo = await readFile(join(dir, '.codex', 'config.toml'), 'utf-8');

    expect(conteudo).toBe('sandbox_mode = "workspace-write"');
    expect(resultado.aplicados).toHaveLength(1);
    await expect(readFile(join(dir, '.claude', 'settings.json'), 'utf-8')).rejects.toThrow();
  });

  it('pull global preserva config local existente do Codex', async () => {
    const dir = await criarDirTemp(temporarios);
    await mkdir(join(dir, '.codex'), { recursive: true });
    await writeFile(join(dir, '.codex', 'config.toml'), 'model = "local"\napi_key = "valor-local"', 'utf-8');

    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [itemRemoto('setting', 'codex-config', 'model = "remoto"', { clientId: 'codex', scope: 'global' })],
        serverTime: '2026-06-27T00:00:00.000Z',
      },
    }));

    const resultado = await executarPullSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      scope: 'global',
      clients: ['codex'],
      fetchImpl: fetchMock,
      homeDir: dir,
    });
    const conteudo = await readFile(join(dir, '.codex', 'config.toml'), 'utf-8');

    expect(conteudo).toBe('model = "local"\napi_key = "valor-local"');
    expect(resultado.aplicados).toHaveLength(0);
    expect(resultado.ignorados).toEqual([
      'codex/global/setting/codex-config: configuração local existente preservada',
    ]);
  });

  it('push bloqueia envio local quando conteúdo contém segredo provável', async () => {
    const dir = await criarDirTemp(temporarios);
    await criarSkillLocal(dir, 'leak', 'Use MYINST_API_KEY=myinst_12345678901234567890');

    const fetchMock = vi.fn();

    await expect(executarPushSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      fetchImpl: fetchMock,
    })).rejects.toThrow('segredo');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('push bloqueia envio quando existe conflito', async () => {
    const dir = await criarDirTemp(temporarios);
    await criarSkillLocal(dir, 'deploy', 'conteudo local novo');
    await gravarManifestoSync(dir, criarSnapshotManifesto({
      workspace: 'default',
      project: 'default',
      serverTime: '2026-06-27T00:00:00.000Z',
      remotos: [itemRemoto('skill', 'deploy', 'conteudo base')],
    }));

    const fetchMock = vi.fn().mockResolvedValue(respostaJson({
      data: {
        items: [itemRemoto('skill', 'deploy', 'conteudo remoto novo')],
        serverTime: '2026-06-27T00:01:00.000Z',
      },
    }));

    await expect(executarPushSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      fetchImpl: fetchMock,
    })).rejects.toThrow('Conflito de sync');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('push envia conteudo local e atualiza manifesto apos sucesso', async () => {
    const dir = await criarDirTemp(temporarios);
    await criarSkillLocal(dir, 'project-state', 'conteudo local');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respostaJson({ data: { items: [], serverTime: '2026-06-27T00:00:00.000Z' } }))
      .mockResolvedValueOnce(respostaJson({ data: { created: ['project-state'], updated: [], serverTime: '2026-06-27T00:01:00.000Z' } }))
      .mockResolvedValueOnce(respostaJson({
        data: {
          items: [itemRemoto('skill', 'project-state', 'conteudo local')],
          serverTime: '2026-06-27T00:02:00.000Z',
        },
      }));

    const resultado = await executarPushSincronizado({
      config,
      diretorio: dir,
      project: 'default',
      workspace: 'default',
      fetchImpl: fetchMock,
    });

    const manifesto = await lerManifestoSync(dir, 'default', 'default');

    expect(resultado.created).toEqual(['project-state']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(manifesto?.items[0]).toMatchObject({ type: 'skill', slug: 'project-state' });
  });

  it('le estruturas nativas de Codex e Kimi no conteudo local', async () => {
    const dir = await criarDirTemp(temporarios);
    await mkdir(join(dir, '.codex'), { recursive: true });
    await writeFile(join(dir, '.codex', 'AGENTS.md'), 'Instrucoes Codex', 'utf-8');
    await mkdir(join(dir, '.kimi-code', 'skills'), { recursive: true });
    await writeFile(join(dir, '.kimi-code', 'skills', 'deploy.md'), 'Skill Kimi', 'utf-8');

    const conteudos = await lerConteudoLocal(dir, { scope: 'project', clients: ['codex', 'kimi'] });

    expect(conteudos).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: 'codex', scope: 'project', type: 'instruction', slug: 'agents' }),
      expect.objectContaining({ clientId: 'kimi', scope: 'project', type: 'skill', slug: 'deploy' }),
    ]));
  });
});

async function criarDirTemp(registro: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'myinst-sync-'));
  registro.push(dir);
  return dir;
}

async function criarSkillLocal(dir: string, slug: string, body: string): Promise<void> {
  const pasta = join(dir, '.claude', 'skills');
  await mkdir(pasta, { recursive: true });
  await writeFile(join(pasta, `${slug}.md`), body, 'utf-8');
}

function itemRemoto(type: string, slug: string, body: string, overrides: Record<string, unknown> = {}) {
  return {
    id: slug,
    clientId: 'claude',
    scope: 'project',
    type,
    title: slug,
    slug,
    body,
    metadata: {},
    tags: [],
    version: 1,
    updatedAt: '2026-06-27T00:00:00.000Z',
    ...overrides,
  };
}

function respostaJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
