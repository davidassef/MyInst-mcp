import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderOpen, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useContextMenuRegistry } from '@/components/ContextMenuRegistry';
import { api } from '@/lib/api';
import { gerarSlug } from '@/lib/slug';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
}

interface Projeto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
}

interface Formulario {
  name: string;
  slug: string;
  description: string;
}

const FORM_INICIAL = { name: '', slug: '', description: '' };

export function WorkspacePage() {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formCriacao, setFormCriacao] = useState<Formulario>(FORM_INICIAL);
  const [slugCriacaoManual, setSlugCriacaoManual] = useState(false);
  const [editandoWorkspace, setEditandoWorkspace] = useState(false);
  const [editandoProjetoId, setEditandoProjetoId] = useState<string | null>(null);
  const [formEdicaoWorkspace, setFormEdicaoWorkspace] = useState<Formulario>(FORM_INICIAL);
  const [formEdicaoProjeto, setFormEdicaoProjeto] = useState<Formulario>(FORM_INICIAL);
  const [slugWorkspaceManual, setSlugWorkspaceManual] = useState(false);
  const [slugProjetoManual, setSlugProjetoManual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoProjetoId, setExcluindoProjetoId] = useState<string | null>(null);
  const [erroForm, setErroForm] = useState('');

  useEffect(() => {
    if (!workspaceSlug) return;

    api.workspaces.obter(workspaceSlug).then(setWorkspace);
    api.projetos.listar(workspaceSlug).then(setProjetos);
  }, [workspaceSlug]);

  useContextMenuRegistry(
    {
      getPageActions: () => [
        {
          label: 'Criar projeto',
          onSelect: () => setMostrarForm(true),
        },
      ],
      getCardActions: ({ kind, id }) => {
        if (kind !== 'project-card') return [];
        const projeto = projetos.find((item) => item.id === id);
        if (!projeto) return [];

        const acoes = [
          {
            label: 'Editar',
            onSelect: () => iniciarEdicaoProjeto(projeto),
          },
        ];

        if (projeto.isDefault) return acoes;

        return [
          ...acoes,
          {
            label: 'Excluir',
            onSelect: () => void excluirProjeto(projeto),
          },
        ];
      },
    },
    [projetos],
  );

  async function criarProjeto(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceSlug) return;

    setSalvando(true);
    setErroForm('');

    try {
      const novo = await api.projetos.criar(workspaceSlug, {
        name: formCriacao.name,
        slug: formCriacao.slug,
        description: formCriacao.description || undefined,
      });

      setProjetos([...projetos, novo]);
      fecharCriacao();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao criar projeto');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicaoWorkspace() {
    if (!workspace) return;

    setEditandoWorkspace(true);
    setFormEdicaoWorkspace({
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description ?? '',
    });
    setSlugWorkspaceManual(false);
    setErroForm('');
  }

  function iniciarEdicaoProjeto(projeto: Projeto) {
    setEditandoProjetoId(projeto.id);
    setFormEdicaoProjeto({
      name: projeto.name,
      slug: projeto.slug,
      description: projeto.description ?? '',
    });
    setSlugProjetoManual(false);
    setErroForm('');
  }

  function cancelarEdicao() {
    setEditandoWorkspace(false);
    setEditandoProjetoId(null);
    setFormEdicaoWorkspace(FORM_INICIAL);
    setFormEdicaoProjeto(FORM_INICIAL);
    setSlugWorkspaceManual(false);
    setSlugProjetoManual(false);
    setErroForm('');
  }

  async function salvarWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !workspaceSlug) return;

    setSalvando(true);
    setErroForm('');

    try {
      const atualizado = await api.workspaces.atualizar(workspaceSlug, {
        name: formEdicaoWorkspace.name,
        slug: formEdicaoWorkspace.slug,
        description: formEdicaoWorkspace.description || undefined,
      });

      setWorkspace(atualizado);
      setEditandoWorkspace(false);

      if (atualizado.slug !== workspaceSlug) {
        navigate(`/workspaces/${atualizado.slug}`, { replace: true });
      }
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar workspace');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarProjeto(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceSlug || !editandoProjetoId) return;

    const projetoAtual = projetos.find((projeto) => projeto.id === editandoProjetoId);
    if (!projetoAtual) return;

    setSalvando(true);
    setErroForm('');

    try {
      const atualizado = await api.projetos.atualizar(workspaceSlug, projetoAtual.slug, {
        name: formEdicaoProjeto.name,
        slug: formEdicaoProjeto.slug,
        description: formEdicaoProjeto.description || undefined,
      });

      setProjetos(projetos.map((projeto) => (projeto.id === atualizado.id ? atualizado : projeto)));
      setEditandoProjetoId(null);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar projeto');
    } finally {
      setSalvando(false);
    }
  }

  async function excluirProjeto(projeto: Projeto) {
    if (!workspaceSlug || projeto.isDefault) return;

    const confirmado = window.confirm(`Excluir o projeto "${projeto.name}"? Todo o conteúdo vinculado a ele será removido.`);
    if (!confirmado) return;

    setExcluindoProjetoId(projeto.id);
    setErroForm('');

    try {
      await api.projetos.deletar(workspaceSlug, projeto.slug);
      setProjetos((atuais) => atuais.filter((item) => item.id !== projeto.id));

      if (editandoProjetoId === projeto.id) {
        cancelarEdicao();
      }
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao excluir projeto');
    } finally {
      setExcluindoProjetoId(null);
    }
  }

  function atualizarNomeCriacao(valor: string) {
    setFormCriacao((atual) => ({
      ...atual,
      name: valor,
      slug: slugCriacaoManual ? atual.slug : gerarSlug(valor),
    }));
  }

  function atualizarNomeWorkspace(valor: string) {
    setFormEdicaoWorkspace((atual) => ({
      ...atual,
      name: valor,
      slug: slugWorkspaceManual ? atual.slug : gerarSlug(valor),
    }));
  }

  function atualizarNomeProjeto(valor: string) {
    setFormEdicaoProjeto((atual) => ({
      ...atual,
      name: valor,
      slug: slugProjetoManual ? atual.slug : gerarSlug(valor),
    }));
  }

  function fecharCriacao() {
    setMostrarForm(false);
    setFormCriacao(FORM_INICIAL);
    setSlugCriacaoManual(false);
    setErroForm('');
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.75fr]">
        <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Link to="/" className="mt-1 rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 text-slate-400 transition hover:border-white/14 hover:text-white">
                <ArrowLeft size={18} />
              </Link>

              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Workspace ativo</p>

                {editandoWorkspace ? (
                  <WorkspaceForm
                    titulo="Editar workspace"
                    form={formEdicaoWorkspace}
                    erro={erroForm}
                    salvando={salvando}
                    onSubmit={salvarWorkspace}
                    onNameChange={atualizarNomeWorkspace}
                    onSlugChange={(valor) => {
                      setSlugWorkspaceManual(true);
                      setFormEdicaoWorkspace((atual) => ({ ...atual, slug: gerarSlug(valor) }));
                    }}
                    onDescriptionChange={(valor) => setFormEdicaoWorkspace((atual) => ({ ...atual, description: valor }))}
                    onCancel={cancelarEdicao}
                    submitLabel="Salvar workspace"
                    className="mt-4"
                  />
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-3">
                      <h1 className="text-3xl font-semibold text-white md:text-4xl">
                        {workspace?.name ?? workspaceSlug}
                      </h1>
                      <button
                        onClick={iniciarEdicaoWorkspace}
                        className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 text-slate-400 transition hover:border-white/14 hover:text-white"
                      >
                        <Pencil size={16} />
                      </button>
                    </div>

                    <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                      {workspace?.slug ?? workspaceSlug}
                    </p>
                    <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-400">
                      {workspace?.description || 'Use este workspace para agrupar projetos que compartilham contexto, convenções e ciclos de sincronização.'}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/8 bg-slate-950/45 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/8">
              <ShieldCheck size={18} className="text-cyan-100" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Resumo do contexto</p>
              <p className="mt-1 text-sm text-slate-200">{projetos.length} projeto(s) neste workspace</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-slate-400">
            Crie um projeto para cada repositório ou produto. Instruções, skills, chats e arquivos de contexto devem ficar no projeto que representa aquele trabalho.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Projetos do workspace</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Projetos sincronizáveis</h2>
        </div>

        <button
          onClick={() => {
            setMostrarForm(!mostrarForm);
            setErroForm('');
          }}
          className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/22 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18"
        >
          <Plus size={16} />
          Novo projeto
        </button>
      </section>

      {mostrarForm && (
        <WorkspaceForm
          titulo="Criar projeto"
          form={formCriacao}
          erro={erroForm}
          salvando={salvando}
          onSubmit={criarProjeto}
          onNameChange={atualizarNomeCriacao}
          onSlugChange={(valor) => {
            setSlugCriacaoManual(true);
            setFormCriacao((atual) => ({ ...atual, slug: gerarSlug(valor) }));
          }}
          onDescriptionChange={(valor) => setFormCriacao((atual) => ({ ...atual, description: valor }))}
          onCancel={fecharCriacao}
          submitLabel="Criar projeto"
        />
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {projetos.map((projeto) => {
          const estaEditando = editandoProjetoId === projeto.id;
          const rotaProjeto = `/workspaces/${workspaceSlug}/projetos/${projeto.slug}`;

          return (
            <article key={projeto.id} className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/14 hover:bg-white/[0.05]">
              {estaEditando ? (
                <WorkspaceForm
                  titulo="Editar projeto"
                  form={formEdicaoProjeto}
                  erro={erroForm}
                  salvando={salvando}
                  onSubmit={salvarProjeto}
                  onNameChange={atualizarNomeProjeto}
                  onSlugChange={(valor) => {
                    setSlugProjetoManual(true);
                    setFormEdicaoProjeto((atual) => ({ ...atual, slug: gerarSlug(valor) }));
                  }}
                  onDescriptionChange={(valor) => setFormEdicaoProjeto((atual) => ({ ...atual, description: valor }))}
                  onCancel={cancelarEdicao}
                  submitLabel="Salvar projeto"
                />
              ) : (
                <div
                  data-context-menu="project-card"
                  data-context-id={projeto.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(rotaProjeto)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    navigate(rotaProjeto);
                  }}
                  className="flex h-full cursor-pointer flex-col"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="group min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/14 bg-cyan-400/8">
                          <FolderOpen size={18} className="text-cyan-100" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-white transition group-hover:text-cyan-200">
                              {projeto.name}
                            </h3>
                            {projeto.isDefault && (
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                protegido
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{projeto.slug}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          iniciarEdicaoProjeto(projeto);
                        }}
                        className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 text-slate-400 transition hover:border-white/14 hover:text-white"
                        aria-label={`Editar ${projeto.name}`}
                      >
                        <Pencil size={16} />
                      </button>

                      {!projeto.isDefault && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void excluirProjeto(projeto);
                          }}
                          disabled={excluindoProjetoId === projeto.id}
                          className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 text-slate-500 transition hover:border-red-400/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Excluir ${projeto.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-5 flex-1 text-sm leading-7 text-slate-400">
                    {projeto.description || 'Projeto pronto para receber imports, pulls e sincronização local-first a partir do MCP.'}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function WorkspaceForm({
  titulo,
  form,
  erro,
  salvando,
  onSubmit,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
  onCancel,
  submitLabel,
  className = '',
}: {
  titulo: string;
  form: Formulario;
  erro: string;
  salvando: boolean;
  onSubmit: (event: React.FormEvent) => Promise<void> | void;
  onNameChange: (valor: string) => void;
  onSlugChange: (valor: string) => void;
  onDescriptionChange: (valor: string) => void;
  onCancel: () => void;
  submitLabel: string;
  className?: string;
}) {
  return (
    <form onSubmit={onSubmit} className={`rounded-[26px] border border-white/10 bg-black/20 p-5 ${className}`}>
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{titulo}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CampoForm label="Nome">
          <input type="text" value={form.name} onChange={(e) => onNameChange(e.target.value)} className="vault-input" required />
        </CampoForm>
        <CampoForm label="Slug">
          <input type="text" value={form.slug} onChange={(e) => onSlugChange(e.target.value)} className="vault-input" required />
        </CampoForm>
      </div>

      <CampoForm label="Descrição" className="mt-4">
        <input type="text" value={form.description} onChange={(e) => onDescriptionChange(e.target.value)} className="vault-input" />
      </CampoForm>

      {erro && <p className="mt-4 text-sm text-red-300">{erro}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-2xl border border-cyan-300/22 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300 transition hover:border-white/14 hover:bg-white/[0.06]"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CampoForm({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}
