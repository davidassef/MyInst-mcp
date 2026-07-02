import { access, constants, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { redigirSegredosEmTexto } from '../security.js';

export type TipoSincronizavel =
  | 'skill'
  | 'instruction'
  | 'mcp_config'
  | 'agent'
  | 'command'
  | 'hook'
  | 'memory'
  | 'output_style'
  | 'setting'
  | 'snippet';

export type EscopoSync = 'project' | 'global' | 'all';
export type NivelSuporte = 'full' | 'partial' | 'experimental';
export type FormatoPull = 'myinst' | 'native';

export interface ItemSincronizavel {
  type: TipoSincronizavel;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface SyncTarget {
  clientId: string;
  clientName: string;
  supportLevel: NivelSuporte;
  scope: 'project' | 'global';
  detectedPaths: string[];
  supportedTypes: TipoSincronizavel[];
  estimatedItemCount: number;
}

export interface ResolucaoSync {
  selectedTargets: SyncTarget[];
  requiresClientSelection: boolean;
  availableTargets: SyncTarget[];
}

interface ClienteAdapter {
  id: string;
  nome: string;
  nivelSuporte: NivelSuporte;
  escopoSuportado: EscopoSync;
  tiposSuportados: TipoSincronizavel[];
  detectar: (ctx: ContextoSync, scope: EscopoSync) => Promise<SyncTarget[]>;
  ler: (target: SyncTarget) => Promise<ItemSincronizavel[]>;
  escrever: (items: ItemSincronizavel[], target: SyncTarget) => Promise<EscritaCliente>;
}

export interface EscritaCliente {
  clientId: string;
  clientName: string;
  scope: 'project' | 'global';
  written: Array<{ path: string; type: TipoSincronizavel; slug: string }>;
  ignored: Array<{ type: TipoSincronizavel; slug: string; reason: string }>;
}

interface ContextoSync {
  projectDir: string;
  userHome: string;
  env: NodeJS.ProcessEnv;
}

const TIPOS_FULL: TipoSincronizavel[] = ['skill', 'instruction', 'mcp_config', 'agent', 'command', 'hook', 'memory', 'output_style', 'setting', 'snippet'];
const TIPOS_PARTIAL: TipoSincronizavel[] = ['instruction', 'mcp_config', 'setting'];
const TIPOS_OPENCODE: TipoSincronizavel[] = ['skill', 'instruction', 'agent', 'command', 'output_style', 'setting', 'snippet'];
const TIPOS_CLAUDE_GLOBAL: TipoSincronizavel[] = ['instruction', 'agent', 'command', 'output_style', 'setting'];
const TIPOS_CURSOR: TipoSincronizavel[] = ['skill', 'instruction', 'mcp_config', 'setting'];
const TIPOS_QWEN: TipoSincronizavel[] = ['instruction', 'setting'];
const TIPOS_GEMINI: TipoSincronizavel[] = ['instruction', 'mcp_config'];
const TIPOS_KIMI: TipoSincronizavel[] = ['skill', 'mcp_config'];
const DIRETORIOS_IGNORADOS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'cache',
  'plugins',
  'attachments',
  'sessions',
  'browser',
  'computer-use',
  'memories',
  'node_repl',
  'sqlite',
  'tmp',
  '.tmp',
  '.sandbox',
  '.sandbox-bin',
  '.sandbox-secrets',
  'vendor_imports',
  'generated_images',
  'ambient-suggestions',
  'process_manager',
  'pets',
]);

const ADAPTERS: ClienteAdapter[] = [
  criarAdapterClaude(),
  criarAdapterCodex(),
  criarAdapterCursor(),
  criarAdapterGemini(),
  criarAdapterOpenCode(),
  criarAdapterQwen(),
  criarAdapterAider(),
  criarAdapterAntigravity(),
  criarAdapterKimi(),
];

