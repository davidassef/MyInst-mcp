import { iniciarLoginBrowser, validarServidor } from '../auth-browser.js';
import { salvarConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const RESET = '\x1b[0m';

interface LoginOptions {
  server?: string;
  apiKey?: string;
}

export async function executarLogin(options: LoginOptions = {}): Promise<void> {
  try {
    if (options.apiKey) {
      await executarLoginManual(options);
      return;
    }

    console.log(`${CINZA}[INFO] Abrindo navegador para conectar o MyInst...${RESET}`);
    const config = await iniciarLoginBrowser({ server: options.server });
    salvarConfig(config);
    console.log(`${VERDE}[SUCCESS] Autenticado com sucesso. Configuracao salva.${RESET}`);
  } catch (erro) {
    if (erro instanceof Error) {
      console.error(`${VERMELHO}[ERROR] ${erro.message}${RESET}`);
      process.exit(1);
    }

    throw erro;
  }
}

async function executarLoginManual(options: LoginOptions): Promise<void> {
  const server = (options.server || 'https://api-myinst.lotoscore.com.br').replace(/\/$/, '');
  const apiKey = options.apiKey;

  if (!apiKey) {
    console.error(`${VERMELHO}[ERROR] API Key obrigatoria${RESET}`);
    process.exit(1);
  }

  process.stdout.write(`${CINZA}Validando credenciais...${RESET}`);
  const valido = await validarServidor(server, apiKey);

  if (!valido) {
    console.error(`\n${VERMELHO}[ERROR] Nao foi possivel conectar ao servidor ou API Key invalida${RESET}`);
    process.exit(1);
  }

  salvarConfig({ server, apiKey });
  console.log(`\n${VERDE}[SUCCESS] Autenticado com sucesso. Configuracao salva.${RESET}`);
}
