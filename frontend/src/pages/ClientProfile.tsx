import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Pencil, Plus, Save, Search, Trash2, Waypoints } from 'lucide-react';
import { useContextMenuRegistry } from '@/components/ContextMenuRegistry';
import { api } from '@/lib/api';
import { gerarSlug } from '@/lib/slug';

const TIPOS_LABEL: Record<string, string> = {
  skill: 'Skill',
  instruction: 'Instrução',
  mcp_config: 'MCP Config',
  agent: 'Agent',
  hook: 'Hook',
  memory: 'Memória',
  snippet: 'Snippet',
};

interface ClientProfile {
  clientId: string;
  name: string;
  description: string | null;
  itemCount?: number;
  isConfigured?: boolean;
}

interface ItemGlobal {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  tags: string[];
  version: number;
  updatedAt: string;
}

export function ClientProfilePage() {
  const { clientId = '' } = useParams<{ clientId: string }>();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [items, setItems] = useState<ItemGlobal[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [selecionado, setSelecionado] = useState<ItemGlobal | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoItemSlug, setExcluindoItemSlug] = useState<string | null>(null);

  const [novoTipo, setNovoTipo] = useState('instruction');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoSlug, setNovoSlug] = useState('');
  const [novoBody, setNovoBody] = useState('');
  const [novoTags, setNovoTags] = useState('');

  const [tituloEditado, setTituloEditado] = useState('');
  const [bodyEditado, setBodyEditado] = useState('');
  const [tagsEditadas, setTagsEditadas] = useState('');

  useEffect(() => {
    if (!clientId) return;
    api.clientProfiles.obter(clientId).then(setProfile);
    api.clientProfiles.listarItens(clientId).then(setItems);
  }, [clientId]);

  useEffect(() => {
    if (!selecionado) return;
    setTituloEditado(selecionado.title);
    setBodyEditado(selecionado.body);
    setTagsEditadas(selecionado.tags.join(', '));
  }, [selecionado]);

  useEffect(() => {
    if (selecionado || items.length === 0) return;
    setSelecionado(items[0]);
  }, [items, selecionado]);

  useContextMenuRegistry(
    {
      getPageActions: () => [
        {
          label: 'Novo item',
          onSelect: () => setMostrarForm(true),
        },
      ],
      getCardActions: ({ kind }) => {
        if (kind !== 'client-profile-item-card') return [];
        return [];
      },
    },
    [clientId],
  );

  const itensFiltrados = useMemo(() => {
    return items.filter((item) => {
      const bateTipo = !filtroTipo || item.type === filtroTipo;
      const bateBusca = !busca || item.title.toLowerCase().includes(busca.toLowerCase()) || item.slug.toLowerCase().includes(busca.toLowerCase());
      return bateTipo && bateBusca;
    });
  }, [busca, filtroTipo, items]);

  async function criarItem(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);

    try {
      const criado = await api.clientProfiles.criarItem(clientId, {
        type: novoTipo,
        title: novoTitulo,
        slug: novoSlug,
        body: novoBody,
        metadata: {},
        tags: normalizarTags(novoTags),
        isActive: true,
      });

      setItems((atual) => [...atual, criado]);
      setMostrarForm(false);
      setNovoTipo('instruction');
      setNovoTitulo('');
      setNovoSlug('');
      setNovoBody('');
      setNovoTags('');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarItem() {
    if (!selecionado) return;
    setSalvando(true);

    try {
      const atualizado = await api.clientProfiles.atualizarItem(clientId, selecionado.slug, {
        title: tituloEditado,
        body: bodyEditado,
        tags: normalizarTags(tagsEditadas),
      });

      setSelecionado(atualizado);
      setItems((atual) => atual.map((item) => (item.id === atualizado.id ? atualizado : item)));
    } finally {
      setSalvando(false);
    }
  }

  async function deletarItem(itemSlug: string) {
    const itemGlobal = items.find((item) => item.slug === itemSlug);
    const titulo = itemGlobal?.title ?? itemSlug;
    const confirmado = window.confirm(`Excluir o item global "${titulo}"?`);
    if (!confirmado) return;

    setExcluindoItemSlug(itemSlug);

    try {
      await api.clientProfiles.deletarItem(clientId, itemSlug);
      setItems((atual) => atual.filter((item) => item.slug !== itemSlug));

      if (selecionado?.slug === itemSlug) {
        setSelecionado(null);
      }
    } finally {
      setExcluindoItemSlug(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/client-profiles" className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 text-slate-400 transition hover:border-white/14 hover:text-white">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Client Profile</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{profile?.name || clientId}</h1>
          <p className="mt-2 text-sm text-slate-400">{profile?.description}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">
            {items.length} item(ns) global(is)
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-stretch gap-3">
            <div className="relative min-w-0 flex-1 basis-[320px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar por título ou slug"
                className="vault-input pl-9"
              />
            </div>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="vault-input min-w-[190px] sm:w-auto">
              <option value="">Todos os tipos</option>
              {Object.entries(TIPOS_LABEL).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              onClick={() => setMostrarForm((atual) => !atual)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/22 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18 sm:ml-auto"
            >
              <Plus size={16} />
              Novo item
            </button>
          </div>

          {mostrarForm && (
            <form onSubmit={criarItem} className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)} className="vault-input">
                  {Object.entries(TIPOS_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input
                  value={novoTitulo}
                  onChange={(e) => {
                    setNovoTitulo(e.target.value);
                    setNovoSlug(gerarSlug(e.target.value));
                  }}
                  placeholder="Título"
                  className="vault-input"
                  required
                />
                <input
                  value={novoSlug}
                  onChange={(e) => setNovoSlug(gerarSlug(e.target.value))}
                  placeholder="Slug"
                  className="vault-input"
                  required
                />
              </div>
              <input
                value={novoTags}
                onChange={(e) => setNovoTags(e.target.value)}
                placeholder="Tags separadas por vírgula"
                className="vault-input"
              />
              <textarea
                value={novoBody}
                onChange={(e) => setNovoBody(e.target.value)}
                rows={8}
                className="vault-input min-h-48 font-mono"
                required
              />
              <button type="submit" disabled={salvando} className="rounded-2xl border border-cyan-300/22 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18 disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Criar item global'}
              </button>
            </form>
          )}

          <div className="mt-4 space-y-3">
            {itensFiltrados.map((item) => (
              <div
                key={item.id}
                data-context-menu="client-profile-item-card"
                data-context-id={item.id}
                onClick={() => setSelecionado(item)}
                className={`cursor-pointer rounded-[22px] border p-4 transition ${
                  selecionado?.id === item.id
                    ? 'border-cyan-300/25 bg-cyan-300/10'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/14 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Waypoints size={15} className="text-cyan-100" />
                      <p className="truncate text-sm font-medium text-white">{item.title}</p>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{item.slug}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void deletarItem(item.slug);
                    }}
                    disabled={excluindoItemSlug === item.slug}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-2 text-slate-500 transition hover:border-red-400/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Excluir ${item.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    {TIPOS_LABEL[item.type] || item.type}
                  </span>
                  <span className="text-xs text-slate-500">v{item.version}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-slate-950/45 p-5">
          {selecionado ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-cyan-100" />
                <span className="text-sm font-medium text-white">{TIPOS_LABEL[selecionado.type] || selecionado.type}</span>
                <span className="text-xs text-slate-500">v{selecionado.version}</span>
              </div>
              <input value={tituloEditado} onChange={(e) => setTituloEditado(e.target.value)} className="vault-input" />
              <input value={tagsEditadas} onChange={(e) => setTagsEditadas(e.target.value)} className="vault-input" placeholder="Tags separadas por vírgula" />
              <textarea value={bodyEditado} onChange={(e) => setBodyEditado(e.target.value)} rows={22} className="vault-input min-h-[420px] font-mono" />
              <button
                onClick={() => void salvarItem()}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/22 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18 disabled:opacity-50"
              >
                <Save size={16} />
                {salvando ? 'Salvando...' : 'Salvar item global'}
              </button>
              <button
                onClick={() => void deletarItem(selecionado.slug)}
                disabled={excluindoItemSlug === selecionado.slug}
                className="ml-3 inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
              >
                <Trash2 size={16} />
                {excluindoItemSlug === selecionado.slug ? 'Excluindo...' : 'Excluir item global'}
              </button>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-black/10 p-6 text-center text-sm leading-7 text-slate-500">
              Selecione um item global para editar corpo, tags e conteúdo deste client profile.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function normalizarTags(tags: string) {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
