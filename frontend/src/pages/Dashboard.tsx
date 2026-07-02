import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Boxes, ChevronRight, Pencil, Plus, ShieldCheck } from 'lucide-react';
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

interface FormularioWorkspace {
  name: string;
  slug: string;
  description: string;
}

const FORM_INICIAL = { name: '', slug: '', description: '' };

export function DashboardPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formCriacao, setFormCriacao] = useState<FormularioWorkspace>(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormularioWorkspace>(FORM_INICIAL);
  const [slugCriacaoManual, setSlugCriacaoManual] = useState(false);
  const [slugEdicaoManual, setSlugEdicaoManual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');

  useEffect(() => {
    api.workspaces.listar().then(setWorkspaces);
  }, []);

  useContextMenuRegistry(
    {
      getPageActions: () => [
        {
          label: 'Criar workspace',
          onSelect: () => setMostrarForm(true),
        },
      ],
      getCardActions: ({ kind, id }) => {
        if (kind !== 'workspace-card') return [];
        const workspace = workspaces.find((item) => item.id === id);
        if (!workspace) return [];

        return [
          {
            label: 'Editar',
            onSelect: () => iniciarEdicao(workspace),
          },
        ];
      },
    },
    [workspaces],
  );

  async function criarWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm('');

    try {
      const novo = await api.workspaces.criar({
        name: formCriacao.name,
        slug: formCriacao.slug,
        description: formCriacao.description || undefined,
      });

      setWorkspaces([...workspaces, novo]);
      fecharCriacao();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao criar workspace');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(workspace: Workspace) {
    setEditandoId(workspace.id);
    setFormEdicao({
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description ?? '',
    });
    setSlugEdicaoManual(false);
    setErroForm('');
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setFormEdicao(FORM_INICIAL);
    setSlugEdicaoManual(false);
    setErroForm('');
  }

  async function salvarEdicaoWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoId) return;

    const workspaceAtual = workspaces.find((workspace) => workspace.id === editandoId);
    if (!workspaceAtual) return;

    setSalvando(true);
    setErroForm('');

    try {
      const atualizado = await api.workspaces.atualizar(workspaceAtual.slug, {
        name: formEdicao.name,
        slug: formEdicao.slug,
        description: formEdicao.description || undefined,
      });

      setWorkspaces(workspaces.map((workspace) => (workspace.id === atualizado.id ? atualizado : workspace)));
      cancelarEdicao();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar workspace');
    } finally {
      setSalvando(false);
    }
  }

  function atualizarNomeCriacao(valor: string) {
    setFormCriacao((atual) => ({
      ...atual,
      name: valor,
      slug: slugCriacaoManual ? atual.slug : gerarSlug(valor),
    }));
  }

  function atualizarNomeEdicao(valor: string) {
    setFormEdicao((atual) => ({
      ...atual,
      name: valor,
      slug: slugEdicaoManual ? atual.slug : gerarSlug(valor),
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
      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Vault Control Plane</p>
              <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Workspaces isolados, API key única, sync previsível.</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 md:text-base">
                Use workspaces para separar contextos, projetos e estratégias de sincronização sem misturar instruções pessoais com fluxos de cliente.
              </p>
            </div>

            <button
              onClick={() => {
                setMostrarForm(!mostrarForm);
                setErroForm('');
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-cyan-300/22 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18"
            >
              <Plus size={16} />
              Novo workspace
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/8 bg-slate-950/45 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/8">
              <ShieldCheck size={18} className="text-cyan-100" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Estado atual</p>
              <p className="mt-1 text-sm text-slate-200">{workspaces.length} workspace(s) disponíveis</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 text-sm text-slate-400">
            <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-4">
              Cada repositório deve ter um projeto próprio no workspace correto. Evite usar um projeto genérico para misturar contextos.
            </div>
            <div className="rounded-2xl border border-white/7 bg-white/[0.02] p-4">
              Renomeações atualizam `name` e `slug` com redirecionamento imediato no frontend.
            </div>
          </div>
        </div>
      </section>

      {mostrarForm && (
        <WorkspaceForm
          titulo="Criar workspace"
          form={formCriacao}
          erro={erroForm}
          salvando={salvando}
          onSubmit={criarWorkspace}
          onNameChange={atualizarNomeCriacao}
          onSlugChange={(valor) => {
            setSlugCriacaoManual(true);
            setFormCriacao((atual) => ({ ...atual, slug: gerarSlug(valor) }));
          }}
          onDescriptionChange={(valor) => setFormCriacao((atual) => ({ ...atual, description: valor }))}
          onCancel={fecharCriacao}
          submitLabel="Criar workspace"
        />
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {workspaces.map((workspace) => {
          const estaEditando = editandoId === workspace.id;

          return (
            <article
              key={workspace.id}
              className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/14 hover:bg-white/[0.05]"
            >
              {estaEditando ? (
                <WorkspaceForm
                  titulo="Editar workspace"
                  form={formEdicao}
                  erro={erroForm}
                  salvando={salvando}
                  onSubmit={salvarEdicaoWorkspace}
                  onNameChange={atualizarNomeEdicao}
                  onSlugChange={(valor) => {
                    setSlugEdicaoManual(true);
                    setFormEdicao((atual) => ({ ...atual, slug: gerarSlug(valor) }));
                  }}
                  onDescriptionChange={(valor) => setFormEdicao((atual) => ({ ...atual, description: valor }))}
                  onCancel={cancelarEdicao}
                  submitLabel="Salvar alterações"
                  compacto
                />
              ) : (
                <div
                  data-context-menu="workspace-card"
                  data-context-id={workspace.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/workspaces/${workspace.slug}`)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    navigate(`/workspaces/${workspace.slug}`);
                  }}
                  className="flex h-full cursor-pointer flex-col"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="group min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/14 bg-cyan-400/8">
                          <Boxes size={18} className="text-cyan-100" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className="truncate text-lg font-semibold text-white transition group-hover:text-cyan-200">
                              {workspace.name}
                            </h2>
                            {workspace.isDefault && (
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                protegido
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{workspace.slug}</p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        iniciarEdicao(workspace);
                      }}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 text-slate-400 transition hover:border-white/14 hover:text-white"
                      aria-label={`Editar ${workspace.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>

                  <p className="mt-5 flex-1 text-sm leading-7 text-slate-400">
                    {workspace.description || 'Workspace pronto para agrupar projetos, perfis e instruções com isolamento limpo.'}
                  </p>

                  <div className="mt-6 flex items-center justify-between border-t border-white/8 pt-4">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Abrir contexto</span>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-cyan-200 transition group-hover:text-white">
                      Entrar
                      <ChevronRight size={16} />
                    </span>
                  </div>
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
  compacto = false,
}: {
  titulo: string;
  form: FormularioWorkspace;
  erro: string;
  salvando: boolean;
  onSubmit: (event: React.FormEvent) => Promise<void> | void;
  onNameChange: (valor: string) => void;
  onSlugChange: (valor: string) => void;
  onDescriptionChange: (valor: string) => void;
  onCancel: () => void;
  submitLabel: string;
  compacto?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={`rounded-[26px] border border-white/10 bg-black/20 ${compacto ? 'p-4' : 'p-6'}`}>
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{titulo}</p>

      <div className={`mt-4 grid gap-4 ${compacto ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
        <CampoForm label="Nome">
          <input
            type="text"
            value={form.name}
            onChange={(e) => onNameChange(e.target.value)}
            className="vault-input"
            required
          />
        </CampoForm>

        <CampoForm label="Slug">
          <input
            type="text"
            value={form.slug}
            onChange={(e) => onSlugChange(e.target.value)}
            className="vault-input"
            required
          />
        </CampoForm>
      </div>

      <CampoForm label="Descrição" className="mt-4">
        <input
          type="text"
          value={form.description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="vault-input"
        />
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
