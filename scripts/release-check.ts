import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

interface PacotePublicavel {
  nome: string;
  dir: string;
  bin?: string;
  sourceVersionPath?: string;
}

const pacotes: PacotePublicavel[] = [
  { nome: '@myinst/shared', dir: 'packages/shared' },
  { nome: '@myinst/mcp-server', dir: 'packages/mcp-server', bin: 'packages/mcp-server/dist/index.js', sourceVersionPath: 'packages/mcp-server/src/index.ts' },
  { nome: '@myinst/cli', dir: 'packages/cli', bin: 'packages/cli/dist/index.js', sourceVersionPath: 'packages/cli/src/index.ts' },
];

const skipNpm = process.argv.includes('--skip-npm');
const destinoPack = join(process.cwd(), '.tmp', 'release-check');

async function main() {
  const versoes = carregarVersoes();
  console.log(`[SUCCESS] Versões carregadas: ${JSON.stringify(versoes)}`);

  validarLockfileCongelado();

  executarPnpm(['--filter', '@myinst/shared', 'build']);
  executarPnpm(['--filter', '@myinst/mcp-server', 'build']);
  executarPnpm(['--filter', '@myinst/cli', 'build']);

  validarBinariosLocais(versoes);
  validarLiteralsDeVersao(versoes);
  validarPacks(versoes);

  if (!skipNpm) {
    validarRegistryNpm(versoes);
    validarNpxPublicado(versoes);
  }

  console.log('[SUCCESS] release:check concluído');
}

function carregarVersoes(): Record<string, string> {
  return Object.fromEntries(pacotes.map((pacote) => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), pacote.dir, 'package.json'), 'utf-8'));
    return [pacote.nome, manifest.version];
  }));
}

function validarLockfileCongelado() {
  executarPnpm(['install', '--frozen-lockfile', '--lockfile-only', '--config.minimumReleaseAge=0']);
  console.log('[SUCCESS] Lockfile está alinhado com os manifests');
}

function validarBinariosLocais(versoes: Record<string, string>) {
  for (const pacote of pacotes.filter((item) => item.bin)) {
    const saida = executar('node', [pacote.bin as string, '--version'], { capture: true }).trim();
    const versaoEsperada = versoes[pacote.nome];

    if (saida !== versaoEsperada) {
      throw new Error(`${pacote.nome} --version local retornou ${saida}, esperado ${versaoEsperada}`);
    }
  }

  console.log('[SUCCESS] Binários locais retornam as versões dos manifests');
}

function validarLiteralsDeVersao(versoes: Record<string, string>) {
  for (const pacote of pacotes.filter((item) => item.sourceVersionPath)) {
    const conteudo = readFileSync(join(process.cwd(), pacote.sourceVersionPath as string), 'utf-8');
    const versaoEsperada = versoes[pacote.nome];

    if (!conteudo.includes(`'${versaoEsperada}'`)) {
      throw new Error(`${pacote.sourceVersionPath} não contém a versão ${versaoEsperada}`);
    }
  }

  console.log('[SUCCESS] Literais de versão do CLI/MCP estão alinhados');
}

function validarPacks(versoes: Record<string, string>) {
  rmSync(destinoPack, { recursive: true, force: true });
  mkdirSync(destinoPack, { recursive: true });

  const tarballs: string[] = [];

  for (const pacote of pacotes) {
    executarPnpm(['--filter', pacote.nome, 'pack', '--pack-destination', destinoPack]);
    const versaoEsperada = versoes[pacote.nome];
    const tarball = encontrarTarball(pacote, versaoEsperada);
    tarballs.push(tarball);

    const manifest = JSON.parse(executar('tar', ['-xOf', tarball, 'package/package.json'], { capture: true }));

    if (manifest.version !== versaoEsperada) {
      throw new Error(`${pacote.nome} pack contém versão ${manifest.version}, esperado ${versaoEsperada}`);
    }

    if (!manifest.files?.includes('dist')) {
      throw new Error(`${pacote.nome} pack não declara dist em files`);
    }

    validarManifestSemWorkspaceProtocol(pacote.nome, manifest);

    const distIndex = pacote.nome === '@myinst/shared'
      ? 'package/dist/index.js'
      : 'package/dist/index.js';

    executar('tar', ['-xOf', tarball, distIndex], { capture: true });
  }

  validarInstalacaoTarballs(versoes, tarballs);

  console.log('[SUCCESS] Tarballs npm contêm manifests, dist e instalação válidos');
}

