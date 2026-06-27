import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  carregarDraftProjectState,
  criarDraftProjectState,
  criarSlugState,
  detectarSegredoProvavel,
  materializarProjectState,
} from '../src/commands/state.js';

describe('Project State CLI', () => {
  it('normaliza slug com acentos e pontuacao', () => {
    expect(criarSlugState('Decisão: Cache do Projeto!')).toBe('decisao-cache-do-projeto');
  });

  it('cria draft revisavel em .myinst/state/drafts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-cli-state-draft-'));

    const caminho = await criarDraftProjectState(dir, {
      type: 'memory',
      title: 'Contexto do deploy',
      slug: 'contexto-do-deploy',
      body: 'Deploy ocorre por push e pull na VPS.',
      metadata: { reviewed: false },
      touchedFiles: [],
      toolsUsed: [],
      status: 'draft',
    });

    const draft = await carregarDraftProjectState(dir, caminho);

    expect(caminho.replace(/\\/g, '/')).toContain('.myinst/state/drafts/memory-contexto-do-deploy.json');
    expect(draft.metadata.reviewed).toBe(false);
    expect(draft.body).toContain('push e pull');

    await rm(dir, { recursive: true, force: true });
  });

  it('bloqueia padrao provavel de segredo antes do push', () => {
    const possuiSegredo = detectarSegredoProvavel({
      type: 'decision',
      title: 'Config',
      slug: 'config',
      body: 'DATABASE_URL=postgres://usuario:senha@localhost/db',
      metadata: { reviewed: true },
      touchedFiles: [],
      toolsUsed: [],
      status: 'reviewed',
    });

    expect(possuiSegredo).toBe(true);
  });

  it('materializa memorias, decisoes e sessoes em markdown', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-cli-state-pull-'));

    const escritos = await materializarProjectState(dir, {
      memories: [{
        title: 'Stack',
        slug: 'stack',
        body: 'Projeto usa Fastify.',
        metadata: { reviewed: true },
      }],
      decisions: [{
        title: 'Sem transcript bruto',
        slug: 'sem-transcript-bruto',
        body: 'Chats entram apenas como resumo revisado.',
        metadata: { reviewed: true },
      }],
      sessions: [{
        title: 'Sessao inicial',
        slug: 'sessao-inicial',
        summary: 'Resumo seguro da sessao.',
        body: 'Sem cache bruto.',
        metadata: { reviewed: true },
      }],
    });

    expect(escritos).toHaveLength(3);

    const memoria = await readFile(join(dir, '.myinst', 'state', 'memories', 'stack.md'), 'utf-8');
    const sessao = await readFile(join(dir, '.myinst', 'state', 'sessions', 'sessao-inicial.md'), 'utf-8');

    expect(memoria).toContain('reviewed: true');
    expect(sessao).toContain('Resumo seguro da sessao.');

    await rm(dir, { recursive: true, force: true });
  });
});
