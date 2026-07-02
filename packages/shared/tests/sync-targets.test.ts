import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportarParaClientesNativos } from '../src/sync-targets/index.js';

describe('sync targets compartilhados', () => {
  const temporarios: string[] = [];

  afterEach(async () => {
    for (const dir of temporarios.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exporta Codex project em layout nativo mesmo sem estrutura previa', async () => {
    const dir = await criarDirTemp(temporarios);

    const exportacao = await exportarParaClientesNativos(
      dir,
      [{
        type: 'skill',
        slug: 'smoke-skill',
        title: 'Smoke Skill',
        body: 'Use somente para validar sync Codex.',
        metadata: { description: 'Skill de smoke', myinstSourceNamespace: 'smoke' },
        tags: [],
      }],
      'project',
      ['codex'],
    );

    const skill = await readFile(join(dir, '.codex', 'skills', 'smoke', 'smoke-skill', 'SKILL.md'), 'utf-8');

    expect(exportacao.targets).toHaveLength(1);
    expect(exportacao.targets[0]).toMatchObject({ clientId: 'codex', scope: 'project' });
    expect(skill).toContain('name: "Smoke Skill"');
    expect(skill).toContain('description: "Skill de smoke"');
    expect(skill.startsWith('---\n')).toBe(true);
  });

  it('preserva sourcePath Claude dentro do projeto ao exportar', async () => {
    const dir = await criarDirTemp(temporarios);
    const caminhoOriginal = join(dir, '.claude', 'skills', 'deploy', 'deploy.md');
    await mkdir(join(dir, '.claude', 'skills', 'deploy'), { recursive: true });
    await writeFile(caminhoOriginal, 'conteudo antigo', 'utf-8');

    const exportacao = await exportarParaClientesNativos(
      dir,
      [{
        type: 'skill',
        slug: 'deploy-deploy',
        title: 'Deploy Deploy',
        body: 'conteudo remoto',
        metadata: { myinstSourcePath: caminhoOriginal },
        tags: [],
      }],
      'project',
      ['claude'],
    );

    const skill = await readFile(caminhoOriginal, 'utf-8');

    expect(skill).toBe('conteudo remoto');
    expect(exportacao.results[0].written).toEqual([
      expect.objectContaining({ path: caminhoOriginal, slug: 'deploy-deploy' }),
    ]);
    await expect(access(join(dir, '.claude', 'skills', 'deploy-deploy.md'))).rejects.toThrow();
  });
});

async function criarDirTemp(registro: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'myinst-shared-sync-'));
  registro.push(dir);
  return dir;
}
