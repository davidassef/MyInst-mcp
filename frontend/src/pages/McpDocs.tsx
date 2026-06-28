import { ArrowLeft, BookOpen, CheckCircle2, GitCompareArrows, KeyRound, LockKeyhole, PackageCheck, TerminalSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBrand } from '@/components/BrandProvider';

const tools = [
  ['myinst_list_workspaces', 'Lista os workspaces disponiveis na conta.'],
  ['myinst_create_workspace', 'Cria um workspace e seu projeto default.'],
  ['myinst_update_workspace', 'Edita nome, slug ou descricao de workspace.'],
  ['myinst_delete_workspace', 'Apaga workspace nao default com confirmacao explicita.'],
  ['myinst_list_projects', 'Lista projetos de um workspace.'],
  ['myinst_create_project', 'Cria projeto dentro de um workspace.'],
  ['myinst_update_project', 'Edita nome, slug ou descricao de projeto.'],
  ['myinst_delete_project', 'Apaga projeto nao default com confirmacao explicita.'],
  ['myinst_list_sync_targets', 'Detecta clientes locais e mostra escopo global ou projeto antes de sincronizar.'],
  ['myinst_pull', 'Materializa conteudo do vault no diretorio alvo. Cria .myinst/MYINST.md.'],
  ['myinst_push', 'Sincroniza alteracoes locais reconhecidas de volta para o vault.'],
  ['myinst_import', 'Importa estruturas conhecidas de clientes para o vault.'],
  ['myinst_search', 'Busca pontual para descoberta. Nao substitui pull para trabalho recorrente.'],
  ['myinst_status', 'Mostra mudancas temporais no vault remoto. Nao compara arquivos locais com manifesto.'],
  ['myinst_create_client_profile_item', 'Cria configuracao global em Client Profiles.'],
  ['myinst_update_client_profile_item', 'Edita configuracao global em Client Profiles.'],
  ['myinst_delete_client_profile_item', 'Apaga configuracao global com confirmacao explicita.'],
  ['myinst_replicate_client_profile', 'Replica Client Profiles compativeis, como claude -> opencode e codex -> opencode.'],
];

const clients = [
  ['claude', 'full', 'project'],
  ['codex', 'full', 'project e global'],
  ['cursor', 'partial', 'project e global'],
  ['gemini', 'partial', 'project e global'],
  ['opencode', 'partial', 'project e global'],
  ['qwen', 'partial', 'project'],
  ['aider', 'partial', 'project e global'],
  ['antigravity', 'experimental', 'project e global'],
  ['kimi', 'partial', 'project e global'],
];

