import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  carregarChatDeArquivo,
  materializarChatMarkdown,
  planejarImportacaoChatClient,
} from '../src/commands/chat.js';

describe('Chat CLI', () => {
  it('carrega conversa de arquivo JSON explícito', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-json-'));
    const caminho = join(dir, 'chat.json');

    await writeFile(caminho, JSON.stringify({
      title: 'Sessão Codex',
      summary: 'Resumo inicial',
      messages: [
        { role: 'user', content: 'Corrija o pull.' },
        { role: 'assistant', content: 'Pull corrigido.', tokenCount: 4 },
      ],
    }), 'utf-8');

    const chat = await carregarChatDeArquivo(caminho, {
      client: 'codex',
      session: 'sessao-1',
    });

    expect(chat).toEqual(expect.objectContaining({
      client: 'codex',
      externalSessionId: 'sessao-1',
      title: 'Sessão Codex',
      summary: 'Resumo inicial',
    }));
    expect(chat.messages).toHaveLength(2);

    await rm(dir, { recursive: true, force: true });
  });

  it('carrega conversa de Markdown explícito como mensagem única', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-md-'));
    const caminho = join(dir, 'chat.md');

    await writeFile(caminho, '# Retrospectiva\n\nConteúdo revisado da sessão.', 'utf-8');

    const chat = await carregarChatDeArquivo(caminho, {
      client: 'codex',
      session: 'sessao-md',
    });

    expect(chat.title).toBe('Retrospectiva');
    expect(chat.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '# Retrospectiva\n\nConteúdo revisado da sessão.',
      }),
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('materializa export markdown retornado pela API', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-export-'));

    const caminho = await materializarChatMarkdown(dir, 'sessao-1', '# Sessão\n\nConteúdo');
    const conteudo = await readFile(caminho, 'utf-8');

    expect(caminho.replace(/\\/g, '/')).toContain('.myinst/chats/sessao-1.md');
    expect(conteudo).toBe('# Sessão\n\nConteúdo');

    await rm(dir, { recursive: true, force: true });
  });

  it('planeja importação de histórico Codex a partir de diretório explícito', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-codex-'));
    const historicoDir = join(dir, '2026', '07');
    await mkdir(historicoDir, { recursive: true });

    const caminho = join(historicoDir, 'sessao-codex.jsonl');
    const registrosJsonl = [
      { type: 'turn_context', payload: { cwd: 'D:\\Documentos\\Projetos\\MyInst' } },
      {
        type: 'response_item',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'MYINST_API_KEY=myinst_12345678901234567890123456789012' }],
        },
      },
      {
        type: 'response_item',
        item: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Configuração revisada.' }],
        },
      },
    ];

    await writeFile(caminho, registrosJsonl.map((registro) => JSON.stringify(registro)).join('\n'), 'utf-8');

    const plano = await planejarImportacaoChatClient({
      client: 'codex',
      include: ['history'],
      sourcePath: dir,
    });

    expect(plano.sessions).toHaveLength(1);
    expect(plano.sessions[0]).toEqual(expect.objectContaining({
      client: 'codex',
      externalSessionId: 'sessao-codex',
      title: 'MYINST_API_KEY={{MYINST_API_KEY}}',
    }));
    expect(plano.sessions[0].messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'MYINST_API_KEY={{MYINST_API_KEY}}',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Configuração revisada.',
      }),
    ]);
    expect(plano.sessions[0].metadata).toEqual(expect.objectContaining({
      client: 'codex',
      source: 'codex-jsonl',
      sourceFile: caminho,
      sourceCwd: 'D:\\Documentos\\Projetos\\MyInst',
    }));

    await rm(dir, { recursive: true, force: true });
  });

  it('planeja importação de histórico Codex no formato payload do desktop', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-codex-payload-'));
    const caminho = join(dir, 'sessao-desktop.jsonl');
    const registrosJsonl = [
      { type: 'turn_context', payload: { cwd: 'D:\\Documentos\\Projetos\\MyInst' } },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: 'Responda em pt-BR.' }],
        },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Sincronize o histórico.' }],
        },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Histórico sincronizado.' }],
        },
      },
    ];

    await writeFile(caminho, registrosJsonl.map((registro) => JSON.stringify(registro)).join('\n'), 'utf-8');

    const plano = await planejarImportacaoChatClient({
      client: 'codex',
      include: ['history'],
      sourcePath: caminho,
    });

    expect(plano.sessions).toHaveLength(1);
    expect(plano.sessions[0].messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Sincronize o histórico.' }),
      expect.objectContaining({ role: 'assistant', content: 'Histórico sincronizado.' }),
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('ignora contexto operacional do Codex e inicia na primeira fala real do usuário', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-codex-context-'));
    const caminho = join(dir, 'sessao-com-contexto.jsonl');
    const registrosJsonl = [
      {
        timestamp: '2026-07-02T10:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: '<permissions instructions>\nFilesystem sandboxing...' }],
        },
      },
      {
        timestamp: '2026-07-02T10:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '# AGENTS.md instructions\n\n<INSTRUCTIONS>...' }],
        },
      },
      {
        timestamp: '2026-07-02T10:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Mensagem anterior ao pedido real.' }],
        },
      },
      {
        timestamp: '2026-07-02T10:00:03.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Corrija a sincronização de chats.' }],
        },
      },
      {
        timestamp: '2026-07-02T10:00:04.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'tool',
          content: [{ type: 'output_text', text: '[tool_output]\nExit code: 0\nWall time: 1.2 seconds' }],
        },
      },
      {
        timestamp: '2026-07-02T10:00:05.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Sincronização corrigida.' }],
        },
      },
    ];

    await writeFile(caminho, registrosJsonl.map((registro) => JSON.stringify(registro)).join('\n'), 'utf-8');

    const plano = await planejarImportacaoChatClient({
      client: 'codex',
      include: ['history'],
      sourcePath: caminho,
    });

    expect(plano.sessions[0].title).toBe('Corrija a sincronização de chats.');
    expect(plano.sessions[0].startedAt).toBe('2026-07-02T10:00:03.000Z');
    expect(plano.sessions[0].updatedAt).toBe('2026-07-02T10:00:05.000Z');
    expect(plano.sessions[0].messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Corrija a sincronização de chats.',
        createdAt: '2026-07-02T10:00:03.000Z',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Sincronização corrigida.',
        createdAt: '2026-07-02T10:00:05.000Z',
      }),
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('usa o pedido real como título quando a mensagem contém anexos do Codex', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-codex-files-'));
    const caminho = join(dir, 'sessao-com-anexo.jsonl');
    const mensagemComAnexo = [
      '# Files mentioned by the user:',
      '',
      '## log.txt: C:\\Temp\\log.txt',
      '',
      '## My request for Codex:',
      'Analise o log e encontre a causa.',
    ].join('\n');
    const registrosJsonl = [
      {
        timestamp: '2026-07-02T11:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: mensagemComAnexo }],
        },
      },
      {
        timestamp: '2026-07-02T11:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Causa encontrada.' }],
        },
      },
    ];

    await writeFile(caminho, registrosJsonl.map((registro) => JSON.stringify(registro)).join('\n'), 'utf-8');

    const plano = await planejarImportacaoChatClient({
      client: 'codex',
      include: ['history'],
      sourcePath: caminho,
    });

    expect(plano.sessions[0].title).toBe('Analise o log e encontre a causa.');

    await rm(dir, { recursive: true, force: true });
  });

  it('redige mensagem inteira quando histórico tem segredo em texto livre', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-codex-secret-'));
    const caminho = join(dir, 'sessao-segredo.jsonl');
    const registrosJsonl = [
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Use Bearer abcdefghijklmnop para testar.' }],
        },
      },
    ];

    await writeFile(caminho, registrosJsonl.map((registro) => JSON.stringify(registro)).join('\n'), 'utf-8');

    const plano = await planejarImportacaoChatClient({
      client: 'codex',
      include: ['history'],
      sourcePath: caminho,
    });

    expect(plano.sessions[0].messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '{{SECRET}}',
        metadata: expect.objectContaining({ myinstRedactedSecrets: ['secret'] }),
      }),
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('bloqueia cache enquanto não houver persistência segura por client', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-cache-'));

    await expect(planejarImportacaoChatClient({
      client: 'codex',
      include: ['cache'],
      sourcePath: dir,
    })).rejects.toThrow('cache ainda não possui persistência segura');

    await rm(dir, { recursive: true, force: true });
  });

  it('bloqueia histórico de clients sem adapter dedicado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myinst-chat-unsupported-'));

    await expect(planejarImportacaoChatClient({
      client: 'claude',
      include: ['history'],
      sourcePath: dir,
    })).rejects.toThrow('Histórico do client claude ainda não possui adapter de importação');

    await rm(dir, { recursive: true, force: true });
  });
});
