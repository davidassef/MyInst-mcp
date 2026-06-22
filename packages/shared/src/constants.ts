import { z } from 'zod';

export const CONTENT_TYPES = [
  'skill',
  'instruction',
  'mcp_config',
  'agent',
  'command',
  'hook',
  'memory',
  'output_style',
  'setting',
  'snippet',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const PROJECT_STATE_TYPES = [
  'memory',
  'decision',
  'session',
] as const;

export type ProjectStateType = (typeof PROJECT_STATE_TYPES)[number];

export const PROJECT_SESSION_STATUSES = [
  'draft',
  'reviewed',
  'archived',
] as const;

export type ProjectSessionStatus = (typeof PROJECT_SESSION_STATUSES)[number];

export const TAG_CATEGORIES = ['model', 'provider', 'custom'] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

export const API_KEY_PREFIX = 'myinst_';

export const API_KEY_SCOPES = ['read', 'write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const CLIENT_PROFILE_IDS = [
  'codex',
  'claude',
  'cursor',
  'gemini',
  'opencode',
  'qwen',
  'aider',
  'antigravity',
] as const;

export type ClientProfileId = (typeof CLIENT_PROFILE_IDS)[number];

export const SYNC_SCOPES = ['project', 'global', 'all'] as const;
export type SyncScope = (typeof SYNC_SCOPES)[number];

export const SEARCH_SCOPES = ['project', 'global', 'state', 'all'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];
