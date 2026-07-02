#!/usr/bin/env node

import { Command } from 'commander';
import { executarLogin } from './commands/login.js';
import { executarPull } from './commands/pull.js';
import { executarPush } from './commands/push.js';
import { executarList } from './commands/list.js';
import { executarStatus } from './commands/status.js';
import {
  executarEnvDelete,
  executarEnvList,
  executarEnvPull,
  executarEnvPush,
  executarEnvShow,
} from './commands/env.js';
import { normalizarSyncOptions, type SyncCliOptions } from './commands/sync-options.js';
import {
  executarStateCapture,
  executarStatePull,
  executarStatePush,
  executarStateSearch,
  type ProjectStateType,
} from './commands/state.js';
import {
  executarChatDelete,
  executarChatExport,
  executarChatImport,
  executarChatList,
  executarChatPush,
  executarChatShow,
  executarChatSummarize,
} from './commands/chat.js';
import { avisarAtualizacaoDisponivel } from './update-check.js';

const programa = new Command();
const MYINST_VERSION = '0.1.0-beta.13';

programa
  .name('myinst')
  .description('CLI para gerenciar seu vault MyInst')
  .version(MYINST_VERSION);

programa
  .command('login')
  .description('Autenticar com o servidor MyInst')
  .option('--server <url>', 'URL do servidor MyInst')
  .option('--api-key <key>', 'API key para login manual sem navegador')
  .action(executarLogin);

programa
  .command('pull [projeto]')
  .description('Baixar conteudo do vault para estruturas nativas detectadas')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-c, --client <id...>', 'Client(s) a considerar')
  .option('--scope <scope>', 'Escopo: project, global ou all')
  .action((projeto: string = 'default', options: SyncCliOptions) => executarPull(projeto, normalizarSyncOptions(options)));

programa
  .command('push [projeto]')
  .description('Enviar conteudo nativo local detectado para o vault')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-c, --client <id...>', 'Client(s) a considerar')
  .option('--scope <scope>', 'Escopo: project, global ou all')
  .action((projeto: string = 'default', options: SyncCliOptions) => executarPush(projeto, normalizarSyncOptions(options)));

programa
  .command('list [projeto]')
  .alias('ls')
  .description('Listar conteudo de um projeto no vault')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .action((projeto: string = 'default', options: { workspace?: string }) => executarList(projeto, options.workspace));

programa
  .command('status [projeto]')
  .alias('st')
  .description('Mostrar pendencias de pull, push e conflitos do projeto')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-c, --client <id...>', 'Client(s) a considerar')
  .option('--scope <scope>', 'Escopo: project, global ou all')
  .action((projeto: string = 'default', options: SyncCliOptions) => executarStatus(projeto, normalizarSyncOptions(options)));

const state = programa
  .command('state')
  .description('Gerenciar Project State revisado do projeto');

state
  .command('capture <tipo> <titulo>')
  .description('Criar draft local revisavel de memoria, decisao ou sessao')
  .option('-b, --body <texto>', 'Conteudo do estado')
  .option('-f, --body-file <caminho>', 'Arquivo com o conteudo do estado')
  .option('-s, --slug <slug>', 'Slug do estado')
  .option('--summary <texto>', 'Resumo para sessoes')
  .option('--source-client <client>', 'Cliente de origem')
  .option('--source-path <caminho>', 'Caminho de origem')
  .option('--touched-file <caminho...>', 'Arquivos tocados na sessao')
  .option('--tool <nome...>', 'Ferramentas usadas na sessao')
  .option('--started-at <iso>', 'Inicio da sessao em ISO')
  .option('--ended-at <iso>', 'Fim da sessao em ISO')
  .action((tipo: ProjectStateType, titulo: string, options) => executarStateCapture(tipo, titulo, options));

state
  .command('push <draft>')
  .description('Enviar draft revisado de Project State para o vault')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-p, --project <slug>', 'Slug do projeto', 'default')
  .option('--reviewed', 'Marca metadata.reviewed=true antes do envio')
  .option('--dry-run', 'Valida sem enviar ao servidor')
  .action((draft: string, options) => executarStatePush(draft, options));

state
  .command('pull [projeto]')
  .description('Materializar Project State em .myinst/state/')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .action((projeto: string = 'default', options: { workspace?: string }) => executarStatePull(projeto, options.workspace));

state
  .command('search <query>')
  .description('Buscar memorias, decisoes e sessoes do Project State')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-p, --project <slug>', 'Slug do projeto')
  .option('-t, --type <tipo>', 'Tipo: memory, decision ou session')
  .action((query: string, options) => executarStateSearch(query, options));

const chat = programa
  .command('chat')
  .description('Gerenciar histórico de chats importado explicitamente');

