import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  exportarParaClientesNativos,
  importarTargetsDetectados,
  type EscopoSync,
  type ItemSincronizavel,
} from '@myinst/shared/sync-targets';
import type { MyInstConfig } from '../config.js';
import {
  calcularSyncStatus,
  criarSnapshotManifesto,
  type ConteudoSyncLocal,
  type ConteudoSyncRemoto,
  type ManifestoSync,
  type ResultadoSyncStatus,
} from './status.js';

export interface OperacaoSyncParams {
  config: MyInstConfig;
  diretorio: string;
  project: string;
  workspace?: string;
  scope?: EscopoSync;
  clients?: string[];
  fetchImpl?: typeof fetch;
}

export interface ResultadoPullSincronizado {
  items: ConteudoSyncRemoto[];
  aplicados: string[];
  manifesto: ManifestoSync;
}

export interface ResultadoPushSincronizado {
  created: string[];
  updated: string[];
  serverTime: string;
  manifesto: ManifestoSync | null;
}

interface ResultadoAplicacaoConteudo {
  aplicados: string[];
  itensAplicados: ConteudoSyncRemoto[];
}

const WORKSPACE_DEFAULT = 'default';
const ESCOPO_DEFAULT: EscopoSync = 'project';

const MAPEAMENTO_DIRETORIO: Record<string, string> = {
  skill: '.claude/skills',
  instruction: '.claude',
  mcp_config: '.',
  agent: '.claude/agents',
  hook: '.claude',
  memory: '.claude/memory',
  snippet: '.claude/snippets',
};

const MAPEAMENTO_ARQUIVO: Record<string, (slug: string) => string> = {
  skill: (slug) => `${slug}.md`,
  instruction: () => 'CLAUDE.md',
  mcp_config: () => '.mcp.json',
  agent: (slug) => `${slug}.md`,
  hook: (slug) => `hook-${slug}.md`,
  memory: (slug) => `${slug}.md`,
  snippet: (slug) => `${slug}.md`,
};

export async function executarPullSincronizado(params: OperacaoSyncParams): Promise<ResultadoPullSincronizado> {
  const workspace = params.workspace || WORKSPACE_DEFAULT;
  const locaisAntesDoPull = await lerConteudoLocal(params.diretorio, { scope: params.scope, clients: params.clients });
  const remoto = await buscarSnapshotRemoto(params, locaisAntesDoPull);
  const aplicacao = await aplicarConteudo(remoto.items, params.diretorio);
  const locais = await lerConteudoLocal(params.diretorio, { scope: params.scope, clients: params.clients });
  const manifesto = criarSnapshotManifesto({
    workspace,
    project: params.project,
    serverTime: remoto.serverTime,
    remotos: aplicacao.itensAplicados,
    locais,
  });

  await gravarManifestoSync(params.diretorio, manifesto);

  return { items: remoto.items, aplicados: aplicacao.aplicados, manifesto };
}

export async function executarPushSincronizado(params: OperacaoSyncParams): Promise<ResultadoPushSincronizado> {
  const workspace = params.workspace || WORKSPACE_DEFAULT;
  const locais = await lerConteudoLocal(params.diretorio, { scope: params.scope, clients: params.clients });

  if (locais.length === 0) {
    return { created: [], updated: [], serverTime: new Date().toISOString(), manifesto: null };
  }

  const remotoAntes = await buscarSnapshotRemoto(params, locais);
  const manifestoAtual = await lerManifestoSync(params.diretorio, workspace, params.project);
  const status = calcularSyncStatus({
    workspace,
    project: params.project,
    locais,
    remotos: remotoAntes.items,
    manifesto: manifestoAtual,
  });

  if (status.conflicts.length > 0) {
    throw new Error(`Conflito de sync: ${status.conflicts.map((conflito) => `${conflito.clientId}/${conflito.scope}/${conflito.type}/${conflito.slug}`).join(', ')}`);
  }

  const respostaPush = await enviarPush(params, locais);
  const remotoDepois = await buscarSnapshotRemoto(params, locais);
  const manifesto = criarSnapshotManifesto({
    workspace,
    project: params.project,
    serverTime: remotoDepois.serverTime,
    remotos: remotoDepois.items,
    locais,
  });

  await gravarManifestoSync(params.diretorio, manifesto);

  return { ...respostaPush, manifesto };
}

