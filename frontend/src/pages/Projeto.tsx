import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, Trash2, Save, Search, Folder, FolderPlus, X, Brain, GitBranch, MessagesSquare, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ShieldCheck, Copy } from 'lucide-react';
import { api, type ChatDetalhado, type ChatMensagem, type ChatResumo, type EnvVaultFileResumo } from '@/lib/api';
import { montarComandoEnvVaultPull, montarComandoEnvVaultPush } from '@/lib/envVaultCommands';

const TIPOS_LABEL: Record<string, string> = {
  skill: 'Skill',
  instruction: 'Instrução',
  mcp_config: 'MCP Config',
  agent: 'Agent',
  hook: 'Hook',
  memory: 'Memória',
  snippet: 'Snippet',
};

const TIPOS_COR: Record<string, string> = {
  skill: 'bg-purple-500/20 text-purple-300',
  instruction: 'bg-blue-500/20 text-blue-300',
  mcp_config: 'bg-green-500/20 text-green-300',
  agent: 'bg-orange-500/20 text-orange-300',
  hook: 'bg-yellow-500/20 text-yellow-300',
  memory: 'bg-pink-500/20 text-pink-300',
  snippet: 'bg-zinc-500/20 text-zinc-300',
};

const TAMANHO_PAGINA_MENSAGENS_CHAT = 50;

interface PastaItem {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

interface ConteudoItem {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  version: number;
  tags: string[];
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectStateItem {
  id: string;
  type: 'memory' | 'decision' | 'session';
  title: string;
  slug: string;
  body: string;
  summary?: string;
  sourceClient?: string | null;
  touchedFiles?: string[];
  toolsUsed?: string[];
  status?: string;
  createdAt: string;
  updatedAt: string;
}

type AbaProjeto = 'conteudo' | 'memorias' | 'decisoes' | 'sessoes' | 'chats' | 'env-vault';

export function ProjetoPage() {
  const { workspaceSlug, slug } = useParams<{ workspaceSlug: string; slug: string }>();
  const [conteudos, setConteudos] = useState<ConteudoItem[]>([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<ConteudoItem | null>(null);

  const [tituloEditado, setTituloEditado] = useState('');
  const [bodyEditado, setBodyEditado] = useState('');
  const [tagsEditadas, setTagsEditadas] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [excluindoConteudoSlug, setExcluindoConteudoSlug] = useState<string | null>(null);
  const [salvoComSucesso, setSalvoComSucesso] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  const [novoTipo, setNovoTipo] = useState('skill');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoSlug, setNovoSlug] = useState('');
  const [novoBody, setNovoBody] = useState('');
  const [novoTags, setNovoTags] = useState('');
  const [novoPastaId, setNovoPastaId] = useState('');

  const [pastas, setPastas] = useState<PastaItem[]>([]);
  const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);
  const [excluindoPastaId, setExcluindoPastaId] = useState<string | null>(null);
  const [mostrarFormPasta, setMostrarFormPasta] = useState(false);
  const [novaPastaNome, setNovaPastaNome] = useState('');
  const [abaAtiva, setAbaAtiva] = useState<AbaProjeto>('conteudo');
  const [memorias, setMemorias] = useState<ProjectStateItem[]>([]);
  const [decisoes, setDecisoes] = useState<ProjectStateItem[]>([]);
  const [sessoes, setSessoes] = useState<ProjectStateItem[]>([]);
  const [chats, setChats] = useState<ChatResumo[]>([]);
  const [envVaultFiles, setEnvVaultFiles] = useState<EnvVaultFileResumo[]>([]);
  const [mostrarFormState, setMostrarFormState] = useState(false);
  const [stateTitulo, setStateTitulo] = useState('');
  const [stateBody, setStateBody] = useState('');
  const [stateResumo, setStateResumo] = useState('');
  const [excluindoStateSlug, setExcluindoStateSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceSlug || !slug) return;
    api.conteudo.listar(workspaceSlug, slug, filtroTipo ? { type: filtroTipo } : undefined).then(setConteudos);
  }, [workspaceSlug, slug, filtroTipo]);

  useEffect(() => {
    if (!workspaceSlug || !slug) return;
    api.pastas.listar(workspaceSlug, slug).then(setPastas);
  }, [workspaceSlug, slug]);

  useEffect(() => {
    if (!workspaceSlug || !slug) return;
    carregarProjectState();
  }, [workspaceSlug, slug]);

  useEffect(() => {
    if (!itemSelecionado) return;
    setTituloEditado(itemSelecionado.title);
    setBodyEditado(itemSelecionado.body);
    setTagsEditadas(itemSelecionado.tags?.join(', ') ?? '');
    setSalvoComSucesso(false);
    setErroSalvar('');
  }, [itemSelecionado]);