export async function listarSyncTargets(
  projectDir: string,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<SyncTarget[]> {
  const ctx = criarContextoSync(projectDir);
  const permitidos = clients?.length ? new Set(clients) : null;
  const targets: SyncTarget[] = [];

  for (const adapter of ADAPTERS) {
    if (permitidos && !permitidos.has(adapter.id)) continue;
    const encontrados = await adapter.detectar(ctx, scope);
    targets.push(...encontrados);
  }

  return targets.sort((a, b) => `${a.clientId}:${a.scope}`.localeCompare(`${b.clientId}:${b.scope}`));
}

export async function resolverSelecaoSync(
  projectDir: string,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<ResolucaoSync> {
  const availableTargets = await listarSyncTargets(projectDir, scope);

  if (clients?.length) {
    return {
      selectedTargets: availableTargets.filter((target) => clients.includes(target.clientId)),
      requiresClientSelection: false,
      availableTargets,
    };
  }

  const clientesEncontrados = new Set(availableTargets.map((target) => target.clientId));
  if (clientesEncontrados.size > 1) {
    return {
      selectedTargets: [],
      requiresClientSelection: true,
      availableTargets,
    };
  }

  return {
    selectedTargets: availableTargets,
    requiresClientSelection: false,
    availableTargets,
  };
}

export async function importarTargetsDetectados(
  projectDir: string,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<{ targets: SyncTarget[]; items: ItemSincronizavel[] }> {
  const targets = await listarSyncTargets(projectDir, scope, clients);
  const items = new Map<string, ItemSincronizavel>();

  for (const target of targets) {
    const adapter = obterAdapter(target.clientId);
    const lidos = await adapter.ler(target);

    for (const item of lidos) {
      items.set(`${target.clientId}:${target.scope}:${item.type}:${item.slug}`, {
        ...item,
        metadata: {
          ...item.metadata,
          myinstClientId: target.clientId,
          myinstSourceScope: target.scope,
        },
      });
    }
  }

  return {
    targets,
    items: [...items.values()],
  };
}

export async function exportarParaClientesNativos(
  projectDir: string,
  items: Array<{ type: string; slug: string; title: string; body: string; metadata: Record<string, unknown>; tags: string[] }>,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<{ targets: SyncTarget[]; results: EscritaCliente[] }> {
  const targetsDetectados = await listarSyncTargets(projectDir, scope, clients);
  const targets = adicionarTargetCodexExplicito(projectDir, scope, clients, targetsDetectados);
  const itemsValidos = items
    .filter((item): item is ItemSincronizavel => TIPOS_FULL.includes(item.type as TipoSincronizavel))
    .map((item) => ({ ...item, type: item.type as TipoSincronizavel }));
  const results: EscritaCliente[] = [];

  for (const target of targets) {
    const adapter = obterAdapter(target.clientId);
    const resultado = await adapter.escrever(itemsValidos, target);
    results.push(resultado);
  }

  return { targets, results };
}

function adicionarTargetCodexExplicito(
  projectDir: string,
  scope: EscopoSync,
  clients: string[] | undefined,
  targets: SyncTarget[],
): SyncTarget[] {
  if (!clients?.includes('codex')) return targets;

  if (scope === 'global') {
    return [
      ...targets.filter((target) => target.clientId !== 'codex' || target.scope !== 'global'),
      {
        clientId: 'codex',
        clientName: 'Codex',
        supportLevel: 'full',
        scope: 'global',
        detectedPaths: [join(resolve(projectDir), '.codex', 'config.toml')],
        supportedTypes: ['skill', 'instruction', 'mcp_config', 'setting'],
        estimatedItemCount: 0,
      },
    ];
  }

  if (targets.some((target) => target.clientId === 'codex' && target.scope === 'project')) return targets;

  return [
    ...targets,
    {
      clientId: 'codex',
      clientName: 'Codex',
      supportLevel: 'full',
      scope: 'project',
      detectedPaths: [join(resolve(projectDir), '.codex', 'AGENTS.md')],
      supportedTypes: TIPOS_FULL,
      estimatedItemCount: 0,
    },
  ];
}

export function obterClientesSuportados() {
  return ADAPTERS.map((adapter) => ({
    id: adapter.id,
    nome: adapter.nome,
    nivelSuporte: adapter.nivelSuporte,
    escopoSuportado: adapter.escopoSuportado,
    tiposSuportados: adapter.tiposSuportados,
  }));
}

function criarContextoSync(projectDir: string): ContextoSync {
  return {
    projectDir: resolve(projectDir),
    userHome: homedir(),
    env: process.env,
  };
}

function obterAdapter(clientId: string) {
  const adapter = ADAPTERS.find((entry) => entry.id === clientId);
  if (!adapter) {
    throw new Error(`Adapter MCP desconhecido: ${clientId}`);
  }

  return adapter;
}

function criarAdapterClaude(): ClienteAdapter {
  return {
    id: 'claude',
    nome: 'Claude Code',
    nivelSuporte: 'full',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_FULL,
    detectar: async (ctx, scope) => {
      if (scope !== 'project') {
        const baseGlobal = join(ctx.userHome, '.claude');
        const encontradosGlobais = await filtrarExistentes([
          join(baseGlobal, 'CLAUDE.md'),
          join(baseGlobal, 'GLOBAL_GUIDELINES.md'),
          join(baseGlobal, 'agents'),
          join(baseGlobal, 'commands'),
          join(baseGlobal, 'output-styles'),
          join(baseGlobal, 'settings.json'),
        ]);

        if (encontradosGlobais.length > 0) {
          return [{
            clientId: 'claude',
            clientName: 'Claude Code',
            supportLevel: 'full',
            scope: 'global',
            detectedPaths: encontradosGlobais,
            supportedTypes: TIPOS_CLAUDE_GLOBAL,
            estimatedItemCount:
              (await existe(join(baseGlobal, 'CLAUDE.md')) ? 1 : 0)
              + (await existe(join(baseGlobal, 'GLOBAL_GUIDELINES.md')) ? 1 : 0)
              + await contarArquivosMarkdownRecursivo(join(baseGlobal, 'agents'))
              + await contarArquivosMarkdownRecursivo(join(baseGlobal, 'commands'))
              + await contarArquivosMarkdownRecursivo(join(baseGlobal, 'output-styles'))
              + (await existe(join(baseGlobal, 'settings.json')) ? 1 : 0),
          }];
        }
      }

      if (scope === 'global') return [];
      if (ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'claude')) return [];

      const base = join(ctx.projectDir, '.claude');
      const encontrados = await filtrarExistentes([
        join(base, 'skills'),
        join(base, 'agents'),
        join(base, 'memory'),
        join(base, 'snippets'),
        join(base, 'hooks'),
        join(base, 'CLAUDE.md'),
        join(ctx.projectDir, 'CLAUDE.md'),
        join(base, '.mcp.json'),
        join(ctx.projectDir, '.mcp.json'),
      ]);

      if (encontrados.length === 0) return [];

      return [{
        clientId: 'claude',
        clientName: 'Claude Code',
        supportLevel: 'full',
        scope: 'project',
        detectedPaths: encontrados,
        supportedTypes: TIPOS_FULL,
        estimatedItemCount: await contarArquivosMarkdownRecursivo(join(base, 'skills'))
          + await contarArquivosMarkdownRecursivo(join(base, 'agents'))
          + await contarArquivosMarkdownRecursivo(join(base, 'memory'))
          + await contarArquivosMarkdownRecursivo(join(base, 'snippets'))
          + await contarArquivosMarkdownRecursivo(join(base, 'hooks'))
          + (await existe(join(base, 'CLAUDE.md')) ? 1 : 0)
          + (await existe(join(ctx.projectDir, 'CLAUDE.md')) ? 1 : 0)
          + (await existe(join(base, '.mcp.json')) ? 1 : 0)
          + (await existe(join(ctx.projectDir, '.mcp.json')) ? 1 : 0),
      }];
    },
    ler: async (target) => {
      if (target.scope === 'global') {
        return lerEstruturaClaudeGlobal(join(homedir(), '.claude'));
      }

      const raizProjeto = dirname(dirname(target.detectedPaths[0] ?? join(process.cwd(), '.claude', 'skills')));
      return lerEstruturaClaude(raizProjeto);
    },
    escrever: async (items, target) => escreverEstruturaClaude(items, target),
  };
}

function criarAdapterCodex(): ClienteAdapter {
  return {
    id: 'codex',
    nome: 'Codex',
    nivelSuporte: 'full',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_FULL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        if (!ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'codex')) {
          const baseProjeto = join(ctx.projectDir, '.codex');
          const encontradosProjeto = await filtrarExistentes([
            join(baseProjeto, 'skills'),
            join(baseProjeto, 'AGENTS.md'),
            join(baseProjeto, '.mcp.json'),
            join(ctx.projectDir, 'AGENTS.md'),
            join(ctx.projectDir, '.mcp.json'),
          ]);

          if (encontradosProjeto.length > 0) {
            targets.push({
              clientId: 'codex',
              clientName: 'Codex',
              supportLevel: 'full',
              scope: 'project',
              detectedPaths: encontradosProjeto,
              supportedTypes: TIPOS_FULL,
              estimatedItemCount: await contarSkillsCodex(join(baseProjeto, 'skills'))
                + (await existe(join(baseProjeto, 'AGENTS.md')) ? 1 : 0)
                + (await existe(join(baseProjeto, '.mcp.json')) ? 1 : 0)
                + (await existe(join(ctx.projectDir, 'AGENTS.md')) ? 1 : 0)
                + (await existe(join(ctx.projectDir, '.mcp.json')) ? 1 : 0),
            });
          }
        }
      }

      if (scope !== 'project') {
        const baseGlobal = join(ctx.userHome, '.codex');
        const encontradosGlobal = await filtrarExistentes([
          join(baseGlobal, 'skills'),
          join(baseGlobal, 'AGENTS.md'),
          join(baseGlobal, 'config.toml'),
        ]);

        if (encontradosGlobal.length > 0) {
          targets.push({
            clientId: 'codex',
            clientName: 'Codex',
            supportLevel: 'full',
            scope: 'global',
            detectedPaths: encontradosGlobal,
            supportedTypes: ['skill', 'instruction', 'mcp_config', 'setting'],
            estimatedItemCount: await contarSkillsCodex(join(baseGlobal, 'skills'))
              + (await existe(join(baseGlobal, 'AGENTS.md')) ? 1 : 0)
              + (await existe(join(baseGlobal, 'config.toml')) ? 1 : 0),
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      const base = target.scope === 'global'
        ? join(homedir(), '.codex')
        : resolverRaizProjetoPorPath(target.detectedPaths[0]);

      return lerEstruturaCodex(base, target.scope === 'global');
    },
    escrever: async (items, target) => escreverEstruturaCodex(items, target),
  };
}

function criarAdapterCursor(): ClienteAdapter {
  return {
    id: 'cursor',
    nome: 'Cursor',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_CURSOR,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        if (!ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'cursor')) {
          const base = join(ctx.projectDir, '.cursor');
          const encontrados = await filtrarExistentes([
            join(base, 'rules'),
            join(base, 'mcp.json'),
            join(base, 'skills-cursor'),
            join(base, 'argv.json'),
          ]);

          if (encontrados.length > 0) {
            targets.push({
              clientId: 'cursor',
              clientName: 'Cursor',
              supportLevel: 'partial',
              scope: 'project',
              detectedPaths: encontrados,
              supportedTypes: TIPOS_CURSOR,
              estimatedItemCount: await contarArquivosPorExtensao(join(base, 'rules'), ['.mdc', '.md'])
                + await contarArquivosSkillPorEstrutura(join(base, 'skills-cursor'))
                + (await existe(join(base, 'argv.json')) ? 1 : 0)
                + (await existe(join(base, 'mcp.json')) ? 1 : 0),
            });
          }
        }
      }

      if (scope !== 'project') {
        const base = join(ctx.userHome, '.cursor');
        const encontrados = await filtrarExistentes([
          join(base, 'rules'),
          join(base, 'mcp.json'),
          join(base, 'skills-cursor'),
          join(base, 'argv.json'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'cursor',
            clientName: 'Cursor',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_CURSOR,
            estimatedItemCount: await contarArquivosPorExtensao(join(base, 'rules'), ['.mdc', '.md'])
              + await contarArquivosSkillPorEstrutura(join(base, 'skills-cursor'))
              + (await existe(join(base, 'argv.json')) ? 1 : 0)
              + (await existe(join(base, 'mcp.json')) ? 1 : 0),
          });
        }
      }

      return targets;
    },
    ler: async (target) => lerEstruturaCursor(
      target.scope === 'global'
        ? join(homedir(), '.cursor')
        : join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.cursor'),
    ),
    escrever: async (items, target) => escreverEstruturaCursor(items, target),
  };
}

function criarAdapterGemini(): ClienteAdapter {
  return {
    id: 'gemini',
    nome: 'Gemini CLI',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_GEMINI,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        if (!ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'gemini')) {
          const caminhoProjeto = join(ctx.projectDir, 'GEMINI.md');
          if (await existe(caminhoProjeto)) {
            targets.push({
              clientId: 'gemini',
              clientName: 'Gemini CLI',
              supportLevel: 'partial',
              scope: 'project',
              detectedPaths: [caminhoProjeto],
              supportedTypes: ['instruction'],
              estimatedItemCount: 1,
            });
          }
        }
      }

      if (scope !== 'project') {
        const raizGlobal = ctx.env.GEMINI_CLI_HOME
          ? resolve(ctx.env.GEMINI_CLI_HOME)
          : join(ctx.userHome, '.gemini');
        const caminhoGlobal = join(raizGlobal, 'GEMINI.md');
        const caminhoMcp = join(raizGlobal, 'antigravity', 'mcp_config.json');

        if (await existe(caminhoGlobal) || await existe(caminhoMcp)) {
          targets.push({
            clientId: 'gemini',
            clientName: 'Gemini CLI',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: (await filtrarExistentes([caminhoGlobal, caminhoMcp])),
            supportedTypes: TIPOS_GEMINI,
            estimatedItemCount: (await existe(caminhoGlobal) ? 1 : 0) + (await existe(caminhoMcp) ? 1 : 0),
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      const base = target.scope === 'global'
        ? (process.env.GEMINI_CLI_HOME ? resolve(process.env.GEMINI_CLI_HOME) : join(homedir(), '.gemini'))
        : resolverRaizProjetoPorPath(target.detectedPaths[0]);

      return [
        ...(await lerArquivosEspecificos([
          { path: target.scope === 'global' ? join(base, 'GEMINI.md') : join(base, 'GEMINI.md'), slug: 'gemini', type: 'instruction' },
        ])),
        ...(await lerArquivoConfiguracaoComRedacao(join(base, 'antigravity', 'mcp_config.json'), 'gemini-antigravity-mcp-config', 'Gemini Antigravity MCP', 'mcp_config')),
      ];
    },
    escrever: async (items, target) => escreverEstruturaGemini(items, target),
  };
}

function criarAdapterOpenCode(): ClienteAdapter {
  return {
    id: 'opencode',
    nome: 'OpenCode',
    nivelSuporte: 'full',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_OPENCODE,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        if (!ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'opencode')) {
          const base = join(ctx.projectDir, '.opencode');
          const encontrados = await filtrarExistentes([
            join(base, 'skills'),
            join(base, 'agents'),
            join(base, 'commands'),
            join(base, 'output-styles'),
            join(base, 'AGENTS.md'),
            join(ctx.projectDir, 'opencode.json'),
            join(ctx.projectDir, 'opencode.jsonc'),
          ]);

          if (encontrados.length > 0) {
            targets.push({
              clientId: 'opencode',
              clientName: 'OpenCode',
              supportLevel: 'full',
              scope: 'project',
              detectedPaths: encontrados,
              supportedTypes: TIPOS_OPENCODE,
              estimatedItemCount: await contarArquivosSkillPorEstrutura(join(base, 'skills'))
                + await contarArquivosSkillPorEstrutura(join(base, 'agents'))
                + await contarArquivosSkillPorEstrutura(join(base, 'commands'))
                + await contarArquivosSkillPorEstrutura(join(base, 'output-styles'))
                + 1,
            });
          }
        }
      }

      if (scope !== 'project') {
        const base = join(ctx.userHome, '.config', 'opencode');
        const encontrados = await filtrarExistentes([
          join(base, 'skills'),
          join(base, 'agents'),
          join(base, 'commands'),
          join(base, 'output-styles'),
          join(base, 'AGENTS.md'),
          join(base, 'opencode.json'),
          join(base, 'opencode.jsonc'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'opencode',
            clientName: 'OpenCode',
            supportLevel: 'full',
            scope: 'global',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_OPENCODE,
            estimatedItemCount: await contarArquivosSkillPorEstrutura(join(base, 'skills'))
              + await contarArquivosSkillPorEstrutura(join(base, 'agents'))
              + await contarArquivosSkillPorEstrutura(join(base, 'commands'))
              + await contarArquivosSkillPorEstrutura(join(base, 'output-styles'))
              + 1,
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      const raizProjeto = resolverRaizProjetoPorPath(target.detectedPaths[0]);
      const base = target.scope === 'global'
        ? join(homedir(), '.config', 'opencode')
        : join(raizProjeto, '.opencode');

      const itens = new Map<string, ItemSincronizavel>();

      await lerSkillsPorEstrutura(join(base, 'skills'), itens);
      await lerSkillsPorEstrutura(join(base, 'agents'), itens);
      await lerSkillsPorEstrutura(join(base, 'commands'), itens);
      await lerSkillsPorEstrutura(join(base, 'output-styles'), itens);

      for (const item of await lerArquivosEspecificos([
        { path: join(base, 'AGENTS.md'), slug: 'agents', type: 'instruction' },
      ])) {
        itens.set(`instruction:${item.slug}`, item);
      }

      const caminhoConfig = join(base, 'opencode.jsonc');
      if (await existe(caminhoConfig)) {
        await lerArquivoConfiguracaoComRedacaoNoMapa(caminhoConfig, 'opencode-config', 'OpenCode Config', 'setting', itens);
      } else {
        await lerArquivoConfiguracaoComRedacaoNoMapa(join(base, 'opencode.json'), 'opencode-config', 'OpenCode Config', 'setting', itens);
      }

      return [...itens.values()];
    },
    escrever: async (items, target) => escreverEstruturaOpenCode(items, target),
  };
}

function criarAdapterQwen(): ClienteAdapter {
  return {
    id: 'qwen',
    nome: 'Qwen Code',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_QWEN,
    detectar: async (ctx, scope) => {
      if (scope !== 'project') {
        const encontradosGlobais = await filtrarExistentes([
          join(ctx.userHome, '.qwen', 'QWEN.md'),
          join(ctx.userHome, '.qwen', 'output-language.md'),
          join(ctx.userHome, '.qwen', 'settings.json'),
        ]);
        if (encontradosGlobais.length > 0) {
          return [{
            clientId: 'qwen',
            clientName: 'Qwen Code',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: encontradosGlobais,
            supportedTypes: TIPOS_QWEN,
            estimatedItemCount: encontradosGlobais.length,
          }];
        }
      }

      if (scope === 'global') return [];
      if (ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'qwen')) return [];

      const caminho = join(ctx.projectDir, '.qwen', 'AGENTS.md');
      if (!(await existe(caminho))) return [];

      return [{
        clientId: 'qwen',
        clientName: 'Qwen Code',
        supportLevel: 'partial',
        scope: 'project',
        detectedPaths: [caminho],
        supportedTypes: ['instruction'],
        estimatedItemCount: 1,
      }];
    },
    ler: async (target) => {
      if (target.scope === 'global') {
        const base = join(homedir(), '.qwen');
        return [
          ...(await lerArquivosEspecificos([
            { path: join(base, 'QWEN.md'), slug: 'qwen', type: 'instruction' },
            { path: join(base, 'output-language.md'), slug: 'output-language', type: 'instruction', title: 'Output Language' },
          ])),
          ...(await lerArquivoConfiguracaoComRedacao(join(base, 'settings.json'), 'qwen-settings', 'Qwen Settings', 'setting')),
        ];
      }

      return lerArquivosEspecificos([
        {
          path: target.detectedPaths[0],
          slug: 'agents',
          type: 'instruction',
        },
      ]);
    },
    escrever: async (items, target) => escreverEstruturaQwen(items, target),
  };
}

function criarAdapterAider(): ClienteAdapter {
  return {
    id: 'aider',
    nome: 'Aider',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_PARTIAL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        if (!ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'aider')) {
          const encontrados = await filtrarExistentes([
            join(ctx.projectDir, '.aider.conf.yml'),
            join(ctx.projectDir, 'CONVENTIONS.md'),
          ]);

          if (encontrados.length > 0) {
            targets.push({
              clientId: 'aider',
              clientName: 'Aider',
              supportLevel: 'partial',
              scope: 'project',
              detectedPaths: encontrados,
              supportedTypes: TIPOS_PARTIAL,
              estimatedItemCount: encontrados.length,
            });
          }
        }
      }

      if (scope !== 'project') {
        const encontrados = await filtrarExistentes([
          join(ctx.userHome, '.aider.conf.yml'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'aider',
            clientName: 'Aider',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: encontrados,
            supportedTypes: ['mcp_config'],
            estimatedItemCount: encontrados.length,
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      if (target.scope === 'global') {
        return lerArquivosEspecificos([
          { path: join(homedir(), '.aider.conf.yml'), slug: 'aider-config', type: 'mcp_config', title: 'Aider Config' },
        ]);
      }

      const base = resolverRaizProjetoPorPath(target.detectedPaths[0]);
      return lerArquivosEspecificos([
        { path: join(base, 'CONVENTIONS.md'), slug: 'conventions', type: 'instruction', title: 'Conventions' },
        { path: join(base, '.aider.conf.yml'), slug: 'aider-config', type: 'mcp_config', title: 'Aider Config' },
      ]);
    },
    escrever: async (items, target) => escreverEstruturaAider(items, target),
  };
}

function criarAdapterAntigravity(): ClienteAdapter {
  return {
    id: 'antigravity',
    nome: 'Antigravity',
    nivelSuporte: 'experimental',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_PARTIAL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        if (!ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'antigravity')) {
          const caminhoProjeto = join(ctx.projectDir, '.antigravity');
          if (await existe(caminhoProjeto)) {
            targets.push({
              clientId: 'antigravity',
              clientName: 'Antigravity',
              supportLevel: 'experimental',
              scope: 'project',
              detectedPaths: [caminhoProjeto],
              supportedTypes: TIPOS_PARTIAL,
              estimatedItemCount: 1,
            });
          }
        }
      }

      if (scope !== 'project') {
        const caminhosGlobais = await filtrarExistentes([
          join(ctx.userHome, '.gemini', 'antigravity-cli', 'settings.json'),
          join(ctx.userHome, '.antigravity', 'argv.json'),
        ]);

        if (caminhosGlobais.length > 0) {
          targets.push({
            clientId: 'antigravity',
            clientName: 'Antigravity',
            supportLevel: 'experimental',
            scope: 'global',
            detectedPaths: caminhosGlobais,
            supportedTypes: ['setting'],
            estimatedItemCount: 1,
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      if (target.scope === 'global') {
        return lerArquivoConfiguracaoComRedacao(target.detectedPaths[0], 'antigravity-settings', 'Antigravity Settings', 'setting');
      }

      return lerArquivosEspecificos([{ path: target.detectedPaths[0], slug: 'antigravity', type: 'instruction' }]);
    },
    escrever: async (items, target) => escreverEstruturaAntigravity(items, target),
  };
}

function criarAdapterKimi(): ClienteAdapter {
  return {
    id: 'kimi',
    nome: 'Kimi Code',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_KIMI,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        if (!ehRaizGlobalCliente(ctx.projectDir, ctx.userHome, 'kimi')) {
          const base = join(ctx.projectDir, '.kimi-code');
          const encontrados = await filtrarExistentes([
            join(base, 'skills'),
            join(base, 'mcp.json'),
          ]);

          if (encontrados.length > 0) {
            targets.push({
              clientId: 'kimi',
              clientName: 'Kimi Code',
              supportLevel: 'partial',
              scope: 'project',
              detectedPaths: encontrados,
              supportedTypes: TIPOS_KIMI,
              estimatedItemCount: await contarSkillsKimi(join(base, 'skills'))
                + (await existe(join(base, 'mcp.json')) ? 1 : 0),
            });
          }
        }
      }

      if (scope !== 'project') {
        const base = join(ctx.userHome, '.kimi-code');
        const encontrados = await filtrarExistentes([
          join(base, 'skills'),
          join(base, 'mcp.json'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'kimi',
            clientName: 'Kimi Code',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_KIMI,
            estimatedItemCount: await contarSkillsKimi(join(base, 'skills'))
              + (await existe(join(base, 'mcp.json')) ? 1 : 0),
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      const base = target.scope === 'global'
        ? join(homedir(), '.kimi-code')
        : join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.kimi-code');

      return lerEstruturaKimi(base);
    },
    escrever: async (items, target) => escreverEstruturaKimi(items, target),
  };
}

async function lerEstruturaClaude(raizProjeto: string): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  const base = join(raizProjeto, '.claude');

  await lerMarkdownsDiretos(join(base, 'skills'), 'skill', itens, ['.md'], true, '', {
    categoriaRaiz: 'shared_materialized',
    categoriaAninhada: 'project',
  });
  await lerMarkdownsDiretos(join(base, 'agents'), 'agent', itens, ['.md'], true);
  await lerMarkdownsDiretos(join(base, 'memory'), 'memory', itens, ['.md'], true);
  await lerMarkdownsDiretos(join(base, 'snippets'), 'snippet', itens, ['.md'], true);
  await lerMarkdownsDiretos(join(base, 'hooks'), 'hook', itens, ['.md'], true);
  await lerPrimeiroArquivoInstrucao([
    { path: join(base, 'CLAUDE.md'), slug: 'claude' },
    { path: join(raizProjeto, 'CLAUDE.md'), slug: 'claude' },
  ], itens);
  await lerArquivosRules(base, itens);
  await lerPrimeiroArquivoConfig([
    { path: join(base, '.mcp.json'), slug: 'mcp-config', title: 'MCP Config' },
    { path: join(raizProjeto, '.mcp.json'), slug: 'mcp-config', title: 'MCP Config' },
  ], itens);

  return [...itens.values()];
}

async function lerEstruturaCodex(base: string, global = false): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  const codexDir = global ? base : join(base, '.codex');

  await lerArquivoInstrucao(join(codexDir, 'AGENTS.md'), 'agents', itens);
  if (global) {
    await lerArquivoConfiguracaoComRedacaoNoMapa(join(codexDir, 'config.toml'), 'codex-config', 'Codex Config', 'setting', itens);
  } else {
    await lerArquivoConfig(join(codexDir, '.mcp.json'), 'mcp-config', 'MCP Config', itens);
  }
  await lerSkillsCodex(join(codexDir, 'skills'), itens);

  if (!global) {
    await lerArquivoInstrucao(join(base, 'AGENTS.md'), 'agents', itens);
    await lerArquivoConfig(join(base, '.mcp.json'), 'mcp-config', 'MCP Config', itens);
  }

  return [...itens.values()];
}

async function lerEstruturaCursor(base: string): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  await lerMarkdownsDiretos(join(base, 'rules'), 'instruction', itens, ['.mdc', '.md']);
  await lerSkillsPorEstrutura(join(base, 'skills-cursor'), itens);
  await lerArquivoConfig(join(base, 'mcp.json'), 'cursor-mcp', 'Cursor MCP', itens);
  await lerArquivoConfiguracaoComRedacaoNoMapa(join(base, 'argv.json'), 'cursor-argv', 'Cursor Argv', 'setting', itens);
  return [...itens.values()];
}

async function lerEstruturaClaudeGlobal(base: string): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  await lerArquivoInstrucao(join(base, 'CLAUDE.md'), 'claude', itens);
  await lerArquivoInstrucao(join(base, 'GLOBAL_GUIDELINES.md'), 'global-guidelines', itens);
  await lerMarkdownsDiretos(join(base, 'agents'), 'agent', itens, ['.md'], true);
  await lerMarkdownsDiretos(join(base, 'commands'), 'command', itens, ['.md'], true);
  await lerMarkdownsDiretos(join(base, 'output-styles'), 'output_style', itens, ['.md'], true);
  await lerArquivoConfiguracaoComRedacaoNoMapa(join(base, 'settings.json'), 'claude-settings', 'Claude Settings', 'setting', itens);
  return [...itens.values()];
}

async function lerMarkdownsDiretos(
  diretorio: string,
  tipo: TipoSincronizavel,
  itens: Map<string, ItemSincronizavel>,
  extensoesPermitidas = ['.md'],
  recursivo = false,
  prefixoSlug = '',
  opcoes?: {
    categoriaRaiz?: string;
    categoriaAninhada?: string;
  },
): Promise<void> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorio);
  } catch {
    return;
  }

  for (const entrada of entradas) {
    const caminho = join(diretorio, entrada);
    if (recursivo && await ehDiretorio(caminho)) {
      if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
      const proximoPrefixo = prefixoSlug ? `${prefixoSlug}-${normalizarSlug(entrada)}` : normalizarSlug(entrada);
      await lerMarkdownsDiretos(caminho, tipo, itens, extensoesPermitidas, true, proximoPrefixo);
      continue;
    }

    if (!extensoesPermitidas.includes(extname(entrada))) continue;

    const conteudo = await readFile(caminho, 'utf-8');
    const { frontmatter, corpo } = parsearFrontmatter(conteudo);
    const slugBase = normalizarSlug(basename(entrada, extname(entrada)));
    const slug = prefixoSlug ? `${prefixoSlug}-${slugBase}` : slugBase;
    const titulo = typeof frontmatter.name === 'string' && frontmatter.name
      ? frontmatter.name
      : tituloDoSlug(slug);

    itens.set(`${tipo}:${slug}`, {
      type: tipo,
      title: titulo,
      slug,
      body: corpo || conteudo,
      metadata: {
        ...obterMetadataLeitura(prefixoSlug, opcoes),
        myinstSourcePath: caminho,
        myinstFileExtension: extname(entrada),
      },
      tags: [],
    });
  }
}

