import { createHash } from 'node:crypto';

export interface ConteudoSyncLocal {
  clientId: string;
  scope: 'project' | 'global';
  type: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
  sourcePath: string;
}

export interface ConteudoSyncRemoto {
  id?: string;
  clientId?: string;
  scope?: 'project' | 'global';
  type: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags?: string[];
  version?: number;
  updatedAt?: string;
}

export interface ManifestoSync {
  workspace: string;
  project: string;
  serverTime: string;
  items: EntradaManifestoSync[];
}

export interface EntradaManifestoSync {
  scope: 'project' | 'global';
  clientId: string;
  workspace: string;
  project: string;
  type: string;
  slug: string;
  bodyHash: string;
  metadataHash: string;
  tagsHash: string;
  remoteVersion: number | null;
  remoteUpdatedAt: string | null;
  sourcePath: string | null;
}

export interface ResultadoSyncStatus {
  workspace: string;
  project: string;
  pull: EntradaStatusSync[];
  push: EntradaStatusSync[];
  conflicts: EntradaStatusSync[];
  synced: EntradaStatusSync[];
}

export interface EntradaStatusSync {
  clientId: string;
  scope: 'project' | 'global';
  type: string;
  slug: string;
  title: string;
  reason: string;
}

interface CalcularSyncStatusParams {
  workspace: string;
  project: string;
  locais: ConteudoSyncLocal[];
  remotos: ConteudoSyncRemoto[];
  manifesto: ManifestoSync | null;
}

interface CriarSnapshotManifestoParams {
  workspace: string;
  project: string;
  serverTime: string;
  remotos: ConteudoSyncRemoto[];
  locais?: ConteudoSyncLocal[];
}

interface AssinaturaSync {
  bodyHash: string;
  metadataHash: string;
  tagsHash: string;
}

export function calcularSyncStatus(params: CalcularSyncStatusParams): ResultadoSyncStatus {
  const locaisPorChave = new Map(params.locais.map((conteudo) => [chaveConteudo(conteudo), conteudo]));
  const remotosPorChave = new Map(params.remotos.map((conteudo) => [chaveConteudo(conteudo), conteudo]));
  const manifestoPorChave = new Map((params.manifesto?.items ?? []).map((entrada) => [chaveConteudo(entrada), entrada]));
  const chaves = new Set([...locaisPorChave.keys(), ...remotosPorChave.keys(), ...manifestoPorChave.keys()]);

  const resultado: ResultadoSyncStatus = {
    workspace: params.workspace,
    project: params.project,
    pull: [],
    push: [],
    conflicts: [],
    synced: [],
  };

  for (const chave of Array.from(chaves).sort()) {
    const local = locaisPorChave.get(chave);
    const remoto = remotosPorChave.get(chave);
    const base = manifestoPorChave.get(chave);

    classificarItem(resultado, local, remoto, base);
  }

  return resultado;
}

export function criarSnapshotManifesto(params: CriarSnapshotManifestoParams): ManifestoSync {
  const locaisPorChave = new Map((params.locais ?? []).map((conteudo) => [chaveConteudo(conteudo), conteudo]));

  return {
    workspace: params.workspace,
    project: params.project,
    serverTime: params.serverTime,
    items: params.remotos.map((conteudo) => {
      const assinatura = assinaturaConteudo(conteudo);
      const local = locaisPorChave.get(chaveConteudo(conteudo));

      return {
        scope: normalizarScope(conteudo),
        clientId: normalizarClientId(conteudo),
        workspace: params.workspace,
        project: params.project,
        type: conteudo.type,
        slug: conteudo.slug,
        bodyHash: assinatura.bodyHash,
        metadataHash: assinatura.metadataHash,
        tagsHash: assinatura.tagsHash,
        remoteVersion: conteudo.version ?? null,
        remoteUpdatedAt: conteudo.updatedAt ?? null,
        sourcePath: local?.sourcePath ?? null,
      };
    }),
  };
}

export function renderizarSyncStatus(status: ResultadoSyncStatus): string {
  const linhas = [
    `Workspace: ${status.workspace}`,
    `Projeto: ${status.project}`,
    '',
    ...renderizarGrupo('Pendente de pull', status.pull),
    '',
    ...renderizarGrupo('Pendente de push', status.push),
    '',
    ...renderizarGrupo('Conflitos', status.conflicts),
    '',
    ...renderizarGrupo('Sincronizado', status.synced),
    '',
    `Resumo: ${status.pull.length} pull, ${status.push.length} push, ${status.conflicts.length} conflito${status.conflicts.length === 1 ? '' : 's'}`,
  ];

  return linhas.join('\n');
}

function classificarItem(
  resultado: ResultadoSyncStatus,
  local: ConteudoSyncLocal | undefined,
  remoto: ConteudoSyncRemoto | undefined,
  base: EntradaManifestoSync | undefined,
): void {
  if (!base) {
    classificarSemManifesto(resultado, local, remoto);
    return;
  }

  if (local && remoto) {
    classificarComTresVersoes(resultado, local, remoto, base);
    return;
  }

  if (local && !remoto) {
    const localIgualBase = assinaturasIguais(assinaturaConteudo(local), base);
    adicionar(resultado, localIgualBase ? 'conflicts' : 'push', local, localIgualBase ? 'remoto removido' : 'local alterado');
    return;
  }

  if (!local && remoto) {
    const remotoIgualBase = assinaturasIguais(assinaturaConteudo(remoto), base);
    adicionar(resultado, remotoIgualBase ? 'conflicts' : 'pull', remoto, remotoIgualBase ? 'local removido' : 'remoto mais novo');
  }
}

