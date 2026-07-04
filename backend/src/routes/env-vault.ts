import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { adicionarEnvVaultRecoveryEnvelopeSchema, criarEnvVaultFileSchema } from '@myinst/shared';
import type { AdicionarEnvVaultRecoveryEnvelopeInput, CriarEnvVaultFileInput } from '@myinst/shared';
import { db } from '../db/index.js';
import { envVaultFiles, envVaultFileVersions, envVaultRecoveryEnvelopes, projects } from '../db/schema.js';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { resolverWorkspaceDoUsuario } from '../lib/workspaces.js';
import { exigirTotpStepUp } from '../lib/step-up.js';

const AMBIENTE_PADRAO = 'default';

type EnvVaultTransacao = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export async function envVaultRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/env-files', async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const envs = await listarEnvVaultFiles(contexto.projectId);

    return { data: envs };
  });

  app.post(
    '/workspaces/:workspaceSlug/projects/:projectSlug/env-files',
    { preHandler: [exigirTotpStepUp, validar(criarEnvVaultFileSchema)] },
    async (request, reply) => criarEnvVaultFile(request, reply),
  );

  app.post(
    '/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId/recovery-envelopes',
    { preHandler: [exigirTotpStepUp, validar(adicionarEnvVaultRecoveryEnvelopeSchema)] },
    async (request, reply) => adicionarRecoveryEnvelope(request, reply),
  );

  app.get('/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId', { preHandler: [exigirTotpStepUp] }, async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const env = await obterEnvVaultFileDetalhado(contexto.projectId, envIdParam(request));
    if (!env) return responderEnvNaoEncontrado(reply);

    return { data: env };
  });

  app.delete('/workspaces/:workspaceSlug/projects/:projectSlug/env-files/:envId', { preHandler: [exigirTotpStepUp] }, async (request, reply) => {
    const contexto = await resolverContextoProjeto(request);
    if (!contexto) return responderProjetoNaoEncontrado(reply);

    const [envRemovido] = await db
      .delete(envVaultFiles)
      .where(and(eq(envVaultFiles.projectId, contexto.projectId), eq(envVaultFiles.id, envIdParam(request))))
      .returning({ id: envVaultFiles.id });

    if (!envRemovido) return responderEnvNaoEncontrado(reply);

    return reply.status(204).send();
  });
}

async function adicionarRecoveryEnvelope(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as AdicionarEnvVaultRecoveryEnvelopeInput;
  const contexto = await resolverContextoProjeto(request);
  if (!contexto) return responderProjetoNaoEncontrado(reply);

  const [env] = await db
    .select()
    .from(envVaultFiles)
    .where(and(eq(envVaultFiles.projectId, contexto.projectId), eq(envVaultFiles.id, envIdParam(request))))
    .limit(1);

  if (!env) return responderEnvNaoEncontrado(reply);

  await db.transaction(async (transacao) => {
    await transacao
      .delete(envVaultRecoveryEnvelopes)
      .where(and(
        eq(envVaultRecoveryEnvelopes.envFileId, env.id),
        eq(envVaultRecoveryEnvelopes.label, body.label),
      ));

    await inserirRecoveryEnvelopes(transacao, env.id, [body]);
  });

  const recoveryEnvelopeCount = await contarRecoveryEnvelopes(env.id);

  return reply.status(201).send({
    data: formatarResumoEnvVaultFile(env, recoveryEnvelopeCount),
  });
}

async function criarEnvVaultFile(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as CriarEnvVaultFileInput;
  const contexto = await resolverContextoProjeto(request);
  if (!contexto) return responderProjetoNaoEncontrado(reply);

  const environment = body.environment ?? AMBIENTE_PADRAO;
  const env = await db.transaction(async (transacao) => {
    const [envExistente] = await transacao
      .select()
      .from(envVaultFiles)
      .where(and(
        eq(envVaultFiles.projectId, contexto.projectId),
        eq(envVaultFiles.name, body.name),
        eq(envVaultFiles.environment, environment),
      ))
      .limit(1);

    const envFile = envExistente
      ? await atualizarEnvVaultFile(transacao, envExistente.id, body, environment)
      : await inserirEnvVaultFile(transacao, request.user.id, contexto, body, environment);

    await transacao.insert(envVaultFileVersions).values({
      envFileId: envFile.id,
      version: envFile.version,
      encryptedPayload: body.encryptedPayload,
      metadata: body.metadata,
    });

    if (body.recoveryEnvelopes) {
      await transacao
        .delete(envVaultRecoveryEnvelopes)
        .where(eq(envVaultRecoveryEnvelopes.envFileId, envFile.id));

      await inserirRecoveryEnvelopes(transacao, envFile.id, body.recoveryEnvelopes);
    }

    return envFile;
  });

  const recoveryEnvelopeCount = await contarRecoveryEnvelopes(env.id);

  return reply.status(201).send({
    data: formatarResumoEnvVaultFile(env, recoveryEnvelopeCount),
  });
}

