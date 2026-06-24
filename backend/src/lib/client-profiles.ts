import { and, eq, sql } from 'drizzle-orm';
import type { ClientProfileId } from '@myinst/shared';
import { db } from '../db/index.js';
import { clientProfileItems, clientProfiles } from '../db/schema.js';

type ClientProfileListItem = typeof clientProfiles.$inferSelect & {
  itemCount: number;
  isConfigured: boolean;
};

const CLIENTES_SUPORTADOS: Record<ClientProfileId, { name: string; slug: string; description: string }> = {
  codex: {
    name: 'Codex',
    slug: 'codex',
    description: 'Configurações globais do Codex válidas para todos os projetos da conta.',
  },
  claude: {
    name: 'Claude',
    slug: 'claude',
    description: 'Configurações globais do Claude Code válidas para todos os projetos da conta.',
  },
  cursor: {
    name: 'Cursor',
    slug: 'cursor',
    description: 'Configurações globais do Cursor válidas para todos os projetos da conta.',
  },
  gemini: {
    name: 'Gemini',
    slug: 'gemini',
    description: 'Configurações globais do Gemini válidas para todos os projetos da conta.',
  },
  opencode: {
    name: 'OpenCode',
    slug: 'opencode',
    description: 'Configurações globais do OpenCode válidas para todos os projetos da conta.',
  },
  qwen: {
    name: 'Qwen',
    slug: 'qwen',
    description: 'Configurações globais do Qwen Code válidas para todos os projetos da conta.',
  },
  aider: {
    name: 'Aider',
    slug: 'aider',
    description: 'Configurações globais do Aider válidas para todos os projetos da conta.',
  },
  antigravity: {
    name: 'Antigravity',
    slug: 'antigravity',
    description: 'Configurações globais do Antigravity válidas para todos os projetos da conta.',
  },
  kimi: {
    name: 'Kimi Code',
    slug: 'kimi',
    description: 'Configurações globais do Kimi Code CLI válidas para todos os projetos da conta.',
  },
};

export function listarClientesProfileSuportados() {
  return Object.entries(CLIENTES_SUPORTADOS).map(([clientId, config]) => ({
    clientId,
    ...config,
  }));
}

export function obterDefinicaoClientProfile(clientId: ClientProfileId) {
  return CLIENTES_SUPORTADOS[clientId];
}

export async function obterOuCriarClientProfile(userId: string, clientId: ClientProfileId) {
  const existente = await buscarClientProfile(userId, clientId);
  if (existente) {
    return existente;
  }

  const definicao = obterDefinicaoClientProfile(clientId);
  const [criado] = await db
    .insert(clientProfiles)
    .values({
      userId,
      clientId,
      name: definicao.name,
      slug: definicao.slug,
      description: definicao.description,
    })
    .returning();

  return criado;
}

export async function buscarClientProfile(userId: string, clientId: ClientProfileId) {
  const [perfil] = await db
    .select()
    .from(clientProfiles)
    .where(and(eq(clientProfiles.userId, userId), eq(clientProfiles.clientId, clientId)))
    .limit(1);

  return perfil ?? null;
}

export async function listarClientProfilesDoUsuario(userId: string) {
  const existentes = await db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, userId));

  const contagens = await db
    .select({
      clientProfileId: clientProfileItems.clientProfileId,
      total: sql<number>`count(*)`,
    })
    .from(clientProfileItems)
    .where(eq(clientProfileItems.userId, userId))
    .groupBy(clientProfileItems.clientProfileId);

  const porCliente = new Map(existentes.map((perfil) => [perfil.clientId, perfil]));
  const totalPorPerfil = new Map(contagens.map((contagem) => [contagem.clientProfileId, Number(contagem.total)]));

  const perfis = listarClientesProfileSuportados().map<ClientProfileListItem>((cliente) => {
    const existente = porCliente.get(cliente.clientId);
    if (existente) {
      const itemCount = totalPorPerfil.get(existente.id) ?? 0;
      return {
        ...existente,
        itemCount,
        isConfigured: itemCount > 0,
      };
    }

    return {
      id: '',
      userId,
      clientId: cliente.clientId as ClientProfileId,
      name: cliente.name,
      slug: cliente.slug,
      description: cliente.description,
      itemCount: 0,
      isConfigured: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  });

  return perfis.sort((perfilA, perfilB) => {
    if (perfilA.isConfigured !== perfilB.isConfigured) {
      return perfilA.isConfigured ? -1 : 1;
    }

    return perfilA.name.localeCompare(perfilB.name, 'pt-BR');
  });
}
