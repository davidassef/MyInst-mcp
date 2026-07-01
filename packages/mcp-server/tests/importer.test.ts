import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importarDiretorio } from '../src/importer/index.js';

describe('Importer', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'myinst-importer-'));

    await mkdir(join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
    await mkdir(join(tempDir, '.claude', 'memory'), { recursive: true });
    await mkdir(join(tempDir, '.claude', 'snippets'), { recursive: true });
    await mkdir(join(tempDir, '.claude', 'hooks'), { recursive: true });
    await mkdir(join(tempDir, 'subprojeto', '.claude', 'skills'), { recursive: true });
    await mkdir(join(tempDir, '.codex', 'skills', 'myinst', 'infra-local'), { recursive: true });

    await writeFile(
      join(tempDir, '.claude', 'skills', 'tdd.md'),
      '---\nname: Test Driven Development\ndescription: Escreva testes primeiro\ntype: skill\n---\nConteúdo da skill TDD.',
    );

    await writeFile(
      join(tempDir, '.claude', 'skills', 'clean-code.md'),
      'Skill sem frontmatter.',
    );

    await writeFile(
      join(tempDir, '.claude', 'agents', 'reviewer.md'),
      '---\nname: Agente Revisor\n---\nRevise com foco em segurança.',
    );

    await writeFile(
      join(tempDir, '.claude', 'memory', 'contexto.md'),
      'Projeto usa Fastify e Prisma.',
    );

    await writeFile(
      join(tempDir, '.claude', 'snippets', 'error-handler.md'),
      '---\nname: Error Handler\n---\ntry/catch padrão.',
    );

    await writeFile(
      join(tempDir, '.claude', 'hooks', 'pre-commit.md'),
      '---\nname: Pre Commit Hook\n---\nValida lint antes do commit.',
    );

    await writeFile(join(tempDir, '.claude', 'CLAUDE.md'), 'Instruções gerais.');

    await writeFile(
      join(tempDir, '.claude', 'custom.rules.md'),
      'Regras customizadas do projeto.',
    );

    await writeFile(join(tempDir, '.claude', '.mcp.json'), '{"mcpServers":{}}');
    await writeFile(join(tempDir, '.mcp.json'), '{"mcpServers":{"root":{}}}');
    await writeFile(join(tempDir, 'AGENTS.md'), 'Instruções globais do projeto.');

    await writeFile(join(tempDir, '.claude', 'skills', 'config.json'), '{}');
    await writeFile(join(tempDir, '.claude', 'skills', 'notas.txt'), 'ignorar');

    await writeFile(
      join(tempDir, 'subprojeto', '.claude', 'skills', 'nested-skill.md'),
      '---\nname: Skill Aninhada\n---\nConteúdo aninhado.',
    );

    await writeFile(
      join(tempDir, '.codex', 'skills', 'myinst', 'infra-local', 'SKILL.md'),
      '---\nname: Infra Local\n---\nConteúdo da skill global.',
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('parseia YAML frontmatter corretamente', async () => {
    const itens = await importarDiretorio(tempDir);
    const tdd = itens.find((i) => i.slug === 'tdd');

    expect(tdd).toBeDefined();
    expect(tdd!.title).toBe('Test Driven Development');
    expect(tdd!.body).toBe('Conteúdo da skill TDD.');
    expect(tdd!.metadata.description).toBe('Escreva testes primeiro');
  });

  it('detecta tipo a partir da estrutura de diretórios', async () => {
    const itens = await importarDiretorio(tempDir);

    const skill = itens.find((i) => i.slug === 'clean-code');
    const agent = itens.find((i) => i.slug === 'reviewer');
    const memory = itens.find((i) => i.slug === 'contexto');
    const snippet = itens.find((i) => i.slug === 'error-handler');
    const hook = itens.find((i) => i.slug === 'pre-commit');

    expect(skill?.type).toBe('skill');
    expect(agent?.type).toBe('agent');
    expect(memory?.type).toBe('memory');
    expect(snippet?.type).toBe('snippet');
    expect(hook?.type).toBe('hook');
  });

  it('gera slug a partir do nome do arquivo', async () => {
    const itens = await importarDiretorio(tempDir);
    const slugs = itens.map((i) => i.slug);

    expect(slugs).toContain('tdd');
    expect(slugs).toContain('clean-code');
    expect(slugs).toContain('reviewer');
    expect(slugs).toContain('pre-commit');
  });

  it('gera título a partir do frontmatter name', async () => {
    const itens = await importarDiretorio(tempDir);
    const reviewer = itens.find((i) => i.slug === 'reviewer');

    expect(reviewer?.title).toBe('Agente Revisor');
  });

  it('gera título a partir do slug quando não há frontmatter', async () => {
    const itens = await importarDiretorio(tempDir);
    const cleanCode = itens.find((i) => i.slug === 'clean-code');

    expect(cleanCode?.title).toBe('Clean Code');
  });

  it('lida com arquivos sem frontmatter', async () => {
    const itens = await importarDiretorio(tempDir);
    const cleanCode = itens.find((i) => i.slug === 'clean-code');

    expect(cleanCode).toBeDefined();
    expect(cleanCode!.body).toBe('Skill sem frontmatter.');
    expect(cleanCode!.metadata).toEqual({});
  });

  it('ignora arquivos não-.md (exceto .mcp.json)', async () => {
    const itens = await importarDiretorio(tempDir);
    const slugs = itens.map((i) => i.slug);

    expect(slugs).not.toContain('config');
    expect(slugs).not.toContain('notas');
  });

  it('lê .mcp.json como tipo mcp_config', async () => {
    const itens = await importarDiretorio(tempDir);
    const mcpConfig = itens.find((i) => i.type === 'mcp_config');

    expect(mcpConfig).toBeDefined();
    expect(mcpConfig!.slug).toBe('mcp-config');
    expect(mcpConfig!.body).toBe('{"mcpServers":{}}');
  });

  it('lida com diretórios vazios', async () => {
    const dirVazio = await mkdtemp(join(tmpdir(), 'myinst-vazio-'));
    const itens = await importarDiretorio(dirVazio);

    expect(itens).toHaveLength(0);
    await rm(dirVazio, { recursive: true, force: true });
  });

  it('lida com estruturas de diretórios aninhadas', async () => {
    const itens = await importarDiretorio(tempDir);
    const nested = itens.find((i) => i.slug === 'nested-skill');

    expect(nested).toBeDefined();
    expect(nested!.type).toBe('skill');
    expect(nested!.title).toBe('Skill Aninhada');
  });

  it('detecta CLAUDE.md como instruction', async () => {
    const itens = await importarDiretorio(tempDir);
    const claude = itens.find((i) => i.slug === 'claude');

    expect(claude).toBeDefined();
    expect(claude!.type).toBe('instruction');
  });

  it('detecta .rules.md como instruction', async () => {
    const itens = await importarDiretorio(tempDir);
    const rules = itens.find((i) => i.slug === 'custom-rules');

    expect(rules).toBeDefined();
    expect(rules!.type).toBe('instruction');
  });

  it('detecta AGENTS.md na raiz como instruction', async () => {
    const itens = await importarDiretorio(tempDir);
    const agents = itens.find((i) => i.slug === 'agents');

    expect(agents).toBeDefined();
    expect(agents!.type).toBe('instruction');
  });

  it('detecta skills no formato .codex/skills/<namespace>/<slug>/SKILL.md', async () => {
    const itens = await importarDiretorio(tempDir);
    const skillCodex = itens.find((i) => i.slug === 'infra-local');

    expect(skillCodex).toBeDefined();
    expect(skillCodex!.type).toBe('skill');
    expect(skillCodex!.title).toBe('Infra Local');
    expect(skillCodex!.body).toBe('Conteúdo da skill global.');
  });
});