async function lerSkillsCodex(diretorioSkills: string, itens: Map<string, ItemSincronizavel>): Promise<void> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorioSkills);
  } catch {
    return;
  }

  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    const caminhoDireto = join(diretorioSkills, entrada, 'SKILL.md');

    if (await existe(caminhoDireto)) {
      await registrarSkillCodex(caminhoDireto, entrada, itens);
      continue;
    }

    const subentradas = await listarEntradas(join(diretorioSkills, entrada));
    for (const subentrada of subentradas) {
      if (DIRETORIOS_IGNORADOS.has(subentrada)) continue;
      await registrarSkillCodex(join(diretorioSkills, entrada, subentrada, 'SKILL.md'), subentrada, itens);
    }
  }
}

async function lerSkillsPorEstrutura(diretorioSkills: string, itens: Map<string, ItemSincronizavel>): Promise<void> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorioSkills);
  } catch {
    return;
  }

  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    await registrarSkillCodex(join(diretorioSkills, entrada, 'SKILL.md'), entrada, itens);
  }
}

async function registrarSkillCodex(caminho: string, slug: string, itens: Map<string, ItemSincronizavel>) {
  if (!(await existe(caminho))) return;

  const conteudo = await readFile(caminho, 'utf-8');
  const { frontmatter, corpo } = parsearFrontmatter(conteudo);
  const titulo = typeof frontmatter.name === 'string' && frontmatter.name
    ? frontmatter.name
    : tituloDoSlug(slug);

  itens.set(`skill:${slug}`, {
    type: 'skill',
    title: titulo,
    slug: normalizarSlug(slug),
    body: corpo || conteudo,
    metadata: {
      myinstSourcePath: caminho,
      myinstFileExtension: extname(caminho),
    },
    tags: [],
  });
}

