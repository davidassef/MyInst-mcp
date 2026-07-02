const UPDATE_CHECK_URL = 'https://registry.npmjs.org/@myinst%2Fcli/latest';
const UPDATE_CHECK_TIMEOUT_MS = 1200;

interface RegistryResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

type UpdateCheckFetch = (url: string, init?: RequestInit) => Promise<RegistryResponse>;

interface ObterAvisoAtualizacaoOptions {
  currentVersion: string;
  fetchImpl?: UpdateCheckFetch;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  timeoutMs?: number;
}

export async function avisarAtualizacaoDisponivel(currentVersion: string): Promise<void> {
  const aviso = await obterAvisoAtualizacao({
    currentVersion,
    fetchImpl: fetch as unknown as UpdateCheckFetch,
    env: process.env,
  });

  if (!aviso) return;

  console.error(aviso);
}

export async function obterAvisoAtualizacao(options: ObterAvisoAtualizacaoOptions): Promise<string | null> {
  const env = options.env ?? process.env;

  if (env.MYINST_DISABLE_UPDATE_CHECK === '1' || env.CI === 'true') {
    return null;
  }

  const latestVersion = await buscarLatestVersion(options);
  if (!latestVersion) {
    return null;
  }

  if (compararVersoes(latestVersion, options.currentVersion) <= 0) {
    return null;
  }

  return `[WARN] Nova versão do MyInst CLI disponível: ${options.currentVersion} -> ${latestVersion}. Atualize com: npm install -g @myinst/cli@latest`;
}

async function buscarLatestVersion(options: ObterAvisoAtualizacaoOptions): Promise<string | null> {
  const fetchImpl: UpdateCheckFetch = options.fetchImpl ?? fetch as unknown as UpdateCheckFetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS);

  try {
    const resposta = await fetchImpl(UPDATE_CHECK_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!resposta.ok) {
      return null;
    }

    const payload = await resposta.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const version = (payload as Record<string, unknown>).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function compararVersoes(a: string, b: string): number {
  const primeiraVersao = parseVersion(a);
  const segundaVersao = parseVersion(b);

  for (const chave of ['major', 'minor', 'patch'] as const) {
    const diferenca = primeiraVersao[chave] - segundaVersao[chave];
    if (diferenca !== 0) {
      return Math.sign(diferenca);
    }
  }

  return compararPrerelease(primeiraVersao.prerelease, segundaVersao.prerelease);
}

function parseVersion(version: string) {
  const [base, prerelease = ''] = version.split('-', 2);
  const [major = 0, minor = 0, patch = 0] = base
    .split('.')
    .map((parte) => Number.parseInt(parte, 10))
    .map((numero) => Number.isFinite(numero) ? numero : 0);

  return { major, minor, patch, prerelease };
}

function compararPrerelease(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const partesA = a.split('.');
  const partesB = b.split('.');
  const tamanho = Math.max(partesA.length, partesB.length);

  for (let indice = 0; indice < tamanho; indice += 1) {
    const parteA = partesA[indice];
    const parteB = partesB[indice];

    if (parteA === undefined) return -1;
    if (parteB === undefined) return 1;

    const comparacao = compararIdentificadorPrerelease(parteA, parteB);
    if (comparacao !== 0) {
      return comparacao;
    }
  }

  return 0;
}

function compararIdentificadorPrerelease(a: string, b: string): number {
  const numeroA = Number.parseInt(a, 10);
  const numeroB = Number.parseInt(b, 10);
  const ambosNumericos = String(numeroA) === a && String(numeroB) === b;

  if (ambosNumericos) {
    return Math.sign(numeroA - numeroB);
  }

  return Math.sign(a.localeCompare(b));
}