export async function obterSyncStatus(params: OperacaoSyncParams): Promise<ResultadoSyncStatus> {
  const workspace = params.workspace || WORKSPACE_DEFAULT;
  const locais = await lerConteudoLocal(params.diretorio, { scope: params.scope, clients: params.clients });
  const [remoto, manifesto] = await Promise.all([
    buscarSnapshotRemoto(params, locais),
    lerManifestoSync(params.diretorio, workspace, params.project),
  ]);

  return calcularSyncStatus({
    workspace,
    project: params.project,
    locais,
    remotos: remoto.items,
    manifesto,
  });
}

export async function lerManifestoSync(
  diretorio: string,
  workspace: string,
  project: string,
): Promise<ManifestoSync | null> {
  try {
    const conteudo = await readFile(caminhoManifesto(diretorio), 'utf-8');
    const manifesto = JSON.parse(conteudo) as ManifestoSync;

    if (manifesto.workspace !== workspace || manifesto.project !== project) {
      return null;
    }

    return manifesto;
  } catch {
    return null;
  }
}

export async function gravarManifestoSync(diretorio: string, manifesto: ManifestoSync): Promise<void> {
  const caminho = caminhoManifesto(diretorio);
  await mkdir(join(diretorio, '.myinst'), { recursive: true });
  await writeFile(caminho, `${JSON.stringify(manifesto, null, 2)}\n`, 'utf-8');
}

export async function lerConteudoLocal(
  diretorio: string,
  options: { scope?: EscopoSync; clients?: string[] } = {},
): Promise<ConteudoSyncLocal[]> {
  const importacao = await importarTargetsDetectados(diretorio, options.scope || ESCOPO_DEFAULT, options.clients);

  return importacao.items.map((conteudo) => {
    const clientId = lerStringMetadata(conteudo.metadata, 'myinstClientId') || 'unknown';
    const scope = lerScopeMetadata(conteudo.metadata);

    return {
      clientId,
      scope,
      type: conteudo.type,
      title: conteudo.title,
      slug: conteudo.slug,
      body: conteudo.body,
      metadata: conteudo.metadata,
      tags: conteudo.tags,
      sourcePath: `${clientId}:${scope}:${conteudo.type}:${conteudo.slug}`,
    };
  });
}

async function aplicarConteudo(conteudos: ConteudoSyncRemoto[], targetDir: string): Promise<ResultadoAplicacaoConteudo> {
  const aplicados: string[] = [];
  const itensAplicados: ConteudoSyncRemoto[] = [];
  const grupos = agruparPorClientEscopo(conteudos);

  for (const grupo of grupos.values()) {
    const exportacao = await exportarParaClientesNativos(
      targetDir,
      grupo.conteudos.map(converterRemotoParaItemSincronizavel),
      grupo.scope,
      [grupo.clientId],
    );

    const caminhosEscritos = exportacao.results.flatMap((resultado) => resultado.written.map((escrito) => escrito.path));
    aplicados.push(...caminhosEscritos);

    if (caminhosEscritos.length > 0) {
      itensAplicados.push(...grupo.conteudos);
      continue;
    }

    if (grupo.clientId !== 'claude' || grupo.scope !== 'project') {
      continue;
    }

    for (const conteudo of grupo.conteudos) {
      const dir = join(targetDir, MAPEAMENTO_DIRETORIO[conteudo.type] || '.claude');
      const nomeArquivo = MAPEAMENTO_ARQUIVO[conteudo.type]?.(conteudo.slug) || `${conteudo.slug}.md`;
      const caminhoCompleto = join(dir, nomeArquivo);

      await mkdir(dir, { recursive: true });
      await writeFile(caminhoCompleto, conteudo.body, 'utf-8');
      aplicados.push(caminhoCompleto);
      itensAplicados.push(conteudo);
    }
  }

  return { aplicados, itensAplicados };
}

