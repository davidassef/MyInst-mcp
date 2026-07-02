import { useEffect, useRef, useState } from 'react';
import { BookOpen, GitCompareArrows, LockKeyhole, ShieldCheck, TerminalSquare, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, salvarToken } from '@/lib/api';
import { useBrand } from '@/components/BrandProvider';

const INTERVALO_SLIDE_MS = 6000;

type ModoAutenticacao = 'login' | 'registro';

interface SlideLanding {
  id: string;
  rotulo: string;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  comando: {
    titulo: string;
    codigo: string;
  };
  destaques: Array<{
    titulo: string;
    texto: string;
  }>;
}

const SLIDES_LANDING: SlideLanding[] = [
  {
    id: 'cli',
    rotulo: 'CLI primeiro',
    titulo: 'Controle o vault pelo terminal antes do agente agir.',
    descricao:
      'Instale a CLI, autentique uma vez e sincronize skills, instruções, agentes, comandos e memórias locais com o mesmo vault remoto.',
    icone: TerminalSquare,
    comando: {
      titulo: 'Instalação rápida',
      codigo: `npm install -g @myinst/cli
myinst login
cd D:\\Documentos\\Projetos\\MyInst
myinst pull myinst --workspace meus-projetos --client codex`,
    },
    destaques: [
      {
        titulo: 'Estrutura local',
        texto: 'Lê os formatos nativos detectados no repositório atual, incluindo .claude, .codex, .cursor e .kimi-code.',
      },
      {
        titulo: 'Operação humana',
        texto: 'O operador revisa o ciclo de sincronização antes de qualquer client consumir o contexto.',
      },
    ],
  },
  {
    id: 'status',
    rotulo: 'Status remoto',
    titulo: 'Veja pull, push e conflitos antes de sincronizar.',
    descricao:
      'O MyInst compara local, remoto e o último sync conhecido para mostrar pendências sem depender de migração ou schema novo.',
    icone: GitCompareArrows,
    comando: {
      titulo: 'Fluxo tipo repositório remoto',
      codigo: `myinst pull myinst --workspace meus-projetos --client codex
myinst status myinst --workspace meus-projetos --client codex
myinst push myinst --workspace meus-projetos --client codex`,
    },
    destaques: [
      {
        titulo: 'Manifesto local',
        texto: 'O arquivo .myinst/sync-state.json guarda o último snapshot remoto aplicado ao projeto atual.',
      },
      {
        titulo: 'Sem merge automático',
        texto: 'Conflitos bloqueiam o push para evitar sobrescrever mudanças remotas ou locais sem revisão.',
      },
    ],
  },
  {
    id: 'mcp',
    rotulo: 'MCP integrado',
    titulo: 'Conecte seus clients ao mesmo vault.',
    descricao:
      'Codex, Claude, Cursor, Kimi e outros clients compatíveis podem consumir o mesmo conteúdo que a CLI organiza.',
    icone: ShieldCheck,
    comando: {
      titulo: 'Servidor MCP local',
      codigo: `npm install -g @myinst/mcp-server
myinst-mcp`,
    },
    destaques: [
      {
        titulo: 'Mesmo backend',
        texto: 'CLI, API, painel web e MCP usam o vault central para manter contexto agentic versionado.',
      },
      {
        titulo: 'Autorização guiada',
        texto: 'O login conecta a conta ao servidor local quando o client abre o fluxo de autorização.',
      },
    ],
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const brand = useBrand();
  const [modo, setModo] = useState<ModoAutenticacao>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const returnUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenOAuth = params.get('token');
    const erroOAuth = params.get('oauth_error');
    const redirectUrl = params.get('return_url');

    if (tokenOAuth) {
      salvarToken(tokenOAuth);
      navigate(redirectUrl || '/', { replace: true });
      return;
    }

    if (erroOAuth) {
      setErro('Não foi possível concluir o login OAuth.');
      window.history.replaceState(null, '', '/login');
    }

    if (redirectUrl) {
      returnUrlRef.current = redirectUrl;
    }
  }, [navigate]);

  const ehFluxoMcp = returnUrlRef.current?.includes('connect-mcp');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      if (modo === 'registro') {
        const resultado = await api.auth.registrar({ email, password, displayName });
        salvarToken(resultado.token);
      } else {
        const resultado = await api.auth.login({ email, password });
        salvarToken(resultado.token);
      }

      navigate(returnUrlRef.current || '/', { replace: true });
    } catch (erroCapturado) {
      setErro(erroCapturado instanceof Error ? erroCapturado.message : 'Erro ao autenticar');
    } finally {
      setCarregando(false);
    }
  }

  if (ehFluxoMcp) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(95,198,213,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(116,132,154,0.15),_transparent_24%),linear-gradient(180deg,_#04070c_0%,_#061019_42%,_#03060a_100%)] px-4 py-8 text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-25" />

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
          <section className="vault-panel vault-grid relative w-full overflow-hidden rounded-[30px] border border-white/8 p-6 shadow-[0_26px_90px_rgba(0,0,0,0.38)] md:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(95,198,213,0.14),_transparent_70%)]" />

            <div className="relative space-y-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-400/8 text-cyan-100">
                <LockKeyhole size={24} />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-slate-500">
                  Conectar MCP
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white">
                  Faça login para autorizar
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Sua conta será vinculada ao servidor MCP local para sincronizar o vault.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="relative mt-8 space-y-5">
              {modo === 'registro' && (
                <CampoRotulo
                  label="Nome"
                  input={(
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="vault-input"
                      required
                    />
                  )}
                />
              )}

              <CampoRotulo
                label="Email"
                input={(
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="vault-input"
                    required
                  />
                )}
              />

              <CampoRotulo
                label="Senha"
                input={(
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="vault-input"
                    minLength={8}
                    required
                  />
                )}
              />

              {erro && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={carregando}
                className="w-full rounded-2xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-3.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {carregando ? 'Aguarde...' : modo === 'login' ? 'Entrar e conectar MCP' : 'Criar conta e conectar MCP'}
              </button>

              <p className="text-center text-sm text-slate-500">
                {modo === 'login' ? 'Ainda não tem conta?' : 'Já possui conta?'}{' '}
                <button
                  type="button"
                  onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}
                  className="font-medium text-cyan-200 transition hover:text-white"
                >
                  {modo === 'login' ? 'Criar agora' : 'Fazer login'}
                </button>
              </p>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(95,198,213,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(116,132,154,0.15),_transparent_24%),linear-gradient(180deg,_#04070c_0%,_#061019_42%,_#03060a_100%)] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-25" />

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] lg:gap-12">
        <section className="min-w-0 px-1 lg:px-4">
          <div className="inline-flex max-w-full items-center gap-3 rounded-full border border-cyan-300/18 bg-cyan-300/8 px-4 py-2 text-xs uppercase tracking-[0.16em] text-cyan-100/85 sm:tracking-[0.26em]">
            <ShieldCheck size={14} />
            <span className="min-w-0 leading-5">Vault remoto para contexto agentic</span>
          </div>

          <img src={brand.logoSidebar} alt={brand.appName} className="mt-7 h-16 w-auto max-w-full object-contain" />

          <ConteudoRotativoLanding brandName={brand.appName} />
        </section>

        <LoginCard
          modo={modo}
          setModo={setModo}
          displayName={displayName}
          setDisplayName={setDisplayName}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          erro={erro}
          carregando={carregando}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}

