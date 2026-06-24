import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('sync targets', () => {
  let tempDir: string;
  let tempHome: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'myinst-sync-project-'));
    tempHome = await mkdtemp(join(tmpdir(), 'myinst-sync-home-'));

    await mkdir(join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(join(tempDir, '.cursor', 'rules'), { recursive: true });
    await mkdir(join(tempDir, '.codex', 'skills', 'infra-local'), { recursive: true });
    await mkdir(join(tempHome, '.codex', 'skills', 'global-skill'), { recursive: true });
    await mkdir(join(tempHome, '.claude', 'agents'), { recursive: true });
    await mkdir(join(tempHome, '.claude', 'commands'), { recursive: true });
    await mkdir(join(tempHome, '.claude', 'output-styles'), { recursive: true });
    await mkdir(join(tempHome, '.cursor', 'skills-cursor', 'cursor-global-skill'), { recursive: true });
    await mkdir(join(tempHome, '.gemini', 'antigravity'), { recursive: true });
    await mkdir(join(tempHome, '.qwen'), { recursive: true });
    await mkdir(join(tempHome, '.antigravity'), { recursive: true });

    await writeFile(join(tempDir, '.claude', 'skills', 'tdd.md'), 'Skill TDD');
    await writeFile(join(tempDir, '.claude', 'CLAUDE.md'), 'Instruções Claude');
    await mkdir(join(tempDir, '.claude', 'skills', 'time-a'), { recursive: true });
    await writeFile(join(tempDir, '.claude', 'skills', 'time-a', 'deploy.md'), 'Deploy time A');
    await writeFile(join(tempDir, '.cursor', 'rules', 'backend.mdc'), 'Regra Cursor');
    await writeFile(join(tempDir, '.cursor', 'mcp.json'), '{"servers":{}}');
    await writeFile(join(tempDir, '.codex', 'skills', 'infra-local', 'SKILL.md'), 'Skill Codex');
    await writeFile(join(tempDir, '.codex', 'AGENTS.md'), 'Agentes Codex');

    await writeFile(join(tempHome, '.codex', 'AGENTS.md'), 'Global Codex');
    await writeFile(join(tempHome, '.codex', 'config.toml'), '[mcp_servers]');
    await writeFile(join(tempHome, '.codex', 'skills', 'global-skill', 'SKILL.md'), 'Skill Global');
    await writeFile(join(tempHome, '.claude', 'CLAUDE.md'), 'Claude Global');
    await writeFile(join(tempHome, '.claude', 'GLOBAL_GUIDELINES.md'), 'Guidelines Globais');
    await writeFile(join(tempHome, '.claude', 'agents', 'reviewer.md'), 'Agente Revisor');
    await writeFile(join(tempHome, '.claude', 'commands', 'commit.md'), 'Comando de commit');
    await writeFile(join(tempHome, '.claude', 'output-styles', 'coding-vibes.md'), 'Estilo casual');
    await writeFile(join(tempHome, '.claude', 'settings.json'), JSON.stringify({
      env: {
        ANTHROPIC_API_KEY: 'sk-test-123',
        ANTHROPIC_BASE_URL: 'https://api.example.com',
      },
      permissions: {
        allow: ['Bash(ls:*)'],
      },
      teammateMode: true,
    }, null, 2));
    await writeFile(join(tempHome, '.cursor', 'skills-cursor', 'cursor-global-skill', 'SKILL.md'), 'Skill Cursor Global');
    await writeFile(join(tempHome, '.cursor', 'argv.json'), '{\n  "enable-crash-reporter": true,\n  "crash-reporter-id": "cursor-id"\n}');
    await writeFile(join(tempHome, '.gemini', 'GEMINI.md'), 'Gemini Global');
    await writeFile(join(tempHome, '.gemini', 'antigravity', 'mcp_config.json'), JSON.stringify({
      mcpServers: {
        github: {
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: 'github_pat_123',
          },
        },
      },
    }, null, 2));
    await writeFile(join(tempHome, '.qwen', 'QWEN.md'), 'Qwen Global');
    await writeFile(join(tempHome, '.qwen', 'output-language.md'), 'Português sempre');
    await writeFile(join(tempHome, '.qwen', 'settings.json'), JSON.stringify({
      security: {
        auth: {
          selectedType: 'qwen-oauth',
        },
      },
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
        },
      },
    }, null, 2));
    await writeFile(join(tempHome, '.antigravity', 'argv.json'), '{"antigravity":true}');
  });

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('node:os', async () => {
      const actual = await vi.importActual<typeof import('node:os')>('node:os');
      return {
        ...actual,
        homedir: () => tempHome,
      };
    });
  });

  afterAll(async () => {
    vi.resetModules();
    vi.doUnmock('node:os');
    await rm(tempDir, { recursive: true, force: true });
    await rm(tempHome, { recursive: true, force: true });
  });

  it('detecta múltiplos clientes no projeto e exige seleção explícita quando necessário', async () => {
    const modulo = await importarModulo();
    const resolucao = await modulo.resolverSelecaoSync(tempDir, 'project');

    expect(resolucao.requiresClientSelection).toBe(true);
    expect(resolucao.availableTargets.map((target) => target.clientId).sort()).toEqual(['claude', 'codex', 'cursor']);
    expect(resolucao.selectedTargets).toHaveLength(0);
  });

  it('lista projeto e global quando o escopo é all', async () => {
    const modulo = await importarModulo();
    const targets = await modulo.listarSyncTargets(tempDir, 'all', ['codex']);

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.scope).sort()).toEqual(['global', 'project']);
  });

  it('detecta clientes globais suportados na home do usuário', async () => {
    const modulo = await importarModulo();
    const targets = await modulo.listarSyncTargets(tempHome, 'global', ['claude', 'cursor', 'gemini', 'qwen', 'antigravity']);

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ clientId: 'claude', scope: 'global' }),
        expect.objectContaining({ clientId: 'cursor', scope: 'global' }),
        expect.objectContaining({ clientId: 'gemini', scope: 'global' }),
        expect.objectContaining({ clientId: 'qwen', scope: 'global' }),
        expect.objectContaining({ clientId: 'antigravity', scope: 'global' }),
      ]),
    );
  });

  it('importa ambos os arquivos globais do Claude e seus agentes', async () => {
    const modulo = await importarModulo();
    const importacao = await modulo.importarTargetsDetectados(tempHome, 'global', ['claude']);

    expect(importacao.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'instruction', slug: 'claude' }),
        expect.objectContaining({ type: 'instruction', slug: 'global-guidelines' }),
        expect.objectContaining({ type: 'agent', slug: 'reviewer' }),
        expect.objectContaining({ type: 'command', slug: 'commit' }),
        expect.objectContaining({ type: 'output_style', slug: 'coding-vibes' }),
        expect.objectContaining({ type: 'setting', slug: 'claude-settings' }),
      ]),
    );
  });

  it('redige segredos em settings e configs globais', async () => {
    const modulo = await importarModulo();
    const claude = await modulo.importarTargetsDetectados(tempHome, 'global', ['claude']);
    const gemini = await modulo.importarTargetsDetectados(tempHome, 'global', ['gemini']);

    const claudeSettings = claude.items.find((item) => item.slug === 'claude-settings');
    const geminiConfig = gemini.items.find((item) => item.slug === 'gemini-antigravity-mcp-config');

    expect(claudeSettings).toBeDefined();
    expect(claudeSettings?.type).toBe('setting');
    expect(claudeSettings?.body).not.toContain('sk-test-123');
    expect(claudeSettings?.body).toContain('[REDACTED]');
    expect(claudeSettings?.metadata).toEqual(
      expect.objectContaining({
        myinstRequiresLocalSecrets: true,
      }),
    );

    expect(geminiConfig).toBeDefined();
    expect(geminiConfig?.type).toBe('mcp_config');
    expect(geminiConfig?.body).not.toContain('github_pat_123');
    expect(geminiConfig?.body).toContain('[REDACTED]');
  });

  it('não trata ~/.codex como projeto quando a origem já é o diretório global do codex', async () => {
    const modulo = await importarModulo();
    const targets = await modulo.listarSyncTargets(join(tempHome, '.codex'), 'all', ['codex']);

    expect(targets).toHaveLength(1);
    expect(targets[0].clientId).toBe('codex');
    expect(targets[0].scope).toBe('global');
  });

  it('não detecta opencode project apenas por AGENTS.md genérico', async () => {
    const modulo = await importarModulo();
    const targets = await modulo.listarSyncTargets(join(tempHome, '.codex'), 'all', ['opencode']);

    expect(targets).toHaveLength(0);
  });

  it('importa apenas o cliente selecionado', async () => {
    const modulo = await importarModulo();
    const importacao = await modulo.importarTargetsDetectados(tempDir, 'project', ['cursor']);

    expect(importacao.targets).toHaveLength(1);
    expect(importacao.targets[0].clientId).toBe('cursor');
    expect(importacao.items.map((item) => item.type).sort()).toEqual(['instruction', 'mcp_config']);
  });

  it('lê skills claude em estrutura aninhada e usa CLAUDE.md da raiz como fallback', async () => {
    const modulo = await importarModulo();
    const importacao = await modulo.importarTargetsDetectados(tempDir, 'project', ['claude']);

    expect(importacao.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'skill',
          slug: 'time-a-deploy',
        }),
        expect.objectContaining({
          type: 'instruction',
          slug: 'claude',
        }),
      ]),
    );
  });

  it('escreve em formato nativo e reporta tipos ignorados sem suporte', async () => {
    const modulo = await importarModulo();
    const destino = await mkdtemp(join(tmpdir(), 'myinst-sync-destino-'));

    try {
      await mkdir(join(destino, '.cursor', 'rules'), { recursive: true });
      await writeFile(join(destino, '.cursor', 'mcp.json'), '{"existente":true}');

      const resultado = await modulo.exportarParaClientesNativos(destino, [
        {
          type: 'instruction',
          slug: 'backend-rule',
          title: 'Backend Rule',
          body: 'Regra nativa',
          metadata: {},
          tags: [],
        },
        {
          type: 'skill',
          slug: 'tdd',
          title: 'TDD',
          body: 'Skill não suportada pelo Cursor',
          metadata: {},
          tags: [],
        },
      ], 'project', ['cursor']);

      expect(resultado.targets).toHaveLength(1);
      expect(resultado.results[0].written).toHaveLength(2);
      expect(resultado.results[0].written.map((item) => item.path)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('.cursor'),
          expect.stringContaining('skills-cursor'),
        ]),
      );
      expect(resultado.results[0].ignored).toHaveLength(0);
    } finally {
      await rm(destino, { recursive: true, force: true });
    }
  });

  it('combina múltiplas instructions ao exportar para OpenCode', async () => {
    const modulo = await importarModulo();
    const destino = await mkdtemp(join(tmpdir(), 'myinst-opencode-destino-'));

    try {
      await writeFile(join(destino, 'opencode.json'), '{\n  "$schema": "https://opencode.ai/config.json"\n}');

      const resultado = await modulo.exportarParaClientesNativos(destino, [
        {
          type: 'instruction',
          slug: 'claude',
          title: 'Claude',
          body: 'Instrucao base',
          metadata: {},
          tags: [],
        },
        {
          type: 'instruction',
          slug: 'global-guidelines',
          title: 'Global Guidelines',
          body: 'Guidelines globais',
          metadata: {},
          tags: [],
        },
      ], 'project', ['opencode']);

      expect(resultado.targets).toHaveLength(1);
      expect(resultado.results[0].written).toHaveLength(2);
      const conteudo = await import('node:fs/promises').then(({ readFile }) => readFile(join(destino, '.opencode', 'AGENTS.md'), 'utf-8'));
      expect(conteudo).toContain('Claude');
      expect(conteudo).toContain('Global Guidelines');
      expect(conteudo).toContain('Instrucao base');
      expect(conteudo).toContain('Guidelines globais');
    } finally {
      await rm(destino, { recursive: true, force: true });
    }
  });
});

async function importarModulo() {
  return await import('../src/sync-targets/index.js');
}
