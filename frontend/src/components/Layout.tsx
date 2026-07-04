import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Boxes, ChevronRight, Home, KeyRound, LockKeyhole, LogOut, ShieldCheck, Waypoints } from 'lucide-react';
import { ContextMenu, type ContextMenuAction } from '@/components/ContextMenu';
import { ContextMenuRegistryProvider, type ContextMenuDefinition } from '@/components/ContextMenuRegistry';
import { limparToken } from '@/lib/api';
import { useBrand } from '@/components/BrandProvider';

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const brand = useBrand();
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; actions: ContextMenuAction[] }>({
    open: false,
    x: 0,
    y: 0,
    actions: [],
  });
  const [contextMenuDefinition, setContextMenuDefinition] = useState<ContextMenuDefinition>({});

  function handleLogout() {
    limparToken();
    navigate('/login');
  }

  function abrirMenu(event: React.MouseEvent, actions: ContextMenuAction[]) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      actions,
    });
  }

  function resolverAcoes(target: HTMLElement) {
    const card = target.closest<HTMLElement>('[data-context-menu]');
    if (card) {
      const kind = card.dataset.contextMenu;
      const id = card.dataset.contextId;
      if (!kind || !id || !contextMenuDefinition.getCardActions) return [];
      return contextMenuDefinition.getCardActions({ kind, id });
    }

    return contextMenuDefinition.getPageActions?.() ?? [];
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(95,198,213,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(76,93,117,0.18),_transparent_32%),linear-gradient(180deg,_#03070b_0%,_#071019_38%,_#04080d_100%)] text-slate-100">
      <div className="relative mx-auto flex min-h-screen max-w-[1600px] gap-5 p-3 md:p-5">
        <aside className="vault-panel vault-grid relative w-full max-w-[310px] overflow-hidden rounded-[28px] border border-white/8 px-5 py-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,_rgba(95,198,213,0.18),_transparent_68%)]" />

          <div className="relative flex h-full flex-col">
            <div className="border-b border-white/8 pb-5">
              <img src={brand.logoSidebar} alt={brand.appName} className="h-14 w-auto max-w-full object-contain" />
              <p className="mt-3 max-w-[18rem] text-sm leading-6 text-slate-400">
                {brand.tagline}
              </p>
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-300/12 bg-slate-950/45 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/8">
                  <ShieldCheck size={18} className="text-cyan-200" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Estado do Vault</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">Sincronização segura e local-first</p>
                </div>
              </div>
            </div>

            <nav className="mt-6 flex-1 space-y-5">
              <div className="space-y-2">
                <p className="px-2 text-[11px] uppercase tracking-[0.24em] text-slate-600">Vault</p>
                <NavItem
                  to="/"
                  label="Workspaces"
                  hint="Contextos e projetos"
                  icon={<Home size={18} />}
                  active={location.pathname === '/' || location.pathname.startsWith('/workspaces/')}
                />
              </div>

              <div className="space-y-2">
                <p className="px-2 text-[11px] uppercase tracking-[0.24em] text-slate-600">Client Profiles</p>
                <NavItem
                  to="/client-profiles"
                  label="Globais"
                  hint="Configs por cliente"
                  icon={<Waypoints size={18} />}
                  active={location.pathname.startsWith('/client-profiles')}
                />
              </div>

              <div className="space-y-2">
                <p className="px-2 text-[11px] uppercase tracking-[0.24em] text-slate-600">Conta</p>
                <NavItem
                  to="/api-keys"
                  label="API Keys"
                  hint="Acesso da conta"
                  icon={<KeyRound size={18} />}
                  active={location.pathname.startsWith('/api-keys')}
                />
                <NavItem
                  to="/security"
                  label="Segurança"
                  hint="2FA e Env Vault"
                  icon={<LockKeyhole size={18} />}
                  active={location.pathname.startsWith('/security')}
                />
              </div>
            </nav>

            <div className="mt-6 rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <Boxes size={18} className="text-slate-200" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-100">{brand.appName}</p>
                  <p className="text-xs text-slate-500">Web, API, CLI e MCP no mesmo vault</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-4 flex items-center justify-between rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-sm text-slate-400 transition hover:border-red-400/25 hover:bg-red-500/6 hover:text-red-200"
            >
              <span className="flex items-center gap-3">
                <LogOut size={17} />
                Encerrar sessão
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <div
            className="vault-panel relative min-h-[calc(100vh-24px)] overflow-hidden rounded-[32px] border border-white/8 p-4 md:p-8"
            onContextMenuCapture={(event) => {
              const target = event.target as HTMLElement;

              if (target.closest('input, textarea, select')) {
                return;
              }

              const actions = resolverAcoes(target);
              if (actions.length === 0) {
                event.preventDefault();
                setMenu((current) => ({ ...current, open: false }));
                return;
              }

              abrirMenu(event, actions);
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[linear-gradient(180deg,_rgba(95,198,213,0.1),_transparent)]" />
            <ContextMenuRegistryProvider setDefinition={setContextMenuDefinition}>
              <div className="relative min-h-[calc(100vh-10rem)] w-full">
                <Outlet />
              </div>
            </ContextMenuRegistryProvider>
          </div>
        </main>
      </div>

      <ContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        actions={menu.actions}
        onClose={() => setMenu((current) => ({ ...current, open: false }))}
      />
    </div>
  );
}

function NavItem({
  to,
  label,
  hint,
  icon,
  active,
}: {
  to: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group flex items-center justify-between rounded-2xl border px-4 py-3 transition ${
        active
          ? 'border-cyan-300/25 bg-cyan-300/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'border-white/7 bg-white/[0.02] text-slate-400 hover:border-white/14 hover:bg-white/[0.05] hover:text-slate-100'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/15">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-slate-500">{hint}</span>
        </span>
      </span>
      <ChevronRight size={16} className={`transition ${active ? 'text-cyan-200' : 'text-slate-600 group-hover:text-slate-300'}`} />
    </Link>
  );
}
