import { exec } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { platform } from 'node:os';
import { URL } from 'node:url';
import type { MyInstConfig } from './config.js';

const DEFAULT_SERVER_URL = 'https://api-myinst.lotoscore.com.br';
const DEFAULT_APP_URL = 'https://myinst.lotoscore.com.br';
const TIMEOUT_MS = 5 * 60 * 1000;

interface LoginBrowserParams {
  server?: string;
  abrirBrowser?: (url: string) => Promise<void>;
  validarCredencial?: (server: string, apiKey: string) => Promise<boolean>;
}

export async function iniciarLoginBrowser(params: LoginBrowserParams = {}): Promise<MyInstConfig> {
  const server = normalizarServer(params.server || DEFAULT_SERVER_URL);
  const appUrl = inferirAppUrl(server);
  const abrirBrowser = params.abrirBrowser || abrirUrlNoBrowser;
  const validarCredencial = params.validarCredencial || validarServidor;

  return new Promise<MyInstConfig>((resolve, reject) => {
    let servidor: Server | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    function limpar() {
      if (timeoutId) clearTimeout(timeoutId);
      if (servidor) servidor.close();
    }

    servidor = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const apiKey = url.searchParams.get('token');
      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Token não recebido.');
        limpar();
        reject(new Error('Token não recebido no callback.'));
        return;
      }

      const valido = await validarCredencial(server, apiKey);
      if (!valido) {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Credencial inválida.');
        limpar();
        reject(new Error('Credencial recebida, mas validação falhou.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html lang="pt-BR"><body><h1>MyInst conectado</h1><p>Você pode fechar esta aba.</p></body></html>');
      limpar();
      resolve({ server, apiKey });
    });

    servidor.listen(0, '127.0.0.1', () => {
      const address = servidor?.address();
      if (!address || typeof address === 'string') {
        limpar();
        reject(new Error('Não foi possível iniciar servidor local de login.'));
        return;
      }

      const urlConexao = `${appUrl}/connect-mcp?callback_port=${address.port}`;
      timeoutId = setTimeout(() => {
        limpar();
        reject(new Error('Timeout: login não concluído em 5 minutos.'));
      }, TIMEOUT_MS);

      abrirBrowser(urlConexao).catch((erro) => {
        limpar();
        reject(erro);
      });
    });

    servidor.on('error', (erro) => {
      limpar();
      reject(new Error(`Erro ao iniciar servidor local de login: ${erro.message}`));
    });
  });
}

export async function validarServidor(server: string, apiKey: string): Promise<boolean> {
  try {
    const resposta = await fetch(`${normalizarServer(server)}/api/v1/workspaces`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

function normalizarServer(server: string): string {
  return server.replace(/\/$/, '');
}

function inferirAppUrl(server: string): string {
  if (server.includes('localhost') || server.includes('127.0.0.1')) {
    return 'http://localhost:5173';
  }

  if (server === DEFAULT_SERVER_URL) {
    return DEFAULT_APP_URL;
  }

  try {
    const url = new URL(server);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return DEFAULT_APP_URL;
  }
}

async function abrirUrlNoBrowser(url: string): Promise<void> {
  const sistema = platform();
  const comando = sistema === 'darwin'
    ? `open "${url}"`
    : sistema === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;

  return new Promise((resolve, reject) => {
    exec(comando, (erro) => {
      if (erro) {
        reject(erro);
        return;
      }

      resolve();
    });
  });
}
