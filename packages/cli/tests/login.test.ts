import { describe, expect, it, vi } from 'vitest';
import { iniciarLoginBrowser } from '../src/auth-browser.js';

describe('login browser', () => {
  it('abre connect-mcp, recebe callback e valida token', async () => {
    const urlsAbertas: string[] = [];
    const validarCredencial = vi.fn().mockResolvedValue(true);

    const promessaLogin = iniciarLoginBrowser({
      server: 'https://api-myinst.lotoscore.com.br',
      abrirBrowser: async (url) => {
        urlsAbertas.push(url);
        const callbackPort = new URL(url).searchParams.get('callback_port');
        expect(callbackPort).toBeTruthy();
        const resposta = await fetch(`http://127.0.0.1:${callbackPort}/callback?token=myinst_12345678901234567890`);
        expect(resposta.status).toBe(200);
      },
      validarCredencial,
    });

    const config = await promessaLogin;

    expect(urlsAbertas[0]).toMatch(/^https:\/\/myinst\.lotoscore\.com\.br\/connect-mcp\?callback_port=\d+$/);
    expect(validarCredencial).toHaveBeenCalledWith('https://api-myinst.lotoscore.com.br', 'myinst_12345678901234567890');
    expect(config).toEqual({
      server: 'https://api-myinst.lotoscore.com.br',
      apiKey: 'myinst_12345678901234567890',
    });
  });
});
