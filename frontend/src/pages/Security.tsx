import { useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api, type SegurancaConta } from '@/lib/api';
import { prepararAccountEnvVaultEnvelopeWeb } from '@/lib/envVaultViewer';

export function SecurityPage() {
  const [seguranca, setSeguranca] = useState<SegurancaConta | null>(null);
  const [secretTotp, setSecretTotp] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [codigoTotp, setCodigoTotp] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [senhaVault, setSenhaVault] = useState('');
  const [codigoStepUp, setCodigoStepUp] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarSeguranca();
  }, []);

  async function iniciarTotp() {
    setErro('');
    setMensagem('');

    try {
      const setup = await api.auth.iniciarTotp();
      setSecretTotp(setup.secret);
      setOtpauthUri(setup.otpauthUri);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível iniciar o 2FA.');
    }
  }

  async function confirmarTotp(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setMensagem('');

    try {
      const resultado = await api.auth.verificarTotp({ code: codigoTotp });
      setRecoveryCodes(resultado.recoveryCodes);
      setSecretTotp('');
      setOtpauthUri('');
      setCodigoTotp('');
      setMensagem('2FA ativado. Guarde os códigos de recuperação em local seguro.');
      await carregarSeguranca();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível confirmar o 2FA.');
    }
  }

  async function salvarEnvelopeConta(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setMensagem('');

    try {
      const envelope = await prepararAccountEnvVaultEnvelopeWeb({
        passphrase: senhaVault,
        label: 'Senha do Env Vault',
      });
      await api.auth.salvarEnvVaultEnvelope(
        { envelope },
        { twoFactorCode: codigoStepUp },
      );
      setSenhaVault('');
      setCodigoStepUp('');
      setMensagem('Envelope do Env Vault da conta atualizado.');
      await carregarSeguranca();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível salvar o envelope do Env Vault.');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Conta</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Segurança</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Proteja ações sensíveis com aplicativo autenticador e mantenha o segredo do Env Vault cifrado por senha local.
          </p>
        </div>
      </header>

      {erro && (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
          {erro}
        </div>
      )}

      {mensagem && (
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-100">
          {mensagem}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-400/8 text-cyan-100">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Autenticador</h2>
              <p className="text-sm text-slate-500">
                {seguranca?.twoFactor.enabled ? '2FA ativo na conta.' : 'Configure antes de usar o Env Vault no painel.'}
              </p>
            </div>
          </div>

          {!seguranca?.twoFactor.enabled && !secretTotp && (
            <button
              type="button"
              onClick={iniciarTotp}
              disabled={carregando}
              className="mt-5 rounded-xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Iniciar setup
            </button>
          )}

          {secretTotp && (
            <form onSubmit={confirmarTotp} className="mt-5 space-y-4">
              <div>
                <label className="text-sm text-slate-400">Secret TOTP</label>
                <code className="mt-2 block overflow-x-auto rounded-xl border border-white/8 bg-slate-950/80 p-3 text-xs text-cyan-100">
                  {secretTotp}
                </code>
              </div>
              <div>
                <label className="text-sm text-slate-400">URI para aplicativo autenticador</label>
                <code className="mt-2 block overflow-x-auto rounded-xl border border-white/8 bg-slate-950/80 p-3 text-xs text-cyan-100">
                  {otpauthUri}
                </code>
              </div>
              <Campo label="Código de 6 dígitos">
                <input
                  value={codigoTotp}
                  onChange={(event) => setCodigoTotp(event.target.value)}
                  className="vault-input"
                  inputMode="numeric"
                  required
                />
              </Campo>
              <button className="rounded-xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20">
                Confirmar 2FA
              </button>
            </form>
          )}

          {recoveryCodes.length > 0 && (
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/8 p-4">
              <p className="text-sm font-medium text-amber-100">Códigos de recuperação</p>
              <pre className="mt-3 overflow-x-auto text-xs leading-6 text-amber-50">{recoveryCodes.join('\n')}</pre>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-400/8 text-cyan-100">
              <LockKeyhole size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Env Vault da conta</h2>
              <p className="text-sm text-slate-500">
                {seguranca?.envVault.envelopeCount ?? 0} envelope(s) cadastrado(s).
              </p>
            </div>
          </div>

          <form onSubmit={salvarEnvelopeConta} className="mt-5 space-y-4">
            <Campo label="Senha local do Env Vault">
              <input
                type="password"
                value={senhaVault}
                onChange={(event) => setSenhaVault(event.target.value)}
                className="vault-input"
                minLength={16}
                disabled={!seguranca?.twoFactor.enabled}
                required
              />
            </Campo>
            <Campo label="Código do autenticador">
              <input
                value={codigoStepUp}
                onChange={(event) => setCodigoStepUp(event.target.value)}
                className="vault-input"
                inputMode="numeric"
                disabled={!seguranca?.twoFactor.enabled}
                required
              />
            </Campo>
            <button
              disabled={!seguranca?.twoFactor.enabled}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound size={16} />
              Salvar envelope
            </button>
          </form>
        </div>
      </section>
    </div>
  );

  async function carregarSeguranca() {
    setCarregando(true);
    setErro('');

    try {
      setSeguranca(await api.auth.seguranca());
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar as configurações de segurança.');
    } finally {
      setCarregando(false);
    }
  }
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}
