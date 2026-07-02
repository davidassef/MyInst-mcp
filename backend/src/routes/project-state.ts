import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { criarProjectStateSchema } from '@myinst/shared';
import type { CriarProjectStateInput } from '@myinst/shared';
import { db } from '../db/index.js';
import { projectDecisions, projectMemories, projects, projectSessions } from '../db/schema.js';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { resolverWorkspaceDoUsuario } from '../lib/workspaces.js';

type StateType = 'memory' | 'decision' | 'session';

export async function projectStateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/state/memories', async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const memorias = await db
      .select()
      .from(projectMemories)
      .where(eq(projectMemories.projectId, contexto.projectId));

    return { data: memorias.map((memoria) => ({ ...memoria, type: 'memory' })) };
  });

  app.post(
    '/workspaces/:workspaceSlug/projects/:projectSlug/state/memories',
    { preHandler: [validar(criarProjectStateSchema)] },
    async (request, reply) => criarStateItem(request, reply, 'memory'),
  );

  app.delete('/workspaces/:workspaceSlug/projects/:projectSlug/state/memories/:stateSlug', async (request, reply) => {
    return deletarStateItem(request, reply, 'memory');
  });

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/state/decisions', async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const decisoes = await db
      .select()
      .from(projectDecisions)
      .where(eq(projectDecisions.projectId, contexto.projectId));

    return { data: decisoes.map((decisao) => ({ ...decisao, type: 'decision' })) };
  });

  app.post(
    '/workspaces/:workspaceSlug/projects/:projectSlug/state/decisions',
    { preHandler: [validar(criarProjectStateSchema)] },
    async (request, reply) => criarStateItem(request, reply, 'decision'),
  );

  app.delete('/workspaces/:workspaceSlug/projects/:projectSlug/state/decisions/:stateSlug', async (request, reply) => {
    return deletarStateItem(request, reply, 'decision');
  });

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/state/sessions', async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const sessoes = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.projectId, contexto.projectId));

    return { data: sessoes.map((sessao) => ({ ...sessao, type: 'session' })) };
  });

  app.post(
    '/workspaces/:workspaceSlug/projects/:projectSlug/state/sessions',
    { preHandler: [validar(criarProjectStateSchema)] },
    async (request, reply) => criarStateItem(request, reply, 'session'),
  );

  app.delete('/workspaces/:workspaceSlug/projects/:projectSlug/state/sessions/:stateSlug', async (request, reply) => {
    return deletarStateItem(request, reply, 'session');
  });
}

async function criarStateItem(request: FastifyRequest, reply: FastifyReply, expectedType: StateType) {
  const body = request.body as CriarProjectStateInput;

  if (body.type !== expectedType) {
    return reply.status(400).send({
      error: { code: 'INVALID_STATE_TYPE', message: `Tipo esperado: ${expectedType}`, status: 400 },
    });
  }

  if (request.authMethod === 'api_key' && body.metadata.reviewed !== true) {
    return reply.status(400).send({
      error: { code: 'REVIEW_REQUIRED', message: 'Project State enviado pelo MCP exige metadata.reviewed=true', status: 400 },
    });
  }

  const contexto = await resolverContextoProjeto(request);
  if (!contexto) return responderProjetoNaoEncontrado(reply);

  const valoresBase = {
    userId: request.user.id,
    workspaceId: contexto.workspaceId,
    projectId: contexto.projectId,
    title: body.title,
    slug: body.slug,
    body: body.body,
    metadata: body.metadata,
    sourceClient: body.sourceClient,
    sourcePath: body.sourcePath,
  };

  if (expectedType === 'memory') {
    const [memoria] = await db
      .insert(projectMemories)
      .values(valoresBase)
      .onConflictDoUpdate({
        target: [projectMemories.projectId, projectMemories.slug],
        set: { ...valoresBase, updatedAt: new Date() },
      })
      .returning();

    return reply.status(201).send({ data: { ...memoria, type: 'memory' } });
  }

  if (expectedType === 'decision') {
    const [decisao] = await db
      .insert(projectDecisions)
      .values(valoresBase)
      .onConflictDoUpdate({
        target: [projectDecisions.projectId, projectDecisions.slug],
        set: { ...valoresBase, updatedAt: new Date() },
      })
      .returning();

    return reply.status(201).send({ data: { ...decisao, type: 'decision' } });
  }

  const [sessao] = await db
    .insert(projectSessions)
    .values({
      ...valoresBase,
      summary: body.summary || body.body,
      touchedFiles: body.touchedFiles,
      toolsUsed: body.toolsUsed,
      status: body.status,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
    })
    .onConflictDoUpdate({
      target: [projectSessions.projectId, projectSessions.slug],
      set: {
        ...valoresBase,
        summary: body.summary || body.body,
        touchedFiles: body.touchedFiles,
        toolsUsed: body.toolsUsed,
        status: body.status,
        startedAt: body.startedAt ? new Date(body.startedAt) : null,
        endedAt: body.endedAt ? new Date(body.endedAt) : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return reply.status(201).send({ data: { ...sessao, type: 'session' } });
}

async function deletarStateItem(request: FastifyRequest, reply: FastifyReply, expectedType: StateType) {
  const contexto = await resolverContextoProjeto(request);
  if (!contexto) return responderProjetoNaoEncontrado(reply);

  const { stateSlug } = request.params as { stateSlug: string };

  if (expectedType === 'memory') {
    const [memoriaRemovida] = await db
      .delete(projectMemories)
      .where(and(eq(projectMemories.projectId, contexto.projectId), eq(projectMemories.slug, stateSlug)))
      .returning({ id: projectMemories.id });

    if (!memoriaRemovida) return responderStateNaoEncontrado(reply);

    return reply.status(204).send();
  }

  if (expectedType === 'decision') {
    const [decisaoRemovida] = await db
      .delete(projectDecisions)
      .where(and(eq(projectDecisions.projectId, contexto.projectId), eq(projectDecisions.slug, stateSlug)))
      .returning({ id: projectDecisions.id });

    if (!decisaoRemovida) return responderStateNaoEncontrado(reply);

    return reply.status(204).send();
  }

  const [sessaoRemovida] = await db
    .delete(projectSessions)
    .where(and(eq(projectSessions.projectId, contexto.projectId), eq(projectSessions.slug, stateSlug)))
    .returning({ id: projectSessions.id });

  if (!sessaoRemovida) return responderStateNaoEncontrado(reply);

  return reply.status(204).send();
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

function responderProjetoNaoEncontrado(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'NOT_FOUND', message: 'Workspace ou projeto não encontrado', status: 404 },
  });
}

function responderStateNaoEncontrado(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'NOT_FOUND', message: 'Item de Project State não encontrado', status: 404 },
  });
}
