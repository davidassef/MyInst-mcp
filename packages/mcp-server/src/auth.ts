import { createServer, type Server } from 'node:http';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { URL } from 'node:url';
import { lerConfigCli, lerCredenciais, salvarCredenciais, limparCredenciais } from './credentials.js';

const DEFAULT_SERVER_URL = 'https://api-myinst.lotoscore.com.br';
const DEFAULT_APP_URL = 'https://myinst.lotoscore.com.br';
const TIMEOUT_MS = 5 * 60 * 1000;

export interface AuthResult {
  token: string;
  serverUrl: string;
}

export async function obterCredenciaisAtivas(serverUrlEnv?: string): Promise<AuthResult | null> {
  const credenciais = await lerCredenciais();

  if (!credenciais) {
    const configCli = await lerConfigCli();
    if (!configCli) {
      return null;
    }

    const serverUrl = serverUrlEnv || configCli.server || DEFAULT_SERVER_URL;
    const valido = await validarToken(configCli.apiKey, serverUrl);

    if (!valido) {
      return null;
    }

    return {
      token: configCli.apiKey,
      serverUrl,
    };
  }

  const serverUrl = serverUrlEnv || credenciais.serverUrl || DEFAULT_SERVER_URL;
  const valido = await validarToken(credenciais.token, serverUrl);

  if (!valido) {
    await limparCredenciais();
    return null;
  }

  return {
    token: credenciais.token,
    serverUrl,
  };
}

async function validarToken(token: string, serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function iniciarFluxoAutenticacao(serverUrlEnv?: string): Promise<AuthResult> {
  const serverUrl = serverUrlEnv || DEFAULT_SERVER_URL;
  const appUrl = inferirAppUrl(serverUrl);

  return new Promise<AuthResult>((resolve, reject) => {
    let servidor: Server;
    let porta: number;
    let timeoutId: NodeJS.Timeout;

    const limpar = () => {
      clearTimeout(timeoutId);
      servidor.close();
    };

    servidor = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(montarHtmlErro('Token não recebido.'));
          limpar();
          reject(new Error('Token não recebido no callback.'));
          return;
        }

        salvarCredenciais(token, serverUrl)
          .then(() => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(montarHtmlSucesso());
            limpar();
            resolve({ token, serverUrl });
          })
          .catch((err) => {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(montarHtmlErro('Erro ao salvar credenciais.'));
            limpar();
            reject(err);
          });
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    servidor.listen(0, '127.0.0.1', () => {
      const address = servidor.address();
      if (!address || typeof address === 'string') {
        limpar();
        reject(new Error('Não foi possível iniciar servidor local.'));
        return;
      }

      porta = address.port;
      const urlConexao = `${appUrl}/connect-mcp?callback_port=${porta}`;

      console.error('');
      console.error('═══════════════════════════════════════════════════════');
      console.error('  AUTENTICAÇÃO MYINST MCP NECESSÁRIA');
      console.error('');
      console.error(`  Abra este link no seu navegador:`);
      console.error(`  ${urlConexao}`);
      console.error('');
      console.error('  Após autenticar, volte ao openCode. O servidor');
      console.error('  aguardará o callback automaticamente.');
      console.error('═══════════════════════════════════════════════════════');
      console.error('');

      abrirBrowser(urlConexao).catch(() => {});

      timeoutId = setTimeout(() => {
        limpar();
        reject(new Error('Timeout: autenticação não concluída em 5 minutos.'));
      }, TIMEOUT_MS);
    });

    servidor.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Erro ao iniciar servidor local: ${err.message}`));
    });
  });
}

function inferirAppUrl(serverUrl: string): string {
  if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
    return 'http://localhost:5173';
  }

  if (serverUrl === 'https://api-myinst.lotoscore.com.br') {
    return DEFAULT_APP_URL;
  }

  try {
    const url = new URL(serverUrl);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return DEFAULT_APP_URL;
  }
}

async function abrirBrowser(url: string): Promise<void> {
  const sistema = platform();
  let comando: string;

  if (sistema === 'darwin') {
    comando = `open "${url}"`;
  } else if (sistema === 'win32') {
    comando = `start "" "${url}"`;
  } else {
    comando = `xdg-open "${url}"`;
  }

  return new Promise((resolve, reject) => {
    exec(comando, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function montarHtmlSucesso(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyInst MCP - Conectado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(180deg, #04070c 0%, #061019 42%, #03060a 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      color: #10b981;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: #fff;
    }
    p {
      font-size: 0.95rem;
      color: #94a3b8;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h1>Conectado com sucesso!</h1>
    <p>O MyInst MCP está vinculado à sua conta. Você pode fechar esta aba e voltar ao seu cliente MCP.</p>
  </div>
</body>
</html>`;
}

function montarHtmlErro(mensagem: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyInst MCP - Erro</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(180deg, #04070c 0%, #061019 42%, #03060a 100%);
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.5rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      color: #ef4444;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: #fff;
    }
    p {
      font-size: 0.95rem;
      color: #94a3b8;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
    <h1>Erro na conexão</h1>
    <p>${mensagem}</p>
  </div>
</body>
</html>`;
}
