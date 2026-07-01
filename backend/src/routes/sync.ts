import type { FastifyInstance } from 'fastify';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { clientProfileItems, clientProfileItemVersions, contentItems, contentTags, contentVersions, folders, projects, tags } from '../db/schema.js';
import { syncPullSchema, syncPushSchema } from '@myinst/shared';
import { detectarSegredoProvavelEmTexto, detectarSegredoProvavelEmValor } from '@myinst/shared/security';
import type { ClientProfileId, ContentType, SearchScope } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { obterWorkspaceDefault, resolverWorkspaceDoUsuario } from '../lib/workspaces.js';
import { obterOuCriarClientProfile } from '../lib/client-profiles.js';

export async function syncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  async function resolverProjeto(userId: string, projectSlug: string, workspaceSlug?: string) {
    const workspace = workspaceSlug
      ? await resolverWorkspaceDoUsuario(userId, workspaceSlug)
      : await obterWorkspaceDefault(userId);

    if (!workspace) return null;

    const [projeto] = await db
      .select({ id: projects.id, workspaceId: projects.workspaceId })
      .from(projects)
      .where(and(
        eq(projects.userId, userId),
        eq(projects.workspaceId, workspace.id),
        eq(projects.slug, projectSlug),
      ))
      .limit(1);

    return projeto ? { workspace, projeto } : null;
  }

  async function resolverClientProfile(userId: string, clientId: ClientProfileId) {
    const perfil = await obterOuCriarClientProfile(userId, clientId);
    return { perfil };
  }

  app.post('/pull', { preHandler: [validar(syncPullSchema)] }, async (request, reply) => {
    const { workspace, project, types, tags: tagFilter, since } = request.body as {
      scope?: SearchScope;
      workspace?: string;
      project?: string;
      clientId?: ClientProfileId;
      types?: string[];
      tags?: string[];
      since?: string;
    };

    if (request.body && (request.body as { scope?: SearchScope }).scope === 'global') {
      const { clientId } = request.body as { clientId: ClientProfileId };
      const { perfil } = await resolverClientProfile(request.user.id, clientId);

      let items = await db
        .select()
        .from(clientProfileItems)
        .where(and(
          eq(clientProfileItems.clientProfileId, perfil.id),
          eq(clientProfileItems.isActive, true),
          ...(since ? [gte(clientProfileItems.updatedAt, new Date(since))] : []),
        ));

      if (types && types.length > 0) {
        items = items.filter((item) => types.includes(item.type));
      }

      if (tagFilter && tagFilter.length > 0) {
        items = items.filter((item) => {
          const tagsDoItem = lerTagsDoMetadata(item.metadata as Record<string, unknown>);
          return tagFilter.some((tag) => tagsDoItem.includes(tag));
        });
      }

      const syncToken = Buffer.from(new Date().toISOString()).toString('base64url');

      return {
        data: {
          items: items.map(normalizarGlobalItem),
          syncToken,
          serverTime: new Date().toISOString(),
        },
      };
    }

    const contexto = await resolverProjeto(request.user.id, project!, workspace);
    if (!contexto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Projeto '${project}' não encontrado`, status: 404 },
      });
    }

    let items = await db
      .select()
      .from(contentItems)
      .where(and(
        eq(contentItems.projectId, contexto.projeto.id),
        eq(contentItems.isActive, true),
        ...(since ? [gte(contentItems.updatedAt, new Date(since))] : []),
      ));

    if (types && types.length > 0) {
      items = items.filter((item) => types.includes(item.type));
    }

    if (tagFilter && tagFilter.length > 0) {
      const tagsDoWorkspace = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.userId, request.user.id), eq(tags.workspaceId, contexto.workspace.id), inArray(tags.name, tagFilter)));

      const tagIds = tagsDoWorkspace.map((tag) => tag.id);

      if (tagIds.length > 0) {
        const conteudosComTag = await db
          .select({ contentId: contentTags.contentId })
          .from(contentTags)
          .where(inArray(contentTags.tagId, tagIds));

        const idsSet = new Set(conteudosComTag.map((item) => item.contentId));
        items = items.filter((item) => idsSet.has(item.id));
      } else {
        items = [];
      }
    }

    const comTags = await Promise.all(
      items.map(async (item) => {
        const itemTags = await db
          .select({ name: tags.name })
          .from(contentTags)
          .innerJoin(tags, eq(tags.id, contentTags.tagId))
          .where(eq(contentTags.contentId, item.id));

        return { ...item, tags: itemTags.map((tag) => tag.name) };
      }),
    );

    const syncToken = Buffer.from(new Date().toISOString()).toString('base64url');

    return {
      data: {
        items: comTags,
        syncToken,
        serverTime: new Date().toISOString(),
      },
    };
  });

  app.post('/push', { preHandler: [validar(syncPushSchema)] }, async (request, reply) => {
    const { workspace, project, items, folderSlug } = request.body as {
      scope?: SearchScope;
      workspace?: string;
      project?: string;
      clientId?: ClientProfileId;
      folderSlug?: string;
      items: { type: ContentType; title: string; slug: string; body: string; metadata: Record<string, unknown>; tags: string[] }[];
    };

    const itemComSegredo = items.find((item) => detectarSegredoProvavelEmTexto(item.body) || detectarSegredoProvavelEmValor(item.metadata));
    if (itemComSegredo) {
      return reply.status(400).send({
        error: {
          code: 'SECRET_DETECTED',
          message: `Item '${itemComSegredo.slug}' contém segredo provável. Substitua por placeholders antes de sincronizar.`,
          status: 400,
        },
      });
    }

    if (request.body && (request.body as { scope?: SearchScope }).scope === 'global') {
      const { clientId } = request.body as { clientId: ClientProfileId };
      const { perfil } = await resolverClientProfile(request.user.id, clientId);
      const criados: string[] = [];
      const atualizados: string[] = [];

      for (const item of items) {
        const [existente] = await db
          .select()
          .from(clientProfileItems)
          .where(and(
            eq(clientProfileItems.clientProfileId, perfil.id),
            eq(clientProfileItems.type, item.type),
            eq(clientProfileItems.slug, item.slug),
          ))
          .limit(1);

        if (existente) {
          await db.insert(clientProfileItemVersions).values({
            clientProfileItemId: existente.id,
            version: existente.version,
            body: existente.body,
            metadata: existente.metadata,
          });

          await db
            .update(clientProfileItems)
            .set({
              title: item.title,
              body: item.body,
              metadata: anexarTagsAoMetadata(item.metadata, item.tags),
              version: existente.version + 1,
              updatedAt: new Date(),
            })
            .where(eq(clientProfileItems.id, existente.id));

          atualizados.push(item.slug);
          continue;
        }

        await db.insert(clientProfileItems).values({
          userId: request.user.id,
          clientProfileId: perfil.id,
          type: item.type,
          title: item.title,
          slug: item.slug,
          body: item.body,
          metadata: anexarTagsAoMetadata(item.metadata, item.tags),
        });

        criados.push(item.slug);
      }

      return {
        data: {
          created: criados,
          updated: atualizados,
          serverTime: new Date().toISOString(),
        },
      };
    }

    const contexto = await resolverProjeto(request.user.id, project!, workspace);
    if (!contexto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Projeto '${project}' não encontrado`, status: 404 },
      });
    }

    let folderId: string | null = null;
    if (folderSlug) {
      const [pasta] = await db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.projectId, contexto.projeto.id), eq(folders.slug, folderSlug)))
        .limit(1);

      if (pasta) {
        folderId = pasta.id;
      }
    }

    const criados: string[] = [];
    const atualizados: string[] = [];

    for (const item of items) {
      const [existente] = await db
        .select()
        .from(contentItems)
        .where(and(
          eq(contentItems.projectId, contexto.projeto.id),
          eq(contentItems.type, item.type),
          eq(contentItems.slug, item.slug),
        ))
        .limit(1);

      if (existente) {
        await db.insert(contentVersions).values({
          contentId: existente.id,
          version: existente.version,
          body: existente.body,
          metadata: existente.metadata,
        });

        await db
          .update(contentItems)
          .set({
            title: item.title,
            body: item.body,
            metadata: item.metadata,
            version: existente.version + 1,
            updatedAt: new Date(),
            ...(folderId ? { folderId } : {}),
          })
          .where(eq(contentItems.id, existente.id));

        await vincularTags(request.user.id, contexto.workspace.id, existente.id, item.tags);
        atualizados.push(item.slug);
      } else {
        const [novo] = await db
          .insert(contentItems)
          .values({
            userId: request.user.id,
            projectId: contexto.projeto.id,
            folderId,
            type: item.type,
            title: item.title,
            slug: item.slug,
            body: item.body,
            metadata: item.metadata,
          })
          .returning({ id: contentItems.id });

        await vincularTags(request.user.id, contexto.workspace.id, novo.id, item.tags);
        criados.push(item.slug);
      }
    }

    return {
      data: {
        created: criados,
        updated: atualizados,
        serverTime: new Date().toISOString(),
      },
    };
  });

  app.get('/status', async (request, reply) => {
    const { workspace, project, since, scope, clientId } = request.query as {
      workspace?: string;
      project?: string;
      since?: string;
      scope?: SearchScope;
      clientId?: ClientProfileId;
    };

    if (scope === 'global') {
      if (!clientId) {
        return reply.status(400).send({
          error: { code: 'MISSING_CLIENT_ID', message: 'Parâmetro clientId é obrigatório para scope=global', status: 400 },
        });
      }

      const { perfil } = await resolverClientProfile(request.user.id, clientId);
      const sinceDate = since ? new Date(since) : new Date(0);

      const alterados = await db
        .select({ id: clientProfileItems.id, slug: clientProfileItems.slug, type: clientProfileItems.type, updatedAt: clientProfileItems.updatedAt })
        .from(clientProfileItems)
        .where(and(
          eq(clientProfileItems.clientProfileId, perfil.id),
          gte(clientProfileItems.updatedAt, sinceDate),
        ));

      return {
        data: {
          changedCount: alterados.length,
          items: alterados,
          serverTime: new Date().toISOString(),
        },
      };
    }

    if (!project) {
      return reply.status(400).send({
        error: { code: 'MISSING_PROJECT', message: 'Parâmetro project é obrigatório', status: 400 },
      });
    }

    const contexto = await resolverProjeto(request.user.id, project, workspace);
    if (!contexto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Projeto '${project}' não encontrado`, status: 404 },
      });
    }

    const sinceDate = since ? new Date(since) : new Date(0);

    const alterados = await db
      .select({ id: contentItems.id, slug: contentItems.slug, type: contentItems.type, updatedAt: contentItems.updatedAt })
      .from(contentItems)
      .where(and(
        eq(contentItems.projectId, contexto.projeto.id),
        gte(contentItems.updatedAt, sinceDate),
      ));

    return {
      data: {
        changedCount: alterados.length,
        items: alterados,
        serverTime: new Date().toISOString(),
      },
    };
  });
}

const CAMPO_TAGS_METADATA = 'myinstTags';

function anexarTagsAoMetadata(metadata: Record<string, unknown>, tags: string[]) {
  return {
    ...metadata,
    [CAMPO_TAGS_METADATA]: tags,
  };
}

function lerTagsDoMetadata(metadata: Record<string, unknown>) {
  const tags = metadata[CAMPO_TAGS_METADATA];
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
}

function normalizarGlobalItem(item: typeof clientProfileItems.$inferSelect) {
  const metadata = item.metadata as Record<string, unknown>;
  return {
    ...item,
    metadata,
    tags: lerTagsDoMetadata(metadata),
  };
}

async function vincularTags(userId: string, workspaceId: string, contentId: string, tagNames: string[]) {
  await db.delete(contentTags).where(eq(contentTags.contentId, contentId));

  if (tagNames.length === 0) return;

  const tagsExistentes = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.workspaceId, workspaceId), inArray(tags.name, tagNames)));

  const nomesExistentes = new Set(tagsExistentes.map((tag) => tag.name));
  const tagsFaltantes = tagNames.filter((name) => !nomesExistentes.has(name));

  const tagsCriadas = tagsFaltantes.length > 0
    ? await db
        .insert(tags)
        .values(tagsFaltantes.map((name) => ({ userId, workspaceId, name, category: 'custom' as const })))
        .returning({ id: tags.id, name: tags.name })
    : [];

  const todasTags = [...tagsExistentes, ...tagsCriadas];
  if (todasTags.length === 0) return;

  await db.insert(contentTags).values(
    todasTags.map((tag) => ({ contentId, tagId: tag.id })),
  );
}
