import { z } from 'zod';
import type {
  registrarUsuarioSchema,
  loginSchema,
  criarApiKeySchema,
  criarWorkspaceSchema,
  atualizarWorkspaceSchema,
  criarProjetoSchema,
  atualizarProjetoSchema,
  criarFolderSchema,
  criarConteudoSchema,
  atualizarConteudoSchema,
  criarTagSchema,
  criarClientProfileItemSchema,
  atualizarClientProfileItemSchema,
  replicarClientProfileSchema,
  criarProjectStateSchema,
  atualizarProjectStateSchema,
  criarChatSessionSchema,
  resumirChatSessionSchema,
  syncPullSchema,
  syncPushSchema,
} from '../schemas/index.js';

export type RegistrarUsuarioInput = z.infer<typeof registrarUsuarioSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CriarApiKeyInput = z.infer<typeof criarApiKeySchema>;
export type CriarWorkspaceInput = z.infer<typeof criarWorkspaceSchema>;
export type AtualizarWorkspaceInput = z.infer<typeof atualizarWorkspaceSchema>;
export type CriarProjetoInput = z.infer<typeof criarProjetoSchema>;
export type AtualizarProjetoInput = z.infer<typeof atualizarProjetoSchema>;
export type CriarFolderInput = z.infer<typeof criarFolderSchema>;
export type CriarConteudoInput = z.infer<typeof criarConteudoSchema>;
export type AtualizarConteudoInput = z.infer<typeof atualizarConteudoSchema>;
export type CriarTagInput = z.infer<typeof criarTagSchema>;
export type CriarClientProfileItemInput = z.infer<typeof criarClientProfileItemSchema>;
export type AtualizarClientProfileItemInput = z.infer<typeof atualizarClientProfileItemSchema>;
export type ReplicarClientProfileInput = z.infer<typeof replicarClientProfileSchema>;
export type CriarProjectStateInput = z.infer<typeof criarProjectStateSchema>;
export type AtualizarProjectStateInput = z.infer<typeof atualizarProjectStateSchema>;
export type CriarChatSessionInput = z.infer<typeof criarChatSessionSchema>;
export type ResumirChatSessionInput = z.infer<typeof resumirChatSessionSchema>;
export type SyncPullInput = z.infer<typeof syncPullSchema>;
export type SyncPushInput = z.infer<typeof syncPushSchema>;

export interface ResumoReplicacaoClientProfileItem {
  type: string;
  slug: string;
  title: string;
  reason?: string;
}

export interface ResumoReplicacaoClientProfile {
  sourceClient: string;
  targetClient: string;
  pair: string;
  compatible: ResumoReplicacaoClientProfileItem[];
  toCreate: ResumoReplicacaoClientProfileItem[];
  toUpdate: ResumoReplicacaoClientProfileItem[];
  skippedExisting: ResumoReplicacaoClientProfileItem[];
  ignoredIncompatible: ResumoReplicacaoClientProfileItem[];
  ignoredNoRule: ResumoReplicacaoClientProfileItem[];
}

export interface Usuario {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Projeto {
  id: string;
  userId: string;
  workspaceId: string | null;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientProfile {
  id: string;
  userId: string;
  clientId: string;
  name: string;
  slug: string;
  description: string | null;
  itemCount: number;
  isConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  sortOrder: number;
  createdAt: string;
}

export interface ClientProfileItem {
  id: string;
  userId: string;
  clientProfileId: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface ConteudoItem {
  id: string;
  userId: string;
  projectId: string;
  folderId: string | null;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  metadata: Record<string, unknown>;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface ProjectStateBase {
  id: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  sourceClient: string | null;
  sourcePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemory extends ProjectStateBase {
  type: 'memory';
}

export interface ProjectDecision extends ProjectStateBase {
  type: 'decision';
}

export interface ProjectSession extends ProjectStateBase {
  type: 'session';
  summary: string;
  touchedFiles: string[];
  toolsUsed: string[];
  status: string;
  startedAt: string | null;
  endedAt: string | null;
}

export type ProjectStateItem = ProjectMemory | ProjectDecision | ProjectSession;

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokenCount: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  client: string;
  externalSessionId: string;
  title: string;
  summary: string | null;
  startedAt: string;
  updatedAt: string;
  retentionUntil: string;
  metadata: Record<string, unknown>;
  messageCount?: number;
  messages?: ChatMessage[];
}

export interface Tag {
  id: string;
  userId: string;
  workspaceId: string | null;
  name: string;
  category: string;
  color: string | null;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface SyncPullResponse {
  items: ConteudoItem[];
  syncToken: string;
  serverTime: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    perPage: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    status: number;
  };
}
