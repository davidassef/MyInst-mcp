import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, boolean, integer, timestamp, pgEnum, jsonb, inet, bigserial, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const contentTypeEnum = pgEnum('content_type', [
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
]);

export const tagCategoryEnum = pgEnum('tag_category', [
  'model',
  'provider',
  'custom',
]);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  maxItems: integer('max_items').notNull(),
  maxProjects: integer('max_projects').notNull(),
  maxApiKeys: integer('max_api_keys').notNull(),
  rateLimit: integer('rate_limit').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  avatarUrl: text('avatar_url'),
  planId: uuid('plan_id').references(() => plans.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const oauthProviderEnum = pgEnum('oauth_provider', ['google', 'github']);

export const oauthAccounts = pgTable('oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: oauthProviderEnum('provider').notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('oauth_accounts_provider_account_idx').on(table.provider, table.providerAccountId),
  index('oauth_accounts_user_idx').on(table.userId),
]);

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 14 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  scopes: text('scopes').array().default(['read', 'write']).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('api_keys_user_name_idx').on(table.userId, table.name),
  index('api_keys_hash_idx').on(table.keyHash),
  index('api_keys_prefix_idx').on(table.keyPrefix),
]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('workspaces_user_slug_idx').on(table.userId, table.slug),
  index('workspaces_user_idx').on(table.userId),
]);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('projects_workspace_slug_idx').on(table.workspaceId, table.slug),
  index('projects_workspace_idx').on(table.workspaceId),
]);

export const clientProfiles = pgTable('client_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: varchar('client_id', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('client_profiles_user_client_idx').on(table.userId, table.clientId),
  uniqueIndex('client_profiles_user_slug_idx').on(table.userId, table.slug),
  index('client_profiles_user_idx').on(table.userId),
]);

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('folders_project_slug_idx').on(table.projectId, table.slug),
]);

export const contentItems = pgTable('content_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  type: contentTypeEnum('type').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  description: text('description'),
  body: text('body').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('content_project_type_slug_idx').on(table.projectId, table.type, table.slug),
  index('content_user_project_idx').on(table.userId, table.projectId),
  index('content_type_idx').on(table.type),
  index('content_search_idx').using(
    'gin',
    sql`to_tsvector('portuguese', coalesce(${table.title}, '') || ' ' || coalesce(${table.body}, '') || ' ' || coalesce(${table.description}, ''))`,
  ),
]);

export const clientProfileItems = pgTable('client_profile_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientProfileId: uuid('client_profile_id').notNull().references(() => clientProfiles.id, { onDelete: 'cascade' }),
  type: contentTypeEnum('type').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  description: text('description'),
  body: text('body').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('client_profile_items_profile_type_slug_idx').on(table.clientProfileId, table.type, table.slug),
  index('client_profile_items_user_profile_idx').on(table.userId, table.clientProfileId),
  index('client_profile_items_type_idx').on(table.type),
  index('client_profile_items_search_idx').using(
    'gin',
    sql`to_tsvector('portuguese', coalesce(${table.title}, '') || ' ' || coalesce(${table.body}, '') || ' ' || coalesce(${table.description}, ''))`,
  ),
]);

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  category: tagCategoryEnum('category').notNull(),
  color: varchar('color', { length: 7 }),
}, (table) => [
  uniqueIndex('tags_workspace_name_idx').on(table.workspaceId, table.name),
  index('tags_workspace_idx').on(table.workspaceId),
]);

export const contentTags = pgTable('content_tags', {
  contentId: uuid('content_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => [
  index('content_tags_tag_idx').on(table.tagId),
]);

export const contentVersions = pgTable('content_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentId: uuid('content_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('content_versions_content_version_idx').on(table.contentId, table.version),
]);

export const clientProfileItemVersions = pgTable('client_profile_item_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientProfileItemId: uuid('client_profile_item_id').notNull().references(() => clientProfileItems.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('client_profile_item_versions_item_version_idx').on(table.clientProfileItemId, table.version),
]);

export const projectMemories = pgTable('project_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  sourceClient: varchar('source_client', { length: 50 }),
  sourcePath: text('source_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('project_memories_project_slug_idx').on(table.projectId, table.slug),
  index('project_memories_project_idx').on(table.projectId),
  index('project_memories_search_idx').using(
    'gin',
    sql`to_tsvector('portuguese', coalesce(${table.title}, '') || ' ' || coalesce(${table.body}, ''))`,
  ),
]);

export const projectDecisions = pgTable('project_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  sourceClient: varchar('source_client', { length: 50 }),
  sourcePath: text('source_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('project_decisions_project_slug_idx').on(table.projectId, table.slug),
  index('project_decisions_project_idx').on(table.projectId),
  index('project_decisions_search_idx').using(
    'gin',
    sql`to_tsvector('portuguese', coalesce(${table.title}, '') || ' ' || coalesce(${table.body}, ''))`,
  ),
]);

export const projectSessions = pgTable('project_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  body: text('body').notNull(),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  sourceClient: varchar('source_client', { length: 50 }),
  sourcePath: text('source_path'),
  touchedFiles: text('touched_files').array().default([]).notNull(),
  toolsUsed: text('tools_used').array().default([]).notNull(),
  status: varchar('status', { length: 30 }).default('reviewed').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('project_sessions_project_slug_idx').on(table.projectId, table.slug),
  index('project_sessions_project_idx').on(table.projectId),
  index('project_sessions_search_idx').using(
    'gin',
    sql`to_tsvector('portuguese', coalesce(${table.title}, '') || ' ' || coalesce(${table.summary}, '') || ' ' || coalesce(${table.body}, ''))`,
  ),
]);

export const modelProfiles = pgTable('model_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  modelPattern: varchar('model_pattern', { length: 200 }).notNull(),
  tags: text('tags').array().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('model_profiles_workspace_name_idx').on(table.workspaceId, table.name),
  index('model_profiles_workspace_idx').on(table.workspaceId),
]);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }),
  resourceId: uuid('resource_id'),
  details: jsonb('details').default({}).notNull(),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_log_user_idx').on(table.userId, table.createdAt),
]);
