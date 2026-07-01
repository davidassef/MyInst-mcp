import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { criarChatSessionSchema, resumirChatSessionSchema } from '@myinst/shared';
import { detectarSegredoProvavelEmTexto, detectarSegredoProvavelEmValor } from '@myinst/shared/security';
import type { CriarChatSessionInput, ResumirChatSessionInput } from '@myinst/shared';
import { db } from '../db/index.js';
import { chatMessages, chatSessions, projects } from '../db/schema.js';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { resolverWorkspaceDoUsuario } from '../lib/workspaces.js';

const DIAS_RETENCAO_PADRAO = 180;

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/chats', async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const query = request.query as { client?: string; q?: string; tag?: string; from?: string; to?: string };
    const sessoes = await listarSessoesChat(contexto.projectId, query);

    return { data: sessoes };
  });

  app.post(
    '/workspaces/:workspaceSlug/projects/:projectSlug/chats',
    { preHandler: [validar(criarChatSessionSchema)] },
    async (request, reply) => criarChat(request, reply),
  );

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId', async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const sessao = await buscarChatComMensagens(contexto.projectId, sessionIdParam(request));
    if (!sessao) return responderChatNaoEncontrado(reply);

    return { data: sessao };
  });

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId/export', async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const sessao = await buscarChatComMensagens(contexto.projectId, sessionIdParam(request));
    if (!sessao) return responderChatNaoEncontrado(reply);

    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    return montarMarkdownChat(sessao);
  });

  app.post(
    '/workspaces/:workspaceSlug/projects/:projectSlug/chats/:sessionId/summarize',
    { preHandler: [validar(resumirChatSessionSchema)] },
    async (request, reply) => resumirChat(request, reply),
  );
}

async function criarChat(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as CriarChatSessionInput;

  if (detectarSegredoChat(body)) {
    return reply.status(400).send({
      error: {
        code: 'SECRET_DETECTED',
        message: 'Chat contém segredo provável. Substitua valores sensíveis por placeholders antes de importar.',
        status: 400,
      },
    });
  }

  const contexto = await resolverContextoProjeto(request);
  if (!contexto) return responderProjetoNaoEncontrado(reply);

  const retentionUntil = body.retentionUntil
    ? new Date(body.retentionUntil)
    : calcularRetencaoPadrao();

  const [sessao] = await db
    .insert(chatSessions)
    .values({
      userId: request.user.id,
      workspaceId: contexto.workspaceId,
      projectId: contexto.projectId,
      client: body.client,
      externalSessionId: body.session,
      title: body.title,
      summary: body.summary,
      startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
      updatedAt: body.updatedAt ? new Date(body.updatedAt) : new Date(),
      retentionUntil,
      metadata: body.metadata,
    })
    .onConflictDoUpdate({
      target: [chatSessions.projectId, chatSessions.client, chatSessions.externalSessionId],
      set: {
        title: body.title,
        summary: body.summary,
        updatedAt: body.updatedAt ? new Date(body.updatedAt) : new Date(),
        retentionUntil,
        metadata: body.metadata,
      },
    })
    .returning();

  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessao.id));
  await db.insert(chatMessages).values(body.messages.map((mensagem) => ({
    sessionId: sessao.id,
    role: mensagem.role,
    content: mensagem.content,
    tokenCount: mensagem.tokenCount,
    metadata: mensagem.metadata,
    createdAt: mensagem.createdAt ? new Date(mensagem.createdAt) : new Date(),
  })));

  return reply.status(201).send({
    data: {
      ...sessao,
      messageCount: body.messages.length,
    },
  });
}

async function resumirChat(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as ResumirChatSessionInput;
  const contexto = await resolverContextoProjeto(request);
  if (!contexto) return responderProjetoNaoEncontrado(reply);

  const sessao = await buscarChatComMensagens(contexto.projectId, sessionIdParam(request));
  if (!sessao) return responderChatNaoEncontrado(reply);

  const summary = body.summary || gerarResumoLocal(sessao.messages);
  const [atualizada] = await db
    .update(chatSessions)
    .set({ summary, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessao.id))
    .returning();

  return { data: { ...atualizada, messageCount: sessao.messages.length } };
}

