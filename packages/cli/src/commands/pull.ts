import { carregarConfig } from '../config.js';
import { executarPullSincronizado } from '../sync/operations.js';
import type { SyncOptionsNormalizadas } from './sync-options.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

export async function executarPull(projeto: string, options: SyncOptionsNormalizadas = {}): Promise<void> {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  console.log(`${CINZA}Baixando conteudo do projeto "${projeto}"...${RESET}`);

  try {
    const resultado = await executarPullSincronizado({
      config,
      diretorio: process.cwd(),
      project: projeto,
      workspace: options.workspace,
      scope: options.scope,
      clients: options.clients,
    });

    if (resultado.items.length === 0) {
      console.log(`${AMARELO}[WARN] Nenhum conteudo encontrado no projeto "${projeto}"${RESET}`);
      return;
    }

    if (resultado.aplicados.length === 0) {
      console.log(`${AMARELO}[WARN] Conteudo remoto encontrado, mas nenhuma estrutura nativa compativel foi detectada para aplicar.${RESET}`);
      return;
    }

    console.log(`${VERDE}[SUCCESS] ${resultado.aplicados.length} arquivo(s) aplicado(s):${RESET}`);
    resultado.aplicados.forEach((caminho) => console.log(`  ${CINZA}${caminho}${RESET}`));
    console.log(`${CINZA}Manifesto atualizado em .myinst/sync-state.json${RESET}`);
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
