import type { EscopoSync } from '@myinst/shared/sync-targets';

export interface SyncCliOptions {
  workspace?: string;
  scope?: string;
  client?: string[];
}

export interface SyncOptionsNormalizadas {
  workspace?: string;
  scope?: EscopoSync;
  clients?: string[];
}

const ESCOPOS_VALIDOS = new Set<EscopoSync>(['project', 'global', 'all']);

export function normalizarSyncOptions(options: SyncCliOptions): SyncOptionsNormalizadas {
  const scope = normalizarScope(options.scope);

  return {
    workspace: options.workspace,
    scope,
    clients: options.client?.filter((clientId) => clientId.trim().length > 0),
  };
}

function normalizarScope(scope?: string): EscopoSync | undefined {
  if (!scope) {
    return undefined;
  }

  if (ESCOPOS_VALIDOS.has(scope as EscopoSync)) {
    return scope as EscopoSync;
  }

  throw new Error(`Escopo invalido: ${scope}. Use project, global ou all.`);
}
