import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
  const versao = [...new Set(Object.values(versoes))][0];

  if (new Set(Object.values(versoes)).size !== 1) {
    throw new Error(`Versões divergentes: ${JSON.stringify(versoes)}`);
  }

  console.log(`[SUCCESS] Versões alinhadas em ${versao}`);

  executar('pnpm', ['--filter', '@myinst/shared', 'build']);
  executar('pnpm', ['--filter', '@myinst/mcp-server', 'build']);
  executar('pnpm', ['--filter', '@myinst/cli', 'build']);

  validarBinariosLocais(versao);
  validarLiteralsDeVersao(versao);
  validarPacks(versao);

  if (!skipNpm) {
    validarRegistryNpm(versao);
    validarNpxPublicado(versao);
  }

  console.log('[SUCCESS] release:check concluído');
}

function carregarVersoes(): Record<string, string> {
  return Object.fromEntries(pacotes.map((pacote) => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), pacote.dir, 'package.json'), 'utf-8'));
    return [pacote.nome, manifest.version];
  }));
}

function validarBinariosLocais(versao: string) {
  for (const pacote of pacotes.filter((item) => item.bin)) {
    const saida = executar('node', [pacote.bin as string, '--version'], { capture: true }).trim();
    if (saida !== versao) {
      throw new Error(`${pacote.nome} --version local retornou ${saida}, esperado ${versao}`);
    }
  }

  console.log('[SUCCESS] Binários locais retornam a versão dos manifests');
}

function validarLiteralsDeVersao(versao: string) {
  for (const pacote of pacotes.filter((item) => item.sourceVersionPath)) {
    const conteudo = readFileSync(join(process.cwd(), pacote.sourceVersionPath as string), 'utf-8');
    if (!conteudo.includes(`'${versao}'`)) {
      throw new Error(`${pacote.sourceVersionPath} não contém a versão ${versao}`);
    }
  }

  console.log('[SUCCESS] Literais de versão do CLI/MCP estão alinhados');
}

function validarPacks(versao: string) {
  rmSync(destinoPack, { recursive: true, force: true });
  mkdirSync(destinoPack, { recursive: true });

  for (const pacote of pacotes) {
    executar('pnpm', ['--filter', pacote.nome, 'pack', '--pack-destination', destinoPack]);
    const tarball = encontrarTarball(pacote, versao);
    const manifest = JSON.parse(executar('tar', ['-xOf', tarball, 'package/package.json'], { capture: true }));

    if (manifest.version !== versao) {
      throw new Error(`${pacote.nome} pack contém versão ${manifest.version}, esperado ${versao}`);
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

  console.log('[SUCCESS] Tarballs npm contêm manifests e dist válidos');
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

function validarRegistryNpm(versao: string) {
  for (const pacote of pacotes) {
    const metadata = JSON.parse(executar('npm', ['view', pacote.nome, 'version', 'dist-tags', '--json', '--prefer-online'], { capture: true }));

    if (metadata.version !== versao) {
      throw new Error(`${pacote.nome} registry está em ${metadata.version}, esperado ${versao}`);
    }

    if (metadata['dist-tags']?.latest !== versao || metadata['dist-tags']?.beta !== versao) {
      throw new Error(`${pacote.nome} dist-tags desalinhadas: ${JSON.stringify(metadata['dist-tags'])}`);
    }
  }

  console.log('[SUCCESS] Registry npm está com latest/beta alinhados');
}

function validarNpxPublicado(versao: string) {
  const cliVersion = executar('npx', ['--yes', '@myinst/cli@latest', '--version'], { capture: true }).trim();
  const mcpVersion = executar('npx', ['--yes', '@myinst/mcp-server@latest', '--version'], { capture: true }).trim();

  if (cliVersion !== versao) {
    throw new Error(`npx @myinst/cli@latest retornou ${cliVersion}, esperado ${versao}`);
  }

  if (mcpVersion !== versao) {
    throw new Error(`npx @myinst/mcp-server@latest retornou ${mcpVersion}, esperado ${versao}`);
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
