const API_BASE = import.meta.env.VITE_MYINST_API_BASE?.trim();

function normalizarBaseApi(base: string): string {
  let baseNormalizada = base.replace(/\/+$/, '');

  while (/\/api(?:\/v1)?$/i.test(baseNormalizada)) {
    baseNormalizada = baseNormalizada.replace(/\/api(?:\/v1)?$/i, '').replace(/\/+$/, '');
  }

  return baseNormalizada;
}

export const API_SERVER_BASE = API_BASE ? normalizarBaseApi(API_BASE) : 'http://localhost:3000';
const BASE_URL = API_BASE ? `${API_SERVER_BASE}/api/v1` : '/api/v1';

function obterToken(): string | null {
  return localStorage.getItem('myinst_token');
}

export function salvarToken(token: string) {
  localStorage.setItem('myinst_token', token);
}

export function limparToken() {
  localStorage.removeItem('myinst_token');
}

export function estaAutenticado(): boolean {
  return !!obterToken();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = obterToken();
  const headers = new Headers(options.headers);

  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));

    if (response.status === 401 && token) {
      limparToken();

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    throw new Error(error.error?.message || response.statusText);
  }

  if (response.status === 204) return undefined as T;
  const json = await response.json();
  return json.data ?? json;
}

export const api = {
  auth: {
    registrar: (body: { email: string; password: string; displayName: string }) =>
      request<{ user: any; token: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<{ user: any; token: string }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    me: () => request<any>('/auth/me'),
    listarApiKeys: () => request<any[]>('/auth/api-keys'),
    criarApiKey: (body: { name: string; scopes: string[] }) =>
      request<any>('/auth/api-keys', { method: 'POST', body: JSON.stringify(body) }),
    deletarApiKey: (id: string) =>
      request<void>(`/auth/api-keys/${id}`, { method: 'DELETE' }),
  },
  workspaces: {
    listar: () => request<any[]>('/workspaces'),
    criar: (body: { name: string; slug: string; description?: string }) =>
      request<any>('/workspaces', { method: 'POST', body: JSON.stringify(body) }),
    obter: (workspaceSlug: string) => request<any>(`/workspaces/${workspaceSlug}`),
    atualizar: (workspaceSlug: string, body: { name?: string; slug?: string; description?: string }) =>
      request<any>(`/workspaces/${workspaceSlug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deletar: (workspaceSlug: string) =>
      request<void>(`/workspaces/${workspaceSlug}`, { method: 'DELETE' }),
  },
  clientProfiles: {
    listar: () => request<any[]>('/client-profiles'),
    obter: (clientId: string) => request<any>(`/client-profiles/${clientId}`),
    listarItens: (clientId: string, params?: { type?: string; active?: boolean }) => {
      const searchParams = new URLSearchParams();
      if (params?.type) searchParams.set('type', params.type);
      if (params?.active !== undefined) searchParams.set('active', String(params.active));
      return request<any[]>(`/client-profiles/${clientId}/items${searchParams.toString() ? `?${searchParams}` : ''}`);
    },
    criarItem: (clientId: string, body: any) =>
      request<any>(`/client-profiles/${clientId}/items`, { method: 'POST', body: JSON.stringify(body) }),
    atualizarItem: (clientId: string, itemSlug: string, body: any) =>
      request<any>(`/client-profiles/${clientId}/items/${itemSlug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deletarItem: (clientId: string, itemSlug: string) =>
      request<void>(`/client-profiles/${clientId}/items/${itemSlug}`, { method: 'DELETE' }),
    replicar: (
      sourceClient: string,
      targetClient: string,
      body: { dryRun?: boolean; types?: string[]; overwrite?: boolean },
    ) => request<{
      sourceClient: string;
      targetClient: string;
      pair: string;
      compatible: Array<{ type: string; slug: string; title: string; reason?: string }>;
      toCreate: Array<{ type: string; slug: string; title: string; reason?: string }>;
      toUpdate: Array<{ type: string; slug: string; title: string; reason?: string }>;
      skippedExisting: Array<{ type: string; slug: string; title: string; reason?: string }>;
      ignoredIncompatible: Array<{ type: string; slug: string; title: string; reason?: string }>;
      ignoredNoRule: Array<{ type: string; slug: string; title: string; reason?: string }>;
    }>(`/client-profiles/${sourceClient}/replicate/${targetClient}`, { method: 'POST', body: JSON.stringify(body) }),
  },
  projetos: {
    listar: (workspaceSlug?: string) =>
      workspaceSlug
        ? request<any[]>(`/workspaces/${workspaceSlug}/projects`)
        : request<any[]>('/projects'),
    criar: (workspaceSlug: string, body: { name: string; slug: string; description?: string }) =>
      request<any>(`/workspaces/${workspaceSlug}/projects`, { method: 'POST', body: JSON.stringify(body) }),
    obter: (workspaceSlug: string, projectSlug: string) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projectSlug}`),
    atualizar: (workspaceSlug: string, projectSlug: string, body: { name?: string; slug?: string; description?: string }) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projectSlug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deletar: (workspaceSlug: string, projectSlug: string) =>
      request<void>(`/workspaces/${workspaceSlug}/projects/${projectSlug}`, { method: 'DELETE' }),
  },
  conteudo: {
    listar: (workspaceSlug: string, projetoSlug: string, params?: { type?: string }) => {
      const query = params?.type ? `?type=${params.type}` : '';
      return request<any[]>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/content${query}`);
    },
    criar: (workspaceSlug: string, projetoSlug: string, body: any) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/content`, { method: 'POST', body: JSON.stringify(body) }),
    obter: (workspaceSlug: string, projetoSlug: string, contentSlug: string) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/content/${contentSlug}`),
    atualizar: (workspaceSlug: string, projetoSlug: string, contentSlug: string, body: any) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/content/${contentSlug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deletar: (workspaceSlug: string, projetoSlug: string, contentSlug: string) =>
      request<void>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/content/${contentSlug}`, { method: 'DELETE' }),
    diff: (workspaceSlug: string, projetoSlug: string, contentSlug: string, v1: number, v2?: number) => {
      const params = new URLSearchParams({ v1: String(v1) });
      if (v2) params.set('v2', String(v2));
      return request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/content/${contentSlug}/diff?${params}`);
    },
    restaurar: (workspaceSlug: string, projetoSlug: string, contentSlug: string, version: number) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/content/${contentSlug}/restore`, { method: 'POST', body: JSON.stringify({ version }) }),
  },
  state: {
    listarMemorias: (workspaceSlug: string, projetoSlug: string) =>
      request<any[]>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/state/memories`),
    criarMemoria: (workspaceSlug: string, projetoSlug: string, body: any) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/state/memories`, { method: 'POST', body: JSON.stringify(body) }),
    listarDecisoes: (workspaceSlug: string, projetoSlug: string) =>
      request<any[]>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/state/decisions`),
    criarDecisao: (workspaceSlug: string, projetoSlug: string, body: any) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/state/decisions`, { method: 'POST', body: JSON.stringify(body) }),
    listarSessoes: (workspaceSlug: string, projetoSlug: string) =>
      request<any[]>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/state/sessions`),
    criarSessao: (workspaceSlug: string, projetoSlug: string, body: any) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/state/sessions`, { method: 'POST', body: JSON.stringify(body) }),
  },
  tags: {
    listar: () => request<any[]>('/tags'),
    criar: (body: { name: string; category: string; color?: string }) =>
      request<any>('/tags', { method: 'POST', body: JSON.stringify(body) }),
    deletar: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
  },
  pastas: {
    listar: (workspaceSlug: string, projetoSlug: string) =>
      request<any[]>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/folders`),
    criar: (workspaceSlug: string, projetoSlug: string, body: { name: string; slug: string; sortOrder?: number }) =>
      request<any>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/folders`, { method: 'POST', body: JSON.stringify(body) }),
    deletar: (workspaceSlug: string, projetoSlug: string, folderId: string) =>
      request<void>(`/workspaces/${workspaceSlug}/projects/${projetoSlug}/folders/${folderId}`, { method: 'DELETE' }),
  },
  busca: {
    pesquisar: (params: { q: string; workspace?: string; project?: string; type?: string; scope?: string; clientId?: string }) => {
      const searchParams = new URLSearchParams({ q: params.q });
      if (params.workspace) searchParams.set('workspace', params.workspace);
      if (params.project) searchParams.set('project', params.project);
      if (params.type) searchParams.set('type', params.type);
      if (params.scope) searchParams.set('scope', params.scope);
      if (params.clientId) searchParams.set('clientId', params.clientId);
      return request<any[]>(`/search?${searchParams.toString()}`);
    },
  },
  mcp: {
    conectar: () => request<{ key: string }>('/mcp/token', { method: 'POST' }),
  },
};
