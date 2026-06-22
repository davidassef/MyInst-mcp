interface PushItem {
  type: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface PushParams {
  scope?: 'project' | 'global' | 'all';
  workspace?: string;
  project?: string;
  clientId?: string;
  folderSlug?: string;
  items: PushItem[];
}

interface PushResponse {
  created: string[];
  updated: string[];
  serverTime: string;
}

interface PullParams {
  scope?: 'project' | 'global' | 'all';
  workspace?: string;
  project?: string;
  clientId?: string;
  types?: string[];
  tags?: string[];
  since?: string;
}

interface ConteudoItem {
  id: string;
  type: string;
  title: string;
  slug: string;
  description?: string | null;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface PullResponse {
  items: ConteudoItem[];
  syncToken: string;
  serverTime: string;
}

interface StatusResponse {
  changedCount: number;
  items: { id: string; slug: string; type: string; updatedAt: string }[];
  serverTime: string;
}

interface SearchResultItem extends ConteudoItem {
  project_slug?: string | null;
  workspace_slug?: string;
  source_scope?: 'project' | 'global' | 'state';
  client_id?: string | null;
  rank: number;
}

interface ProjectStateInput {
  type: 'memory' | 'decision' | 'session';
  title: string;
  slug: string;
  body: string;
  summary?: string;
  metadata: Record<string, unknown>;
  sourceClient?: string;
  sourcePath?: string;
  touchedFiles?: string[];
  toolsUsed?: string[];
  status?: 'draft' | 'reviewed' | 'archived';
  startedAt?: string;
  endedAt?: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
}

interface Projeto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  workspaceId?: string | null;
}

interface PerfilModelo {
  id: string;
  name: string;
  modelPattern: string;
  tags: string[];
}

interface ClientProfile {
  id: string;
  userId: string;
  clientId: string;
  name: string;
  slug: string;
  description: string | null;
}

export class MyInstClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`MyInst API error (${response.status}): ${error.error?.message || response.statusText}`);
    }

    const json = await response.json();
    return json.data ?? json;
  }

  async listarProjetos(): Promise<Projeto[]> {
    return this.request<Projeto[]>('/projects');
  }

  async listarWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>('/workspaces');
  }

  async listarProjetosDoWorkspace(workspace?: string): Promise<Projeto[]> {
    if (!workspace) {
      return this.listarProjetos();
    }

    return this.request<Projeto[]>(`/workspaces/${encodeURIComponent(workspace)}/projects`);
  }

  async listarClientProfiles(): Promise<ClientProfile[]> {
    return this.request<ClientProfile[]>('/client-profiles');
  }

  async criarProjeto(
    body: { name: string; slug: string; description?: string },
    workspace?: string,
  ): Promise<Projeto> {
    if (workspace) {
      return this.request<Projeto>(`/workspaces/${encodeURIComponent(workspace)}/projects`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    return this.request<Projeto>('/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async pull(params: PullParams): Promise<PullResponse> {
    return this.request<PullResponse>('/sync/pull', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async status(project: string, since?: string, workspace?: string): Promise<StatusResponse> {
    const query = new URLSearchParams({ project });
    if (since) query.set('since', since);
    if (workspace) query.set('workspace', workspace);
    return this.request<StatusResponse>(`/sync/status?${query}`);
  }

  async statusGlobal(clientId: string, since?: string): Promise<StatusResponse> {
    const query = new URLSearchParams({ scope: 'global', clientId });
    if (since) query.set('since', since);
    return this.request<StatusResponse>(`/sync/status?${query}`);
  }

  async push(params: PushParams): Promise<PushResponse> {
    return this.request<PushResponse>('/sync/push', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async buscarConteudo(params: {
    query: string;
    workspace?: string;
    project?: string;
    type?: string;
    scope?: 'project' | 'global' | 'state' | 'all';
    clientId?: string;
  }): Promise<SearchResultItem[]> {
    const searchParams = new URLSearchParams({ q: params.query });
    if (params.workspace) searchParams.set('workspace', params.workspace);
    if (params.project) searchParams.set('project', params.project);
    if (params.type) searchParams.set('type', params.type);
    if (params.scope) searchParams.set('scope', params.scope);
    if (params.clientId) searchParams.set('clientId', params.clientId);

    return this.request<SearchResultItem[]>(`/search?${searchParams.toString()}`);
  }

  async listarProjectState(workspace: string, project: string) {
    const base = `/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/state`;
    const [memories, decisions, sessions] = await Promise.all([
      this.request<Array<Record<string, unknown>>>(`${base}/memories`),
      this.request<Array<Record<string, unknown>>>(`${base}/decisions`),
      this.request<Array<Record<string, unknown>>>(`${base}/sessions`),
    ]);

    return { memories, decisions, sessions };
  }

  async criarProjectState(workspace: string, project: string, item: ProjectStateInput) {
    const endpoint = item.type === 'memory'
      ? 'memories'
      : item.type === 'decision'
        ? 'decisions'
        : 'sessions';

    return this.request(`/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/state/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async listarItensClientProfile(clientId: string, params?: { type?: string; active?: boolean }) {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.active !== undefined) searchParams.set('active', String(params.active));
    const query = searchParams.toString();
    return this.request<ConteudoItem[]>(`/client-profiles/${encodeURIComponent(clientId)}/items${query ? `?${query}` : ''}`);
  }

  async matchProfile(model: string, workspace?: string): Promise<PerfilModelo | null> {
    try {
      const searchParams = new URLSearchParams({ model });
      if (workspace) searchParams.set('workspace', workspace);
      return await this.request<PerfilModelo>(`/profiles/match?${searchParams.toString()}`);
    } catch {
      return null;
    }
  }

  async listarPastas(project: string, workspace?: string): Promise<{ id: string; slug: string; name: string }[]> {
    if (workspace) {
      return this.request(`/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/folders`);
    }

    return this.request(`/projects/${project}/folders`);
  }

  async criarPasta(project: string, body: { name: string; slug: string }, workspace?: string): Promise<{ id: string; slug: string; name: string }> {
    if (workspace) {
      return this.request(`/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/folders`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    return this.request(`/projects/${project}/folders`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
