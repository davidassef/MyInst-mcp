import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { carregarConfig, type MyInstConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

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

interface ChatListOptions {
  workspace?: string;
  project?: string;
  client?: string;
  q?: string;
}

interface ChatShowOptions {
  workspace?: string;
  project?: string;
}

interface ChatExportOptions extends ChatShowOptions {
  format?: 'markdown';
}

export async function executarChatPush(options: ChatPushOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';
  const chat = await carregarChatDeArquivo(options.file, options);

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

  const json = await resposta.json();
  console.log(`${VERDE}[SUCCESS] Chat salvo:${RESET} ${json.data.client}/${json.data.externalSessionId}`);
}

export async function executarChatList(options: ChatListOptions): Promise<void> {
  const config = carregarConfigObrigatoria();
  const workspace = options.workspace || 'default';
  const project = options.project || 'default';
  const params = new URLSearchParams();

  if (options.client) params.set('client', options.client);
  if (options.q) params.set('q', options.q);

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
  const resposta = await fetch(endpointChat(config, workspace, project, sessionId), {
    headers: headersJson(config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  const chat = json.data as { title: string; client: string; externalSessionId: string; messages: ChatMessageInput[] };

  console.log(`${VERDE}${chat.title}${RESET} ${CINZA}${chat.client}/${chat.externalSessionId}${RESET}`);
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

export async function materializarChatMarkdown(targetDir: string, sessionId: string, markdown: string): Promise<string> {
  const dir = join(targetDir, '.myinst', 'chats');
  await mkdir(dir, { recursive: true });

  const caminho = join(dir, `${normalizarNomeArquivo(sessionId)}.md`);
  await writeFile(caminho, markdown, 'utf-8');
  return caminho;
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
