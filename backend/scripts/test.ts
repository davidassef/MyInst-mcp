import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nomeContainer = `myinst-server-test-${Date.now()}`;
const imagemPostgres = process.env.MYINST_TEST_POSTGRES_IMAGE || 'postgres:16-alpine';
const diretorioScript = dirname(fileURLToPath(import.meta.url));
const diretorioServidor = dirname(diretorioScript);

async function main() {
  const usarBancoExistente = process.env.MYINST_USE_EXISTING_TEST_DB === '1';

  if (usarBancoExistente) {
    process.exitCode = executarVitest({
      ...process.env,
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
    });
    return;
  }

  const portaHost = await obterPortaLivre();
  const urlBanco = `postgresql://postgres:postgres@127.0.0.1:${portaHost}/myinst_test`;

  removerContainersDeTesteOrfaos();
  pararContainer();

  executar('docker', [
    'run',
    '--detach',
    '--name',
    nomeContainer,
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_PASSWORD=postgres',
    '-e',
    'POSTGRES_DB=myinst_test',
    '-p',
    `127.0.0.1:${portaHost}:5432`,
    imagemPostgres,
  ]);

  try {
    aguardarBancoPronto();

    executar(obterBinarioLocal('drizzle-kit'), [
      'push',
      '--schema',
      'src/db/schema.ts',
      '--dialect',
      'postgresql',
      '--force',
      '--url',
      urlBanco,
    ]);

    process.exitCode = executarVitest({
      ...process.env,
      DATABASE_URL: urlBanco,
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
    });
  } finally {
    pararContainer();
  }
}

async function obterPortaLivre(): Promise<number> {
  const servidor = createServer();

  const porta = await new Promise<number>((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const endereco = servidor.address();

      if (!endereco || typeof endereco === 'string') {
        reject(new Error('Nao foi possivel reservar uma porta livre para o Postgres de teste.'));
        return;
      }

      resolve(endereco.port);
    });
  });

  await new Promise<void>((resolve, reject) => {
    servidor.close((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });

  return porta;
}

function aguardarBancoPronto() {
  const maxTentativas = 30;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    const resultado = spawnSync(
      'docker',
      ['exec', nomeContainer, 'pg_isready', '-U', 'postgres', '-d', 'myinst_test'],
      { stdio: 'ignore' },
    );

    if (resultado.status === 0) {
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  throw new Error('Postgres de teste nao ficou pronto a tempo.');
}

function executarVitest(env: NodeJS.ProcessEnv): number {
  const resultado = spawnSync(obterBinarioLocal('vitest'), ['run'], {
    stdio: 'inherit',
    env,
    cwd: diretorioServidor,
    shell: process.platform === 'win32',
  });

  return resultado.status ?? 1;
}

function pararContainer() {
  spawnSync('docker', ['rm', '-f', nomeContainer], { stdio: 'ignore' });
}

function removerContainersDeTesteOrfaos() {
  const resultado = spawnSync('docker', ['ps', '-aq', '--filter', 'name=^/myinst-server-test-'], {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });

  const ids = resultado.stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.length === 0) return;

  spawnSync('docker', ['rm', '-f', ...ids], { stdio: 'ignore', shell: process.platform === 'win32' });
}

function executar(comando: string, args: string[]) {
  const resultado = spawnSync(comando, args, {
    stdio: 'inherit',
    encoding: 'utf-8',
    env: process.env,
    cwd: diretorioServidor,
    shell: process.platform === 'win32',
  });

  if (resultado.status !== 0) {
    throw new Error(`Falha ao executar: ${comando} ${args.join(' ')}`);
  }
}

function obterBinarioLocal(nome: string): string {
  return process.platform === 'win32'
    ? join(diretorioServidor, 'node_modules', '.bin', `${nome}.CMD`)
    : join(diretorioServidor, 'node_modules', '.bin', nome);
}

await main();
