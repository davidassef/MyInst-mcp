import { describe, expect, it } from 'vitest';
import { listarMatrizCompatibilidadeReplicacao, planejarReplicacaoClientProfile } from '../src/client-profile-replication.js';
import type { ItemSincronizavel } from '../src/sync-targets/index.js';

describe('client profile replication', () => {
  it('lista pares suportados e futuros da matriz oficial', () => {
    const matriz = listarMatrizCompatibilidadeReplicacao();

    expect(matriz).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceClient: 'claude', targetClient: 'opencode', status: 'supported' }),
        expect.objectContaining({ sourceClient: 'codex', targetClient: 'opencode', status: 'supported' }),
        expect.objectContaining({ sourceClient: 'claude', targetClient: 'codex', status: 'planned' }),
      ]),
    );
  });

  it('planeja Claude -> OpenCode replicando apenas instructions', () => {
    const plano = planejarReplicacaoClientProfile({
      sourceClient: 'claude',
      targetClient: 'opencode',
      sourceItems: [
        criarItem('instruction', 'claude', 'Claude'),
        criarItem('instruction', 'global-guidelines', 'Global Guidelines'),
        criarItem('command', 'commit', 'Commit'),
        criarItem('setting', 'claude-settings', 'Claude Settings'),
      ],
      targetItems: [],
    });

    expect(plano.compatible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'instruction', slug: 'claude' }),
        expect.objectContaining({ type: 'instruction', slug: 'global-guidelines' }),
      ]),
    );
    expect(plano.toCreate).toHaveLength(2);
    expect(plano.ignoredIncompatible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'command', slug: 'commit' }),
        expect.objectContaining({ type: 'setting', slug: 'claude-settings' }),
      ]),
    );
  });

  it('planeja Codex -> OpenCode ignorando skill sem suporte nativo explícito', () => {
    const plano = planejarReplicacaoClientProfile({
      sourceClient: 'codex',
      targetClient: 'opencode',
      sourceItems: [
        criarItem('instruction', 'agents', 'Agents'),
        criarItem('skill', 'infra-local', 'Infra Local'),
        criarItem('setting', 'codex-config', 'Codex Config'),
      ],
      targetItems: [],
    });

    expect(plano.toCreate).toEqual([
      expect.objectContaining({
        type: 'instruction',
        slug: 'agents',
      }),
      expect.objectContaining({
        type: 'skill',
        slug: 'infra-local',
      }),
    ]);
    expect(plano.ignoredNoRule).toHaveLength(0);
    expect(plano.ignoredIncompatible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'setting', slug: 'codex-config' }),
      ]),
    );
  });

  it('não sobrescreve itens existentes por padrão', () => {
    const plano = planejarReplicacaoClientProfile({
      sourceClient: 'claude',
      targetClient: 'opencode',
      sourceItems: [criarItem('instruction', 'claude', 'Claude')],
      targetItems: [criarItem('instruction', 'claude', 'Claude')],
      overwrite: false,
    });

    expect(plano.toCreate).toHaveLength(0);
    expect(plano.toUpdate).toHaveLength(0);
    expect(plano.skippedExisting).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'instruction', slug: 'claude' }),
      ]),
    );
  });

  it('permite overwrite explícito para tipos suportados', () => {
    const plano = planejarReplicacaoClientProfile({
      sourceClient: 'claude',
      targetClient: 'opencode',
      sourceItems: [criarItem('instruction', 'claude', 'Claude')],
      targetItems: [criarItem('instruction', 'claude', 'Claude')],
      overwrite: true,
    });

    expect(plano.toCreate).toHaveLength(0);
    expect(plano.toUpdate).toHaveLength(1);
    expect(plano.skippedExisting).toHaveLength(0);
  });

  it('falha quando o par não é suportado no v1', () => {
    expect(() => planejarReplicacaoClientProfile({
      sourceClient: 'cursor',
      targetClient: 'opencode',
      sourceItems: [criarItem('instruction', 'backend', 'Backend')],
      targetItems: [],
    })).toThrow('Replicação não suportada no v1 para cursor -> opencode');
  });
});

function criarItem(type: ItemSincronizavel['type'], slug: string, title: string): ItemSincronizavel {
  return {
    type,
    slug,
    title,
    body: `${title} body`,
    metadata: {},
    tags: [],
  };
}
