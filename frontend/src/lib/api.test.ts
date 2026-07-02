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
});
