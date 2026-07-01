import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregarChatDeArquivo, materializarChatMarkdown } from '../src/commands/chat.js';

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
});
