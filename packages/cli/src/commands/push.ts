import { carregarConfig } from '../config.js';
import { executarPushSincronizado } from '../sync/operations.js';
import type { SyncOptionsNormalizadas } from './sync-options.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

export async function executarPush(projeto: string, options: SyncOptionsNormalizadas = {}): Promise<void> {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  console.log(`${CINZA}Verificando pendencias de sync do projeto "${projeto}"...${RESET}`);

  try {
    const resultado = await executarPushSincronizado({
      config,
      diretorio: process.cwd(),
      project: projeto,
      workspace: options.workspace,
      scope: options.scope,
      clients: options.clients,
    });

    if (!resultado.manifesto) {
      console.log(`${AMARELO}[WARN] Nenhum conteudo nativo encontrado para sync${RESET}`);
      return;
    }

    console.log(`${VERDE}[SUCCESS] Push concluido:${RESET}`);
    if (resultado.created.length) {
      console.log(`  ${VERDE}Criados:${RESET} ${resultado.created.join(', ')}`);
    }
    if (resultado.updated.length) {
      console.log(`  ${AMARELO}Atualizados:${RESET} ${resultado.updated.join(', ')}`);
    }
    console.log(`${CINZA}Manifesto atualizado em .myinst/sync-state.json${RESET}`);
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('Conflito de sync')) {
      console.error(`${VERMELHO}[ERROR] ${erro.message}${RESET}`);
      console.error(`${AMARELO}[WARN] Rode myinst status para revisar pendencias antes de enviar.${RESET}`);
    } else if (erro instanceof Error && erro.message.includes('fetch')) {
      console.error(`${VERMELHO}[ERROR] Nao foi possivel conectar ao servidor${RESET}`);
    } else if (erro instanceof Error) {
      console.error(`${VERMELHO}[ERROR] ${erro.message}${RESET}`);
    } else {
      throw erro;
    }
    process.exit(1);
  }
}