async function buscarSnapshotRemoto(
  params: OperacaoSyncParams,
  locais: ConteudoSyncLocal[] = [],
): Promise<{ items: ConteudoSyncRemoto[]; serverTime: string }> {
  const workspace = params.workspace || WORKSPACE_DEFAULT;
  const scope = params.scope || ESCOPO_DEFAULT;
  const respostas: Array<{ items: ConteudoSyncRemoto[]; serverTime: string }> = [];

  if (scope !== 'global') {
    respostas.push(await buscarSnapshotProjeto(params, workspace));
  }

  if (scope !== 'project') {
    for (const clientId of listarClientsGlobais(params, locais)) {
      respostas.push(await buscarSnapshotGlobal(params, clientId));
    }
  }

  return {
    items: respostas.flatMap((resposta) => resposta.items),
    serverTime: respostas.at(-1)?.serverTime ?? new Date().toISOString(),
  };
}

async function enviarPush(
  params: OperacaoSyncParams,
  conteudos: ConteudoSyncLocal[],
): Promise<{ created: string[]; updated: string[]; serverTime: string }> {
  const scope = params.scope || ESCOPO_DEFAULT;
  const created: string[] = [];
  const updated: string[] = [];
  let serverTime = new Date().toISOString();

  if (scope !== 'global') {
    const conteudosProjeto = conteudos.filter((conteudo) => conteudo.scope === 'project');
    const respostaProjeto = await enviarPushProjeto(params, conteudosProjeto);
    created.push(...respostaProjeto.created);
    updated.push(...respostaProjeto.updated);
    serverTime = respostaProjeto.serverTime;
  }

  if (scope === 'project') {
    return { created, updated, serverTime };
  }

  for (const [clientId, conteudosGlobais] of agruparGlobaisPorClient(conteudos)) {
    const respostaGlobal = await enviarPushGlobal(params, clientId, conteudosGlobais);
    created.push(...respostaGlobal.created.map((slug) => `${clientId}:${slug}`));
    updated.push(...respostaGlobal.updated.map((slug) => `${clientId}:${slug}`));
    serverTime = respostaGlobal.serverTime;
  }

  return { created, updated, serverTime };
}

async function buscarSnapshotProjeto(
  params: OperacaoSyncParams,
  workspace: string,
): Promise<{ items: ConteudoSyncRemoto[]; serverTime: string }> {
  const resposta = await (params.fetchImpl ?? fetch)(`${params.config.server}/api/v1/sync/pull`, {
    method: 'POST',
    headers: headersJson(params.config),
    body: JSON.stringify({ scope: 'project', workspace, project: params.project }),
  });

  return lerRespostaSnapshot(resposta, { scope: 'project' });
}

async function buscarSnapshotGlobal(
  params: OperacaoSyncParams,
  clientId: string,
): Promise<{ items: ConteudoSyncRemoto[]; serverTime: string }> {
  const resposta = await (params.fetchImpl ?? fetch)(`${params.config.server}/api/v1/sync/pull`, {
    method: 'POST',
    headers: headersJson(params.config),
    body: JSON.stringify({ scope: 'global', clientId }),
  });

  return lerRespostaSnapshot(resposta, { scope: 'global', clientId });
}

async function lerRespostaSnapshot(
  resposta: Response,
  defaults: { scope: 'project' | 'global'; clientId?: string },
): Promise<{ items: ConteudoSyncRemoto[]; serverTime: string }> {
  if (!resposta.ok) {
    await erroHttp(resposta);
  }

  const json = await resposta.json();
  const payload = json.data ?? json;
  return {
    items: (payload.items ?? []).map((conteudo: ConteudoSyncRemoto) => normalizarConteudoRemoto({
      ...conteudo,
      scope: conteudo.scope || defaults.scope,
      clientId: conteudo.clientId || defaults.clientId,
    })),
    serverTime: payload.serverTime ?? new Date().toISOString(),
  };
}

async function enviarPushProjeto(
  params: OperacaoSyncParams,
  conteudos: ConteudoSyncLocal[],
): Promise<{ created: string[]; updated: string[]; serverTime: string }> {
  if (conteudos.length === 0) {
    return { created: [], updated: [], serverTime: new Date().toISOString() };
  }

  const resposta = await (params.fetchImpl ?? fetch)(`${params.config.server}/api/v1/sync/push`, {
    method: 'POST',
    headers: headersJson(params.config),
    body: JSON.stringify({
      scope: 'project',
      workspace: params.workspace || WORKSPACE_DEFAULT,
      project: params.project,
      items: conteudos,
    }),
  });

  return lerRespostaPush(resposta);
}

