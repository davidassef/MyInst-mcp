import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { detectarSegredoProvavelEmTexto, redigirSegredosEmTexto } from '@myinst/shared/security';
import { carregarConfig, type MyInstConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

type ChatRole = 'user' | 'assistant' | 'system' | 'tool';
type ChatImportInclude = 'history' | 'cache';

interface ChatMessageInput {
  role: ChatRole;
  content: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface ChatArquivo {
  client: string;
  externalSessionId: string;
  title: string;
  summary?: string;
  startedAt?: string;
  updatedAt?: string;
  retentionUntil?: string;
  metadata: Record<string, unknown>;
  messages: ChatMessageInput[];
}

interface ChatArquivoOptions {
  client: string;
  session: string;
}

interface ChatPushOptions extends ChatArquivoOptions {
  workspace?: string;
  project?: string;
  file: string;
}

interface ChatImportOptions {
  workspace?: string;
  project?: string;
  client: string;
  include: string;
  path: string;
  reviewed?: boolean;
  dryRun?: boolean;
}

export interface ChatImportPlanOptions {
  client: string;
  include: ChatImportInclude[];
  sourcePath: string;
}

export interface ChatImportPlan {
  client: string;
  include: ChatImportInclude[];
  sourcePath: string;
  sessions: ChatArquivo[];
  warnings: string[];
}

interface ChatListOptions {
  workspace?: string;
  project?: string;
  client?: string;
  q?: string;
  tag?: string;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
}

interface ChatShowOptions {
  workspace?: string;
  project?: string;
  messageLimit?: string;
  messageOffset?: string;
}

interface ChatExportOptions extends ChatShowOptions {
  format?: 'markdown';
}

export async function executarChatPush(options: ChatPushOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';
  const chat = await carregarChatDeArquivo(options.file, options);

  const json = await enviarChat(config, workspace, project, chat);
  console.log(`${VERDE}[SUCCESS] Chat salvo:${RESET} ${json.data.client}/${json.data.externalSessionId}`);
}

export async function executarChatImport(options: ChatImportOptions): Promise<void> {
  try {
    if (!options.dryRun && !options.reviewed) {
      throw new Error('Importação de histórico/cache exige --reviewed ou --dry-run.');
    }

    const workspace = options.workspace || 'default';
    const project = options.project || 'default';
    const include = normalizarIncludes(options.include);
    const plano = await planejarImportacaoChatClient({
      client: options.client,
      include,
      sourcePath: options.path,
    });

    console.log(`${VERDE}[SUCCESS] Plano de importação:${RESET} ${plano.sessions.length} sessão(ões) encontradas`);

    for (const aviso of plano.warnings) {
      console.log(`${AMARELO}[WARN] ${aviso}${RESET}`);
    }

    if (options.dryRun) {
      for (const session of plano.sessions) {
        console.log(`${CINZA}${session.client}/${session.externalSessionId} ${session.messages.length} msg - ${session.title}${RESET}`);
      }

      return;
    }

    const config = carregarConfigObrigatoria();
    for (const session of plano.sessions) {
      const json = await enviarChat(config, workspace, project, session);
      console.log(`${VERDE}[SUCCESS] Chat salvo:${RESET} ${json.data.client}/${json.data.externalSessionId}`);
    }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha ao importar chats.';
    console.error(`${VERMELHO}[ERROR] ${mensagem}${RESET}`);
    process.exit(1);
  }
}

export async function executarChatList(options: ChatListOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';
  const params = new URLSearchParams();

  if (options.client) params.set('client', options.client);
  if (options.q) params.set('q', options.q);
  if (options.tag) params.set('tag', options.tag);
  if (options.from) params.set('from', options.from);
  if (options.to) params.set('to', options.to);
  if (options.limit) params.set('limit', options.limit);
  if (options.offset) params.set('offset', options.offset);

  const resposta = await fetch(`${endpointChats(config, workspace, project)}?${params.toString()}`, {
    headers: headersJson(config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  const chats = (json.data ?? []) as Array<{ client: string; externalSessionId: string; title: string; messageCount: number }>;

  if (chats.length === 0) {
    console.log(`${AMARELO}[WARN] Nenhum chat encontrado em ${workspace}/${project}${RESET}`);
    return;
  }

  for (const chat of chats) {
    console.log(`${VERDE}${chat.client}${RESET} ${chat.title} ${CINZA}${chat.externalSessionId} (${chat.messageCount} msg)${RESET}`);
  }
}

export async function executarChatShow(sessionId: string, options: ChatShowOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';
  const params = new URLSearchParams();

  if (options.messageLimit) params.set('messageLimit', options.messageLimit);
  if (options.messageOffset) params.set('messageOffset', options.messageOffset);

  const query = params.toString() ? `?${params}` : '';
  const resposta = await fetch(`${endpointChat(config, workspace, project, sessionId)}${query}`, {
    headers: headersJson(config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  const chat = json.data as {
    title: string;
    client: string;
    externalSessionId: string;
    messageCount: number;
    messageLimit?: number;
    messageOffset?: number;
    messages: ChatMessageInput[];
  };

  const offset = chat.messageOffset ?? 0;
  const ate = offset + chat.messages.length;
  console.log(`${VERDE}${chat.title}${RESET} ${CINZA}${chat.client}/${chat.externalSessionId} (${ate}/${chat.messageCount} msg)${RESET}`);
  for (const mensagem of chat.messages) {
    console.log(`\n${CINZA}[${mensagem.role}]${RESET}\n${mensagem.content}`);
  }
}

export async function executarChatExport(sessionId: string, options: ChatExportOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';
  const format = options.format || 'markdown';

  const resposta = await fetch(`${endpointChat(config, workspace, project, sessionId)}/export?format=${format}`, {
    headers: headersJson(config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const markdown = await resposta.text();
  const caminho = await materializarChatMarkdown(process.cwd(), sessionId, markdown);
  console.log(`${VERDE}[SUCCESS] Chat exportado:${RESET} ${caminho}`);
}

export async function executarChatSummarize(sessionId: string, options: ChatShowOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';

  const resposta = await fetch(`${endpointChat(config, workspace, project, sessionId)}/summarize`, {
    method: 'POST',
    headers: headersJson(config),
    body: JSON.stringify({}),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  console.log(`${VERDE}[SUCCESS] Resumo atualizado:${RESET} ${json.data.summary ?? ''}`);
}

export async function executarChatDelete(sessionId: string, options: ChatShowOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';

  const resposta = await fetch(endpointChat(config, workspace, project, sessionId), {
    method: 'DELETE',
    headers: headersJson(config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  console.log(`${VERDE}[SUCCESS] Chat removido:${RESET} ${sessionId}`);
}

export async function carregarChatDeArquivo(caminho: string, options: ChatArquivoOptions): Promise<ChatArquivo> {
  const conteudo = await readFile(caminho, 'utf-8');
  const extensao = extname(caminho).toLowerCase();

  if (extensao === '.json') {
    return normalizarChatJson(JSON.parse(conteudo) as Record<string, unknown>, options);
  }

  return {
    client: options.client,
    externalSessionId: options.session,
    title: extrairTituloMarkdown(conteudo) || options.session,
    metadata: { sourceFile: caminho },
    messages: [{ role: 'user', content: conteudo }],
  };
}

export async function planejarImportacaoChatClient(options: ChatImportPlanOptions): Promise<ChatImportPlan> {
  const include = [...new Set(options.include)];

  if (include.includes('cache')) {
    throw new Error('A categoria cache ainda não possui persistência segura por client nesta versão.');
  }

  if (!include.includes('history')) {
    throw new Error('Informe pelo menos uma categoria suportada: history.');
  }

  if (options.client !== 'codex') {
    throw new Error(`Histórico do client ${options.client} ainda não possui adapter de importação dedicado.`);
  }

  const sourcePath = resolve(options.sourcePath);
  const sessions = await carregarHistoricoCodex(sourcePath);

  return {
    client: options.client,
    include,
    sourcePath,
    sessions,
    warnings: sessions.length === 0
      ? ['Nenhum arquivo .jsonl de histórico Codex com mensagens foi encontrado no caminho informado.']
      : [],
  };
}

export async function materializarChatMarkdown(targetDir: string, sessionId: string, markdown: string): Promise<string> {
  const dir = join(targetDir, '.myinst', 'chats');
  await mkdir(dir, { recursive: true });

  const caminho = join(dir, `${normalizarNomeArquivo(sessionId)}.md`);
  await writeFile(caminho, markdown, 'utf-8');
  return caminho;
}

async function carregarHistoricoCodex(sourcePath: string): Promise<ChatArquivo[]> {
  const caminhos = await listarArquivosJsonl(sourcePath);
  const sessions: ChatArquivo[] = [];

  for (const caminho of caminhos) {
    const session = await carregarSessaoCodexJsonl(caminho);
    if (!session) continue;

    sessions.push(session);
  }

  return sessions;
}

async function carregarSessaoCodexJsonl(caminho: string): Promise<ChatArquivo | null> {
  const conteudo = await readFile(caminho, 'utf-8');
  const messages: ChatMessageInput[] = [];
  let sourceCwd: string | undefined;
  let conversaIniciada = false;
  let ultimoTimestampMensagem: number | null = null;

  for (const linha of conteudo.split(/\r?\n/)) {
    if (!linha.trim()) continue;

    const registro = parseJsonlRecord(linha);
    if (!registro) continue;

    const cwd = extrairCwdCodex(registro);
    if (cwd) {
      sourceCwd = cwd;
    }

    const message = extrairMensagemCodex(registro);
    if (!message) continue;
    if (ehMensagemOperacionalCodex(message)) continue;
    if (!conversaIniciada && message.role !== 'user') continue;

    conversaIniciada = true;
    ultimoTimestampMensagem = aplicarOrdemCronologicaCodex(message, ultimoTimestampMensagem);
    messages.push(message);
  }

  if (messages.length === 0) {
    return null;
  }

  const externalSessionId = basename(caminho, '.jsonl');
  const titulo = extrairTituloChat(messages) || externalSessionId;

  return {
    client: 'codex',
    externalSessionId,
    title: titulo,
    startedAt: messages[0]?.createdAt,
    updatedAt: messages.at(-1)?.createdAt,
    metadata: {
      client: 'codex',
      source: 'codex-jsonl',
      sourceFile: caminho,
      sourceCwd,
      tags: ['codex', 'history'],
      myinstRequiresReview: true,
    },
    messages,
  };
}

async function listarArquivosJsonl(sourcePath: string): Promise<string[]> {
  const detalhes = await stat(sourcePath);

  if (detalhes.isFile()) {
    return extname(sourcePath).toLowerCase() === '.jsonl' ? [sourcePath] : [];
  }

  const caminhos: string[] = [];
  const entradas = await readdir(sourcePath, { withFileTypes: true });

  for (const entrada of entradas) {
    const caminho = join(sourcePath, entrada.name);

    if (entrada.isDirectory()) {
      caminhos.push(...await listarArquivosJsonl(caminho));
      continue;
    }

    if (entrada.isFile() && extname(entrada.name).toLowerCase() === '.jsonl') {
      caminhos.push(caminho);
    }
  }

  return caminhos.sort((a, b) => a.localeCompare(b));
}

function parseJsonlRecord(linha: string): Record<string, unknown> | null {
  try {
    const registro = JSON.parse(linha) as unknown;
    if (!registro || typeof registro !== 'object' || Array.isArray(registro)) {
      return null;
    }

    return registro as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extrairCwdCodex(registro: Record<string, unknown>): string | undefined {
  const payload = lerObjeto(registro.payload);
  if (typeof payload?.cwd === 'string') {
    return payload.cwd;
  }

  return undefined;
}

function extrairMensagemCodex(registro: Record<string, unknown>): ChatMessageInput | null {
  if (registro.type !== 'response_item') {
    return null;
  }

  const responseItem = lerObjeto(registro.item) ?? lerObjeto(registro.payload);
  if (responseItem?.type !== 'message') {
    return null;
  }

  const role = normalizarRoleCodex(responseItem.role);
  if (!role) {
    return null;
  }

  const content = extrairTextoConteudoCodex(responseItem.content);
  if (!content.trim()) {
    return null;
  }

  const redacao = redigirSegredosEmTexto(content);
  if (detectarSegredoProvavelEmTexto(redacao.texto)) {
    return {
      role,
      content: '{{SECRET}}',
      createdAt: extrairTimestampCodex(registro),
      metadata: { myinstRedactedSecrets: ['secret'], myinstRedactionMode: 'message' },
    };
  }

  return {
    role,
    content: redacao.texto,
    createdAt: extrairTimestampCodex(registro),
    metadata: redacao.possuiSegredos
      ? { myinstRedactedSecrets: redacao.chavesRedigidas }
      : {},
  };
}

function ehMensagemOperacionalCodex(message: ChatMessageInput): boolean {
  if (message.role === 'system' || message.role === 'tool') {
    return true;
  }

  const conteudo = message.content.trimStart();
  return conteudo.startsWith('# AGENTS.md instructions')
    || conteudo.startsWith('<permissions instructions>')
    || conteudo.startsWith('<environment_context>')
    || conteudo.startsWith('<app-context>')
    || conteudo.startsWith('<collaboration_mode>')
    || conteudo.startsWith('The following is the Codex agent history')
    || conteudo.startsWith('[tool_output]')
    || /^Exit code:\s*\d+\s+Wall time:/i.test(conteudo);
}

function aplicarOrdemCronologicaCodex(message: ChatMessageInput, ultimoTimestamp: number | null): number | null {
  if (!message.createdAt) {
    return ultimoTimestamp;
  }

  const timestamp = new Date(message.createdAt).getTime();
  if (Number.isNaN(timestamp)) {
    delete message.createdAt;
    return ultimoTimestamp;
  }

  const timestampOrdenado = ultimoTimestamp !== null && timestamp <= ultimoTimestamp
    ? ultimoTimestamp + 1
    : timestamp;

  message.createdAt = new Date(timestampOrdenado).toISOString();
  return timestampOrdenado;
}

function extrairTextoConteudoCodex(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((parte) => {
      const bloco = lerObjeto(parte);
      if (!bloco) return '';
      if (typeof bloco.text === 'string') return bloco.text;
      if (typeof bloco.input_text === 'string') return bloco.input_text;
      if (typeof bloco.output_text === 'string') return bloco.output_text;
      if (typeof bloco.content === 'string') return bloco.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function lerObjeto(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return null;
  }

  return valor as Record<string, unknown>;
}

function normalizarRoleCodex(valor: unknown): ChatRole | null {
  if (valor === 'user' || valor === 'assistant' || valor === 'system' || valor === 'tool') {
    return valor;
  }

  if (valor === 'developer') {
    return 'system';
  }

  return null;
}

function extrairTituloChat(messages: ChatMessageInput[]): string | null {
  const primeiraMensagemUsuario = messages.find((mensagem) => mensagem.role === 'user');
  if (!primeiraMensagemUsuario) {
    return null;
  }

  const pedidoCodex = extrairPedidoCodex(primeiraMensagemUsuario.content);
  if (pedidoCodex) {
    return pedidoCodex.slice(0, 80);
  }

  const primeiraLinha = primeiraMensagemUsuario.content
    .split(/\r?\n/)
    .find((linha) => linha.trim());

  if (!primeiraLinha) {
    return null;
  }

  return primeiraLinha.trim().slice(0, 80);
}

function extrairPedidoCodex(content: string): string | null {
  const linhas = content.split(/\r?\n/);
  const indicePedido = linhas.findIndex((linha) => linha.trim() === '## My request for Codex:');
  if (indicePedido < 0) {
    return null;
  }

  const primeiraLinhaPedido = linhas
    .slice(indicePedido + 1)
    .find((linha) => linha.trim());

  return primeiraLinhaPedido?.trim() || null;
}

function extrairTimestampCodex(registro: Record<string, unknown>): string | undefined {
  if (typeof registro.timestamp !== 'string') {
    return undefined;
  }

  const timestamp = new Date(registro.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return undefined;
  }

  return timestamp.toISOString();
}

function normalizarIncludes(valor: string): ChatImportInclude[] {
  const include = valor
    .split(',')
    .map((entrada) => entrada.trim().toLowerCase())
    .filter(Boolean);

  if (include.length === 0) {
    throw new Error('Informe --include com history ou cache.');
  }

  for (const entrada of include) {
    if (entrada !== 'history' && entrada !== 'cache') {
      throw new Error(`Categoria de importação inválida: ${entrada}. Use history ou cache.`);
    }
  }

  return include as ChatImportInclude[];
}

async function enviarChat(config: MyInstConfig, workspace: string, project: string, chat: ChatArquivo): Promise<{ data: { client: string; externalSessionId: string } }> {
  const resposta = await fetch(endpointChats(config, workspace, project), {
    method: 'POST',
    headers: headersJson(config),
    body: JSON.stringify({
      client: chat.client,
      session: chat.externalSessionId,
      title: chat.title,
      summary: chat.summary,
      startedAt: chat.startedAt,
      updatedAt: chat.updatedAt,
      retentionUntil: chat.retentionUntil,
      metadata: chat.metadata,
      messages: chat.messages,
    }),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  return await resposta.json() as { data: { client: string; externalSessionId: string } };
}

function normalizarChatJson(valor: Record<string, unknown>, options: ChatArquivoOptions): ChatArquivo {
  const messages = Array.isArray(valor.messages)
    ? valor.messages.map(normalizarMensagem)
    : [];

  if (messages.length === 0) {
    throw new Error('Arquivo de chat precisa conter messages com pelo menos uma mensagem.');
  }

  return {
    client: options.client,
    externalSessionId: options.session,
    title: typeof valor.title === 'string' ? valor.title : options.session,
    summary: typeof valor.summary === 'string' ? valor.summary : undefined,
    startedAt: typeof valor.startedAt === 'string' ? valor.startedAt : undefined,
    updatedAt: typeof valor.updatedAt === 'string' ? valor.updatedAt : undefined,
    retentionUntil: typeof valor.retentionUntil === 'string' ? valor.retentionUntil : undefined,
    metadata: valor.metadata && typeof valor.metadata === 'object' && !Array.isArray(valor.metadata)
      ? valor.metadata as Record<string, unknown>
      : {},
    messages,
  };
}

function normalizarMensagem(valor: unknown): ChatMessageInput {
  if (!valor || typeof valor !== 'object') {
    throw new Error('Mensagem de chat inválida.');
  }

  const mensagem = valor as Record<string, unknown>;
  const role = typeof mensagem.role === 'string' ? mensagem.role : 'user';
  if (!['user', 'assistant', 'system', 'tool'].includes(role)) {
    throw new Error(`Role de chat inválido: ${role}`);
  }

  if (typeof mensagem.content !== 'string' || !mensagem.content.trim()) {
    throw new Error('Mensagem de chat precisa de content.');
  }

  return {
    role: role as ChatRole,
    content: mensagem.content,
    tokenCount: typeof mensagem.tokenCount === 'number' ? mensagem.tokenCount : undefined,
    metadata: mensagem.metadata && typeof mensagem.metadata === 'object' && !Array.isArray(mensagem.metadata)
      ? mensagem.metadata as Record<string, unknown>
      : {},
    createdAt: typeof mensagem.createdAt === 'string' ? mensagem.createdAt : undefined,
  };
}

function endpointChats(config: MyInstConfig, workspace: string, project: string): string {
  return `${config.server}/api/v1/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/chats`;
}

function endpointChat(config: MyInstConfig, workspace: string, project: string, sessionId: string): string {
  return `${endpointChats(config, workspace, project)}/${encodeURIComponent(sessionId)}`;
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

async function encerrarComErroHttp(resposta: Response): Promise<never> {
  const erro = await resposta.json().catch(() => ({ error: { message: resposta.statusText } }));
  console.error(`${VERMELHO}[ERROR] ${erro.error?.message || resposta.statusText}${RESET}`);
  process.exit(1);
}

function extrairTituloMarkdown(conteudo: string): string | null {
  const titulo = conteudo.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return titulo || null;
}

function normalizarNomeArquivo(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'chat';
}