function ConteudoRotativoLanding({ brandName }: { brandName: string }) {
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [prefereReducaoMovimento, setPrefereReducaoMovimento] = useState(false);

  useEffect(() => {
    const mediaQueryReducao = window.matchMedia('(prefers-reduced-motion: reduce)');

    function atualizarPreferencia() {
      setPrefereReducaoMovimento(mediaQueryReducao.matches);
    }

    atualizarPreferencia();
    mediaQueryReducao.addEventListener('change', atualizarPreferencia);

    return () => mediaQueryReducao.removeEventListener('change', atualizarPreferencia);
  }, []);

  useEffect(() => {
    if (pausado || prefereReducaoMovimento) return;

    const intervaloSlides = window.setInterval(() => {
      setIndiceAtivo((indiceAtual) => (indiceAtual + 1) % SLIDES_LANDING.length);
    }, INTERVALO_SLIDE_MS);

    return () => window.clearInterval(intervaloSlides);
  }, [pausado, prefereReducaoMovimento]);

  function selecionarSlide(novoIndice: number) {
    setIndiceAtivo(novoIndice);
    setPausado(true);
  }

  return (
    <div
      className="mt-8 max-w-3xl"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={() => setPausado(false)}
    >
      <div className="grid">
        {SLIDES_LANDING.map((slide, indiceSlide) => {
          const IconeSlide = slide.icone;
          const slideEstaAtivo = indiceSlide === indiceAtivo;

          return (
            <section
              key={slide.id}
              aria-hidden={!slideEstaAtivo}
              className={[
                'relative col-start-1 row-start-1 min-w-0 transition-all duration-700 ease-out motion-reduce:transition-none',
                slideEstaAtivo ? 'z-10 opacity-100 blur-0 translate-y-0' : 'pointer-events-none z-0 opacity-0 blur-[2px] translate-y-4',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 text-cyan-100">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-400/8">
                  <IconeSlide size={20} />
                </div>
                <p className="min-w-0 text-xs uppercase leading-5 tracking-[0.18em] text-slate-500 sm:tracking-[0.24em]">
                  {slide.rotulo}
                </p>
              </div>

              <div aria-live={slideEstaAtivo ? 'polite' : 'off'}>
                <h1 className="mt-6 max-w-full break-words text-4xl font-semibold tracking-tight text-white md:text-6xl">
                  {slide.titulo}
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400 md:text-lg">
                  {brandName} agora é CLI, MCP, painel web e API para sincronizar contexto como um repositório remoto.
                  {' '}
                  {slide.descricao}
                </p>
              </div>

              <div className="relative z-20 mt-6 flex flex-wrap gap-2">
                {SLIDES_LANDING.map((slideIndicador, indiceIndicador) => (
                  <IndicadorSlide
                    key={slideIndicador.id}
                    ativo={indiceIndicador === indiceAtivo}
                    label={`Mostrar ${slideIndicador.rotulo}`}
                    onClick={() => selecionarSlide(indiceIndicador)}
                  />
                ))}
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {slide.destaques.map((destaque) => (
                  <div key={destaque.titulo} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{destaque.titulo}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{destaque.texto}</p>
                  </div>
                ))}
              </div>

              <div className="vault-panel mt-8 rounded-[28px] border border-white/8 p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">CLI e MCP</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Comece pelo terminal e conecte o agente quando precisar</h2>
                  </div>
                  <span className="rounded-full border border-cyan-300/18 bg-cyan-300/8 px-3 py-1 text-xs uppercase tracking-[0.18em] text-cyan-100/85 sm:tracking-[0.22em]">
                    npm global
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  <BlocoCodigo titulo={slide.comando.titulo} codigo={slide.comando.codigo} />

                  <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-6 text-cyan-100">
                    Use placeholders em exemplos e documentos. Nunca cole chaves ou segredos reais no arquivo de onboarding.
                  </div>
                </div>

                <Link
                  to="/mcp"
                  className="mt-5 inline-flex max-w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-200 transition hover:border-cyan-300/24 hover:bg-cyan-300/8 hover:text-white"
                >
                  <BookOpen size={16} className="shrink-0" />
                  <span className="min-w-0">Ler documentação de CLI e MCP</span>
                </Link>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function IndicadorSlide({ ativo, label, onClick }: { ativo: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={ativo}
      onClick={onClick}
      className={[
        'h-2.5 rounded-full border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-200/40',
        ativo
          ? 'w-10 border-cyan-200/50 bg-cyan-200/80'
          : 'w-2.5 border-white/12 bg-white/20 hover:border-cyan-200/35 hover:bg-cyan-200/45',
      ].join(' ')}
    />
  );
}

interface LoginCardProps {
  modo: ModoAutenticacao;
  setModo: (modo: ModoAutenticacao) => void;
  displayName: string;
  setDisplayName: (displayName: string) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  erro: string;
  carregando: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

function LoginCard({
  modo,
  setModo,
  displayName,
  setDisplayName,
  email,
  setEmail,
  password,
  setPassword,
  erro,
  carregando,
  onSubmit,
}: LoginCardProps) {
  return (
    <section className="vault-panel vault-grid relative min-w-0 overflow-hidden rounded-[30px] border border-white/8 p-6 shadow-[0_26px_90px_rgba(0,0,0,0.38)] md:p-8 lg:fixed lg:right-[max(2rem,calc((100vw-72rem)/2))] lg:top-1/2 lg:z-20 lg:max-h-[calc(100vh-4rem)] lg:w-[min(440px,calc(100vw-4rem))] lg:-translate-y-1/2 lg:overflow-y-auto">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(95,198,213,0.14),_transparent_70%)]" />

      <form onSubmit={onSubmit} className="relative space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Acesso ao Vault</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {modo === 'login' ? 'Entrar na conta' : 'Criar nova conta'}
            </h2>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-400/8 text-cyan-100">
            <LockKeyhole size={20} />
          </div>
        </div>

        {modo === 'registro' && (
          <CampoRotulo
            label="Nome"
            input={(
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="vault-input"
                required
              />
            )}
          />
        )}

        <CampoRotulo
          label="Email"
          input={(
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="vault-input"
              required
            />
          )}
        />

        <CampoRotulo
          label="Senha"
          input={(
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="vault-input"
              minLength={8}
              required
            />
          )}
        />

        {erro && (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-2xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {carregando ? 'Processando...' : modo === 'login' ? 'Entrar no vault' : 'Criar conta e abrir vault'}
        </button>

        <p className="text-center text-sm text-slate-500">
          {modo === 'login' ? 'Ainda não tem conta?' : 'Já possui conta?'}{' '}
          <button
            type="button"
            onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}
            className="font-medium text-cyan-200 transition hover:text-white"
          >
            {modo === 'login' ? 'Criar agora' : 'Fazer login'}
          </button>
        </p>
      </form>
    </section>
  );
}

function CampoRotulo({ label, input }: { label: string; input: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-400">{label}</span>
      {input}
    </label>
  );
}

function BlocoCodigo({ titulo, codigo }: { titulo: string; codigo: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-[#050c14]/90 p-4">
      <p className="text-sm font-medium text-slate-200">{titulo}</p>
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/6 bg-slate-950/80 p-4 text-xs leading-6 text-cyan-100">
        <code>{codigo}</code>
      </pre>
    </div>
  );
}
