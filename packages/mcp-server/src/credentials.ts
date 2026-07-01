import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MYINST_DIR = '.myinst';
const CREDENTIALS_FILE = 'credentials.json';
const CONFIG_FILE = 'config.json';

export interface Credenciais {
  token: string;
  serverUrl: string;
  connectedAt: string;
}

export interface ConfigCli {
  apiKey: string;
  server: string;
}

function obterCaminhoCredenciais(): string {
  return join(homedir(), MYINST_DIR, CREDENTIALS_FILE);
}

function obterDiretorioMyInst(): string {
  return join(homedir(), MYINST_DIR);
}

export async function lerCredenciais(): Promise<Credenciais | null> {
  try {
    const caminho = obterCaminhoCredenciais();
    const conteudo = await readFile(caminho, 'utf-8');
    const dados = JSON.parse(conteudo) as Credenciais;

    if (!dados.token || !dados.serverUrl) {
      return null;
    }

    return dados;
  } catch {
    return null;
  }
}

export async function lerConfigCli(): Promise<ConfigCli | null> {
  try {
    const caminho = join(obterDiretorioMyInst(), CONFIG_FILE);
    const conteudo = await readFile(caminho, 'utf-8');
    const dados = JSON.parse(conteudo) as ConfigCli;

    if (!dados.apiKey || !dados.server) {
      return null;
    }

    return dados;
  } catch {
    return null;
  }
}

export async function salvarCredenciais(token: string, serverUrl: string): Promise<void> {
  const diretorio = obterDiretorioMyInst();
  const caminho = obterCaminhoCredenciais();

  await mkdir(diretorio, { recursive: true });

  const credenciais: Credenciais = {
    token,
    serverUrl,
    connectedAt: new Date().toISOString(),
  };

  await writeFile(caminho, JSON.stringify(credenciais, null, 2), { mode: 0o600 });

  try {
    await chmod(caminho, 0o600);
  } catch {
    // chmod pode falhar em alguns sistemas (Windows), ignorar
  }
}

export async function limparCredenciais(): Promise<void> {
  try {
    const caminho = obterCaminhoCredenciais();
    await unlink(caminho);
  } catch {
    // arquivo pode não existir, ignorar
  }
}
