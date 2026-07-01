import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, count, desc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
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

    const query = request.query as {
      client?: string;
      q?: string;
      tag?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };
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
  query: { client?: string; q?: string; tag?: string; from?: string; to?: string; limit?: string; offset?: string },
) {
  const limite = limitarInteiro(query.limit, 100, 1, 200);
  const deslocamento = limitarInteiro(query.offset, 0, 0, 10_000);
  const filtros = montarFiltrosListagemChat(projectId, query);
  const sessoes = await db
    .select()
    .from(chatSessions)
    .where(and(...filtros))
    .orderBy(desc(chatSessions.updatedAt), desc(chatSessions.startedAt))
    .limit(limite)
    .offset(deslocamento);

  const contagensPorSessao = await contarMensagensPorSessao(sessoes.map((sessao) => sessao.id));

  return sessoes.map((sessao) => ({
    ...sessao,
    messageCount: contagensPorSessao.get(sessao.id) ?? 0,
  }));
}

async function buscarChatComMensagens(projectId: string, sessionId: string) {
  const filtroIdInterno = ehUuid(sessionId) ? eq(chatSessions.id, sessionId) : undefined;
  const filtroSessaoExterna = eq(chatSessions.externalSessionId, sessionId);
  const filtroIdentificador = filtroIdInterno
    ? or(filtroIdInterno, filtroSessaoExterna)
    : filtroSessaoExterna;

  if (!filtroIdentificador) return null;

  const sessoes = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.projectId, projectId), filtroIdentificador))
    .limit(1);
  const sessao = sessoes[0];
  if (!sessao) return null;

  const mensagens = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessao.id))
    .orderBy(asc(chatMessages.createdAt));

  return {
    ...sessao,
    messageCount: mensagens.length,
    messages: mensagens,
  };
}

async function contarMensagensPorSessao(sessionIds: string[]): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();

  const contagens = await db
    .select({
      sessionId: chatMessages.sessionId,
      total: count(chatMessages.id),
    })
    .from(chatMessages)
    .where(inArray(chatMessages.sessionId, sessionIds))
    .groupBy(chatMessages.sessionId);

  return new Map(contagens.map((contagem) => [contagem.sessionId, Number(contagem.total)]));
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

function montarFiltrosListagemChat(
  projectId: string,
  query: { client?: string; q?: string; tag?: string; from?: string; to?: string },
): SQL[] {
  const filtros: SQL[] = [eq(chatSessions.projectId, projectId)];

  if (query.client) {
    filtros.push(eq(chatSessions.client, query.client));
  }

  const inicio = converterDataFiltro(query.from);
  if (inicio) {
    filtros.push(gte(chatSessions.startedAt, inicio));
  }

  const fim = converterDataFiltro(query.to);
  if (fim) {
    filtros.push(lte(chatSessions.startedAt, fim));
  }

  const textoBusca = query.q?.trim();
  if (textoBusca) {
    filtros.push(sql`(
      to_tsvector('portuguese', coalesce(${chatSessions.title}, '') || ' ' || coalesce(${chatSessions.summary}, ''))
        @@ plainto_tsquery('portuguese', ${textoBusca})
      OR EXISTS (
        SELECT 1
        FROM chat_messages mensagem_busca
        WHERE mensagem_busca.session_id = ${chatSessions.id}
          AND to_tsvector('portuguese', coalesce(mensagem_busca.content, ''))
            @@ plainto_tsquery('portuguese', ${textoBusca})
      )
    )`);
  }

  const tag = query.tag?.trim();
  if (tag) {
    filtros.push(sql`${chatSessions.metadata}->'tags' ? ${tag}`);
  }

  return filtros;
}

function converterDataFiltro(valor?: string): Date | null {
  if (!valor) return null;

  const dataFiltro = new Date(valor);
  if (Number.isNaN(dataFiltro.getTime())) return null;

  return dataFiltro;
}

function limitarInteiro(valor: string | undefined, padrao: number, minimo: number, maximo: number): number {
  if (!valor) return padrao;

  const numero = Number.parseInt(valor, 10);
  if (Number.isNaN(numero)) return padrao;

  return Math.min(Math.max(numero, minimo), maximo);
}

function ehUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
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