async function lerArquivoInstrucao(caminhoArquivo: string, slug: string, itens: Map<string, ItemSincronizavel>) {
  if (!(await existe(caminhoArquivo))) return;

  const conteudo = await readFile(caminhoArquivo, 'utf-8');
  itens.set(`instruction:${slug}`, {
    type: 'instruction',
    title: tituloDoSlug(slug),
    slug,
    body: conteudo,
    metadata: {
      myinstSourcePath: caminhoArquivo,
      myinstFileExtension: extname(caminhoArquivo),
    },
    tags: [],
  });
}

async function lerPrimeiroArquivoInstrucao(
  definicoes: Array<{ path: string; slug: string }>,
  itens: Map<string, ItemSincronizavel>,
) {
  for (const definicao of definicoes) {
    if (!(await existe(definicao.path))) continue;
    await lerArquivoInstrucao(definicao.path, definicao.slug, itens);
    return;
  }
}

async function lerArquivoConfig(
  caminhoArquivo: string,
  slug: string,
  title: string,
  itens: Map<string, ItemSincronizavel>,
) {
  if (!(await existe(caminhoArquivo))) return;

  const conteudo = await readFile(caminhoArquivo, 'utf-8');
  const redacao = redigirSegredos(caminhoArquivo, conteudo);
  itens.set(`mcp_config:${slug}`, {
    type: 'mcp_config',
    title,
    slug,
    body: redacao.body,
    metadata: {
      myinstSourcePath: redacao.sourcePath,
      myinstFileExtension: redacao.fileExtension,
      ...(redacao.requiresLocalSecrets ? { myinstRequiresLocalSecrets: true } : {}),
      ...(redacao.redactedKeys.length > 0 ? { myinstRedactedSecrets: redacao.redactedKeys } : {}),
    },
    tags: [],
  });
}

