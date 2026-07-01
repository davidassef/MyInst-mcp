import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { aplicarConteudo } from '../src/applier/index.js';

function normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

describe('Applier', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'myinst-test-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('aplica skill como conteúdo canônico em .myinst/content/', async () => {
    const items = [{
      id: '1',
      type: 'skill',
      title: 'TDD',
      slug: 'tdd',
      description: null,
      body: 'Escreva testes primeiro.',
      metadata: {},
      tags: ['claude-opus'],
    }];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(3);
    expect(normalizePath(resultado[0].path)).toContain('.myinst/MYINST.md');
    expect(normalizePath(resultado[1].path)).toContain('.claude/MYINST.md');
    expect(normalizePath(resultado[2].path)).toContain('.myinst/content/skills/tdd.md');

    const conteudo = await readFile(resultado[2].path, 'utf-8');
    expect(conteudo).toBe('Escreva testes primeiro.');
  });

  it('aplica instruction como conteúdo canônico em .myinst/content/', async () => {
    const items = [{
      id: '2',
      type: 'instruction',
      title: 'Regras Base',
      slug: 'regras-base',
      description: null,
      body: 'Use early return sempre.',
      metadata: {},
      tags: [],
    }];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(3);
    expect(normalizePath(resultado[2].path)).toContain('.myinst/content/instructions/regras-base.md');

    const conteudo = await readFile(resultado[2].path, 'utf-8');
    expect(conteudo).toContain('# Regras Base');
    expect(conteudo).toContain('Use early return sempre.');
  });

  it('aplica agent como .md em .claude/agents/', async () => {
    const items = [{
      id: '3',
      type: 'agent',
      title: 'Code Reviewer',
      slug: 'code-reviewer',
      description: null,
      body: 'Revise código com foco em segurança.',
      metadata: {},
      tags: [],
    }];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(3);
    expect(normalizePath(resultado[2].path)).toContain('.myinst/content/agents/code-reviewer.md');
  });

  it('materializa tipos globais em arvore previsivel por client', async () => {
    const items = [
      {
        id: '10',
        type: 'command',
        title: 'Commit',
        slug: 'commit',
        description: null,
        body: 'Comando global.',
        metadata: {
          myinstSourceScope: 'global',
          myinstClientId: 'claude',
          myinstSourcePath: '.claude/commands/commit.md',
        },
        tags: [],
      },
      {
        id: '11',
        type: 'output_style',
        title: 'Coding Vibes',
        slug: 'coding-vibes',
        description: null,
        body: 'Estilo global.',
        metadata: {
          myinstSourceScope: 'global',
          myinstClientId: 'claude',
          myinstSourcePath: '.claude/output-styles/coding-vibes.md',
        },
        tags: [],
      },
      {
        id: '12',
        type: 'setting',
        title: 'Claude Settings',
        slug: 'claude-settings',
        description: null,
        body: '{\n  "env": {\n    "ANTHROPIC_API_KEY": "{{ANTHROPIC_API_KEY}}"\n  }\n}',
        metadata: {
          myinstSourceScope: 'global',
          myinstClientId: 'claude',
          myinstSourcePath: '.claude/settings.json',
          myinstFileExtension: '.json',
          myinstRequiresLocalSecrets: true,
        },
        tags: [],
      },
    ];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(5);
    expect(normalizePath(resultado[2].path)).toContain('.myinst/client-profiles/claude/commands/commit.md');
    expect(normalizePath(resultado[3].path)).toContain('.myinst/client-profiles/claude/output-styles/coding-vibes.md');
    expect(normalizePath(resultado[4].path)).toContain('.myinst/client-profiles/claude/settings/claude-settings.json');

    const conteudoSetting = await readFile(resultado[4].path, 'utf-8');
    expect(conteudoSetting).toContain('{{ANTHROPIC_API_KEY}}');
  });

  it('aplica múltiplos itens de uma vez', async () => {
    const items = [
      { id: '4', type: 'skill', title: 'Debug', slug: 'debug', description: null, body: 'Debug skill', metadata: {}, tags: [] },
      { id: '5', type: 'memory', title: 'Contexto', slug: 'contexto', description: null, body: 'Memoria', metadata: {}, tags: [] },
    ];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(4);
    expect(resultado[2].path).toContain('debug.md');
    expect(resultado[3].path).toContain('contexto.md');
    expect(normalizePath(resultado[2].path)).toContain('.myinst/content/skills');
    expect(normalizePath(resultado[3].path)).toContain('.myinst/content/memory');
  });

  it('materializa guia operacional do MyInst sem sobrescrever CLAUDE.md', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-guia-'));
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude', 'CLAUDE.md'), 'Instrucoes do projeto.', 'utf-8');

    const resultado = await aplicarConteudo([], dir);

    expect(resultado).toHaveLength(2);
    expect(normalizePath(resultado[0].path)).toContain('.myinst/MYINST.md');
    expect(normalizePath(resultado[1].path)).toContain('.claude/MYINST.md');

    const guia = await readFile(join(dir, '.myinst', 'MYINST.md'), 'utf-8');
    const claude = await readFile(join(dir, '.claude', 'CLAUDE.md'), 'utf-8');
    expect(guia).toContain('myinst-managed: true');
    expect(guia).toContain('myinst_pull -> trabalho local -> myinst_push');
    expect(guia).toContain('## Regras de segurança (obrigatórias)');
    expect(guia).toContain('Checklist obrigatório');
    expect(claude).toBe('Instrucoes do projeto.');

    await rm(dir, { recursive: true, force: true });
  });

  it('atualiza MYINST.md quando o arquivo já é gerenciado pelo MyInst', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-gerenciado-'));
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude', 'MYINST.md'), '<!-- myinst-managed: true -->\nconteudo antigo', 'utf-8');

    const resultado = await aplicarConteudo([], dir);

    expect(resultado[0].status).toBe('created');
    expect(resultado[1].status).toBe('overwritten');
    const guia = await readFile(join(dir, '.myinst', 'MYINST.md'), 'utf-8');
    expect(guia).toContain('## Modelo de escopo');
    expect(guia).toContain('## Fluxo oficial');
    expect(guia).toContain('## Regras de segurança (obrigatórias)');
    expect(guia).toContain('Checklist obrigatório');
    expect(guia).toContain('Client Profiles');
    expect(guia).not.toContain('conteudo antigo');

    await rm(dir, { recursive: true, force: true });
  });

  it('preserva MYINST.md manual e cria vault-MYINST.md em conflito', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-conflito-'));
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude', 'MYINST.md'), 'arquivo manual', 'utf-8');

    const resultado = await aplicarConteudo([], dir);

    expect(resultado[0].status).toBe('created');
    expect(resultado[1].status).toBe('prefixed');
    expect(normalizePath(resultado[1].path)).toContain('.claude/vault-MYINST.md');

    const manual = await readFile(join(dir, '.claude', 'MYINST.md'), 'utf-8');
    const guia = await readFile(join(dir, '.claude', 'vault-MYINST.md'), 'utf-8');
    const guiaRaiz = await readFile(join(dir, '.myinst', 'MYINST.md'), 'utf-8');
    expect(manual).toBe('arquivo manual');
    expect(guia).toContain('myinst-managed: true');
    expect(guiaRaiz).toContain('myinst-managed: true');

    await rm(dir, { recursive: true, force: true });
  });

  it('preserva MYINST.md manual com strategy skip', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-skip-'));
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude', 'MYINST.md'), 'arquivo manual', 'utf-8');

    const resultado = await aplicarConteudo([], dir, 'skip');

    expect(resultado[0].status).toBe('created');
    expect(resultado[1].status).toBe('skipped');
    const manual = await readFile(join(dir, '.claude', 'MYINST.md'), 'utf-8');
    expect(manual).toBe('arquivo manual');
    const guiaRaiz = await readFile(join(dir, '.myinst', 'MYINST.md'), 'utf-8');
    expect(guiaRaiz).toContain('myinst-managed: true');

    await rm(dir, { recursive: true, force: true });
  });
});