  const conteudosFiltrados = conteudos
    .filter((c) => {
      if (pastaSelecionada === 'sem-pasta') return !c.folderId;
      if (pastaSelecionada) return c.folderId === pastaSelecionada;
      return true;
    })
    .filter((c) => !filtroTexto || c.title.toLowerCase().includes(filtroTexto.toLowerCase()));

  async function salvarEdicao() {
    if (!workspaceSlug || !slug || !itemSelecionado) return;
    setSalvando(true);
    setSalvoComSucesso(false);
    setErroSalvar('');

    try {
      const atualizado = await api.conteudo.atualizar(workspaceSlug, slug, itemSelecionado.slug, {
        title: tituloEditado,
        body: bodyEditado,
        tags: tagsEditadas ? tagsEditadas.split(',').map((t) => t.trim()) : [],
      });

      setItemSelecionado(atualizado);
      setConteudos(conteudos.map((c) => (c.id === atualizado.id ? atualizado : c)));
      setSalvoComSucesso(true);
      setTimeout(() => setSalvoComSucesso(false), 3000);
    } catch (err) {
      setErroSalvar(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function criarPasta(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceSlug || !slug || !novaPastaNome.trim()) return;

    const pastaSlug = novaPastaNome.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const novaPasta = await api.pastas.criar(workspaceSlug, slug, { name: novaPastaNome, slug: pastaSlug });
    setPastas([...pastas, novaPasta]);
    setNovaPastaNome('');
    setMostrarFormPasta(false);
  }

  async function deletarPasta(pastaId: string) {
    if (!workspaceSlug || !slug) return;
    const confirmado = window.confirm('Excluir esta pasta? Os conteúdos vinculados ficarão sem pasta.');
    if (!confirmado) return;

    setExcluindoPastaId(pastaId);

    try {
      await api.pastas.deletar(workspaceSlug, slug, pastaId);
      setPastas((atuais) => atuais.filter((pasta) => pasta.id !== pastaId));
      setConteudos((atuais) => atuais.map((conteudo) => (
        conteudo.folderId === pastaId ? { ...conteudo, folderId: null } : conteudo
      )));

      if (pastaSelecionada === pastaId) {
        setPastaSelecionada(null);
      }
    } finally {
      setExcluindoPastaId(null);
    }
  }

  async function criarConteudo(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceSlug || !slug) return;

    const novo = await api.conteudo.criar(workspaceSlug, slug, {
      type: novoTipo,
      title: novoTitulo,
      slug: novoSlug,
      body: novoBody,
      metadata: {},
      tags: novoTags ? novoTags.split(',').map((t) => t.trim()) : [],
      isActive: true,
      ...(novoPastaId ? { folderId: novoPastaId } : {}),
    });

    setConteudos([...conteudos, novo]);
    setMostrarForm(false);
    setNovoTitulo('');
    setNovoSlug('');
    setNovoBody('');
    setNovoTags('');
    setNovoPastaId('');
  }

  async function deletarConteudo(contentSlug: string) {
    if (!workspaceSlug || !slug) return;
    const confirmado = window.confirm('Excluir este conteúdo? O histórico de versões vinculado também será removido.');
    if (!confirmado) return;

    setExcluindoConteudoSlug(contentSlug);
    setErroSalvar('');

    try {
      await api.conteudo.deletar(workspaceSlug, slug, contentSlug);
      setConteudos((atuais) => atuais.filter((conteudo) => conteudo.slug !== contentSlug));

      if (itemSelecionado?.slug === contentSlug) {
        setItemSelecionado(null);
      }
    } catch (err) {
      setErroSalvar(err instanceof Error ? err.message : 'Erro ao excluir conteúdo');
    } finally {
      setExcluindoConteudoSlug(null);
    }
  }

  async function carregarProjectState() {
    if (!workspaceSlug || !slug) return;
    const [memoriasCarregadas, decisoesCarregadas, sessoesCarregadas] = await Promise.all([
      api.state.listarMemorias(workspaceSlug, slug),
      api.state.listarDecisoes(workspaceSlug, slug),
      api.state.listarSessoes(workspaceSlug, slug),
    ]);

    setMemorias(memoriasCarregadas);
    setDecisoes(decisoesCarregadas);
    setSessoes(sessoesCarregadas);
    const [chatsCarregados, envsCarregados] = await Promise.all([
      api.chats.listar(workspaceSlug, slug, { limit: 100 }),
      api.envVault.listar(workspaceSlug, slug),
    ]);

    setChats(chatsCarregados);
    setEnvVaultFiles(envsCarregados);
  }

  async function criarState(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceSlug || !slug || !stateTitulo.trim() || !stateBody.trim()) return;

    const tipo = abaAtiva === 'memorias' ? 'memory' : abaAtiva === 'decisoes' ? 'decision' : 'session';
    const body = {
      type: tipo,
      title: stateTitulo,
      slug: stateTitulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      body: stateBody,
      summary: tipo === 'session' ? stateResumo || stateBody : undefined,
      metadata: { reviewed: true, createdFrom: 'web' },
      touchedFiles: [],
      toolsUsed: [],
      status: 'reviewed',
    };

    if (tipo === 'memory') {
      const novaMemoria = await api.state.criarMemoria(workspaceSlug, slug, body);
      setMemorias([...memorias, novaMemoria]);
    } else if (tipo === 'decision') {
      const novaDecisao = await api.state.criarDecisao(workspaceSlug, slug, body);
      setDecisoes([...decisoes, novaDecisao]);
    } else {
      const novaSessao = await api.state.criarSessao(workspaceSlug, slug, body);
      setSessoes([...sessoes, novaSessao]);
    }

    setStateTitulo('');
    setStateBody('');
    setStateResumo('');
    setMostrarFormState(false);
  }