async function lerArquivoConfiguracaoComRedacao(
  caminhoArquivo: string,
  slug: string,
  title: string,
  type: 'setting' | 'mcp_config',
): Promise<ItemSincronizavel[]> {
  if (!(await existe(caminhoArquivo))) return [];

  const conteudo = await readFile(caminhoArquivo, 'utf-8');
  const redacao = redigirSegredos(caminhoArquivo, conteudo);

  return [{
    type,
    title,
    slug,
    body: redacao.body,
    metadata: {
      myinstSourcePath: redacao.sourcePath,
      myinstFileExtension: redacao.fileExtension,
      ...(redacao.requiresLocalSecrets ? { myinstRequiresLocalSecrets: true } : {}),
      ...(redacao.redactedKeys.length > 0 ? { myinstRedactedSecrets: redacao.redactedKeys } : {}),
    },
    tags: [],
  }];
}

async function lerArquivoConfiguracaoComRedacaoNoMapa(
  caminhoArquivo: string,
  slug: string,
  title: string,
  type: 'setting' | 'mcp_config',
  itens: Map<string, ItemSincronizavel>,
) {
  const encontrados = await lerArquivoConfiguracaoComRedacao(caminhoArquivo, slug, title, type);
  for (const item of encontrados) {
    itens.set(`${item.type}:${item.slug}`, item);
  }
}

async function lerPrimeiroArquivoConfig(
  definicoes: Array<{ path: string; slug: string; title: string }>,
  itens: Map<string, ItemSincronizavel>,
) {
  for (const definicao of definicoes) {
    if (!(await existe(definicao.path))) continue;
    await lerArquivoConfig(definicao.path, definicao.slug, definicao.title, itens);
    return;
  }
}