async function enviarPushGlobal(
  params: OperacaoSyncParams,
  clientId: string,
  conteudos: ConteudoSyncLocal[],
): Promise<{ created: string[]; updated: string[]; serverTime: string }> {
  if (conteudos.length === 0) {
    return { created: [], updated: [], serverTime: new Date().toISOString() };
  }

  const resposta = await (params.fetchImpl ?? fetch)(`${params.config.server}/api/v1/sync/push`, {
    method: 'POST',
    headers: headersJson(params.config),
    body: JSON.stringify({ scope: 'global', clientId, items: conteudos }),
  });

  return lerRespostaPush(resposta);
}

async function lerRespostaPush(resposta: Response): Promise<{ created: string[]; updated: string[]; serverTime: string }> {
  if (!resposta.ok) {
    await erroHttp(resposta);
  }

  const json = await resposta.json();
  const payload = json.data ?? json;
  return {
    created: payload.created ?? [],
    updated: payload.updated ?? [],
    serverTime: payload.serverTime ?? new Date().toISOString(),
  };
}

async function erroHttp(resposta: Response): Promise<never> {
  const erro = await resposta.json().catch(() => ({ error: { message: resposta.statusText } }));
  throw new Error(erro.error?.message || resposta.statusText);
}

function headersJson(config: MyInstConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
}

function caminhoManifesto(diretorio: string): string {
  return join(diretorio, '.myinst', 'sync-state.json');
}

function normalizarConteudoRemoto(conteudo: ConteudoSyncRemoto): ConteudoSyncRemoto {
  const clientId = conteudo.clientId || lerStringMetadata(conteudo.metadata, 'myinstClientId') || 'claude';
  const scope = conteudo.scope || lerScopeMetadata(conteudo.metadata);

  return { ...conteudo, clientId, scope };
}

function listarClientsGlobais(params: OperacaoSyncParams, locais: ConteudoSyncLocal[]): string[] {
  const clients = new Set<string>();

  for (const clientId of params.clients ?? []) {
    clients.add(clientId);
  }

  for (const conteudo of locais) {
    if (conteudo.scope === 'global') {
      clients.add(conteudo.clientId);
    }
  }

  return [...clients].sort();
}

function agruparGlobaisPorClient(conteudos: ConteudoSyncLocal[]): Map<string, ConteudoSyncLocal[]> {
  const grupos = new Map<string, ConteudoSyncLocal[]>();

  for (const conteudo of conteudos) {
    if (conteudo.scope !== 'global') continue;

    const grupo = grupos.get(conteudo.clientId) ?? [];
    grupo.push(conteudo);
    grupos.set(conteudo.clientId, grupo);
  }

  return grupos;
}

function agruparPorClientEscopo(conteudos: ConteudoSyncRemoto[]): Map<string, { clientId: string; scope: 'project' | 'global'; conteudos: ConteudoSyncRemoto[] }> {
  const grupos = new Map<string, { clientId: string; scope: 'project' | 'global'; conteudos: ConteudoSyncRemoto[] }>();

  for (const conteudo of conteudos.map(normalizarConteudoRemoto)) {
    const clientId = conteudo.clientId || 'claude';
    const scope = conteudo.scope || 'project';
    const chave = `${clientId}:${scope}`;
    const grupo = grupos.get(chave) ?? { clientId, scope, conteudos: [] };
    grupo.conteudos.push(conteudo);
    grupos.set(chave, grupo);
  }

  return grupos;
}

function converterRemotoParaItemSincronizavel(conteudo: ConteudoSyncRemoto): ItemSincronizavel {
  return {
    type: conteudo.type as ItemSincronizavel['type'],
    title: conteudo.title,
    slug: conteudo.slug,
    body: conteudo.body,
    metadata: conteudo.metadata,
    tags: conteudo.tags ?? [],
  };
}

function lerStringMetadata(metadata: Record<string, unknown>, chave: string): string | null {
  const valor = metadata[chave];
  return typeof valor === 'string' && valor ? valor : null;
}

function lerScopeMetadata(metadata: Record<string, unknown>): 'project' | 'global' {
  return metadata.myinstSourceScope === 'global' ? 'global' : 'project';
}