  async function deletarStateItem(item: ProjectStateItem) {
    if (!workspaceSlug || !slug) return;

    const confirmado = window.confirm(`Excluir "${item.title}" do Project State?`);
    if (!confirmado) return;

    setExcluindoStateSlug(item.slug);

    try {
      if (item.type === 'memory') {
        await api.state.deletarMemoria(workspaceSlug, slug, item.slug);
        setMemorias((atuais) => atuais.filter((memoria) => memoria.slug !== item.slug));
        return;
      }

      if (item.type === 'decision') {
        await api.state.deletarDecisao(workspaceSlug, slug, item.slug);
        setDecisoes((atuais) => atuais.filter((decisao) => decisao.slug !== item.slug));
        return;
      }

      await api.state.deletarSessao(workspaceSlug, slug, item.slug);
      setSessoes((atuais) => atuais.filter((sessao) => sessao.slug !== item.slug));
    } finally {
      setExcluindoStateSlug(null);
    }
  }

  async function deletarChat(chat: ChatResumo): Promise<boolean> {
    if (!workspaceSlug || !slug) return false;

    const confirmado = window.confirm(`Excluir o chat importado "${chat.title}"?`);
    if (!confirmado) return false;

    await api.chats.deletar(workspaceSlug, slug, chat.externalSessionId);
    setChats((atuais) => atuais.filter((item) => item.id !== chat.id));
    return true;
  }

  async function deletarEnvVaultFile(env: EnvVaultFileResumo): Promise<boolean> {
    if (!workspaceSlug || !slug) return false;

    const confirmado = window.confirm(`Remover o env criptografado "${env.name}" do projeto?`);
    if (!confirmado) return false;

    await api.envVault.deletar(workspaceSlug, slug, env.id);
    setEnvVaultFiles((atuais) => atuais.filter((item) => item.id !== env.id));
    return true;
  }