async function lerArquivosRules(diretorio: string, itens: Map<string, ItemSincronizavel>) {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorio);
  } catch {
    return;
  }

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith('.rules.md')) continue;
    const conteudo = await readFile(join(diretorio, arquivo), 'utf-8');
    const slug = normalizarSlug(basename(arquivo, '.md'));
    itens.set(`instruction:${slug}`, {
      type: 'instruction',
      title: tituloDoSlug(slug),
      slug,
      body: conteudo,
      metadata: {
        myinstSourcePath: join(diretorio, arquivo),
        myinstFileExtension: extname(arquivo),
      },
      tags: [],
    });
  }
}

async function lerArquivosEspecificos(definicoes: Array<{ path: string; slug: string; type: TipoSincronizavel; title?: string }>) {
  const itens: ItemSincronizavel[] = [];

  for (const definicao of definicoes) {
    if (!(await existe(definicao.path))) continue;
    const conteudo = await readFile(definicao.path, 'utf-8');
    itens.push({
      type: definicao.type,
      title: definicao.title ?? tituloDoSlug(definicao.slug),
      slug: definicao.slug,
      body: conteudo,
      metadata: {
        myinstSourcePath: definicao.path,
        myinstFileExtension: extname(definicao.path),
      },
      tags: [],
    });
  }

  return itens;
}

async function escreverEstruturaClaude(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  if (target.scope === 'global') {
    return escreverEstruturaClaudeGlobal(items, target);
  }

  const base = join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.claude');

  return escreverComRegras(items, target, {
    skill: { dir: join(base, 'skills'), ext: '.md' },
    instruction: { file: join(base, 'CLAUDE.md') },
    mcp_config: { file: join(base, '.mcp.json') },
    agent: { dir: join(base, 'agents'), ext: '.md' },
    command: { dir: join(base, 'commands'), ext: '.md' },
    hook: { dir: join(base, 'hooks'), ext: '.md' },
    memory: { dir: join(base, 'memory'), ext: '.md' },
    output_style: { dir: join(base, 'output-styles'), ext: '.md' },
    setting: { file: join(base, 'settings.json') },
    snippet: { dir: join(base, 'snippets'), ext: '.md' },
  });
}

async function escreverEstruturaClaudeGlobal(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = join(homedir(), '.claude');
  const written: EscritaCliente['written'] = [];
  const ignored: EscritaCliente['ignored'] = [];

  for (const item of items) {
    const caminho = resolverCaminhoClaudeGlobal(base, item);
    if (!caminho) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'tipo sem suporte nativo neste cliente' });
      continue;
    }

    await escreverArquivoNativo(caminho, item, written, ignored);
  }

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    scope: target.scope,
    written,
    ignored,
  };
}

async function escreverEstruturaCodex(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.codex');

  const written: EscritaCliente['written'] = [];
  const ignored: EscritaCliente['ignored'] = [];

  for (const item of items) {
    if (item.type === 'skill') {
      const namespace = resolverNamespaceCodex(item);
      const caminho = join(base, 'skills', namespace, item.slug, 'SKILL.md');
      const conteudo = montarSkillCodex(item);
      validarSkillCodex(conteudo, item.slug);
      await mkdir(dirname(caminho), { recursive: true });
      await writeFile(caminho, conteudo, 'utf-8');
      written.push({ path: caminho, type: item.type, slug: item.slug });
      continue;
    }

    const caminho = resolverCaminhoCodex(base, target.scope, item);
    if (!caminho) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'tipo sem suporte nativo neste cliente' });
      continue;
    }

    await escreverArquivoNativo(caminho, item, written, ignored);
  }

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    scope: target.scope,
    written,
    ignored,
  };
}

function resolverCaminhoCodex(base: string, scope: 'project' | 'global', item: ItemSincronizavel): string | null {
  switch (item.type) {
    case 'instruction':
      return join(base, 'AGENTS.md');
    case 'mcp_config':
      return scope === 'global' ? join(base, 'config.toml') : join(base, '.mcp.json');
    case 'setting':
      return scope === 'global' ? join(base, 'config.toml') : null;
    default:
      return null;
  }
}

function resolverNamespaceCodex(item: ItemSincronizavel): string {
  const candidatos = [
    item.metadata.myinstSourceNamespace,
    item.metadata.myinstSourceCategory,
    item.metadata.sourceClient,
    item.metadata.myinstClientId,
  ];

  const namespace = candidatos.find((valor): valor is string => typeof valor === 'string' && valor.trim().length > 0);
  return normalizarSlug(namespace ?? 'myinst') || 'myinst';
}

function montarSkillCodex(item: ItemSincronizavel): string {
  const { frontmatter, corpo } = parsearFrontmatter(item.body);
  const name = limparValorYaml(frontmatter.name) || item.title || tituloDoSlug(item.slug);
  const description = limparValorYaml(frontmatter.description)
    || lerStringMetadata(item.metadata, 'description')
    || item.title
    || tituloDoSlug(item.slug);
  const corpoFinal = corpo || item.body;

  return [
    '---',
    `name: "${escaparYaml(name)}"`,
    `description: "${escaparYaml(description)}"`,
    '---',
    '',
    corpoFinal.trim(),
    '',
  ].join('\n');
}

function validarSkillCodex(conteudo: string, slug: string): void {
  if (!conteudo.startsWith('---\n')) {
    throw new Error(`Skill Codex inválida (${slug}): frontmatter YAML ausente`);
  }

  const { frontmatter } = parsearFrontmatter(conteudo);
  if (!limparValorYaml(frontmatter.name) || !limparValorYaml(frontmatter.description)) {
    throw new Error(`Skill Codex inválida (${slug}): name e description são obrigatórios`);
  }
}

function lerStringMetadata(metadata: Record<string, unknown>, chave: string): string | null {
  const valor = metadata[chave];
  return typeof valor === 'string' && valor.trim() ? valor : null;
}

function limparValorYaml(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().replace(/^["']|["']$/g, '');
  return limpo || null;
}

function escaparYaml(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function escreverEstruturaCursor(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? join(homedir(), '.cursor')
    : join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.cursor');
  return escreverComRegras(items, target, {
    skill: { dir: join(base, 'skills-cursor'), ext: '/SKILL.md' },
    instruction: { dir: join(base, 'rules'), ext: '.mdc' },
    mcp_config: { file: join(base, 'mcp.json') },
    setting: { file: join(base, 'argv.json') },
  });
}

async function escreverEstruturaOpenCode(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const raizProjeto = resolverRaizProjetoPorPath(target.detectedPaths[0]);
  const base = target.scope === 'global'
    ? join(homedir(), '.config', 'opencode')
    : join(raizProjeto, '.opencode');
  const written: EscritaCliente['written'] = [];
  const ignored: EscritaCliente['ignored'] = [];

  const regras: Partial<Record<TipoSincronizavel, { file?: string; dir?: string; ext?: string } | undefined>> = {
    skill: { dir: join(base, 'skills'), ext: '/SKILL.md' },
    agent: { dir: join(base, 'agents'), ext: '/SKILL.md' },
    command: { dir: join(base, 'commands'), ext: '/SKILL.md' },
    output_style: { dir: join(base, 'output-styles'), ext: '/SKILL.md' },
    instruction: { file: join(base, 'AGENTS.md') },
  };

  const instrucoes = items.filter((item) => item.type === 'instruction');
  if (instrucoes.length > 0) {
    const caminhoInstrucoes = join(base, 'AGENTS.md');
    await mkdir(dirname(caminhoInstrucoes), { recursive: true });
    await writeFile(caminhoInstrucoes, combinarInstrucoesOpenCode(instrucoes), 'utf-8');
    for (const item of instrucoes) {
      written.push({ path: caminhoInstrucoes, type: item.type, slug: item.slug });
    }
  }

  const configs = items.filter((item) => item.type === 'setting' || item.type === 'mcp_config');
  if (configs.length > 0) {
    const caminhoConfig = join(base, 'opencode.jsonc');
    const configPrincipal = escolherConfigPrincipalOpenCode(configs);
    await escreverArquivoNativo(caminhoConfig, configPrincipal, written, ignored);
    for (const item of configs) {
      if (item.slug === configPrincipal.slug && item.type === configPrincipal.type) continue;
      ignored.push({ type: item.type, slug: item.slug, reason: 'opencode.jsonc já foi reservado por um item de maior precedência' });
    }
  }

  for (const item of items) {
    if (item.type === 'instruction' || item.type === 'setting' || item.type === 'mcp_config') continue;
    const regra = regras[item.type];
    if (!regra || !regra.dir || !regra.ext) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'tipo sem suporte nativo neste cliente' });
      continue;
    }
    const caminho = regra.ext.startsWith('/')
      ? join(regra.dir, item.slug, regra.ext.slice(1))
      : join(regra.dir, `${item.slug}${regra.ext}`);
    if (written.some((w) => w.path === caminho)) continue;
    await escreverArquivoNativo(caminho, item, written, ignored);
  }

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    scope: target.scope,
    written,
    ignored,
  };
}