chat
  .command('import')
  .description('Importar histórico/cache de client por seleção explícita')
  .requiredOption('-w, --workspace <slug>', 'Slug do workspace')
  .requiredOption('-p, --project <slug>', 'Slug do projeto')
  .requiredOption('-c, --client <client>', 'Client de origem')
  .requiredOption('--include <categorias>', 'Categorias separadas por vírgula: history,cache')
  .requiredOption('--path <path>', 'Arquivo ou diretório fonte do client')
  .option('--reviewed', 'Confirma revisão humana antes de enviar')
  .option('--dry-run', 'Mostra o plano sem enviar ao servidor')
  .action(executarChatImport);

chat
  .command('push')
  .description('Importar chat de arquivo JSON ou Markdown explícito')
  .requiredOption('-p, --project <slug>', 'Slug do projeto')
  .requiredOption('-c, --client <client>', 'Cliente de origem')
  .requiredOption('-s, --session <id>', 'ID da sessão no cliente')
  .requiredOption('-f, --file <path>', 'Arquivo JSON ou Markdown')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .action(executarChatPush);

chat
  .command('list')
  .description('Listar chats importados do projeto')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-p, --project <slug>', 'Slug do projeto', 'default')
  .option('-c, --client <client>', 'Filtrar por cliente')
  .option('-q, --q <texto>', 'Filtrar por texto')
  .option('--tag <tag>', 'Filtrar por tag em metadata.tags')
  .option('--from <iso>', 'Filtrar sessões iniciadas a partir desta data')
  .option('--to <iso>', 'Filtrar sessões iniciadas até esta data')
  .option('--limit <numero>', 'Limite de sessões retornadas')
  .option('--offset <numero>', 'Deslocamento da listagem')
  .action(executarChatList);

chat
  .command('show <sessionId>')
  .description('Mostrar mensagens de uma sessão de chat')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-p, --project <slug>', 'Slug do projeto', 'default')
  .option('--message-limit <numero>', 'Quantidade de mensagens retornadas')
  .option('--message-offset <numero>', 'Deslocamento das mensagens')
  .action((sessionId: string, options) => executarChatShow(sessionId, options));

chat
  .command('export <sessionId>')
  .description('Exportar chat como Markdown em .myinst/chats/')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-p, --project <slug>', 'Slug do projeto', 'default')
  .option('--format <format>', 'Formato de exportacao', 'markdown')
  .action((sessionId: string, options) => executarChatExport(sessionId, options));

chat
  .command('summarize <sessionId>')
  .description('Gerar ou atualizar resumo do chat')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-p, --project <slug>', 'Slug do projeto', 'default')
  .action((sessionId: string, options) => executarChatSummarize(sessionId, options));

chat
  .command('delete <sessionId>')
  .description('Remover uma sessão de chat importada')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .option('-p, --project <slug>', 'Slug do projeto', 'default')
  .action((sessionId: string, options) => executarChatDelete(sessionId, options));

const env = programa
  .command('env')
  .description('Gerenciar arquivos .env criptografados por projeto');

env
  .command('push')
  .description('Criptografar e enviar arquivo .env para o Env Vault')
  .requiredOption('-f, --file <path>', 'Arquivo .env local')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .requiredOption('-p, --project <slug>', 'Slug do projeto')
  .option('-n, --name <name>', 'Nome lógico do env')
  .option('--environment <name>', 'Ambiente associado')
  .option('--secret <secret>', 'Segredo local do Env Vault')
  .option('--create-recovery-key', 'Gerar recovery key local e enviar envelope de recuperação cifrado')
  .action(executarEnvPush);

env
  .command('pull')
  .description('Baixar e descriptografar arquivo .env do Env Vault')
  .requiredOption('-n, --name <name>', 'Nome lógico ou id do env')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .requiredOption('-p, --project <slug>', 'Slug do projeto')
  .option('-o, --output <path>', 'Destino local do arquivo')
  .option('--overwrite', 'Sobrescrever destino sem criar backup')
  .option('--secret <secret>', 'Segredo local do Env Vault')
  .action(executarEnvPull);

env
  .command('list')
  .description('Listar envs criptografados do projeto')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .requiredOption('-p, --project <slug>', 'Slug do projeto')
  .action(executarEnvList);

env
  .command('show')
  .description('Mostrar metadados seguros de um env')
  .requiredOption('-n, --name <name>', 'Nome lógico ou id do env')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .requiredOption('-p, --project <slug>', 'Slug do projeto')
  .action(executarEnvShow);

env
  .command('delete')
  .description('Remover env criptografado do projeto')
  .requiredOption('-n, --name <name>', 'Nome lógico ou id do env')
  .option('-w, --workspace <slug>', 'Slug do workspace')
  .requiredOption('-p, --project <slug>', 'Slug do projeto')
  .action(executarEnvDelete);

await avisarAtualizacaoDisponivel(MYINST_VERSION);

programa.parse();