function classificarSemManifesto(
  resultado: ResultadoSyncStatus,
  local: ConteudoSyncLocal | undefined,
  remoto: ConteudoSyncRemoto | undefined,
): void {
  if (local && remoto) {
    const destino = assinaturasIguais(assinaturaConteudo(local), assinaturaConteudo(remoto)) ? 'synced' : 'conflicts';
    const motivo = destino === 'synced' ? 'sincronizado' : 'local e remoto divergem sem manifesto';
    adicionar(resultado, destino, local, motivo);
    return;
  }

  if (local) {
    adicionar(resultado, 'push', local, 'existe só local');
    return;
  }

  if (remoto) {
    adicionar(resultado, 'pull', remoto, 'existe só no remoto');
  }
}

function classificarComTresVersoes(
  resultado: ResultadoSyncStatus,
  local: ConteudoSyncLocal,
  remoto: ConteudoSyncRemoto,
  base: EntradaManifestoSync,
): void {
  const assinaturaLocal = assinaturaConteudo(local);
  const assinaturaRemoto = assinaturaConteudo(remoto);

  if (assinaturasIguais(assinaturaLocal, assinaturaRemoto)) {
    adicionar(resultado, 'synced', local, 'sincronizado');
    return;
  }

  const localIgualBase = assinaturasIguais(assinaturaLocal, base);
  const remotoIgualBase = assinaturasIguais(assinaturaRemoto, base);

  if (localIgualBase && !remotoIgualBase) {
    adicionar(resultado, 'pull', remoto, 'remoto mais novo');
    return;
  }

  if (!localIgualBase && remotoIgualBase) {
    adicionar(resultado, 'push', local, 'local alterado');
    return;
  }

  adicionar(resultado, 'conflicts', local, 'local e remoto mudaram');
}

function adicionar(
  resultado: ResultadoSyncStatus,
  grupo: keyof Pick<ResultadoSyncStatus, 'pull' | 'push' | 'conflicts' | 'synced'>,
  conteudo: ConteudoSyncLocal | ConteudoSyncRemoto,
  reason: string,
): void {
  resultado[grupo].push({
    type: conteudo.type,
    clientId: normalizarClientId(conteudo),
    scope: normalizarScope(conteudo),
    slug: conteudo.slug,
    title: conteudo.title,
    reason,
  });
}

function assinaturaConteudo(conteudo: ConteudoSyncLocal | ConteudoSyncRemoto): AssinaturaSync {
  return {
    bodyHash: hashValor(conteudo.body),
    metadataHash: hashValor(removerMetadataInterna(conteudo.metadata)),
    tagsHash: hashValor([...(conteudo.tags ?? [])].sort()),
  };
}

function assinaturasIguais(a: AssinaturaSync, b: AssinaturaSync): boolean {
  return a.bodyHash === b.bodyHash
    && a.metadataHash === b.metadataHash
    && a.tagsHash === b.tagsHash;
}

function chaveConteudo(conteudo: { type: string; slug: string; clientId?: string; scope?: 'project' | 'global' }): string {
  return `${normalizarClientId(conteudo)}:${normalizarScope(conteudo)}:${conteudo.type}:${conteudo.slug}`;
}

function hashValor(valor: unknown): string {
  return createHash('sha256').update(stringifyEstavel(valor)).digest('hex');
}

function removerMetadataInterna(metadata: Record<string, unknown>): Record<string, unknown> {
  const metadataPublica = { ...metadata };

  delete metadataPublica.myinstClientId;
  delete metadataPublica.myinstSourceScope;
  delete metadataPublica.myinstSourcePath;
  delete metadataPublica.myinstFileExtension;
  delete metadataPublica.myinstSourceCategory;
  delete metadataPublica.migratedBy;
  delete metadataPublica.migratedFromPath;
  delete metadataPublica.description;

  return metadataPublica;
}

function stringifyEstavel(valor: unknown): string {
  if (Array.isArray(valor)) {
    return `[${valor.map((entrada) => stringifyEstavel(entrada)).join(',')}]`;
  }

  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>;
    return `{${Object.keys(objeto)
      .sort()
      .map((chave) => `${JSON.stringify(chave)}:${stringifyEstavel(objeto[chave])}`)
      .join(',')}}`;
  }

  return JSON.stringify(valor);
}

function renderizarGrupo(titulo: string, entradas: EntradaStatusSync[]): string[] {
  if (entradas.length === 0) {
    return [`${titulo}:`, '  nenhum'];
  }

  return [
    `${titulo}:`,
    ...entradas.map((entrada) => `  ${entrada.clientId.padEnd(10)} ${entrada.type.padEnd(12)} ${entrada.slug.padEnd(17)} ${entrada.reason}`),
  ];
}

function normalizarClientId(conteudo: { clientId?: string }): string {
  return conteudo.clientId || 'claude';
}

function normalizarScope(conteudo: { scope?: 'project' | 'global' }): 'project' | 'global' {
  return conteudo.scope || 'project';
}