async function escreverEstruturaAider(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? homedir()
    : resolverRaizProjetoPorPath(target.detectedPaths[0]);
  return escreverComRegras(items, target, {
    instruction: target.scope === 'global' ? undefined : { file: join(base, 'CONVENTIONS.md') },
    mcp_config: { file: target.scope === 'global' ? join(base, '.aider.conf.yml') : join(base, '.aider.conf.yml') },
  });
}

async function escreverEstruturaAntigravity(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? join(homedir(), '.antigravity')
    : resolverRaizProjetoPorPath(target.detectedPaths[0]);
  return escreverComRegras(items, target, {
    instruction: target.scope === 'global' ? undefined : { file: join(base, '.antigravity') },
    mcp_config: target.scope === 'global' ? undefined : { file: join(base, '.antigravity') },
    setting: target.scope === 'global' ? { file: join(base, 'argv.json') } : undefined,
  });
}

async function lerEstruturaKimi(base: string): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  await lerSkillsKimi(join(base, 'skills'), itens);
  await lerArquivoConfig(join(base, 'mcp.json'), 'mcp-config', 'MCP Config', itens);
  return [...itens.values()];
}

async function lerSkillsKimi(diretorioSkills: string, itens: Map<string, ItemSincronizavel>): Promise<void> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorioSkills);
  } catch {
    return;
  }

  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    const caminho = join(diretorioSkills, entrada);

    if (await ehDiretorio(caminho)) {
      const caminhoSkill = join(caminho, 'SKILL.md');
      if (await existe(caminhoSkill)) {
        await registrarSkillKimi(caminhoSkill, entrada, itens);
      }
      continue;
    }

    if (entrada.endsWith('.md')) {
      await registrarSkillKimi(caminho, basename(entrada, '.md'), itens);
    }
  }
}

async function registrarSkillKimi(caminho: string, slug: string, itens: Map<string, ItemSincronizavel>): Promise<void> {
  const conteudo = await readFile(caminho, 'utf-8');
  const { frontmatter, corpo } = parsearFrontmatter(conteudo);
  const titulo = typeof frontmatter.name === 'string' && frontmatter.name
    ? frontmatter.name
    : tituloDoSlug(slug);

  itens.set(`skill:${normalizarSlug(slug)}`, {
    type: 'skill',
    title: titulo,
    slug: normalizarSlug(slug),
    body: corpo || conteudo,
    metadata: {
      myinstSourcePath: caminho,
      myinstFileExtension: extname(caminho),
    },
    tags: [],
  });
}

async function contarSkillsKimi(diretorioSkills: string): Promise<number> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorioSkills);
  } catch {
    return 0;
  }

  let total = 0;
  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    const caminho = join(diretorioSkills, entrada);

    if (await ehDiretorio(caminho)) {
      if (await existe(join(caminho, 'SKILL.md'))) total++;
      continue;
    }

    if (entrada.endsWith('.md')) total++;
  }

  return total;
}

async function escreverEstruturaKimi(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? join(homedir(), '.kimi-code')
    : join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.kimi-code');

  return escreverComRegras(items, target, {
    skill: { dir: join(base, 'skills'), ext: '/SKILL.md' },
    mcp_config: { file: join(base, 'mcp.json') },
  });
}

async function escreverEstruturaGemini(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? (process.env.GEMINI_CLI_HOME ? resolve(process.env.GEMINI_CLI_HOME) : join(homedir(), '.gemini'))
    : resolverRaizProjetoPorPath(target.detectedPaths[0]);

  return escreverComRegras(items, target, {
    instruction: { file: join(base, 'GEMINI.md') },
    mcp_config: { file: join(base, 'antigravity', 'mcp_config.json') },
  });
}

async function escreverEstruturaQwen(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? join(homedir(), '.qwen')
    : join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.qwen');

  if (target.scope !== 'global') {
    return escreverComRegras(items, target, {
      instruction: { file: join(base, 'AGENTS.md') },
    });
  }

  const written: EscritaCliente['written'] = [];
  const ignored: EscritaCliente['ignored'] = [];

  for (const item of items) {
    const caminho = resolverCaminhoQwenGlobal(base, item);
    if (!caminho) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'tipo sem suporte nativo neste cliente' });
      continue;
    }

    await escreverArquivoNativo(caminho, item, written, ignored);
  }

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    scope: target.scope,
    written,
    ignored,
  };
}

async function escreverArquivoUnico(
  items: ItemSincronizavel[],
  target: SyncTarget,
  type: TipoSincronizavel,
  resolver: (target: SyncTarget) => string,
): Promise<EscritaCliente> {
  const caminho = resolver(target);
  return escreverComRegras(items, target, {
    [type]: { file: caminho },
  } as Partial<Record<TipoSincronizavel, { file?: string; dir?: string; ext?: string }>>);
}

function obterCaminhoGemini(target: SyncTarget) {
  if (target.scope === 'global') {
    const base = process.env.GEMINI_CLI_HOME ? resolve(process.env.GEMINI_CLI_HOME) : join(homedir(), '.gemini');
    return join(base, 'GEMINI.md');
  }

  return join(resolverRaizProjetoPorPath(target.detectedPaths[0]), 'GEMINI.md');
}

async function escreverComRegras(
  items: ItemSincronizavel[],
  target: SyncTarget,
  regras: Partial<Record<TipoSincronizavel, { file?: string; dir?: string; ext?: string } | undefined>>,
): Promise<EscritaCliente> {
  const written: EscritaCliente['written'] = [];
  const ignored: EscritaCliente['ignored'] = [];

  for (const item of items) {
    const regra = regras[item.type];
    if (!regra) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'tipo sem suporte nativo neste cliente' });
      continue;
    }

    if (regra.file) {
      await escreverArquivoNativo(regra.file, item, written, ignored);
      continue;
    }

    if (!regra.dir || !regra.ext) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'regra de escrita incompleta' });
      continue;
    }

    const caminho = regra.ext.startsWith('/')
      ? join(regra.dir, item.slug, regra.ext.slice(1))
      : join(regra.dir, `${item.slug}${regra.ext}`);

    await escreverArquivoNativo(caminho, item, written, ignored);
  }

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    scope: target.scope,
    written,
    ignored,
  };
}

async function escreverArquivoNativo(
  caminho: string,
  item: ItemSincronizavel,
  written: EscritaCliente['written'],
  ignored: EscritaCliente['ignored'],
  conteudo = item.body,
): Promise<void> {
  if (ehConfiguracaoLocalProtegida(item) && await existe(caminho)) {
    ignored.push({
      type: item.type,
      slug: item.slug,
      reason: 'configuração local existente preservada',
    });
    return;
  }

  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, conteudo, 'utf-8');
  written.push({ path: caminho, type: item.type, slug: item.slug });
}

function ehConfiguracaoLocalProtegida(item: ItemSincronizavel): boolean {
  return item.type === 'setting' || item.type === 'mcp_config';
}

function resolverBaseOculta(target: SyncTarget, dir: string) {
  if (target.scope === 'global') {
    return join(homedir(), dir, 'rules');
  }

  return join(resolverRaizProjetoPorPath(target.detectedPaths[0]), dir, 'rules');
}

