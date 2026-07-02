import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
});

describe('api.chats', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    storage.clear();
  });

  it('lista chats importados do projeto pelo endpoint dedicado', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'chat-1',
            client: 'codex',
            externalSessionId: 'sessao-1',
            title: 'Sessão Codex',
            messageCount: 12,
          },
        ],
      }),
    } as Response);

    const chats = await api.chats.listar('meus-projetos', 'myinst', {
      client: 'codex',
      limit: 20,
    });

    expect(chats).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/chats?client=codex&limit=20', {
      headers: expect.any(Headers),
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-local');
  });

  it('busca mensagens de um chat pelo identificador da sessão', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'chat-1',
          client: 'codex',
          externalSessionId: 'sessao-1',
          title: 'Sessão Codex',
          messageCount: 1,
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Abrir chat',
              metadata: {},
              createdAt: '2026-07-02T12:00:00.000Z',
            },
          ],
        },
      }),
    } as Response);

    const chat = await api.chats.obter('meus-projetos', 'myinst', 'sessao-1', {
      messageLimit: 50,
      messageOffset: 0,
    });

    expect(chat.messages).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/chats/sessao-1?messageLimit=50&messageOffset=0', {
      headers: expect.any(Headers),
    });
  });

  it('remove chat importado pelo endpoint dedicado', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await api.chats.deletar('meus-projetos', 'myinst', 'sessao-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/chats/sessao-1', {
      method: 'DELETE',
      headers: expect.any(Headers),
    });
  });
});

describe('api.state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    storage.clear();
  });

  it('remove memória de Project State pelo slug', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await api.state.deletarMemoria('meus-projetos', 'myinst', 'stack-do-projeto');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/state/memories/stack-do-projeto', {
      method: 'DELETE',
      headers: expect.any(Headers),
    });
  });

  it('remove decisão de Project State pelo slug', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await api.state.deletarDecisao('meus-projetos', 'myinst', 'usar-fastify');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/state/decisions/usar-fastify', {
      method: 'DELETE',
      headers: expect.any(Headers),
    });
  });

  it('remove sessão de Project State pelo slug', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await api.state.deletarSessao('meus-projetos', 'myinst', 'sessao-inicial');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/state/sessions/sessao-inicial', {
      method: 'DELETE',
      headers: expect.any(Headers),
    });
  });
});

describe('api.envVault', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    storage.clear();
  });

  it('lista envs por projeto sem buscar payload criptografado', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'env-1',
            name: 'local',
            sourcePath: '.env.local',
            metadata: { ciphertextByteLength: 120 },
          },
        ],
      }),
    } as Response);

    const envs = await api.envVault.listar('meus-projetos', 'myinst');

    expect(envs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/env-files', {
      headers: expect.any(Headers),
    });
  });

  it('cria env enviando somente envelope cifrado', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'env-1', name: 'local' } }),
    } as Response);

    await api.envVault.criar('meus-projetos', 'myinst', {
      name: 'local',
      sourcePath: '.env.local',
      encryptedPayload: {
        version: 'env-vault-v1',
        algorithm: 'AES-GCM',
        kdf: {
          algorithm: 'pbkdf2-sha256',
          iterations: 210000,
          keyLength: 32,
          digest: 'sha256',
        },
        salt: 'AAAAAAAAAAAAAAAAAAAAAA',
        iv: 'AAAAAAAAAAAAAAAA',
        authTag: 'AAAAAAAAAAAAAAAAAAAAAA',
        ciphertext: 'AAAAAAAA',
      },
      metadata: {
        ciphertextByteLength: 6,
        ciphertextSha256: 'a'.repeat(64),
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).not.toHaveProperty('plaintext');
    expect(body).not.toHaveProperty('keyNames');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/env-files', {
      method: 'POST',
      body: expect.any(String),
      headers: expect.any(Headers),
    });
  });

  it('busca payload criptografado por id em rota dedicada', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'env-1', name: 'local', encryptedPayload: { ciphertext: 'abc' } } }),
    } as Response);

    const env = await api.envVault.obter('meus-projetos', 'myinst', 'env-1');

    expect(env.id).toBe('env-1');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/env-files/env-1', {
      headers: expect.any(Headers),
    });
  });

  it('remove env por id em rota dedicada', async () => {
    localStorage.setItem('myinst_token', 'token-local');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await api.envVault.deletar('meus-projetos', 'myinst', 'env-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/meus-projetos/projects/myinst/env-files/env-1', {
      method: 'DELETE',
      headers: expect.any(Headers),
    });
  });
});
