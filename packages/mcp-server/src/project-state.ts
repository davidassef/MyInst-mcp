import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { detectarSegredoProvavelEmValor } from '@myinst/shared/security';

export type ProjectStateType = 'memory' | 'decision' | 'session';

export interface ProjectStateDraft {
  type: ProjectStateType;
  title: string;
  slug: string;
  body: string;
  summary?: string;
  metadata: Record<string, unknown>;
  sourceClient?: string;
  sourcePath?: string;
  touchedFiles: string[];
  toolsUsed: string[];
  status: 'draft' | 'reviewed' | 'archived';
  startedAt?: string;
  endedAt?: string;
}

export function criarSlugState(texto: string) {
  const slug = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return slug || `state-${Date.now()}`;
}

export async function criarDraftProjectState(targetDir: string, draft: ProjectStateDraft) {
  const dir = join(targetDir, '.myinst', 'state', 'drafts');
  await mkdir(dir, { recursive: true });

  const caminho = join(dir, `${draft.type}-${draft.slug}.json`);
  await writeFile(caminho, JSON.stringify(draft, null, 2), 'utf-8');
  return caminho;
}

export async function carregarDraftProjectState(baseDir: string, draftPath: string): Promise<ProjectStateDraft> {
  const caminho = isAbsolute(draftPath) ? draftPath : join(baseDir, draftPath);
  const conteudo = await readFile(caminho, 'utf-8');
  return JSON.parse(conteudo) as ProjectStateDraft;
}

export function detectarSegredoProvavel(draft: ProjectStateDraft) {
  return detectarSegredoProvavelEmValor(draft);
}

export async function materializarProjectState(
  targetDir: string,
  state: {
    memories: Array<{ title: string; slug: string; body: string; metadata: Record<string, unknown> }>;
    decisions: Array<{ title: string; slug: string; body: string; metadata: Record<string, unknown> }>;
    sessions: Array<{
      title: string;
      slug: string;
      body: string;
      summary: string;
      metadata: Record<string, unknown>;
      touchedFiles?: string[];
      toolsUsed?: string[];
      status?: string;
      startedAt?: string | null;
      endedAt?: string | null;
    }>;
  },
) {
  const base = join(targetDir, '.myinst', 'state');
  const escritos: string[] = [];

  await mkdir(join(base, 'memories'), { recursive: true });
  await mkdir(join(base, 'decisions'), { recursive: true });
  await mkdir(join(base, 'sessions'), { recursive: true });

  for (const memoria of state.memories) {
    const caminho = join(base, 'memories', `${memoria.slug}.md`);
    await writeFile(caminho, montarMarkdownState('memory', memoria), 'utf-8');
    escritos.push(caminho);
  }

  for (const decisao of state.decisions) {
    const caminho = join(base, 'decisions', `${decisao.slug}.md`);
    await writeFile(caminho, montarMarkdownState('decision', decisao), 'utf-8');
    escritos.push(caminho);
  }

  for (const sessao of state.sessions) {
    const caminho = join(base, 'sessions', `${sessao.slug}.md`);
    await writeFile(caminho, montarMarkdownState('session', sessao), 'utf-8');
    escritos.push(caminho);
  }

  return escritos;
}

function montarMarkdownState(
  type: ProjectStateType,
  item: {
    title: string;
    slug: string;
    body: string;
    summary?: string;
    metadata: Record<string, unknown>;
  },
) {
  const frontmatter = [
    '---',
    `type: ${type}`,
    `slug: ${item.slug}`,
    `reviewed: ${item.metadata.reviewed === true ? 'true' : 'false'}`,
    '---',
    '',
  ].join('\n');

  const resumo = item.summary ? `\n## Resumo\n\n${item.summary}\n` : '';
  return `${frontmatter}# ${item.title}\n${resumo}\n${item.body}\n`;
}
