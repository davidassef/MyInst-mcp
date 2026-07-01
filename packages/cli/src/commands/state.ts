import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { detectarSegredoProvavelEmValor } from '@myinst/shared/security';
import { carregarConfig, type MyInstConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

export type ProjectStateType = 'memory' | 'decision' | 'session';

export interface ProjectStateDraft {
  type: ProjectStateType;
  title: string;
  slug: string;
  body: string;
  summary?: string;
  metadata: Record<string, unknown>;
  sourceClient?: string;
  sourcePath?: string;
  touchedFiles: string[];
  toolsUsed: string[];
  status: 'draft' | 'reviewed' | 'archived';
  startedAt?: string;
  endedAt?: string;
}

interface StatePullResponse {
  memories: ProjectStateItem[];
  decisions: ProjectStateItem[];
  sessions: ProjectStateItem[];
}

interface ProjectStateItem {
  type?: ProjectStateType;
  title: string;
  slug: string;
  body: string;
  summary?: string;
  metadata: Record<string, unknown>;
  touchedFiles?: string[];
  toolsUsed?: string[];
  status?: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

interface StateCaptureOptions {
  body?: string;
  bodyFile?: string;
  slug?: string;
  summary?: string;
  sourceClient?: string;
  sourcePath?: string;
  touchedFile?: string[];
  tool?: string[];
  startedAt?: string;
  endedAt?: string;
}

interface StatePushOptions {
  workspace?: string;
  project?: string;
  reviewed?: boolean;
  dryRun?: boolean;
}

interface StateSearchOptions {
  workspace?: string;
  project?: string;
  type?: ProjectStateType;
}

const TIPOS_STATE = ['memory', 'decision', 'session'] as const;

export async function executarStateCapture(
  tipo: ProjectStateType,
  titulo: string,
  options: StateCaptureOptions,
): Promise<void> {
  validarTipoState(tipo);

  const body = await resolverBody(options);
  if (!body.trim()) {
    console.error(`${VERMELHO}[ERROR] Informe o conteudo com --body ou --body-file${RESET}`);
    process.exit(1);
  }

  const draft: ProjectStateDraft = {
    type: tipo,
    title: titulo,
    slug: options.slug || criarSlugState(titulo),
    body,
    summary: options.summary,
    metadata: { reviewed: false },
    sourceClient: options.sourceClient,
    sourcePath: options.sourcePath,
    touchedFiles: options.touchedFile ?? [],
    toolsUsed: options.tool ?? [],
    status: 'draft',
    startedAt: options.startedAt,
    endedAt: options.endedAt,
  };

  const caminho = await criarDraftProjectState(process.cwd(), draft);
  console.log(`${VERDE}[SUCCESS] Draft criado para revisao:${RESET} ${caminho}`);
}

export async function executarStatePush(draftPath: string, options: StatePushOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';
  const draft = await carregarDraftProjectState(process.cwd(), draftPath);

  validarTipoState(draft.type);

  const item = options.reviewed
    ? { ...draft, status: 'reviewed' as const, metadata: { ...draft.metadata, reviewed: true } }
    : draft;

  if (item.metadata.reviewed !== true) {
    console.error(`${VERMELHO}[ERROR] Project State exige metadata.reviewed=true apos revisao manual${RESET}`);
    process.exit(1);
  }

  if (detectarSegredoProvavel(item)) {
    console.error(`${VERMELHO}[ERROR] Envio bloqueado: draft contem padrao provavel de segredo${RESET}`);
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(`${AMARELO}[DRY RUN] Project State validado e pronto para envio${RESET}`);
    return;
  }

  const endpoint = endpointState(config, workspace, project, item.type);
  const resposta = await fetch(endpoint, {
    method: 'POST',
    headers: headersJson(config),
    body: JSON.stringify(item),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  const salvo = (json.data ?? json) as ProjectStateItem;

  console.log(`${VERDE}[SUCCESS] Project State salvo:${RESET} ${salvo.type ?? item.type}/${salvo.slug}`);
}

export async function executarStatePull(projeto: string, workspace?: string): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspaceSlug = workspace || 'default';
  const state = await buscarProjectState(config, workspaceSlug, projeto);
  const escritos = await materializarProjectState(process.cwd(), state);

  if (escritos.length === 0) {
    console.log(`${AMARELO}[WARN] Nenhum Project State encontrado em ${workspaceSlug}/${projeto}${RESET}`);
    return;
  }

  console.log(`${VERDE}[SUCCESS] ${escritos.length} arquivo(s) materializado(s):${RESET}`);
  escritos.forEach((caminho) => console.log(`  ${CINZA}${caminho}${RESET}`));
}

export async function executarStateSearch(query: string, options: StateSearchOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const searchParams = new URLSearchParams({ q: query, scope: 'state' });

  if (options.workspace) searchParams.set('workspace', options.workspace);
  if (options.project) searchParams.set('project', options.project);
  if (options.type) searchParams.set('type', options.type);

  const resposta = await fetch(`${config.server}/api/v1/search?${searchParams.toString()}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  const resultados = (json.data ?? json) as Array<{ type: string; title: string; slug: string; projectSlug?: string }>;

  if (resultados.length === 0) {
    console.log(`${AMARELO}[WARN] Nenhum Project State encontrado para "${query}"${RESET}`);
    return;
  }

  for (const resultado of resultados) {
    const projetoResultado = resultado.projectSlug ? ` ${CINZA}${resultado.projectSlug}${RESET}` : '';
    console.log(`${VERDE}${resultado.type}${RESET} ${resultado.title} ${CINZA}${resultado.slug}${RESET}${projetoResultado}`);
  }
}

export function criarSlugState(texto: string): string {
  const slug = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return slug || `state-${Date.now()}`;
}

export async function criarDraftProjectState(targetDir: string, draft: ProjectStateDraft): Promise<string> {
  const dir = join(targetDir, '.myinst', 'state', 'drafts');
  await mkdir(dir, { recursive: true });

  const caminho = join(dir, `${draft.type}-${draft.slug}.json`);
  await writeFile(caminho, JSON.stringify(draft, null, 2), 'utf-8');
  return caminho;
}

export async function carregarDraftProjectState(baseDir: string, draftPath: string): Promise<ProjectStateDraft> {
  const caminho = isAbsolute(draftPath) ? draftPath : join(baseDir, draftPath);
  const conteudo = await readFile(caminho, 'utf-8');
  return JSON.parse(conteudo) as ProjectStateDraft;
}

export function detectarSegredoProvavel(draft: ProjectStateDraft): boolean {
  return detectarSegredoProvavelEmValor(draft);
}

export async function materializarProjectState(targetDir: string, state: StatePullResponse): Promise<string[]> {
  const base = join(targetDir, '.myinst', 'state');
  const escritos: string[] = [];

  await mkdir(join(base, 'memories'), { recursive: true });
  await mkdir(join(base, 'decisions'), { recursive: true });
  await mkdir(join(base, 'sessions'), { recursive: true });

  for (const memoria of state.memories) {
    const caminho = join(base, 'memories', `${memoria.slug}.md`);
    await writeFile(caminho, montarMarkdownState('memory', memoria), 'utf-8');
    escritos.push(caminho);
  }

  for (const decisao of state.decisions) {
    const caminho = join(base, 'decisions', `${decisao.slug}.md`);
    await writeFile(caminho, montarMarkdownState('decision', decisao), 'utf-8');
    escritos.push(caminho);
  }

  for (const sessao of state.sessions) {
    const caminho = join(base, 'sessions', `${sessao.slug}.md`);
    await writeFile(caminho, montarMarkdownState('session', sessao), 'utf-8');
    escritos.push(caminho);
  }

  return escritos;
}

async function buscarProjectState(config: MyInstConfig, workspace: string, project: string): Promise<StatePullResponse> {
  const [memories, decisions, sessions] = await Promise.all([
    buscarStateItems(config, workspace, project, 'memory'),
    buscarStateItems(config, workspace, project, 'decision'),
    buscarStateItems(config, workspace, project, 'session'),
  ]);

  return { memories, decisions, sessions };
}

async function buscarStateItems(
  config: MyInstConfig,
  workspace: string,
  project: string,
  type: ProjectStateType,
): Promise<ProjectStateItem[]> {
  const resposta = await fetch(endpointState(config, workspace, project, type), {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  return (json.data ?? json) as ProjectStateItem[];
}

async function resolverBody(options: StateCaptureOptions): Promise<string> {
  if (options.bodyFile) {
    return readFile(options.bodyFile, 'utf-8');
  }

  return options.body ?? '';
}

function endpointState(config: MyInstConfig, workspace: string, project: string, type: ProjectStateType): string {
  const endpoint = type === 'memory'
    ? 'memories'
    : type === 'decision'
      ? 'decisions'
      : 'sessions';

  return `${config.server}/api/v1/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/state/${endpoint}`;
}

function headersJson(config: MyInstConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
}

function carregarConfigObrigatoria(): MyInstConfig {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  return config;
}

function validarTipoState(tipo: string): asserts tipo is ProjectStateType {
  if ((TIPOS_STATE as readonly string[]).includes(tipo)) return;

  console.error(`${VERMELHO}[ERROR] Tipo invalido. Use: memory, decision ou session${RESET}`);
  process.exit(1);
}

async function encerrarComErroHttp(resposta: Response): Promise<never> {
  const erro = await resposta.json().catch(() => ({ error: { message: resposta.statusText } }));
  console.error(`${VERMELHO}[ERROR] ${erro.error?.message || resposta.statusText}${RESET}`);
  process.exit(1);
}

function montarMarkdownState(type: ProjectStateType, item: ProjectStateItem): string {
  const frontmatter = [
    '---',
    `type: ${type}`,
    `slug: ${item.slug}`,
    `reviewed: ${item.metadata.reviewed === true ? 'true' : 'false'}`,
    '---',
    '',
  ].join('\n');

  const resumo = item.summary ? `\n## Resumo\n\n${item.summary}\n` : '';
  return `${frontmatter}# ${item.title}\n${resumo}\n${item.body}\n`;
}