async function listarSessoesChat(
  projectId: string,
  query: { client?: string; q?: string; tag?: string; from?: string; to?: string },
) {
  const sessoes = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.projectId, projectId));

  const filtradas = sessoes.filter((sessao) => {
    if (query.client && sessao.client !== query.client) return false;
    if (query.from && sessao.startedAt < new Date(query.from)) return false;
    if (query.to && sessao.startedAt > new Date(query.to)) return false;
    if (query.q && !textoSessao(sessao).includes(query.q.toLowerCase())) return false;
    if (query.tag && !tagsDaSessao(sessao.metadata).includes(query.tag)) return false;
    return true;
  });

  return Promise.all(filtradas.map(async (sessao) => ({
    ...sessao,
    messageCount: await contarMensagens(sessao.id),
  })));
}

async function buscarChatComMensagens(projectId: string, sessionId: string) {
  const sessoes = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.projectId, projectId));
  const sessao = sessoes.find((chat) => chat.id === sessionId || chat.externalSessionId === sessionId);
  if (!sessao) return null;

  const mensagens = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessao.id));

  return {
    ...sessao,
    messageCount: mensagens.length,
    messages: mensagens,
  };
}

async function contarMensagens(sessionId: string): Promise<number> {
  const mensagens = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId));

  return mensagens.length;
}

async function resolverContextoProjeto(request: FastifyRequest) {
  const { workspaceSlug, projectSlug } = request.params as { workspaceSlug: string; projectSlug: string };
  const workspace = await resolverWorkspaceDoUsuario(request.user.id, workspaceSlug);
  if (!workspace) return null;

  const [projeto] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(
      eq(projects.userId, request.user.id),
      eq(projects.workspaceId, workspace.id),
      eq(projects.slug, projectSlug),
    ))
    .limit(1);

  if (!projeto) return null;

  return {
    workspaceId: workspace.id,
    projectId: projeto.id,
  };
}

function detectarSegredoChat(body: CriarChatSessionInput): boolean {
  if (detectarSegredoProvavelEmValor(body.metadata)) return true;

  return body.messages.some((mensagem) => (
    detectarSegredoProvavelEmTexto(mensagem.content)
    || detectarSegredoProvavelEmValor(mensagem.metadata)
  ));
}

function calcularRetencaoPadrao(): Date {
  const retentionUntil = new Date();
  retentionUntil.setDate(retentionUntil.getDate() + DIAS_RETENCAO_PADRAO);
  return retentionUntil;
}

function textoSessao(sessao: { title: string; summary: string | null }): string {
  return `${sessao.title} ${sessao.summary ?? ''}`.toLowerCase();
}

function tagsDaSessao(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const tags = (metadata as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === 'string');
}

function sessionIdParam(request: FastifyRequest): string {
  return (request.params as { sessionId: string }).sessionId;
}

function responderProjetoNaoEncontrado(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'NOT_FOUND', message: 'Workspace ou projeto não encontrado', status: 404 },
  });
}

function responderChatNaoEncontrado(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'NOT_FOUND', message: 'Chat não encontrado', status: 404 },
  });
}

function gerarResumoLocal(messages: Array<{ content: string }>): string {
  return messages
    .map((mensagem) => mensagem.content.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 1000);
}

function montarMarkdownChat(sessao: { title: string; client: string; externalSessionId: string; summary: string | null; messages: Array<{ role: string; content: string }> }): string {
  const linhas = [
    `# ${sessao.title}`,
    '',
    `- client: ${sessao.client}`,
    `- session: ${sessao.externalSessionId}`,
    '',
  ];

  if (sessao.summary) {
    linhas.push('## Resumo', '', sessao.summary, '');
  }

  for (const mensagem of sessao.messages) {
    linhas.push(`## ${mensagem.role}`, '', mensagem.content, '');
  }

  return `${linhas.join('\n').trim()}\n`;
}
