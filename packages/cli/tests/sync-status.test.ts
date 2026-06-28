import { describe, expect, it } from 'vitest';
import {
  calcularSyncStatus,
  criarSnapshotManifesto,
  renderizarSyncStatus,
  type ConteudoSyncLocal,
  type ConteudoSyncRemoto,
  type ManifestoSync,
} from '../src/sync/status.js';

const workspace = 'default';
const project = 'default';

describe('sync status', () => {
  it('classifica item igual no local, remoto e manifesto como sincronizado', () => {
    const remoto = conteudoRemoto('skill', 'deploy', 'conteudo');
    const manifesto = manifestoCom(remoto);
    const local = conteudoLocal('skill', 'deploy', 'conteudo');

    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [local],
      remotos: [remoto],
      manifesto,
    });

    expect(status.synced).toHaveLength(1);
    expect(status.push).toHaveLength(0);
    expect(status.pull).toHaveLength(0);
    expect(status.conflicts).toHaveLength(0);
  });

  it('classifica item que existe apenas no local como pendente de push', () => {
    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [conteudoLocal('memory', 'decisao-sync', 'conteudo local')],
      remotos: [],
      manifesto: null,
    });

    expect(status.push).toMatchObject([{ type: 'memory', slug: 'decisao-sync', reason: 'existe só local' }]);
  });

  it('classifica item que existe apenas no remoto como pendente de pull', () => {
    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [],
      remotos: [conteudoRemoto('instruction', 'agents-md', 'conteudo remoto')],
      manifesto: null,
    });

    expect(status.pull).toMatchObject([{ type: 'instruction', slug: 'agents-md', reason: 'existe só no remoto' }]);
  });

  it('classifica local alterado desde ultimo sync como pendente de push', () => {
    const remoto = conteudoRemoto('skill', 'deploy', 'conteudo base');
    const manifesto = manifestoCom(remoto);
    const local = conteudoLocal('skill', 'deploy', 'conteudo alterado');

    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [local],
      remotos: [remoto],
      manifesto,
    });

    expect(status.push).toMatchObject([{ type: 'skill', slug: 'deploy', reason: 'local alterado' }]);
  });

  it('classifica remoto alterado desde ultimo sync como pendente de pull', () => {
    const base = conteudoRemoto('skill', 'deploy', 'conteudo base');
    const manifesto = manifestoCom(base);
    const remoto = conteudoRemoto('skill', 'deploy', 'conteudo remoto novo');
    const local = conteudoLocal('skill', 'deploy', 'conteudo base');

    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [local],
      remotos: [remoto],
      manifesto,
    });

    expect(status.pull).toMatchObject([{ type: 'skill', slug: 'deploy', reason: 'remoto mais novo' }]);
  });

  it('classifica alteracao local e remota como conflito', () => {
    const base = conteudoRemoto('instruction', 'agents-md', 'conteudo base');
    const manifesto = manifestoCom(base);
    const remoto = conteudoRemoto('instruction', 'agents-md', 'conteudo remoto');
    const local = conteudoLocal('instruction', 'agents-md', 'conteudo local');

    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [local],
      remotos: [remoto],
      manifesto,
    });

    expect(status.conflicts).toMatchObject([
      { type: 'instruction', slug: 'agents-md', reason: 'local e remoto mudaram' },
    ]);
  });

  it('classifica primeiro uso com local e remoto diferentes como conflito', () => {
    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [conteudoLocal('instruction', 'agents-md', 'conteudo local')],
      remotos: [conteudoRemoto('instruction', 'agents-md', 'conteudo remoto')],
      manifesto: null,
    });

    expect(status.conflicts).toMatchObject([
      { type: 'instruction', slug: 'agents-md', reason: 'local e remoto divergem sem manifesto' },
    ]);
  });

  it('renderiza grupos e resumo no formato da CLI', () => {
    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [conteudoLocal('skill', 'project-state', 'local')],
      remotos: [conteudoRemoto('skill', 'deploy-local', 'remoto')],
      manifesto: null,
    });

    const saida = renderizarSyncStatus(status);

    expect(saida).toContain('Pendente de pull:');
    expect(saida).toContain('claude     skill        deploy-local      existe só no remoto');
    expect(saida).toContain('Pendente de push:');
    expect(saida).toContain('claude     skill        project-state     existe só local');
    expect(saida).toContain('Resumo: 1 pull, 1 push, 0 conflitos');
  });

  it('nao trata clients diferentes com mesmo tipo e slug como o mesmo conteudo', () => {
    const status = calcularSyncStatus({
      workspace,
      project,
      locais: [
        conteudoLocal('instruction', 'agents', 'instrucao codex', 'codex'),
        conteudoLocal('instruction', 'agents', 'instrucao claude', 'claude'),
      ],
      remotos: [
        conteudoRemoto('instruction', 'agents', 'instrucao codex', 'codex'),
        conteudoRemoto('instruction', 'agents', 'instrucao claude', 'claude'),
      ],
      manifesto: null,
    });

    expect(status.synced).toHaveLength(2);
    expect(status.conflicts).toHaveLength(0);
    expect(status.synced).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: 'codex', slug: 'agents' }),
      expect.objectContaining({ clientId: 'claude', slug: 'agents' }),
    ]));
  });
});

function conteudoLocal(type: string, slug: string, body: string, clientId = 'claude'): ConteudoSyncLocal {
  return {
    clientId,
    scope: 'project',
    type,
    title: slug,
    slug,
    body,
    metadata: {},
    tags: [],
    sourcePath: `.claude/${slug}.md`,
  };
}

function conteudoRemoto(type: string, slug: string, body: string, clientId = 'claude'): ConteudoSyncRemoto {
  return {
    id: slug,
    clientId,
    scope: 'project',
    type,
    title: slug,
    slug,
    body,
    metadata: {},
    tags: [],
    version: 1,
    updatedAt: '2026-06-27T00:00:00.000Z',
  };
}

function manifestoCom(...items: ConteudoSyncRemoto[]): ManifestoSync {
  return criarSnapshotManifesto({
    workspace,
    project,
    serverTime: '2026-06-27T00:00:00.000Z',
    remotos: items,
    locais: items.map((item) => conteudoLocal(item.type, item.slug, item.body)),
  });
}
