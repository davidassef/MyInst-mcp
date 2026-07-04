import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, LockKeyhole, QrCode, RefreshCcw, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, type SegurancaConta } from '@/lib/api';
import { prepararAccountEnvVaultEnvelopeWeb } from '@/lib/envVaultViewer';

type EtapaWizardTotp = 'inicio' | 'qr' | 'recovery' | 'ativo';

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
  const [copiado, setCopiado] = useState('');
  const [processandoTotp, setProcessandoTotp] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const totpAtivo = seguranca?.twoFactor.enabled ?? false;
  const etapaTotp = obterEtapaTotp({
    totpAtivo,
    possuiSetupPendente: !!secretTotp,
    possuiRecoveryCodes: recoveryCodes.length > 0,
  });
  const codigoTotpValido = /^\d{6}$/.test(codigoTotp);

  useEffect(() => {
    carregarSeguranca();
  }, []);

  async function iniciarTotp() {
    setErro('');
    setMensagem('');
    setRecoveryCodes([]);
    setCodigoTotp('');
    setProcessandoTotp(true);

    try {
      const setup = await api.auth.iniciarTotp();
      setSecretTotp(setup.secret);
      setOtpauthUri(setup.otpauthUri);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível iniciar o 2FA.');
    } finally {
      setProcessandoTotp(false);
    }
  }

  async function confirmarTotp(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setMensagem('');
    setProcessandoTotp(true);

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
    } finally {
      setProcessandoTotp(false);
    }
  }

  function atualizarCodigoTotp(valor: string) {
    setCodigoTotp(valor.replace(/\D/g, '').slice(0, 6));
  }

  async function copiarTexto(valor: string, id: string) {
    await navigator.clipboard.writeText(valor);
    setCopiado(id);
    window.setTimeout(() => setCopiado((idAtual) => (idAtual === id ? '' : idAtual)), 2000);
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
                {totpAtivo ? '2FA ativo na conta.' : 'Configure antes de usar o Env Vault no painel.'}
              </p>
            </div>
          </div>

          <WizardTotp
            etapa={etapaTotp}
            secret={secretTotp}
            otpauthUri={otpauthUri}
            codigo={codigoTotp}
            codigoValido={codigoTotpValido}
            recoveryCodes={recoveryCodes}
            recoveryCodeCount={seguranca?.twoFactor.recoveryCodeCount ?? 0}
            copiado={copiado}
            carregando={carregando || processandoTotp}
            onStart={iniciarTotp}
            onConfirm={confirmarTotp}
            onChangeCode={atualizarCodigoTotp}
            onCopy={copiarTexto}
          />
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

function WizardTotp({
  etapa,
  secret,
  otpauthUri,
  codigo,
  codigoValido,
  recoveryCodes,
  recoveryCodeCount,
  copiado,
  carregando,
  onStart,
  onConfirm,
  onChangeCode,
  onCopy,
}: {
  etapa: EtapaWizardTotp;
  secret: string;
  otpauthUri: string;
  codigo: string;
  codigoValido: boolean;
  recoveryCodes: string[];
  recoveryCodeCount: number;
  copiado: string;
  carregando: boolean;
  onStart: () => Promise<void>;
  onConfirm: (event: React.FormEvent) => Promise<void>;
  onChangeCode: (valor: string) => void;
  onCopy: (valor: string, id: string) => Promise<void>;
}) {
  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <EtapaTotp numero="1" titulo="Gerar QR" ativa={etapa === 'inicio'} completa={etapa !== 'inicio'} />
        <EtapaTotp numero="2" titulo="Conferir código" ativa={etapa === 'qr'} completa={etapa === 'recovery' || etapa === 'ativo'} />
        <EtapaTotp numero="3" titulo="Guardar recuperação" ativa={etapa === 'recovery'} completa={etapa === 'ativo'} />
      </div>

      {etapa === 'ativo' && (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/8 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-emerald-100" size={18} />
            <div>
              <p className="text-sm font-medium text-emerald-100">Autenticador configurado</p>
              <p className="mt-1 text-sm leading-6 text-emerald-50/75">
                A conta exigirá código do aplicativo autenticador no login e em ações sensíveis. Você ainda possui {recoveryCodeCount} código(s) de recuperação disponível(is).
              </p>
            </div>
          </div>
        </div>
      )}

      {etapa === 'inicio' && (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-400">
            O assistente gera um QR Code compatível com Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden e apps TOTP equivalentes.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <QrCode size={16} />
            {carregando ? 'Preparando...' : 'Configurar autenticador'}
          </button>
        </div>
      )}

      {etapa === 'qr' && (
        <form onSubmit={onConfirm} className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="flex justify-center rounded-xl border border-white/10 bg-white p-4">
              <QRCodeSVG
                value={otpauthUri}
                size={208}
                level="H"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#020617"
                title="QR Code para configurar 2FA do MyInst"
              />
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-200">Escaneie o QR Code no aplicativo autenticador</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Depois de adicionar a conta no aplicativo, informe o código de 6 dígitos gerado para ativar o 2FA.
                </p>
              </div>

              <div className="rounded-xl border border-white/8 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Chave manual</span>
                  <button
                    type="button"
                    onClick={() => onCopy(secret, 'totp-secret')}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/8"
                  >
                    <Copy size={14} />
                    {copiado === 'totp-secret' ? 'Copiada' : 'Copiar'}
                  </button>
                </div>
                <code className="mt-2 block break-all font-mono text-sm text-cyan-100">{secret}</code>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onCopy(otpauthUri, 'totp-uri')}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/8"
                >
                  <Copy size={14} />
                  {copiado === 'totp-uri' ? 'URI copiada' : 'Copiar URI'}
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  disabled={carregando}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCcw size={14} />
                  Gerar novo QR
                </button>
              </div>
            </div>
          </div>

          <Campo label="Código de 6 dígitos">
            <input
              value={codigo}
              onChange={(event) => onChangeCode(event.target.value)}
              className="vault-input max-w-48 text-center font-mono text-lg tracking-[0.18em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
          </Campo>

          <button
            disabled={!codigoValido || carregando}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-2 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck size={16} />
            {carregando ? 'Conferindo...' : 'Conferir e ativar'}
          </button>
        </form>
      )}

      {etapa === 'recovery' && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-100">Códigos de recuperação</p>
              <p className="mt-1 text-sm leading-6 text-amber-50/75">
                Estes códigos aparecem uma única vez. Guarde fora do MyInst antes de sair da página.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCopy(recoveryCodes.join('\n'), 'totp-recovery')}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-100/20 px-3 py-2 text-xs text-amber-50 transition hover:bg-amber-100/10"
            >
              <Copy size={14} />
              {copiado === 'totp-recovery' ? 'Copiados' : 'Copiar códigos'}
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-amber-100/10 bg-slate-950/70 p-3 text-xs leading-6 text-amber-50">{recoveryCodes.join('\n')}</pre>
        </div>
      )}
    </div>
  );
}

function EtapaTotp({ numero, titulo, ativa, completa }: { numero: string; titulo: string; ativa: boolean; completa: boolean }) {
  let estilo = 'border-white/8 bg-white/[0.03] text-slate-500';

  if (ativa) {
    estilo = 'border-cyan-300/24 bg-cyan-300/10 text-cyan-50';
  }

  if (completa) {
    estilo = 'border-emerald-300/24 bg-emerald-300/10 text-emerald-50';
  }

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${estilo}`}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/30 text-xs font-medium">
        {completa ? <CheckCircle2 size={14} /> : numero}
      </span>
      <span className="truncate text-xs font-medium">{titulo}</span>
    </div>
  );
}

function obterEtapaTotp({
  totpAtivo,
  possuiSetupPendente,
  possuiRecoveryCodes,
}: {
  totpAtivo: boolean;
  possuiSetupPendente: boolean;
  possuiRecoveryCodes: boolean;
}): EtapaWizardTotp {
  if (possuiRecoveryCodes) return 'recovery';
  if (possuiSetupPendente) return 'qr';
  if (totpAtivo) return 'ativo';

  return 'inicio';
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}
