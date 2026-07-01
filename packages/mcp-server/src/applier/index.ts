import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface ConteudoItem {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

export type ConflictStrategy = 'overwrite' | 'prefix' | 'skip';

interface ItemAplicado {
  type: string;
  title: string;
  slug: string;
  path: string;
  status: 'created' | 'overwritten' | 'prefixed' | 'skipped';
}

const MARCADOR_GUIA_MYINST = '<!-- myinst-managed: true -->';

const CONTEUDO_GUIA_MYINST = `${MARCADOR_GUIA_MYINST}
# MyInst MCP

Use o MyInst como fluxo local-first para materializar, editar e sincronizar contexto agentic.

## Modelo de escopo
- project: conteudo do repositorio atual. Vai para workspace/projeto no vault.
- global: configuracoes e skills de cliente que valem para toda a conta. Vao para Client Profiles, fora de workspace e projeto.
- all: combina project e global na mesma operacao, mas o MyInst separa o destino correto de cada item.

## Fluxo oficial
- No inicio do trabalho, use myinst_pull para materializar o conteudo relevante localmente.
- Prefira os arquivos locais materializados em vez de repetir consultas ao MCP.
- Use myinst_search apenas para descoberta pontual ou para localizar conteudo remoto antes de materializar.
- Sempre que criar, editar, reescrever ou reorganizar skills, instructions, agents, hooks, memory, snippets ou mcp_config, finalize com myinst_push para sincronizar de volta.
- O mesmo vale para commands, output styles e settings globais redigidos quando o client suportar esses artefatos.

## Project State
- Conteudo autoral e configuracao continuam no fluxo myinst_pull -> trabalho local -> myinst_push.
- Continuidade de projeto usa tools separadas: myinst_state_capture, myinst_state_push, myinst_state_pull e myinst_state_search.
- Use Project State para memorias revisadas, decisoes tecnicas e resumos seguros de sessao.
- Nao sincronize cache bruto, transcripts completos, sessions internas, history, bancos locais, JSONL operacional, telemetry ou runtime interno.
- Chats so podem entrar como resumo revisado, nunca como copia bruta por padrao.
- myinst_state_capture cria draft local em .myinst/state/drafts e nao envia nada ao servidor.
- myinst_state_push so deve ser usado depois de revisar o draft e definir metadata.reviewed=true.

## Regras de uso
- Se estiver trabalhando no repositorio atual, use scope=project.
- Se estiver trabalhando em configuracoes da home do usuario, como .codex, .gemini ou .config/opencode, use scope=global.
- Se houver mais de um cliente detectado, informe clients explicitamente.
- Quando nao estiver no contexto default, informe workspace e project explicitamente nas tools de projeto.
- Nao trate configuracoes globais de cliente como projeto. O destino correto e Client Profiles.

## Regras de segurança (obrigatórias)
- O agente nao deve inserir ou divulgar informacoes sensiveis.
- Nunca inclua 'senha', 'token', 'api key', 'secret', 'oauth', credenciais, cookies ou conteúdo de '.env' em texto plano.
- Nao passe segredos reais no 'myinst_push'.
- Se um valor sensivel for necessario no arquivo original, substitua por placeholder generico, por exemplo:
  - '{{API_KEY}}'
  - '{{DATABASE_URL}}'
  - '{{SECRET_KEY}}'
  - '{{TOKEN_ACESSO}}'
- Se houver erro de parse, bloqueio ou limite, interrompa e reporte o plano de acao sem expor secret.
- Para itens com configuracao persistente e seguranca, registre estrutura e metadados e indique que o valor deve ser aplicado localmente.
- Se qualquer item contiver segredo real detectado, suspenda o push e execute revisão manual antes de sincronizar.
- Checklist obrigatório antes de 'myinst_push' (no mesmo ciclo):
  - conteudo revisado
  - sem segredos reais em texto plano
  - placeholders aplicados onde necessário
- Não substitua placeholders por valores reais no fluxo automático.

## Exemplos operacionais
- Projeto atual: myinst_pull com scope=project, editar arquivos locais, depois myinst_push com scope=project.
- Global do Codex: myinst_pull com scope=global e clients=["codex"], editar o conteudo materializado, depois myinst_push com scope=global e clients=["codex"].
- Busca global: myinst_search com scope=global e clientId="codex".
- Busca de projeto: myinst_search com workspace e project quando o contexto nao for o default.

## Arquivos materializados
- Conteudo canonico de projeto: .myinst/content/{tipo}/{slug}
- Settings globais: .myinst/client-profiles/{clientId}/settings/{slug}.json
- Layouts nativos de clientes: use myinst_pull com targetFormat="native" e clients explicitos

## Regra final
O ciclo correto e sempre:
myinst_pull -> trabalho local -> myinst_push
`;

const MAPEAMENTO_DIRETORIO: Record<string, string> = {
  skill: '.myinst/content/skills',
  instruction: '.myinst/content/instructions',
  mcp_config: '.myinst/content/mcp-config',
  agent: '.myinst/content/agents',
  command: '.myinst/content/commands',
  hook: '.myinst/content/hooks',
  memory: '.myinst/content/memory',
  output_style: '.myinst/content/output-styles',
  setting: '.myinst/content/settings',
  snippet: '.myinst/content/snippets',
};

const MAPEAMENTO_ARQUIVO: Record<string, (slug: string) => string> = {
  skill: (slug) => `${slug}.md`,
  instruction: (slug) => `${slug}.md`,
  mcp_config: (slug) => `${slug}.json`,
  agent: (slug) => `${slug}.md`,
  command: (slug) => `${slug}.md`,
  hook: (slug) => `hook-${slug}.md`,
  memory: (slug) => `${slug}.md`,
  output_style: (slug) => `${slug}.md`,
  setting: (slug) => `${slug}.json`,
  snippet: (slug) => `${slug}.md`,
};

async function arquivoExiste(caminho: string): Promise<boolean> {
  try {
    await access(caminho, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function aplicarConteudo(
  items: ConteudoItem[],
  targetDir: string,
  conflictStrategy: ConflictStrategy = 'overwrite',
): Promise<ItemAplicado[]> {
  const aplicados: ItemAplicado[] = [];

  aplicados.push(...(await aplicarGuiaMyInst(targetDir, conflictStrategy)));

  for (const item of items) {
    const dir = resolverDiretorioItem(targetDir, item);
    const nomeArquivo = resolverNomeArquivoItem(item);
    const caminhoCompleto = join(dir, nomeArquivo);

    await mkdir(dir, { recursive: true });

    const existe = await arquivoExiste(caminhoCompleto);

    if (existe && conflictStrategy === 'skip') {
      aplicados.push({ type: item.type, title: item.title, slug: item.slug, path: caminhoCompleto, status: 'skipped' });
      continue;
    }

    let caminhoFinal = caminhoCompleto;
    let status: ItemAplicado['status'] = existe ? 'overwritten' : 'created';

    if (existe && conflictStrategy === 'prefix') {
      const nomePrefixado = `vault-${nomeArquivo}`;
      caminhoFinal = join(dir, nomePrefixado);
      status = 'prefixed';
    }

    let conteudo = item.body;

    if (item.type === 'instruction') {
      conteudo = `# ${item.title}\n\n${item.body}`;
    }

    await writeFile(caminhoFinal, conteudo, 'utf-8');

    aplicados.push({ type: item.type, title: item.title, slug: item.slug, path: caminhoFinal, status });
  }

  return aplicados;
}

function resolverDiretorioItem(targetDir: string, item: ConteudoItem) {
  if (item.metadata?.myinstSourceScope === 'global') {
    const clientId = typeof item.metadata?.myinstClientId === 'string' ? item.metadata.myinstClientId : 'unknown';
    const base = join(targetDir, '.myinst', 'client-profiles', clientId);

    switch (item.type) {
      case 'skill':
        return join(base, 'skills');
      case 'instruction':
        return join(base, 'instructions');
      case 'agent':
        return join(base, 'agents');
      case 'command':
        return join(base, 'commands');
      case 'output_style':
        return join(base, 'output-styles');
      case 'setting':
        return join(base, 'settings');
      case 'mcp_config':
        return join(base, 'mcp-config');
      case 'hook':
        return join(base, 'hooks');
      case 'memory':
        return join(base, 'memory');
      case 'snippet':
        return join(base, 'snippets');
      default:
        return join(base, 'items');
    }
  }

  return join(targetDir, MAPEAMENTO_DIRETORIO[item.type] || '.claude');
}

function resolverNomeArquivoItem(item: ConteudoItem) {
  if (item.metadata?.myinstSourceScope === 'global' && item.type === 'setting') {
    const extensao = typeof item.metadata?.myinstFileExtension === 'string'
      ? item.metadata.myinstFileExtension
      : '.json';
    return `${item.slug}${extensao}`;
  }

  if (item.metadata?.myinstSourceScope === 'global' && item.type === 'mcp_config') {
    const extensao = typeof item.metadata?.myinstFileExtension === 'string'
      ? item.metadata.myinstFileExtension
      : '.json';
    return `${item.slug}${extensao}`;
  }

  return MAPEAMENTO_ARQUIVO[item.type]?.(item.slug) || `${item.slug}.md`;
}

async function aplicarGuiaMyInst(
  targetDir: string,
  conflictStrategy: ConflictStrategy,
): Promise<ItemAplicado[]> {
  const resultado: ItemAplicado[] = [];

  const caminhoPrincipal = join(targetDir, '.myinst');
  const caminhoRaiz = join(caminhoPrincipal, 'MYINST.md');
  const caminhoRaizExiste = await arquivoExiste(caminhoRaiz);

  await mkdir(caminhoPrincipal, { recursive: true });
  await writeFile(caminhoRaiz, CONTEUDO_GUIA_MYINST, 'utf-8');
  resultado.push(criarResultadoGuia(caminhoRaiz, caminhoRaizExiste ? 'overwritten' : 'created'));

  const compatibilidade = await aplicarGuiaMyInstCompat(targetDir, conflictStrategy);
  if (compatibilidade) {
    resultado.push(compatibilidade);
  }

  return resultado;
}

async function aplicarGuiaMyInstCompat(
  targetDir: string,
  conflictStrategy: ConflictStrategy,
): Promise<ItemAplicado | null> {
  const dir = join(targetDir, '.claude');
  const caminhoGuia = join(dir, 'MYINST.md');

  await mkdir(dir, { recursive: true });

  const existe = await arquivoExiste(caminhoGuia);
  if (!existe) {
    await writeFile(caminhoGuia, CONTEUDO_GUIA_MYINST, 'utf-8');
    return criarResultadoGuia(caminhoGuia, 'created');
  }

  const conteudoAtual = await readFile(caminhoGuia, 'utf-8');
  const ehGerenciadoPeloMyInst = conteudoAtual.includes(MARCADOR_GUIA_MYINST);

  if (ehGerenciadoPeloMyInst) {
    await writeFile(caminhoGuia, CONTEUDO_GUIA_MYINST, 'utf-8');
    return criarResultadoGuia(caminhoGuia, 'overwritten');
  }

  if (conflictStrategy === 'skip') {
    return criarResultadoGuia(caminhoGuia, 'skipped');
  }

  const caminhoPrefixado = join(dir, 'vault-MYINST.md');
  await writeFile(caminhoPrefixado, CONTEUDO_GUIA_MYINST, 'utf-8');
  return criarResultadoGuia(caminhoPrefixado, 'prefixed');
}

function criarResultadoGuia(path: string, status: ItemAplicado['status']): ItemAplicado {
  return {
    type: 'instruction',
    title: 'MyInst MCP',
    slug: 'myinst',
    path,
    status,
  };
}
