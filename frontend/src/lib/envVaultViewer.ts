import {
  abrirEnvVaultRecoveryEnvelope,
  criarEnvVaultRecoveryEnvelope,
  descriptografarEnvVault,
  gerarRecoveryKeyEnvVault,
  gerarSegredoVaultEnvVault,
} from '@myinst/shared/env-vault';
import type { EnvVaultEncryptedPayload, EnvVaultRecoveryEnvelope } from './api';

export interface EnvVaultVariavelVisualizacao {
  nome: string;
  valor: string;
  linha: number;
}

export interface EnvVaultLinhaIgnorada {
  linha: number;
  conteudo: string;
}

export interface EnvVaultVisualizacao {
  variaveis: EnvVaultVariavelVisualizacao[];
  linhasIgnoradas: EnvVaultLinhaIgnorada[];
  totalLinhas: number;
  plaintext: string;
}

export async function desbloquearEnvVaultParaVisualizacao({
  encryptedPayload,
  secret,
}: {
  encryptedPayload: EnvVaultEncryptedPayload;
  secret: string;
}): Promise<EnvVaultVisualizacao> {
  const plaintext = await descriptografarEnvVault({
    payload: encryptedPayload,
    segredo: secret,
  });

  return parsearEnvParaVisualizacao(plaintext);
}

export async function desbloquearEnvVaultComRecoveryKeyParaVisualizacao({
  encryptedPayload,
  recoveryEnvelope,
  recoveryKey,
}: {
  encryptedPayload: EnvVaultEncryptedPayload;
  recoveryEnvelope: EnvVaultRecoveryEnvelope;
  recoveryKey: string;
}): Promise<EnvVaultVisualizacao> {
  const vaultSecret = await abrirEnvVaultRecoveryEnvelope({
    envelope: recoveryEnvelope,
    segredoRecuperacao: recoveryKey,
  });

  return desbloquearEnvVaultParaVisualizacao({
    encryptedPayload,
    secret: vaultSecret,
  });
}

export async function desbloquearEnvVaultComAccountEnvelopeParaVisualizacao({
  encryptedPayload,
  accountEnvelope,
  passphrase,
}: {
  encryptedPayload: EnvVaultEncryptedPayload;
  accountEnvelope: EnvVaultRecoveryEnvelope;
  passphrase: string;
}): Promise<EnvVaultVisualizacao> {
  const vaultSecret = await abrirEnvVaultRecoveryEnvelope({
    envelope: accountEnvelope,
    segredoRecuperacao: passphrase,
  });

  return desbloquearEnvVaultParaVisualizacao({
    encryptedPayload,
    secret: vaultSecret,
  });
}

export async function prepararRecoveryEnvelopeEnvVaultWeb({
  vaultSecret,
  recoveryKey,
  label = 'Recovery key web',
}: {
  vaultSecret: string;
  recoveryKey?: string;
  label?: string;
}) {
  const recoveryKeyGerada = recoveryKey ?? gerarRecoveryKeyEnvVault();
  const envelope = await criarEnvVaultRecoveryEnvelope({
    vaultSecret,
    segredoRecuperacao: recoveryKeyGerada,
    method: 'recovery_key',
    label,
    stepUpFactors: [],
  });

  return {
    recoveryKey: recoveryKeyGerada,
    envelope,
  };
}

export async function prepararAccountEnvVaultEnvelopeWeb({
  passphrase,
  label = 'Senha do Env Vault',
}: {
  passphrase: string;
  label?: string;
}): Promise<EnvVaultRecoveryEnvelope> {
  return criarEnvVaultRecoveryEnvelope({
    vaultSecret: gerarSegredoVaultEnvVault(),
    segredoRecuperacao: passphrase,
    method: 'passphrase',
    label,
    stepUpFactors: ['totp'],
  });
}

export function parsearEnvParaVisualizacao(plaintext: string): EnvVaultVisualizacao {
  const linhas = plaintext.split(/\r?\n/);
  const variaveis: EnvVaultVariavelVisualizacao[] = [];
  const linhasIgnoradas: EnvVaultLinhaIgnorada[] = [];

  linhas.forEach((linhaOriginal, indiceLinha) => {
    const numeroLinha = indiceLinha + 1;
    const conteudoNormalizado = linhaOriginal.trim();

    if (!conteudoNormalizado || conteudoNormalizado.startsWith('#')) return;

    const variavel = conteudoNormalizado.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!variavel) {
      linhasIgnoradas.push({ linha: numeroLinha, conteudo: linhaOriginal });
      return;
    }

    const [, nome, valorBruto] = variavel;
    variaveis.push({
      nome,
      valor: normalizarValorEnv(valorBruto),
      linha: numeroLinha,
    });
  });

  return {
    variaveis,
    linhasIgnoradas,
    totalLinhas: linhas.length,
    plaintext,
  };
}

export function mascararValorEnvVault(valor: string) {
  if (!valor) return '(vazio)';
  return '********';
}

function normalizarValorEnv(valorBruto: string) {
  const valorSemComentarioInline = removerComentarioInline(valorBruto.trim());
  const primeiroCaractere = valorSemComentarioInline.at(0);
  const ultimoCaractere = valorSemComentarioInline.at(-1);

  if (primeiroCaractere === '"' && ultimoCaractere === '"') {
    return valorSemComentarioInline.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  if (primeiroCaractere === "'" && ultimoCaractere === "'") {
    return valorSemComentarioInline.slice(1, -1);
  }

  return valorSemComentarioInline;
}

function removerComentarioInline(valorBruto: string) {
  let entreAspasSimples = false;
  let entreAspasDuplas = false;

  for (let indice = 0; indice < valorBruto.length; indice += 1) {
    const caractere = valorBruto[indice];
    const caractereAnterior = valorBruto[indice - 1];

    if (caractere === "'" && !entreAspasDuplas) {
      entreAspasSimples = !entreAspasSimples;
      continue;
    }

    if (caractere === '"' && !entreAspasSimples && caractereAnterior !== '\\') {
      entreAspasDuplas = !entreAspasDuplas;
      continue;
    }

    if (caractere === '#' && !entreAspasSimples && !entreAspasDuplas && caractereAnterior === ' ') {
      return valorBruto.slice(0, indice).trimEnd();
    }
  }

  return valorBruto;
}