function validarManifestSemWorkspaceProtocol(nomePacote: string, manifest: Record<string, unknown>) {
  const gruposDependencias = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

  for (const grupo of gruposDependencias) {
    const dependencias = manifest[grupo];
    if (!dependencias || typeof dependencias !== 'object' || Array.isArray(dependencias)) {
      continue;
    }

    for (const [nome, versao] of Object.entries(dependencias as Record<string, unknown>)) {
      if (typeof versao === 'string' && versao.startsWith('workspace:')) {
        throw new Error(`${nomePacote} pack contém dependência ${grupo}.${nome}=${versao}; publique com versão npm explícita`);
      }
    }
  }
}

function validarInstalacaoTarballs(versoes: Record<string, string>, tarballs: string[]) {
  const destinoInstalacao = join(destinoPack, 'install-test');

  mkdirSync(destinoInstalacao, { recursive: true });
  writeFileSync(
    join(destinoInstalacao, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }, null, 2),
  );

  executar('npm', [
    'install',
    '--prefix',
    destinoInstalacao,
    '--ignore-scripts',
    '--package-lock=false',
    '--fund=false',
    '--audit=false',
    ...tarballs,
  ]);

  const cliVersion = executar('node', [
    join(destinoInstalacao, 'node_modules', '@myinst', 'cli', 'dist', 'index.js'),
    '--version',
  ], { capture: true }).trim();

  const mcpVersion = executar('node', [
    join(destinoInstalacao, 'node_modules', '@myinst', 'mcp-server', 'dist', 'index.js'),
    '--version',
  ], { capture: true }).trim();

  if (cliVersion !== versoes['@myinst/cli']) {
    throw new Error(`tarball @myinst/cli retornou ${cliVersion}, esperado ${versoes['@myinst/cli']}`);
  }

  if (mcpVersion !== versoes['@myinst/mcp-server']) {
    throw new Error(`tarball @myinst/mcp-server retornou ${mcpVersion}, esperado ${versoes['@myinst/mcp-server']}`);
  }
}

function validarRegistryNpm(versoes: Record<string, string>) {
  for (const pacote of pacotes) {
    const metadata = JSON.parse(executar('npm', ['view', pacote.nome, 'version', 'dist-tags', '--json', '--prefer-online'], { capture: true }));
    const versaoEsperada = versoes[pacote.nome];

    if (metadata.version !== versaoEsperada) {
      throw new Error(`${pacote.nome} registry está em ${metadata.version}, esperado ${versaoEsperada}`);
    }

    if (metadata['dist-tags']?.latest !== versaoEsperada || metadata['dist-tags']?.beta !== versaoEsperada) {
      throw new Error(`${pacote.nome} dist-tags desalinhadas: ${JSON.stringify(metadata['dist-tags'])}`);
    }
  }

  console.log('[SUCCESS] Registry npm está com latest/beta alinhados');
}

function validarNpxPublicado(versoes: Record<string, string>) {
  const cliVersion = executar('npx', ['--yes', '@myinst/cli@latest', '--version'], { capture: true }).trim();
  const mcpVersion = executar('npx', ['--yes', '@myinst/mcp-server@latest', '--version'], { capture: true }).trim();

  if (cliVersion !== versoes['@myinst/cli']) {
    throw new Error(`npx @myinst/cli@latest retornou ${cliVersion}, esperado ${versoes['@myinst/cli']}`);
  }

  if (mcpVersion !== versoes['@myinst/mcp-server']) {
    throw new Error(`npx @myinst/mcp-server@latest retornou ${mcpVersion}, esperado ${versoes['@myinst/mcp-server']}`);
  }

  console.log('[SUCCESS] npx @latest retorna a versão publicada');
}

function encontrarTarball(pacote: PacotePublicavel, versao: string): string {
  const prefixo = pacote.nome.replace('@', '').replace('/', '-');
  const arquivo = readdirSync(destinoPack)
    .find((nomeArquivo) => nomeArquivo === `${prefixo}-${versao}.tgz`);

  if (!arquivo) {
    throw new Error(`Tarball não encontrado para ${pacote.nome}@${versao}`);
  }

  return join(destinoPack, arquivo);
}

function executarPnpm(args: string[], options: { capture?: boolean } = {}): string {
  return executar('corepack', ['pnpm', ...args], options);
}

function executar(
  comando: string,
  args: string[],
  options: { capture?: boolean } = {},
): string {
  const resultado = spawnSync(comando, args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
    maxBuffer: 30 * 1024 * 1024,
  });

  if (resultado.status !== 0) {
    const saida = `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`.trim();
    throw new Error(`Falha ao executar ${comando} ${args.join(' ')}${saida ? `\n${saida}` : ''}`);
  }

  return `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`;
}

main().catch((error) => {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