async function inserirEnvVaultFile(
  transacao: EnvVaultTransacao,
  userId: string,
  contexto: { workspaceId: string; projectId: string },
  body: CriarEnvVaultFileInput,
  environment: string,
) {
  const [envFile] = await transacao
    .insert(envVaultFiles)
    .values({
      userId,
      workspaceId: contexto.workspaceId,
      projectId: contexto.projectId,
      name: body.name,
      sourcePath: body.sourcePath,
      environment,
      metadata: body.metadata,
      version: 1,
    })
    .returning();

  return envFile;
}

async function atualizarEnvVaultFile(
  transacao: EnvVaultTransacao,
  envFileId: string,
  body: CriarEnvVaultFileInput,
  environment: string,
) {
  const [envFile] = await transacao
    .update(envVaultFiles)
    .set({
      sourcePath: body.sourcePath,
      environment,
      metadata: body.metadata,
      version: sql`${envVaultFiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(envVaultFiles.id, envFileId))
    .returning();

  return envFile;
}

async function inserirRecoveryEnvelopes(
  transacao: EnvVaultTransacao,
  envFileId: string,
  recoveryEnvelopes: NonNullable<CriarEnvVaultFileInput['recoveryEnvelopes']>,
) {
  if (recoveryEnvelopes.length === 0) return;

  await transacao.insert(envVaultRecoveryEnvelopes).values(recoveryEnvelopes.map((envelope) => ({
    envFileId,
    method: envelope.method,
    label: envelope.label,
    encryptedVaultSecret: envelope.encryptedVaultSecret,
    stepUpFactors: envelope.stepUpFactors,
  })));
}

async function listarEnvVaultFiles(projectId: string) {
  const envs = await db
    .select()
    .from(envVaultFiles)
    .where(eq(envVaultFiles.projectId, projectId))
    .orderBy(desc(envVaultFiles.updatedAt), desc(envVaultFiles.createdAt));

  const contagensPorEnv = await contarRecoveryEnvelopesPorEnv(envs.map((env) => env.id));

  return envs.map((env) => formatarResumoEnvVaultFile(env, contagensPorEnv.get(env.id) ?? 0));
}

async function obterEnvVaultFileDetalhado(projectId: string, envId: string) {
  const [env] = await db
    .select()
    .from(envVaultFiles)
    .where(and(eq(envVaultFiles.projectId, projectId), eq(envVaultFiles.id, envId)))
    .limit(1);

  if (!env) return null;

  const [versao] = await db
    .select()
    .from(envVaultFileVersions)
    .where(and(
      eq(envVaultFileVersions.envFileId, env.id),
      eq(envVaultFileVersions.version, env.version),
    ))
    .limit(1);

  if (!versao) return null;

  const recoveryEnvelopes = await db
    .select({
      method: envVaultRecoveryEnvelopes.method,
      label: envVaultRecoveryEnvelopes.label,
      encryptedVaultSecret: envVaultRecoveryEnvelopes.encryptedVaultSecret,
      stepUpFactors: envVaultRecoveryEnvelopes.stepUpFactors,
    })
    .from(envVaultRecoveryEnvelopes)
    .where(eq(envVaultRecoveryEnvelopes.envFileId, env.id));

  return {
    ...formatarResumoEnvVaultFile(env, recoveryEnvelopes.length),
    encryptedPayload: versao.encryptedPayload,
    recoveryEnvelopes,
  };
}

async function contarRecoveryEnvelopes(envFileId: string): Promise<number> {
  const contagens = await contarRecoveryEnvelopesPorEnv([envFileId]);

  return contagens.get(envFileId) ?? 0;
}

async function contarRecoveryEnvelopesPorEnv(envFileIds: string[]): Promise<Map<string, number>> {
  if (envFileIds.length === 0) return new Map();

  const contagens = await db
    .select({
      envFileId: envVaultRecoveryEnvelopes.envFileId,
      total: count(envVaultRecoveryEnvelopes.id),
    })
    .from(envVaultRecoveryEnvelopes)
    .where(inArray(envVaultRecoveryEnvelopes.envFileId, envFileIds))
    .groupBy(envVaultRecoveryEnvelopes.envFileId);

  return new Map(contagens.map((contagem) => [contagem.envFileId, Number(contagem.total)]));
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

function formatarResumoEnvVaultFile(
  env: typeof envVaultFiles.$inferSelect,
  recoveryEnvelopeCount: number,
) {
  return {
    id: env.id,
    name: env.name,
    sourcePath: env.sourcePath,
    environment: env.environment,
    metadata: env.metadata,
    version: env.version,
    recoveryEnvelopeCount,
    createdAt: env.createdAt,
    updatedAt: env.updatedAt,
  };
}

function envIdParam(request: FastifyRequest): string {
  return (request.params as { envId: string }).envId;
}

function responderProjetoNaoEncontrado(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'NOT_FOUND', message: 'Workspace ou projeto não encontrado', status: 404 },
  });
}

function responderEnvNaoEncontrado(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: 'NOT_FOUND', message: 'Env Vault file não encontrado', status: 404 },
  });
}