export function McpDocsPage() {
  const brand = useBrand();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(95,198,213,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(76,93,117,0.18),_transparent_32%),linear-gradient(180deg,_#03070b_0%,_#071019_38%,_#04080d_100%)] px-4 py-6 text-slate-100 md:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <main className="relative mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-300/24 hover:text-white"
          >
            <ArrowLeft size={16} />
            Voltar para landing
          </Link>

          <img src={brand.logoSidebar} alt={brand.appName} className="h-11 w-auto max-w-full object-contain" />
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/18 bg-cyan-300/8 px-4 py-2 text-xs uppercase tracking-[0.24em] text-cyan-100/85">
              <BookOpen size={14} />
              Documentacao CLI e MCP
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Como operar o MyInst pelo terminal, pelo MCP e pelo vault web
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400 md:text-lg">
              Esta pagina e a referencia publica para humanos e agentes. A CLI cobre o fluxo de repositorio remoto com pull,
              status e push; o MCP conecta os clients de IA ao mesmo vault.
            </p>
          </div>

          <div className="vault-panel vault-grid relative overflow-hidden rounded-[28px] border border-white/8 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(95,198,213,0.14),_transparent_70%)]" />
            <div className="relative space-y-4">
              <ResumoItem
                icon={<PackageCheck size={18} />}
                titulo="CLI"
                texto="Instale @myinst/cli para operar pull, status, push e Project State direto no repositorio."
              />
              <ResumoItem
                icon={<TerminalSquare size={18} />}
                titulo="MCP"
                texto="Instale @myinst/mcp-server quando quiser conectar Codex, Claude, Cursor e outros clients ao vault."
              />
              <ResumoItem
                icon={<KeyRound size={18} />}
                titulo="Autenticacao"
                texto="Por padrao, o MCP abre o navegador para login e gera a chave automaticamente. MYINST_API_KEY manual e opcional."
              />
              <ResumoItem
                icon={<LockKeyhole size={18} />}
                titulo="Seguranca"
                texto="Nunca sincronize tokens, senhas, cookies, arquivos .env ou segredos reais em texto plano."
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <Etapa
            numero="1"
            titulo="Instale a CLI"
            codigo={`npm install -g @myinst/cli
myinst login`}
          />
          <Etapa
            numero="2"
            titulo="Sincronize o projeto"
            codigo={`myinst pull default
myinst status default
myinst push default`}
          />
          <Etapa
            numero="3"
            titulo="Conecte clients MCP"
            codigo={`npm install -g @myinst/mcp-server
command: myinst-mcp`}
          />
        </section>

        <Secao titulo="Autenticacao automatica">
          <div className="grid gap-4 md:grid-cols-3">
            <CartaoTexto
              titulo="Fluxo padrao"
              texto="Configure apenas o comando myinst-mcp e, opcionalmente, MYINST_SERVER. Na primeira execucao sem credencial local, o MCP inicia um servidor temporario em localhost e abre o navegador."
            />
            <CartaoTexto
              titulo="Login e autorizacao"
              texto="A pagina /connect-mcp redireciona para login quando necessario. Depois de autenticar, o usuario confirma a conexao e uma API key e gerada automaticamente para o MCP."
            />
            <CartaoTexto
              titulo="Credencial local"
              texto="A chave gerada e retornada para o servidor local do MCP e salva na maquina do usuario. Gerar API key manualmente continua possivel, mas e um fallback para ambientes sem browser ou automacao."
            />
          </div>
        </Secao>

        <Secao titulo="Configuracao MCP">
          <div className="grid gap-5 lg:grid-cols-2">
            <BlocoCodigo
              titulo="JSON recomendado com login automatico"
              codigo={`{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_SERVER": "https://api-myinst.lotoscore.com.br"
      }
    }
  }
}`}
            />

            <BlocoCodigo
              titulo="Codex config.toml recomendado"
              codigo={`[mcp_servers.myinst]
command = "myinst-mcp"

[mcp_servers.myinst.env]
MYINST_SERVER = "https://api-myinst.lotoscore.com.br"`}
            />
          </div>

          <div className="mt-5">
            <BlocoCodigo
              titulo="Fallback com API key manual"
              codigo={`{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_API_KEY": "{{MYINST_API_KEY}}",
        "MYINST_SERVER": "https://api-myinst.lotoscore.com.br"
      }
    }
  }
}`}
            />
          </div>
        </Secao>

        <Secao titulo="Contrato operacional para agentes">
          <div className="grid gap-4 md:grid-cols-2">
            <CartaoTexto
              titulo="Ao iniciar trabalho"
              texto="Use myinst_pull no diretorio do repositorio ou informe targetDir. O pull cria .myinst/MYINST.md com as regras operacionais que o agente deve ler antes de editar conteudo."
            />
            <CartaoTexto
              titulo="Durante o trabalho"
              texto="Prefira arquivos locais materializados. Use myinst_search apenas para descoberta pontual quando o conteudo ainda nao estiver local."
            />
            <CartaoTexto
              titulo="Ao alterar conteudo"
              texto="Se criar, reescrever ou reorganizar skills, instructions, agents, hooks, memory, snippets, commands, output styles, settings ou mcp_config, finalize com myinst_push."
            />
            <CartaoTexto
              titulo="Ao detectar varios clientes"
              texto="Quando houver mais de um client detectado, informe clients explicitamente. Nao sincronize automaticamente uma origem ambigua."
            />
          </div>
        </Secao>

        <Secao titulo="CLI standalone e status local">
          <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
            <div className="vault-panel rounded-[24px] border border-white/8 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-300/8 text-cyan-100">
                  <GitCompareArrows size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Status tipo repositorio remoto</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    A CLI mantem .myinst/sync-state.json no repositorio e compara manifesto, arquivos locais de todos os clients detectados e snapshot remoto.
                    O atalho myinst st executa o mesmo fluxo de myinst status.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 text-sm text-slate-300">
                <LinhaStatus titulo="Pendente de pull" texto="O vault remoto mudou ou possui item ausente no disco." />
                <LinhaStatus titulo="Pendente de push" texto="O disco local mudou ou possui item ausente no vault." />
                <LinhaStatus titulo="Conflitos" texto="Local e remoto mudaram desde o ultimo manifesto; push fica bloqueado." />
                <LinhaStatus titulo="Sincronizado" texto="Local, remoto e manifesto estao equivalentes." />
              </div>
            </div>

            <BlocoCodigo
              titulo="Fluxo CLI recomendado"
              codigo={`myinst pull default
myinst status default
myinst st
# editar arquivos locais
myinst status default
myinst push default

myinst status default --client codex kimi
myinst push default --scope project`}
            />
          </div>
        </Secao>

        <Secao titulo="Escopos">
          <div className="grid gap-4 md:grid-cols-3">
            <CartaoTexto titulo="project" texto="Conteudo do repositorio atual. E o padrao da CLI e le todos os clients detectados no projeto." />
            <CartaoTexto titulo="global" texto="Configuracoes e skills do cliente na home do usuario. Entra apenas quando solicitado explicitamente." />
            <CartaoTexto titulo="all" texto="Combina project e global na mesma operacao, separando cada item por client e escopo." />
          </div>
        </Secao>

        <Secao titulo="Politica anti-segredo">
          <div className="vault-panel rounded-[24px] border border-red-300/14 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="mt-1 text-red-200" />
              <div>
                <h2 className="text-xl font-semibold text-white">Regra obrigatoria antes de push ou import</h2>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
                  O agente nao deve enviar token, api key, secret, senha, oauth, cookie, arquivo .env ou credencial real.
                  Valores sensiveis devem ser substituidos por placeholders como <code className="text-cyan-100">{'{{API_KEY}}'}</code>,
                  {' '}<code className="text-cyan-100">{'{{DATABASE_URL}}'}</code> ou <code className="text-cyan-100">{'{{SECRET_KEY}}'}</code>.
                  Se houver suspeita de segredo real, a sincronizacao deve ser interrompida para revisao manual.
                </p>
              </div>
            </div>
          </div>
        </Secao>

        <Secao titulo="Tools MCP">
          <div className="overflow-hidden rounded-[24px] border border-white/8">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/[0.04] text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-medium">Tool</th>
                  <th className="px-4 py-3 font-medium">Uso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {tools.map(([tool, descricao]) => (
                  <tr key={tool} className="bg-black/10">
                    <td className="px-4 py-3 font-mono text-xs text-cyan-100">{tool}</td>
                    <td className="px-4 py-3 text-slate-400">{descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>

        <Secao titulo="Clientes suportados">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {clients.map(([client, suporte, escopo]) => (
              <div key={client} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="font-mono text-sm text-cyan-100">{client}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{suporte}</p>
                <p className="mt-3 text-sm text-slate-300">{escopo}</p>
              </div>
            ))}
          </div>
        </Secao>

        <Secao titulo="Kimi Code">
          <div className="grid gap-4 md:grid-cols-3">
            <CartaoTexto
              titulo="Escopo de projeto"
              texto="O MyInst detecta .kimi-code/skills e .kimi-code/mcp.json dentro do repositorio atual."
            />
            <CartaoTexto
              titulo="Escopo global"
              texto="Configuracoes globais do Kimi sao lidas em ~/.kimi-code/skills e ~/.kimi-code/mcp.json e salvas em Client Profiles."
            />
            <CartaoTexto
              titulo="Limite do suporte"
              texto="O suporte e parcial: sincroniza skills e mcp_config. Cache, historico, sessoes e arquivos arbitrarios nao entram no vault."
            />
          </div>

          <div className="mt-5">
            <BlocoCodigo
              titulo="Exemplos Kimi"
              codigo={`myinst_list_sync_targets scope="all" clients=["kimi"]
myinst_import scope="global" clients=["kimi"] dryRun=true
myinst_pull targetFormat="native" scope="project" clients=["kimi"]`}
            />
          </div>
        </Secao>

        <Secao titulo="Primeiro uso recomendado">
          <BlocoCodigo
            titulo="Sequencia para um agente"
            codigo={`1. Ler esta pagina.
2. Confirmar que myinst-mcp esta configurado no cliente MCP.
3. Se nao houver credencial local, aguardar o navegador abrir /connect-mcp, fazer login e autorizar.
4. Rodar myinst_list_sync_targets para detectar clients e escopos.
5. Rodar myinst_pull com scope e clients explicitos quando necessario.
6. Ler .myinst/MYINST.md no repositorio alvo.
7. Trabalhar nos arquivos locais materializados.
8. Rodar myinst_push somente apos revisar que nao ha segredos reais.`}
          />
        </Secao>
      </main>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-2xl font-semibold text-white">{titulo}</h2>
      {children}
    </section>
  );
}

function ResumoItem({ icon, titulo, texto }: { icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="flex gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-300/8 text-cyan-100">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-white">{titulo}</p>
        <p className="mt-1 text-sm leading-6 text-slate-400">{texto}</p>
      </div>
    </div>
  );
}

function Etapa({ numero, titulo, codigo }: { numero: string; titulo: string; codigo: string }) {
  return (
    <div className="vault-panel rounded-[24px] border border-white/8 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-300/8 text-sm text-cyan-100">
          {numero}
        </span>
        <h2 className="text-lg font-semibold text-white">{titulo}</h2>
      </div>
      <pre className="mt-4 min-h-24 overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/75 p-4 text-xs leading-6 text-cyan-100">
        <code>{codigo}</code>
      </pre>
    </div>
  );
}

function BlocoCodigo({ titulo, codigo }: { titulo: string; codigo: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-[#050c14]/90 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
        <TerminalSquare size={16} className="text-cyan-100" />
        {titulo}
      </div>
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/6 bg-slate-950/80 p-4 text-xs leading-6 text-cyan-100">
        <code>{codigo}</code>
      </pre>
    </div>
  );
}

function CartaoTexto({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <article className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
      <h3 className="text-base font-semibold text-white">{titulo}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-400">{texto}</p>
    </article>
  );
}

function LinhaStatus({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <p className="font-medium text-cyan-100">{titulo}</p>
      <p className="mt-1 leading-6 text-slate-400">{texto}</p>
    </div>
  );
}