  const itensState = abaAtiva === 'memorias' ? memorias : abaAtiva === 'decisoes' ? decisoes : sessoes;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/workspaces/${workspaceSlug}`} className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={20} />
        </Link>
        <h2 className="text-2xl font-bold text-zinc-100">{slug}</h2>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <BotaoAbaProjeto label="Conteúdo" active={abaAtiva === 'conteudo'} onClick={() => setAbaAtiva('conteudo')} icon={<FileText size={14} />} />
        <BotaoAbaProjeto label="Memórias" active={abaAtiva === 'memorias'} onClick={() => setAbaAtiva('memorias')} icon={<Brain size={14} />} />
        <BotaoAbaProjeto label="Decisões" active={abaAtiva === 'decisoes'} onClick={() => setAbaAtiva('decisoes')} icon={<GitBranch size={14} />} />
        <BotaoAbaProjeto label="Sessões" active={abaAtiva === 'sessoes'} onClick={() => setAbaAtiva('sessoes')} icon={<MessagesSquare size={14} />} />
        <BotaoAbaProjeto label="Chats" active={abaAtiva === 'chats'} onClick={() => setAbaAtiva('chats')} icon={<MessagesSquare size={14} />} />
        <BotaoAbaProjeto label="Env Vault" active={abaAtiva === 'env-vault'} onClick={() => setAbaAtiva('env-vault')} icon={<ShieldCheck size={14} />} />
      </div>

      {abaAtiva === 'chats' && workspaceSlug && slug && (
        <ChatHistoryPanel workspaceSlug={workspaceSlug} projectSlug={slug} chats={chats} onDeleteChat={deletarChat} />
      )}

      {abaAtiva === 'env-vault' && workspaceSlug && slug && (
        <EnvVaultPanel
          workspaceSlug={workspaceSlug}
          projectSlug={slug}
          envs={envVaultFiles}
          onDeleteEnv={deletarEnvVaultFile}
        />
      )}

      {abaAtiva !== 'conteudo' && abaAtiva !== 'chats' && abaAtiva !== 'env-vault' && (
        <ProjectStatePanel
          aba={abaAtiva}
          items={itensState}
          mostrarForm={mostrarFormState}
          setMostrarForm={setMostrarFormState}
          titulo={stateTitulo}
          setTitulo={setStateTitulo}
          body={stateBody}
          setBody={setStateBody}
          resumo={stateResumo}
          setResumo={setStateResumo}
          criarState={criarState}
          deletarStateItem={deletarStateItem}
          excluindoStateSlug={excluindoStateSlug}
        />
      )}

      {abaAtiva === 'conteudo' && (
        <>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="min-w-[190px] rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 focus:outline-none"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={14} />
          Novo
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setPastaSelecionada(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
            pastaSelecionada === null
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Folder size={14} />
          Todas
        </button>
        <button
          onClick={() => setPastaSelecionada('sem-pasta')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
            pastaSelecionada === 'sem-pasta'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Sem pasta
        </button>
        {pastas.map((pasta) => (
          <div key={pasta.id} className="flex items-center gap-0.5">
            <button
              onClick={() => setPastaSelecionada(pasta.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                pastaSelecionada === pasta.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Folder size={14} />
              {pasta.name}
            </button>
            <button
              onClick={() => deletarPasta(pasta.id)}
              disabled={excluindoPastaId === pasta.id}
              className="text-zinc-600 hover:text-red-400 transition-colors p-1 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Excluir pasta ${pasta.name}`}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {mostrarFormPasta ? (
          <form onSubmit={criarPasta} className="flex items-center gap-2">
            <input
              type="text"
              value={novaPastaNome}
              onChange={(e) => setNovaPastaNome(e.target.value)}
              placeholder="Nome da pasta"
              autoFocus
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-full text-zinc-200 text-sm focus:outline-none focus:border-blue-500"
            />
            <button type="submit" className="text-green-400 hover:text-green-300 p-1">
              <Plus size={14} />
            </button>
            <button type="button" onClick={() => setMostrarFormPasta(false)} className="text-zinc-500 hover:text-zinc-300 p-1">
              <X size={14} />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setMostrarFormPasta(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <FolderPlus size={14} />
          </button>
        )}
      </div>

      {mostrarForm && (
        <form onSubmit={criarConteudo} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Tipo</label>
              <select
                value={novoTipo}
                onChange={(e) => setNovoTipo(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100"
              >
                {Object.entries(TIPOS_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Título</label>
              <input
                type="text"
                value={novoTitulo}
                onChange={(e) => { setNovoTitulo(e.target.value); setNovoSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Pasta</label>
              <select
                value={novoPastaId}
                onChange={(e) => setNovoPastaId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100"
              >
                <option value="">Nenhuma</option>
                {pastas.map((pasta) => (
                  <option key={pasta.id} value={pasta.id}>{pasta.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Tags (separadas por vírgula)</label>
              <input
                type="text"
                value={novoTags}
                onChange={(e) => setNovoTags(e.target.value)}
                placeholder="claude-opus, sonnet"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Conteúdo</label>
            <textarea
              value={novoBody}
              onChange={(e) => setNovoBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 font-mono text-sm focus:outline-none focus:border-blue-500 resize-y"
              required
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
            Criar
          </button>
        </form>
      )}

      <div className="flex gap-4">
        <div className="w-1/2 space-y-2">
          <div className="relative mb-3 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Filtrar por título..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {conteudosFiltrados.map((item) => (
            <div
              key={item.id}
              onClick={() => setItemSelecionado(item)}
              className={`bg-zinc-900 border rounded-lg p-3 cursor-pointer transition-colors ${
                itemSelecionado?.id === item.id ? 'border-blue-500' : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-zinc-500" />
                  <span className="font-medium text-zinc-200 text-sm">{item.title}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deletarConteudo(item.slug); }}
                  disabled={excluindoConteudoSlug === item.slug}
                  className="text-zinc-600 hover:text-red-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Excluir ${item.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded ${TIPOS_COR[item.type] || 'bg-zinc-700 text-zinc-300'}`}>
                  {TIPOS_LABEL[item.type] || item.type}
                </span>
                {item.folderId && (
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-700/50 text-zinc-400 flex items-center gap-1">
                    <Folder size={10} />
                    {pastas.find((p) => p.id === item.folderId)?.name || 'Pasta'}
                  </span>
                )}
                {item.tags?.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                    {tag}
                  </span>
                ))}
                <span className="text-xs text-zinc-600 ml-auto">v{item.version}</span>
              </div>
            </div>
          ))}
          {conteudosFiltrados.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-8">Nenhum conteúdo encontrado.</p>
          )}
        </div>

        <div className="w-1/2">
          {itemSelecionado ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${TIPOS_COR[itemSelecionado.type]}`}>
                    {TIPOS_LABEL[itemSelecionado.type]}
                  </span>
                  <span className="text-xs text-zinc-500">v{itemSelecionado.version}</span>
                </div>
                <span className="text-xs text-zinc-600">
                  Atualizado em {new Date(itemSelecionado.updatedAt).toLocaleDateString('pt-BR')}
                </span>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Título</label>
                <input
                  type="text"
                  value={tituloEditado}
                  onChange={(e) => setTituloEditado(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Conteúdo</label>
                <textarea
                  value={bodyEditado}
                  onChange={(e) => setBodyEditado(e.target.value)}
                  rows={16}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 font-mono text-sm focus:outline-none focus:border-blue-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Tags (separadas por vírgula)</label>
                <input
                  type="text"
                  value={tagsEditadas}
                  onChange={(e) => setTagsEditadas(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              {erroSalvar && (
                <p className="text-sm text-red-400">{erroSalvar}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={salvarEdicao}
                  disabled={salvando}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
                >
                  <Save size={14} />
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => deletarConteudo(itemSelecionado.slug)}
                  disabled={excluindoConteudoSlug === itemSelecionado.slug}
                  className="flex items-center gap-2 px-4 py-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed text-red-200 text-sm rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                  {excluindoConteudoSlug === itemSelecionado.slug ? 'Excluindo...' : 'Excluir'}
                </button>
                {salvoComSucesso && (
                  <span className="text-sm text-green-400">Salvo!</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">
              Selecione um item para editar
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function EnvVaultPanel({
  workspaceSlug,
  projectSlug,
  envs,
  onDeleteEnv,
}: {
  workspaceSlug: string;
  projectSlug: string;
  envs: EnvVaultFileResumo[];
  onDeleteEnv: (env: EnvVaultFileResumo) => Promise<boolean>;
}) {
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [excluindoEnvId, setExcluindoEnvId] = useState<string | null>(null);
  const [erroEnv, setErroEnv] = useState('');

  async function copiarComando(comando: string, id: string) {
    setErroEnv('');

    try {
      await copiarTextoParaClipboard(comando);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 2500);
    } catch {
      setErroEnv('Não foi possível acessar o clipboard. Copie o comando exibido no painel.');
    }
  }

  async function excluirEnv(env: EnvVaultFileResumo) {
    setExcluindoEnvId(env.id);
    setErroEnv('');

    try {
      await onDeleteEnv(env);
    } catch (err) {
      setErroEnv(err instanceof Error ? err.message : 'Erro ao remover env.');
    } finally {
      setExcluindoEnvId(null);
    }
  }

  const comandoPush = montarComandoEnvVaultPush({
    workspaceSlug,
    projectSlug,
    name: 'local',
    environment: 'local',
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-zinc-100">Env Vault</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
            Metadados seguros dos arquivos .env criptografados do projeto. O painel não descriptografa, não exibe valores e não solicita segredo local.
          </p>
        </div>
        <button
          type="button"
          onClick={() => copiarComando(comandoPush, 'push')}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-blue-500 hover:text-blue-200"
        >
          <Copy size={14} />
          {copiadoId === 'push' ? 'Comando copiado' : 'Copiar push'}
        </button>
      </div>

      <div className="rounded-xl border border-blue-900/40 bg-blue-950/10 p-4 text-sm leading-6 text-blue-100">
        Use a CLI local para desbloquear e materializar envs. O comando copiado não inclui `MYINST_ENV_VAULT_SECRET` nem recovery key.
      </div>

      <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-6 text-zinc-300">
        <code>{comandoPush}</code>
      </pre>

      {erroEnv && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">
          {erroEnv}
        </div>
      )}

      <div className="grid gap-3">
        {envs.map((env) => {
          const comandoPull = montarComandoEnvVaultPull({
            workspaceSlug,
            projectSlug,
            name: env.name,
            environment: env.environment,
          });

          return (
            <article key={env.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-medium text-zinc-100">{env.name}</h4>
                  <p className="mt-1 break-all text-xs text-zinc-500">{env.sourcePath}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copiarComando(comandoPull, env.id)}
                    className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-blue-500 hover:text-blue-200"
                  >
                    <Copy size={14} />
                    {copiadoId === env.id ? 'Copiado' : 'Copiar pull'}
                  </button>
                  <button
                    type="button"
                    onClick={() => excluirEnv(env)}
                    disabled={excluindoEnvId === env.id}
                    className="rounded-lg border border-zinc-800 p-2 text-zinc-500 transition-colors hover:border-red-500/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Remover env ${env.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span className="rounded bg-zinc-800 px-2 py-1">ambiente: {env.environment || 'default'}</span>
                <span className="rounded bg-zinc-800 px-2 py-1">versão: {env.version ?? '-'}</span>
                <span className="rounded bg-zinc-800 px-2 py-1">ciphertext: {formatarBytes(env.metadata?.ciphertextByteLength)}</span>
                <span className="rounded bg-zinc-800 px-2 py-1">recovery: {env.recoveryEnvelopeCount ?? 0}</span>
                {env.updatedAt && <span className="rounded bg-zinc-800 px-2 py-1">atualizado: {new Date(env.updatedAt).toLocaleDateString('pt-BR')}</span>}
              </div>

              <pre className="mt-4 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-6 text-zinc-300">
                <code>{comandoPull}</code>
              </pre>
            </article>
          );
        })}

        {envs.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <h4 className="font-medium text-zinc-100">Nenhum env criptografado neste projeto</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Cadastre pela CLI local para manter o plaintext fora do navegador e do backend.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              {comandoPush}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

async function copiarTextoParaClipboard(texto: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return;
    } catch {
      // Alguns webviews bloqueiam Clipboard API mesmo após clique do usuário.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = texto;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copiado = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copiado) {
    throw new Error('clipboard_indisponivel');
  }
}

function ChatHistoryPanel({
  workspaceSlug,
  projectSlug,
  chats,
  onDeleteChat,
}: {
  workspaceSlug: string;
  projectSlug: string;
  chats: ChatResumo[];
  onDeleteChat: (chat: ChatResumo) => Promise<boolean>;
}) {
  const [chatSelecionadoId, setChatSelecionadoId] = useState<string | null>(null);
  const [chatSelecionado, setChatSelecionado] = useState<ChatDetalhado | null>(null);
  const [carregandoChat, setCarregandoChat] = useState(false);
  const [carregandoPaginaMensagens, setCarregandoPaginaMensagens] = useState(false);
  const [excluindoChatId, setExcluindoChatId] = useState<string | null>(null);
  const [erroChat, setErroChat] = useState('');

  async function selecionarChat(chat: ChatResumo) {
    setChatSelecionadoId(chat.externalSessionId);
    setChatSelecionado(null);
    setCarregandoChat(true);
    setErroChat('');

    try {
      const chatDetalhado = await api.chats.obter(workspaceSlug, projectSlug, chat.externalSessionId, {
        messageLimit: TAMANHO_PAGINA_MENSAGENS_CHAT,
        messageOffset: 0,
      });
      setChatSelecionado(chatDetalhado);
    } catch (err) {
      setChatSelecionado(null);
      setErroChat(err instanceof Error ? err.message : 'Erro ao carregar chat.');
    } finally {
      setCarregandoChat(false);
    }
  }

  async function excluirChat(chat: ChatResumo, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setExcluindoChatId(chat.id);
    setErroChat('');

    try {
      const removido = await onDeleteChat(chat);
      if (!removido) return;

      if (chatSelecionadoId === chat.externalSessionId) {
        setChatSelecionadoId(null);
        setChatSelecionado(null);
      }
    } catch (err) {
      setErroChat(err instanceof Error ? err.message : 'Erro ao excluir chat.');
    } finally {
      setExcluindoChatId(null);
    }
  }

  async function carregarPaginaMensagens(pagina: number) {
    if (!chatSelecionado) return;

    const totalPaginas = calcularTotalPaginasChat(chatSelecionado);
    const paginaSegura = Math.min(Math.max(pagina, 1), totalPaginas);
    const messageOffset = (paginaSegura - 1) * TAMANHO_PAGINA_MENSAGENS_CHAT;

    setCarregandoPaginaMensagens(true);
    setErroChat('');

    try {
      const proximaPagina = await api.chats.obter(workspaceSlug, projectSlug, chatSelecionado.externalSessionId, {
        messageLimit: TAMANHO_PAGINA_MENSAGENS_CHAT,
        messageOffset,
      });
      setChatSelecionado(proximaPagina);
    } catch (err) {
      setErroChat(err instanceof Error ? err.message : 'Erro ao carregar mensagens.');
    } finally {
      setCarregandoPaginaMensagens(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-zinc-100">Histórico de chats</h3>
        <p className="mt-1 text-sm text-zinc-500">Transcripts importados explicitamente por client, separados dos resumos de Project State.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
        <div className="grid content-start gap-3">
          {chats.map((chat) => {
            const tags = extrairTagsChat(chat.metadata);
            const estaSelecionado = chatSelecionadoId === chat.externalSessionId;

            return (
              <article
                key={chat.id}
                role="button"
                tabIndex={0}
                onClick={() => selecionarChat(chat)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  selecionarChat(chat);
                }}
                className={`rounded-xl border bg-zinc-900 p-4 text-left transition-colors ${
                  estaSelecionado
                    ? 'border-blue-500'
                    : 'border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium text-zinc-100">{chat.title}</h4>
                    <p className="mt-1 break-all text-xs text-zinc-500">{chat.externalSessionId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600">{new Date(chat.updatedAt).toLocaleDateString('pt-BR')}</span>
                    <button
                      type="button"
                      onClick={(event) => excluirChat(chat, event)}
                      disabled={excluindoChatId === chat.id}
                      className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 transition-colors hover:border-red-500/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Excluir chat ${chat.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {chat.summary && <p className="mt-3 text-sm leading-6 text-blue-200">{chat.summary}</p>}

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
                  <span className="rounded bg-zinc-800 px-2 py-1">client: {chat.client}</span>
                  <span className="rounded bg-zinc-800 px-2 py-1">mensagens: {chat.messageCount}</span>
                  {tags.map((tag) => (
                    <span key={tag} className="rounded bg-zinc-800 px-2 py-1">tag: {tag}</span>
                  ))}
                </div>
              </article>
            );
          })}

          {chats.length === 0 && (
            <p className="rounded-xl border border-zinc-800 bg-zinc-900 py-10 text-center text-sm text-zinc-500">Nenhum chat importado encontrado.</p>
          )}
        </div>

        <ChatDetailPanel
          chat={chatSelecionado}
          carregando={carregandoChat}
          carregandoPagina={carregandoPaginaMensagens}
          erro={erroChat}
          onSelecionarPagina={carregarPaginaMensagens}
        />
      </div>
    </section>
  );
}

function ChatDetailPanel({
  chat,
  carregando,
  carregandoPagina,
  erro,
  onSelecionarPagina,
}: {
  chat: ChatDetalhado | null;
  carregando: boolean;
  carregandoPagina: boolean;
  erro: string;
  onSelecionarPagina: (pagina: number) => void;
}) {
  const [paginaDigitada, setPaginaDigitada] = useState('1');
  const paginaAtual = chat ? calcularPaginaAtualChat(chat) : 1;
  const totalPaginas = chat ? calcularTotalPaginasChat(chat) : 1;

  useEffect(() => {
    setPaginaDigitada(String(paginaAtual));
  }, [paginaAtual, chat?.externalSessionId]);

  if (carregando) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-500">
        Carregando chat...
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-6 text-sm text-red-300">
        {erro}
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-500">
        Selecione um chat para visualizar as mensagens.
      </div>
    );
  }

  function submeterPagina(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pagina = Number.parseInt(paginaDigitada, 10);
    if (Number.isNaN(pagina)) return;

    onSelecionarPagina(pagina);
  }

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-medium text-zinc-100">{chat.title}</h4>
            <p className="mt-1 break-all text-xs text-zinc-500">{chat.externalSessionId}</p>
          </div>
          <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-500">
            página {paginaAtual} de {totalPaginas} · {chat.messageCount} mensagens
          </span>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {chat.messages.map((mensagem) => (
          <ChatMessageItem key={mensagem.id} mensagem={mensagem} />
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 p-4">
          <div className="flex items-center gap-2">
            <BotaoPaginaChat
              label="Primeira página"
              disabled={carregandoPagina || paginaAtual <= 1}
              onClick={() => onSelecionarPagina(1)}
              icon={<ChevronsLeft size={16} />}
            />
            <BotaoPaginaChat
              label="Página anterior"
              disabled={carregandoPagina || paginaAtual <= 1}
              onClick={() => onSelecionarPagina(paginaAtual - 1)}
              icon={<ChevronLeft size={16} />}
            />
            <BotaoPaginaChat
              label="Próxima página"
              disabled={carregandoPagina || paginaAtual >= totalPaginas}
              onClick={() => onSelecionarPagina(paginaAtual + 1)}
              icon={<ChevronRight size={16} />}
            />
            <BotaoPaginaChat
              label="Última página"
              disabled={carregandoPagina || paginaAtual >= totalPaginas}
              onClick={() => onSelecionarPagina(totalPaginas)}
              icon={<ChevronsRight size={16} />}
            />
          </div>

          <form onSubmit={submeterPagina} className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Página</span>
            <input
              type="number"
              min={1}
              max={totalPaginas}
              value={paginaDigitada}
              onChange={(event) => setPaginaDigitada(event.target.value)}
              className="h-9 w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-200 outline-none focus:border-blue-500"
            />
            <span>de {totalPaginas}</span>
            <button
              type="submit"
              disabled={carregandoPagina}
              className="h-9 rounded-lg border border-zinc-700 px-3 text-zinc-300 transition-colors hover:border-blue-500 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ir
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function calcularPaginaAtualChat(chat: ChatDetalhado): number {
  return Math.floor((chat.messageOffset || 0) / TAMANHO_PAGINA_MENSAGENS_CHAT) + 1;
}

function calcularTotalPaginasChat(chat: ChatDetalhado): number {
  return Math.max(1, Math.ceil(chat.messageCount / TAMANHO_PAGINA_MENSAGENS_CHAT));
}

function BotaoPaginaChat({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition-colors hover:border-blue-500 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
    </button>
  );
}

function ChatMessageItem({ mensagem }: { mensagem: ChatMensagem }) {
  const ehUsuario = mensagem.role === 'user';
  const ehAssistente = mensagem.role === 'assistant';
  const rotulo = ehUsuario ? 'Usuário' : ehAssistente ? 'Assistente' : mensagem.role;
  const alinhamento = ehUsuario ? 'justify-end' : 'justify-start';
  const largura = ehUsuario ? 'max-w-[88%] border-blue-500/30 bg-blue-950/30' : 'max-w-[92%] border-zinc-800 bg-zinc-950/60';
  const corRotulo = ehUsuario ? 'text-blue-200' : ehAssistente ? 'text-zinc-200' : 'text-zinc-500';

  return (
    <div className={`flex ${alinhamento} border-b border-zinc-800 px-4 py-3 last:border-b-0`}>
      <div className={`rounded-lg border px-4 py-3 ${largura}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-xs font-medium ${corRotulo}`}>{rotulo}</span>
          <span className="text-xs text-zinc-600">{new Date(mensagem.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{mensagem.content}</p>
      </div>
    </div>
  );
}

function BotaoAbaProjeto({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-blue-500 bg-blue-600/20 text-blue-200'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ProjectStatePanel({
  aba,
  items,
  mostrarForm,
  setMostrarForm,
  titulo,
  setTitulo,
  body,
  setBody,
  resumo,
  setResumo,
  criarState,
  deletarStateItem,
  excluindoStateSlug,
}: {
  aba: AbaProjeto;
  items: ProjectStateItem[];
  mostrarForm: boolean;
  setMostrarForm: (value: boolean) => void;
  titulo: string;
  setTitulo: (value: string) => void;
  body: string;
  setBody: (value: string) => void;
  resumo: string;
  setResumo: (value: string) => void;
  criarState: (e: React.FormEvent) => Promise<void>;
  deletarStateItem: (item: ProjectStateItem) => Promise<void>;
  excluindoStateSlug: string | null;
}) {
  const tituloAba = aba === 'memorias' ? 'Memórias revisadas' : aba === 'decisoes' ? 'Decisões técnicas' : 'Resumos de sessão';
  const textoBotao = aba === 'memorias' ? 'Nova memória' : aba === 'decisoes' ? 'Nova decisão' : 'Nova sessão';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-zinc-100">{tituloAba}</h3>
          <p className="mt-1 text-sm text-zinc-500">Project State armazena continuidade revisada do projeto, sem cache bruto ou transcript completo.</p>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={14} />
          {textoBotao}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={criarState} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título revisado"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
            required
          />
          {aba === 'sessoes' && (
            <textarea
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              placeholder="Resumo curto da sessão"
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Conteúdo revisado, sem segredos reais"
            rows={8}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            required
          />
          <p className="text-xs text-zinc-500">Ao salvar pela web, o item será marcado como revisado. Não inclua tokens, senhas, cookies, .env ou credenciais reais.</p>
          <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700">
            Salvar revisado
          </button>
        </form>
      )}

      <div className="grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium text-zinc-100">{item.title}</h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600">{new Date(item.updatedAt).toLocaleDateString('pt-BR')}</span>
                <button
                  type="button"
                  onClick={() => deletarStateItem(item)}
                  disabled={excluindoStateSlug === item.slug}
                  className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 transition-colors hover:border-red-500/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Excluir ${item.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {item.summary && <p className="mt-3 text-sm leading-6 text-blue-200">{item.summary}</p>}
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{item.body}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
              {item.sourceClient && <span className="rounded bg-zinc-800 px-2 py-1">client: {item.sourceClient}</span>}
              {item.status && <span className="rounded bg-zinc-800 px-2 py-1">status: {item.status}</span>}
              {item.touchedFiles?.length ? <span className="rounded bg-zinc-800 px-2 py-1">arquivos: {item.touchedFiles.length}</span> : null}
            </div>
          </article>
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900 py-10 text-center text-sm text-zinc-500">Nenhum item de Project State encontrado.</p>
        )}
      </div>
    </section>
  );
}

function extrairTagsChat(metadata: Record<string, unknown>): string[] {
  const tags = metadata.tags;

  if (!Array.isArray(tags)) return [];

  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
}

function formatarBytes(valor: unknown): string {
  if (typeof valor !== 'number' || Number.isNaN(valor)) return '-';
  if (valor < 1024) return `${valor} B`;

  return `${(valor / 1024).toFixed(1)} KB`;
}
