import { carregarConfig } from '../config.js';
import { obterSyncStatus } from '../sync/operations.js';
import { renderizarSyncStatus } from '../sync/status.js';
import type { SyncOptionsNormalizadas } from './sync-options.js';

const VERMELHO = '\x1b[31m';
const RESET = '\x1b[0m';

export async function executarStatus(projeto: string, options: SyncOptionsNormalizadas = {}): Promise<void> {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  try {
    const status = await obterSyncStatus({
      config,
      diretorio: process.cwd(),
      project: projeto,
      workspace: options.workspace,
      scope: options.scope,
      clients: options.clients,
    });

    console.log(renderizarSyncStatus(status));
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('fetch')) {
      console.error(`${VERMELHO}[ERROR] Nao foi possivel conectar ao servidor${RESET}`);
    } else if (erro instanceof Error) {
      console.error(`${VERMELHO}[ERROR] ${erro.message}${RESET}`);
    } else {
      throw erro;
    }
    process.exit(1);
  }
}