function ehRaizGlobalCliente(projectDir: string, userHome: string, clientId: string) {
  const raizProjeto = normalizarPath(projectDir);
  const raizesGlobais = obterRaizesGlobaisCliente(userHome, clientId);

  return raizesGlobais.some((raizGlobal) => raizProjeto === normalizarPath(raizGlobal));
}

function obterRaizesGlobaisCliente(userHome: string, clientId: string) {
  const geminiHome = process.env.GEMINI_CLI_HOME ? resolve(process.env.GEMINI_CLI_HOME) : join(userHome, '.gemini');

  switch (clientId) {
    case 'claude':
      return [join(userHome, '.claude')];
    case 'codex':
      return [join(userHome, '.codex')];
    case 'cursor':
      return [join(userHome, '.cursor')];
    case 'gemini':
      return [geminiHome];
    case 'opencode':
      return [join(userHome, '.config', 'opencode')];
    case 'qwen':
      return [join(userHome, '.qwen')];
    case 'aider':
      return [userHome];
    case 'antigravity':
      return [join(userHome, '.gemini', 'antigravity-cli'), join(userHome, '.antigravity')];
    case 'kimi':
      return [join(userHome, '.kimi-code')];
    default:
      return [];
  }
}

function normalizarPath(path: string) {
  return resolve(path)
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function resolverRaizProjetoPorPath(path: string) {
  if (!path) return process.cwd();

  const normalizado = resolve(path);
  const marcadores = ['.claude', '.codex', '.cursor', '.qwen', '.opencode', '.kimi-code'];
  const marcador = marcadores.find((entry) => normalizado.includes(`${entry}\\`) || normalizado.includes(`${entry}/`));

  if (!marcador) {
    return dirname(normalizado);
  }

  const indiceMarcador = normalizado.indexOf(marcador);
  if (indiceMarcador <= 0) {
    return dirname(normalizado);
  }

  const prefixo = normalizado.slice(0, indiceMarcador);
  return prefixo.endsWith('\\') || prefixo.endsWith('/')
    ? prefixo.slice(0, -1)
    : prefixo;
}

async function filtrarExistentes(paths: string[]) {
  const encontrados: string[] = [];

  for (const path of paths) {
    if (await existe(path)) {
      encontrados.push(path);
    }
  }

  return encontrados;
}

async function contarArquivosMarkdown(dir: string) {
  return contarArquivosPorExtensao(dir, ['.md']);
}

async function contarArquivosMarkdownRecursivo(dir: string): Promise<number> {
  let entradas: string[];
  try {
    entradas = await readdir(dir);
  } catch {
    return 0;
  }

  let total = 0;
  for (const entrada of entradas) {
    const caminho = join(dir, entrada);
    if (await ehDiretorio(caminho)) {
      if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
      total += await contarArquivosMarkdownRecursivo(caminho);
      continue;
    }

    if (extname(entrada) === '.md') {
      total += 1;
    }
  }

  return total;
}

async function contarArquivosPorExtensao(dir: string, extensoes: string[]) {
  let arquivos: string[];
  try {
    arquivos = await readdir(dir);
  } catch {
    return 0;
  }

  return arquivos.filter((arquivo) => extensoes.includes(extname(arquivo))).length;
}

async function contarSkillsCodex(dir: string) {
  let entradas: string[];
  try {
    entradas = await readdir(dir);
  } catch {
    return 0;
  }

  let total = 0;
  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    if (await existe(join(dir, entrada, 'SKILL.md'))) {
      total += 1;
      continue;
    }

    const subentradas = await listarEntradas(join(dir, entrada));
    total += subentradas.filter((subentrada) => !DIRETORIOS_IGNORADOS.has(subentrada)).length;
  }

  return total;
}

async function contarArquivosSkillPorEstrutura(dir: string) {
  let entradas: string[];
  try {
    entradas = await readdir(dir);
  } catch {
    return 0;
  }

  let total = 0;
  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    if (await existe(join(dir, entrada, 'SKILL.md'))) {
      total += 1;
    }
  }

  return total;
}

async function listarEntradas(diretorio: string): Promise<string[]> {
  try {
    return await readdir(diretorio);
  } catch {
    return [];
  }
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await access(caminho, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ehDiretorio(caminho: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises');
    return (await stat(caminho)).isDirectory();
  } catch {
    return false;
  }
}

function parsearFrontmatter(conteudo: string): { frontmatter: Record<string, unknown>; corpo: string } {
  if (!conteudo.startsWith('---')) {
    return { frontmatter: {}, corpo: conteudo };
  }

  const fimMarcador = conteudo.indexOf('---', 3);
  if (fimMarcador === -1) {
    return { frontmatter: {}, corpo: conteudo };
  }

  const blocoYaml = conteudo.slice(3, fimMarcador).trim();
  const corpo = conteudo.slice(fimMarcador + 3).trim();
  const frontmatter: Record<string, unknown> = {};

  for (const linha of blocoYaml.split('\n')) {
    const separador = linha.indexOf(':');
    if (separador === -1) continue;

    frontmatter[linha.slice(0, separador).trim()] = linha.slice(separador + 1).trim();
  }

  return { frontmatter, corpo };
}

function tituloDoSlug(slug: string): string {
  return slug
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

function normalizarSlug(valor: string) {
  return valor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function obterMetadataLeitura(
  prefixoSlug: string,
  opcoes?: {
    categoriaRaiz?: string;
    categoriaAninhada?: string;
  },
) {
  const categoria = prefixoSlug
    ? opcoes?.categoriaAninhada
    : opcoes?.categoriaRaiz;

  if (!categoria) {
    return {};
  }

  return {
    myinstSourceCategory: categoria,
  };
}

function combinarInstrucoesOpenCode(instrucoes: ItemSincronizavel[]) {
  if (instrucoes.length === 1) {
    return instrucoes[0].body;
  }

  return [
    '<!-- myinst-managed: true -->',
    '# MyInst OpenCode Instructions',
    '',
    'Arquivo gerado pelo MyInst a partir de multiplas instrucoes compativeis.',
    '',
    ...instrucoes.flatMap((item, indice) => [
      `## ${item.title}`,
      '',
      item.body.trim(),
      ...(indice === instrucoes.length - 1 ? [] : ['', '---', '']),
    ]),
    '',
  ].join('\n');
}

function escolherConfigPrincipalOpenCode(configs: ItemSincronizavel[]) {
  return configs.find((item) => item.type === 'setting') ?? configs[0];
}

function resolverCaminhoClaudeGlobal(base: string, item: ItemSincronizavel) {
  switch (item.type) {
    case 'instruction':
      if (item.slug === 'global-guidelines') {
        return join(base, 'GLOBAL_GUIDELINES.md');
      }

      return join(base, 'CLAUDE.md');
    case 'agent':
      return join(base, 'agents', `${item.slug}.md`);
    case 'command':
      return join(base, 'commands', `${item.slug}.md`);
    case 'output_style':
      return join(base, 'output-styles', `${item.slug}.md`);
    case 'setting':
      return join(base, 'settings.json');
    default:
      return null;
  }
}

function resolverCaminhoQwenGlobal(base: string, item: ItemSincronizavel) {
  switch (item.type) {
    case 'instruction':
      if (item.slug === 'output-language') {
        return join(base, 'output-language.md');
      }

      return join(base, 'QWEN.md');
    case 'setting':
      return join(base, 'settings.json');
    default:
      return null;
  }
}

function redigirSegredos(caminhoArquivo: string, conteudo: string) {
  const fileExtension = extname(caminhoArquivo);
  const sourcePath = caminhoArquivo;
  const redacao = redigirSegredosEmTexto(conteudo);

  return {
    body: redacao.texto,
    requiresLocalSecrets: redacao.possuiSegredos,
    redactedKeys: redacao.chavesRedigidas,
    fileExtension,
    sourcePath,
  };
}
