import { chmod, copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import {
  calcularHashCiphertextEnvVault,
  criarEnvVaultRecoveryEnvelope,
  criptografarEnvVault,
  descriptografarEnvVault,
  gerarRecoveryKeyEnvVault,
  validarPayloadEnvVault,
  type EnvVaultEncryptedPayload,
  type EnvVaultRecoveryEnvelope,
} from '@myinst/shared/env-vault';
import type { CriarEnvVaultFileInput } from '@myinst/shared';
import { carregarConfig, type MyInstConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

interface EnvBaseOptions {
  workspace?: string;
  project?: string;
}

interface EnvPushOptions extends EnvBaseOptions {
  file: string;
  name?: string;
  environment?: string;
  createRecoveryKey?: boolean;
}

interface EnvPullOptions extends EnvBaseOptions {
  name: string;
  output?: string;
  overwrite?: boolean;
}

interface EnvNameOptions extends EnvBaseOptions {
  name: string;
}

interface EnvListOptions {
  workspace?: string;
  project?: string;
}

export interface PrepararEnvVaultPushParams {
  file: string;
  name?: string;
  environment?: string;
  segredo: string;
  recoveryKey?: string;
  createRecoveryKey?: boolean;
}

export interface PrepararEnvVaultPushResult {
  body: CriarEnvVaultFileInput;
  generatedRecoveryKey?: string;
}

export interface EnvVaultFileResumo {
  id: string;
  name: string;
  sourcePath: string;
  environment?: string | null;
  metadata?: Record<string, unknown>;
  encryptedPayload?: EnvVaultEncryptedPayload;
  recoveryEnvelopes?: EnvVaultRecoveryEnvelope[];
  createdAt?: string;
  updatedAt?: string;
}

interface EnvVaultRequestParams {
  config: MyInstConfig;
  workspace: string;
  project: string;
  fetchImpl?: typeof fetch;
}

interface BuscarEnvVaultFileParams extends EnvVaultRequestParams {
  name: string;
}

interface BaixarEnvVaultFileParams extends BuscarEnvVaultFileParams {
  output?: string;
  overwrite?: boolean;
  segredo: string;
}

interface BaixarEnvVaultFileResult {
  outputPath: string;
  backupPath: string | null;
}

export async function executarEnvPush(options: EnvPushOptions): Promise<void> {
  try {
    garantirEnvVaultExperimentalHabilitado();

    const config = carregarConfigObrigatoria();
    const workspace = options.workspace || 'default';
    const project = obterProjetoObrigatorio(options.project);
    const segredo = await resolverSegredoEnvVault();
    const preparado = await prepararEnvVaultPush({
      file: options.file,
      name: options.name,
      environment: options.environment,
      segredo,
      recoveryKey: process.env.MYINST_ENV_VAULT_RECOVERY_KEY,
      createRecoveryKey: options.createRecoveryKey,
    });

    const resposta = await fetch(endpointEnvFiles(config, workspace, project), {
      method: 'POST',
      headers: headersJson(config),
      body: JSON.stringify(preparado.body),
    });

    if (!resposta.ok) {
      await encerrarComErroHttp(resposta);
    }

    const json = await resposta.json();
    console.log(`${VERDE}[SUCCESS] Env salvo:${RESET} ${json.data?.name ?? preparado.body.name}`);
    if (preparado.generatedRecoveryKey) {
      console.log(`${AMARELO}[WARN] Guarde esta recovery key. Ela nao sera exibida novamente:${RESET} ${preparado.generatedRecoveryKey}`);
    }
  } catch (erro) {
    encerrarComErro(erro);
  }
}

export async function executarEnvPull(options: EnvPullOptions): Promise<void> {
  try {
    garantirEnvVaultExperimentalHabilitado();

    const config = carregarConfigObrigatoria();
    const workspace = options.workspace || 'default';
    const project = obterProjetoObrigatorio(options.project);
    const segredo = await resolverSegredoEnvVault();
    const resultado = await baixarEnvVaultFile({
      config,
      workspace,
      project,
      name: options.name,
      output: options.output,
      overwrite: options.overwrite,
      segredo,
    });

    console.log(`${VERDE}[SUCCESS] Env materializado:${RESET} ${resultado.outputPath}`);
    if (resultado.backupPath) {
      console.log(`${AMARELO}[WARN] Backup criado:${RESET} ${resultado.backupPath}`);
    }
  } catch (erro) {
    encerrarComErro(erro);
  }
}

export async function executarEnvList(options: EnvListOptions): Promise<void> {
  try {
    garantirEnvVaultExperimentalHabilitado();

    const config = carregarConfigObrigatoria();
    const workspace = options.workspace || 'default';
    const project = obterProjetoObrigatorio(options.project);
    const resposta = await fetch(endpointEnvFiles(config, workspace, project), {
      headers: headersAuth(config),
    });

    if (!resposta.ok) {
      await encerrarComErroHttp(resposta);
    }

    const json = await resposta.json();
    const envs = (json.data ?? []) as EnvVaultFileResumo[];
    if (envs.length === 0) {
      console.log(`${AMARELO}[WARN] Nenhum env encontrado em ${workspace}/${project}${RESET}`);
      return;
    }

    for (const env of envs) {
      const ambiente = env.environment ? ` ${CINZA}${env.environment}${RESET}` : '';
      console.log(`${VERDE}${env.name}${RESET}${ambiente} ${CINZA}${env.sourcePath}${RESET}`);
    }
  } catch (erro) {
    encerrarComErro(erro);
  }
}

export async function executarEnvShow(options: EnvNameOptions): Promise<void> {
  try {
    garantirEnvVaultExperimentalHabilitado();

    const config = carregarConfigObrigatoria();
    const workspace = options.workspace || 'default';
    const project = obterProjetoObrigatorio(options.project);
    const env = await buscarEnvVaultFile({
      config,
      workspace,
      project,
      name: options.name,
    });

    console.log(`${VERDE}${env.name}${RESET} ${CINZA}${env.sourcePath}${RESET}`);
    console.log(`${CINZA}Tamanho cifrado:${RESET} ${env.metadata?.ciphertextByteLength ?? '-'}`);
    if (env.updatedAt) {
      console.log(`${CINZA}Atualizado em:${RESET} ${env.updatedAt}`);
    }
  } catch (erro) {
    encerrarComErro(erro);
  }
}

export async function executarEnvDelete(options: EnvNameOptions): Promise<void> {
  try {
    garantirEnvVaultExperimentalHabilitado();

    const config = carregarConfigObrigatoria();
    const workspace = options.workspace || 'default';
    const project = obterProjetoObrigatorio(options.project);
    await deletarEnvVaultFile({
      config,
      workspace,
      project,
      name: options.name,
    });

    console.log(`${VERDE}[SUCCESS] Env removido:${RESET} ${options.name}`);
  } catch (erro) {
    encerrarComErro(erro);
  }
}

export async function prepararEnvVaultPush(params: PrepararEnvVaultPushParams): Promise<PrepararEnvVaultPushResult> {
  const plaintext = await readFile(params.file, 'utf-8');
  const encryptedPayload = await criptografarEnvVault({
    plaintext,
    segredo: params.segredo,
  });
  const ciphertextByteLength = tamanhoCiphertext(encryptedPayload);
  const recoveryKey = params.createRecoveryKey
    ? gerarRecoveryKeyEnvVault()
    : params.recoveryKey;
  const recoveryEnvelopes = recoveryKey
    ? [await criarEnvVaultRecoveryEnvelope({
      vaultSecret: params.segredo,
      segredoRecuperacao: recoveryKey,
      method: 'recovery_key',
      label: 'Recovery key principal',
    })]
    : undefined;

  return {
    body: {
      name: normalizarNomeEnv(params.name || basename(params.file)),
      sourcePath: basename(params.file),
      environment: params.environment,
      encryptedPayload,
      metadata: {
        ciphertextByteLength,
        ciphertextSha256: calcularHashCiphertextEnvVault(encryptedPayload),
      },
      recoveryEnvelopes,
    },
    generatedRecoveryKey: params.createRecoveryKey ? recoveryKey : undefined,
  };
}

export async function baixarEnvVaultFile(params: BaixarEnvVaultFileParams): Promise<BaixarEnvVaultFileResult> {
  const resumo = await buscarEnvVaultFile(params);
  const env = await obterEnvVaultFileDetalhado({
    ...params,
    id: resumo.id,
  });
  if (!env.encryptedPayload) {
    throw new Error('Env Vault sem payload criptografado.');
  }

  const plaintext = await descriptografarEnvVault({
    payload: validarPayloadEnvVault(env.encryptedPayload),
    segredo: params.segredo,
  });
  const outputPath = params.output;
  if (!outputPath) {
    throw new Error('Informe --output para materializar um env localmente.');
  }

  const backupPath = await prepararDestino(outputPath, params.overwrite);

  await writeFile(outputPath, plaintext, { encoding: 'utf-8', mode: 0o600 });
  await restringirPermissaoArquivo(outputPath);

  return { outputPath, backupPath };
}

export async function buscarEnvVaultFile(params: BuscarEnvVaultFileParams): Promise<EnvVaultFileResumo> {
  const resposta = await (params.fetchImpl ?? fetch)(endpointEnvFiles(params.config, params.workspace, params.project), {
    headers: headersAuth(params.config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  const data = json.data ?? [];
  const envs = Array.isArray(data)
    ? data as EnvVaultFileResumo[]
    : [data as EnvVaultFileResumo];
  const env = envs.find((entrada) => entrada.name === params.name || entrada.id === params.name);
  if (!env) {
    throw new Error(`Env não encontrado: ${params.name}`);
  }

  if (env.encryptedPayload) {
    env.encryptedPayload = validarPayloadEnvVault(env.encryptedPayload);
  }

  return env;
}

async function obterEnvVaultFileDetalhado(params: EnvVaultRequestParams & { id: string }): Promise<EnvVaultFileResumo> {
  const resposta = await (params.fetchImpl ?? fetch)(endpointEnvFile(params.config, params.workspace, params.project, params.id), {
    headers: headersAuth(params.config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }

  const json = await resposta.json();
  const env = json.data as EnvVaultFileResumo;
  if (env.encryptedPayload) {
    env.encryptedPayload = validarPayloadEnvVault(env.encryptedPayload);
  }

  return env;
}

export async function deletarEnvVaultFile(params: BuscarEnvVaultFileParams): Promise<void> {
  const env = await buscarEnvVaultFile(params);
  const resposta = await (params.fetchImpl ?? fetch)(endpointEnvFile(params.config, params.workspace, params.project, env.id), {
    method: 'DELETE',
    headers: headersAuth(params.config),
  });

  if (!resposta.ok) {
    await encerrarComErroHttp(resposta);
  }
}

async function resolverSegredoEnvVault(): Promise<string> {
  const valor = process.env.MYINST_ENV_VAULT_SECRET;
  if (valor) {
    return valor;
  }

  return perguntarSegredoOculto('Segredo do Env Vault: ');
}

async function perguntarSegredoOculto(prompt: string): Promise<string> {
  const entrada = input;
  if (!entrada.isTTY || typeof entrada.setRawMode !== 'function') {
    throw new Error('Segredo do Env Vault é obrigatório. Informe MYINST_ENV_VAULT_SECRET ou use o prompt interativo.');
  }

  output.write(prompt);
  emitKeypressEvents(entrada);
  entrada.setRawMode(true);
  entrada.resume();

  return new Promise((resolve, reject) => {
    let segredo = '';

    const limpar = () => {
      entrada.setRawMode?.(false);
      entrada.pause();
      entrada.off('keypress', aoPressionar);
      output.write('\n');
    };

    const aoPressionar = (char: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        limpar();
        reject(new Error('Operação cancelada.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        limpar();
        if (!segredo) {
          reject(new Error('Segredo do Env Vault é obrigatório.'));
          return;
        }

        resolve(segredo);
        return;
      }

      if (key.name === 'backspace') {
        segredo = segredo.slice(0, -1);
        return;
      }

      if (char && !key.ctrl) {
        segredo += char;
      }
    };

    entrada.on('keypress', aoPressionar);
  });
}

async function prepararDestino(outputPath: string, overwrite?: boolean): Promise<string | null> {
  if (!existsSync(outputPath)) {
    return null;
  }

  if (overwrite) {
    return null;
  }

  const backupPath = `${outputPath}.bak`;
  if (existsSync(backupPath)) {
    await rename(backupPath, `${backupPath}.${Date.now()}`);
  }

  await copyFile(outputPath, backupPath);
  await restringirPermissaoArquivo(backupPath);
  return backupPath;
}

async function restringirPermissaoArquivo(caminho: string): Promise<void> {
  await chmod(caminho, 0o600).catch(() => undefined);
}

function normalizarNomeEnv(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'env';
}

function tamanhoCiphertext(payload: EnvVaultEncryptedPayload): number {
  const normalizado = payload.ciphertext.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalizado.length % 4)) % 4);

  return Buffer.from(`${normalizado}${padding}`, 'base64').byteLength;
}

function endpointEnvFiles(config: MyInstConfig, workspace: string, project: string): string {
  return `${config.server}/api/v1/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/env-files`;
}

function endpointEnvFile(config: MyInstConfig, workspace: string, project: string, id: string): string {
  return `${endpointEnvFiles(config, workspace, project)}/${encodeURIComponent(id)}`;
}

function headersJson(config: MyInstConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
}

function headersAuth(config: MyInstConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
  };
}

function carregarConfigObrigatoria(): MyInstConfig {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  return config;
}

function obterProjetoObrigatorio(project?: string): string {
  if (project?.trim()) {
    return project;
  }

  throw new Error('Informe --project para associar o env a um projeto especifico.');
}

function garantirEnvVaultExperimentalHabilitado(): void {
  if (process.env.MYINST_ENABLE_ENV_VAULT === '1') {
    return;
  }

  throw new Error('Env Vault ainda está em rollout. Defina MYINST_ENABLE_ENV_VAULT=1 apenas após habilitar a API no servidor.');
}

async function encerrarComErroHttp(resposta: Response): Promise<never> {
  const erro = await resposta.json().catch(() => ({ error: { message: resposta.statusText } }));
  throw new Error(erro.error?.message || resposta.statusText);
}

function encerrarComErro(erro: unknown): never {
  const mensagem = erro instanceof Error ? erro.message : 'Falha no Env Vault.';
  console.error(`${VERMELHO}[ERROR] ${mensagem}${RESET}`);
  process.exit(1);
}
