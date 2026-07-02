import { z } from 'zod';
import { envVaultEncryptedPayloadSchema, envVaultRecoveryEnvelopeSchema } from '../env-vault.js';
import {
  CONTENT_TYPES,
  TAG_CATEGORIES,
  API_KEY_SCOPES,
  CLIENT_PROFILE_IDS,
  PROJECT_SESSION_STATUSES,
  PROJECT_STATE_TYPES,
  SYNC_SCOPES,
} from '../constants.js';

export const registrarUsuarioSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const criarApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).default(['read', 'write']),
  expiresAt: z.string().datetime().optional(),
});

export const criarWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

export const atualizarWorkspaceSchema = criarWorkspaceSchema.partial();

export const criarProjetoSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
});

export const atualizarProjetoSchema = criarProjetoSchema.partial();

export const clientProfileIdSchema = z.enum(CLIENT_PROFILE_IDS);

export const criarClientProfileItemSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  body: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const atualizarClientProfileItemSchema = criarClientProfileItemSchema.partial();

export const replicarClientProfileSchema = z.object({
  dryRun: z.boolean().optional(),
  types: z.array(z.enum(CONTENT_TYPES)).optional(),
  overwrite: z.boolean().optional(),
});

export const criarProjectStateSchema = z.object({
  type: z.enum(PROJECT_STATE_TYPES),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  body: z.string().min(1),
  summary: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).default({}),
  sourceClient: z.string().max(50).optional(),
  sourcePath: z.string().max(500).optional(),
  touchedFiles: z.array(z.string().max(500)).default([]),
  toolsUsed: z.array(z.string().max(100)).default([]),
  status: z.enum(PROJECT_SESSION_STATUSES).default('reviewed'),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
});

export const atualizarProjectStateSchema = criarProjectStateSchema.partial();

export const criarChatSessionSchema = z.object({
  client: z.string().min(1).max(50),
  session: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  summary: z.string().max(4000).optional(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  retentionUntil: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string().min(1),
    tokenCount: z.number().int().nonnegative().optional(),
    metadata: z.record(z.unknown()).default({}),
    createdAt: z.string().datetime().optional(),
  })).min(1),
});

export const resumirChatSessionSchema = z.object({
  summary: z.string().max(4000).optional(),
}).default({});

const nomeEnvVaultSchema = z.string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9._-]+$/);

const caminhoEnvVaultSchema = z.string()
  .min(1)
  .max(500)
  .refine((valor) => !valor.includes('\0'))
  .refine((valor) => !valor.includes('..'));

const ambienteEnvVaultSchema = z.string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9._-]+$/)
  .optional();

export const envVaultFileMetadataSchema = z.object({
  ciphertextByteLength: z.number().int().positive().max(5 * 1024 * 1024),
  ciphertextSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const criarEnvVaultFileSchema = z.object({
  name: nomeEnvVaultSchema,
  sourcePath: caminhoEnvVaultSchema,
  environment: ambienteEnvVaultSchema,
  encryptedPayload: envVaultEncryptedPayloadSchema,
  metadata: envVaultFileMetadataSchema,
  recoveryEnvelopes: z.array(envVaultRecoveryEnvelopeSchema).max(5).optional(),
}).strict();

export const criarFolderSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  sortOrder: z.number().int().default(0),
});

export const criarConteudoSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  body: z.string().min(1),
  folderId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const atualizarConteudoSchema = criarConteudoSchema.partial();

export const criarTagSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  category: z.enum(TAG_CATEGORIES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const criarPerfilSchema = z.object({
  name: z.string().min(1).max(100),
  modelPattern: z.string().min(1).max(200),
  tags: z.array(z.string()).min(1),
});

export const atualizarPerfilSchema = criarPerfilSchema.partial();

export const syncPullSchema = z.object({
  scope: z.enum(SYNC_SCOPES).optional(),
  workspace: z.string().optional(),
  project: z.string().optional(),
  clientId: clientProfileIdSchema.optional(),
  types: z.array(z.enum(CONTENT_TYPES)).optional(),
  tags: z.array(z.string()).optional(),
  since: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  if (value.scope === 'global') {
    if (!value.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clientId'],
        message: 'clientId é obrigatório quando scope=global',
      });
    }

    return;
  }

  if (!value.project) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['project'],
      message: 'project é obrigatório quando scope não é global',
    });
  }
});

export const syncPushSchema = z.object({
  scope: z.enum(SYNC_SCOPES).optional(),
  workspace: z.string().optional(),
  project: z.string().optional(),
  clientId: clientProfileIdSchema.optional(),
  folderSlug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  items: z.array(z.object({
    type: z.enum(CONTENT_TYPES),
    title: z.string().min(1).max(200),
    slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
    body: z.string().min(1),
    metadata: z.record(z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
  })),
}).superRefine((value, ctx) => {
  if (value.scope === 'global') {
    if (!value.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clientId'],
        message: 'clientId é obrigatório quando scope=global',
      });
    }

    return;
  }

  if (!value.project) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['project'],
      message: 'project é obrigatório quando scope não é global',
    });
  }
});
