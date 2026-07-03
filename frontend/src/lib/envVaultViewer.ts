import { descriptografarEnvVault } from '@myinst/shared/env-vault';
import type { EnvVaultEncryptedPayload } from './api';

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
