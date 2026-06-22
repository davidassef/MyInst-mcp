import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  carregarDraftProjectState,
  criarDraftProjectState,
  detectarSegredoProvavel,
  materializarProjectState,
} from '../src/project-state.js';

describe('Project State MCP', () => {
  it('cria draft revisável sem enviar ao servidor', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-state-draft-'));
    const caminho = await criarDraftProjectState(dir, {
      type: 'memory',
      title: 'Decisão de cache',
      slug: 'decisao-cache',
      body: 'Cache bruto não deve ser sincronizado.',
      metadata: { reviewed: false },
      touchedFiles: [],
      toolsUsed: [],
      status: 'draft',
    });

    const draft = await carregarDraftProjectState(dir, caminho);

    expect(caminho.replace(/\\/g, '/')).toContain('.myinst/state/drafts/memory-decisao-cache.json');
    expect(draft.metadata.reviewed).toBe(false);
    expect(draft.body).toContain('Cache bruto');

    await rm(dir, { recursive: true, force: true });
  });

  it('detecta padrão provável de segredo', () => {
    const possuiSegredo = detectarSegredoProvavel({
      type: 'decision',
      title: 'Configuração',
      slug: 'configuracao',
      body: 'DATABASE_URL=postgres://usuario:senha@host/db',
      metadata: { reviewed: true },
      touchedFiles: [],
      toolsUsed: [],
      status: 'reviewed',
    });

    expect(possuiSegredo).toBe(true);
  });

  it('materializa Project State em .myinst/state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-state-pull-'));
    const escritos = await materializarProjectState(dir, {
      memories: [{
        title: 'Stack',
        slug: 'stack',
        body: 'Projeto usa Fastify.',
        metadata: { reviewed: true },
      }],
      decisions: [{
        title: 'Sem cache bruto',
        slug: 'sem-cache-bruto',
        body: 'Cache bruto fica fora do v1.',
        metadata: { reviewed: true },
      }],
      sessions: [{
        title: 'Sessão inicial',
        slug: 'sessao-inicial',
        summary: 'Resumo seguro da sessão.',
        body: 'Sem transcript bruto.',
        metadata: { reviewed: true },
      }],
    });

    expect(escritos).toHaveLength(3);

    const memoria = await readFile(join(dir, '.myinst', 'state', 'memories', 'stack.md'), 'utf-8');
    const sessao = await readFile(join(dir, '.myinst', 'state', 'sessions', 'sessao-inicial.md'), 'utf-8');

    expect(memoria).toContain('reviewed: true');
    expect(sessao).toContain('Resumo seguro da sessão.');

    await rm(dir, { recursive: true, force: true });
  });
});
