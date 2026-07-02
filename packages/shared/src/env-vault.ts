import { z } from 'zod';

const ALGORITMO = 'AES-GCM';
const KDF_ALGORITMO = 'pbkdf2-sha256';
const VERSAO_PAYLOAD = 'env-vault-v1';
const TAMANHO_SALT = 16;
const TAMANHO_IV = 12;
const TAMANHO_CHAVE = 32;
const TAMANHO_AUTH_TAG = 16;
const ITERACOES_PADRAO = 210_000;
const TAMANHO_MAXIMO_CIPHERTEXT = 5 * 1024 * 1024;
const PREFIXO_RECOVERY_KEY = 'myinst-env-rk_';
const BASE64_URL_REGEX = /^[A-Za-z0-9_-]+$/;

export interface EnvVaultKdfParams {
  algorithm: typeof KDF_ALGORITMO;
  iterations: typeof ITERACOES_PADRAO;
  keyLength: typeof TAMANHO_CHAVE;
  digest: 'sha256';
}

export interface EnvVaultEncryptedPayload {
  version: typeof VERSAO_PAYLOAD;
  algorithm: typeof ALGORITMO;
  kdf: EnvVaultKdfParams;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface EnvVaultMetadata {
  keyNames?: string[];
  byteLength: number;
}

export interface ExtrairMetadadosEnvSeguroOptions {
  incluirNomesChaves?: boolean;
}

export interface CriptografarEnvVaultParams {
  plaintext: string;
  segredo: string;
}

export interface DescriptografarEnvVaultParams {
  payload: EnvVaultEncryptedPayload;
  segredo: string;
}

export async function criptografarEnvVault(params: CriptografarEnvVaultParams): Promise<EnvVaultEncryptedPayload> {
  validarSegredo(params.segredo);

  const salt = randomBytes(TAMANHO_SALT);
  const iv = randomBytes(TAMANHO_IV);
  const kdf = criarKdfParams();
  const chave = await derivarChave(params.segredo, salt, kdf, ['encrypt']);
  const textoCodificado = new TextEncoder().encode(params.plaintext);
  const resultado = await crypto.subtle.encrypt({ name: ALGORITMO, iv: copiarArrayBuffer(iv) }, chave, copiarArrayBuffer(textoCodificado));
  const bytesCriptografados = new Uint8Array(resultado);
  const authTag = bytesCriptografados.slice(bytesCriptografados.length - 16);
  const ciphertext = bytesCriptografados.slice(0, bytesCriptografados.length - 16);

  return {
    version: VERSAO_PAYLOAD,
    algorithm: ALGORITMO,
    kdf,
    salt: codificarBase64Url(salt),
    iv: codificarBase64Url(iv),
    authTag: codificarBase64Url(authTag),
    ciphertext: codificarBase64Url(ciphertext),
  };
}

export async function descriptografarEnvVault(params: DescriptografarEnvVaultParams): Promise<string> {
  try {
    const payload = validarPayloadEnvVault(params.payload);
    validarSegredo(params.segredo);

    const salt = decodificarBase64Url(payload.salt);
    const iv = decodificarBase64Url(payload.iv);
    const authTag = decodificarBase64Url(payload.authTag);
    const ciphertext = decodificarBase64Url(payload.ciphertext);
    const chave = await derivarChave(params.segredo, salt, payload.kdf, ['decrypt']);
    const bytesComTag = concatenarBytes(ciphertext, authTag);
    const plaintext = await crypto.subtle.decrypt({ name: ALGORITMO, iv: copiarArrayBuffer(iv) }, chave, copiarArrayBuffer(bytesComTag));

    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Não foi possível descriptografar o Env Vault.');
  }
}

export function extrairMetadadosEnvSeguro(
  plaintext: string,
  options: ExtrairMetadadosEnvSeguroOptions = {},
): EnvVaultMetadata {
  const bytes = new TextEncoder().encode(plaintext);
  const metadata: EnvVaultMetadata = {
    byteLength: bytes.byteLength,
  };

  if (options.incluirNomesChaves) {
    metadata.keyNames = extrairNomesChavesEnv(plaintext);
  }

  return metadata;
}

export function calcularHashCiphertextEnvVault(payload: EnvVaultEncryptedPayload): string {
  const payloadValidado = validarPayloadEnvVault(payload);
  const materialOperacional = [
    payloadValidado.version,
    payloadValidado.algorithm,
    payloadValidado.salt,
    payloadValidado.iv,
    payloadValidado.authTag,
    payloadValidado.ciphertext,
  ].join('.');

  return sha256Sincrono(materialOperacional);
}

export function gerarRecoveryKeyEnvVault(): string {
  return `${PREFIXO_RECOVERY_KEY}${codificarBase64Url(randomBytes(32))}`;
}

function criarKdfParams(): EnvVaultKdfParams {
  return {
    algorithm: KDF_ALGORITMO,
    iterations: ITERACOES_PADRAO,
    keyLength: TAMANHO_CHAVE,
    digest: 'sha256',
  };
}

async function derivarChave(
  segredo: string,
  salt: Uint8Array,
  kdf: EnvVaultKdfParams,
  usos: KeyUsage[],
): Promise<CryptoKey> {
  if (kdf.algorithm !== KDF_ALGORITMO || kdf.digest !== 'sha256') {
    throw new Error('KDF do Env Vault não suportado.');
  }

  const materialChave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: copiarArrayBuffer(salt),
      iterations: kdf.iterations,
      hash: 'SHA-256',
    },
    materialChave,
    { name: ALGORITMO, length: kdf.keyLength * 8 },
    false,
    usos,
  );
}

function validarSegredo(segredo: string): void {
  if (segredo.trim().length < 16) {
    throw new Error('Segredo do Env Vault precisa ter pelo menos 16 caracteres.');
  }
}

export function validarPayloadEnvVault(payload: unknown): EnvVaultEncryptedPayload {
  const resultado = envVaultEncryptedPayloadSchema.safeParse(payload);
  if (!resultado.success) {
    throw new Error('Payload de Env Vault inválido.');
  }

  return resultado.data;
}

function extrairNomesChavesEnv(plaintext: string): string[] {
  const nomes = new Set<string>();

  for (const linha of plaintext.split(/\r?\n/)) {
    const match = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) continue;

    nomes.add(match[1]);
  }

  return [...nomes];
}

function randomBytes(tamanho: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(tamanho));
}

function concatenarBytes(primeiro: Uint8Array, segundo: Uint8Array): Uint8Array {
  const concatenado = new Uint8Array(primeiro.length + segundo.length);
  concatenado.set(primeiro);
  concatenado.set(segundo, primeiro.length);

  return concatenado;
}

function copiarArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);

  return copia.buffer;
}

function codificarBase64Url(bytes: Uint8Array): string {
  return codificarBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodificarBase64Url(valor: string): Uint8Array {
  const normalizado = valor
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalizado.length % 4)) % 4);

  return decodificarBase64(`${normalizado}${padding}`);
}

function possuiTamanhoBase64Url(valor: string, tamanhoEsperado: number): boolean {
  try {
    return decodificarBase64Url(valor).byteLength === tamanhoEsperado;
  } catch {
    return false;
  }
}

function possuiCiphertextValido(valor: string): boolean {
  try {
    const tamanho = decodificarBase64Url(valor).byteLength;
    return tamanho > 0 && tamanho <= TAMANHO_MAXIMO_CIPHERTEXT;
  } catch {
    return false;
  }
}

function codificarBase64(bytes: Uint8Array): string {
  const binario = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

  if (typeof btoa === 'function') {
    return btoa(binario);
  }

  return Buffer.from(binario, 'binary').toString('base64');
}

function decodificarBase64(valor: string): Uint8Array {
  const binario = typeof atob === 'function'
    ? atob(valor)
    : Buffer.from(valor, 'base64').toString('binary');

  return Uint8Array.from(binario, (char) => char.charCodeAt(0));
}

function sha256Sincrono(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  const palavras = prepararPalavrasSha256(bytes);
  const hash = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  for (let bloco = 0; bloco < palavras.length; bloco += 16) {
    const agenda = palavras.slice(bloco, bloco + 16);

    for (let indice = 16; indice < 64; indice++) {
      const s0 = rotacionarDireita(agenda[indice - 15], 7)
        ^ rotacionarDireita(agenda[indice - 15], 18)
        ^ (agenda[indice - 15] >>> 3);
      const s1 = rotacionarDireita(agenda[indice - 2], 17)
        ^ rotacionarDireita(agenda[indice - 2], 19)
        ^ (agenda[indice - 2] >>> 10);
      agenda[indice] = somarUint32(agenda[indice - 16], s0, agenda[indice - 7], s1);
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let indice = 0; indice < 64; indice++) {
      const s1 = rotacionarDireita(e, 6) ^ rotacionarDireita(e, 11) ^ rotacionarDireita(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = somarUint32(h, s1, ch, SHA256_CONSTANTES[indice], agenda[indice]);
      const s0 = rotacionarDireita(a, 2) ^ rotacionarDireita(a, 13) ^ rotacionarDireita(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = somarUint32(s0, maj);

      h = g;
      g = f;
      f = e;
      e = somarUint32(d, temp1);
      d = c;
      c = b;
      b = a;
      a = somarUint32(temp1, temp2);
    }

    hash[0] = somarUint32(hash[0], a);
    hash[1] = somarUint32(hash[1], b);
    hash[2] = somarUint32(hash[2], c);
    hash[3] = somarUint32(hash[3], d);
    hash[4] = somarUint32(hash[4], e);
    hash[5] = somarUint32(hash[5], f);
    hash[6] = somarUint32(hash[6], g);
    hash[7] = somarUint32(hash[7], h);
  }

  return hash.map((valor) => valor.toString(16).padStart(8, '0')).join('');
}

function prepararPalavrasSha256(bytes: Uint8Array): number[] {
  const tamanhoComUm = bytes.length + 1;
  const tamanhoComComprimento = tamanhoComUm + 8;
  const tamanhoFinal = Math.ceil(tamanhoComComprimento / 64) * 64;
  const mensagem = new Uint8Array(tamanhoFinal);

  mensagem.set(bytes);
  mensagem[bytes.length] = 0x80;

  const tamanhoBits = bytes.length * 8;
  const view = new DataView(mensagem.buffer);
  view.setUint32(tamanhoFinal - 4, tamanhoBits, false);

  const palavras: number[] = [];

  for (let indice = 0; indice < mensagem.length; indice += 4) {
    palavras.push(view.getUint32(indice, false));
  }

  return palavras;
}

function rotacionarDireita(valor: number, deslocamento: number): number {
  return (valor >>> deslocamento) | (valor << (32 - deslocamento));
}

function somarUint32(...valores: number[]): number {
  return valores.reduce((soma, valor) => (soma + valor) >>> 0, 0);
}

const SHA256_CONSTANTES = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export const envVaultEncryptedPayloadSchema = z.object({
  version: z.literal(VERSAO_PAYLOAD),
  algorithm: z.literal(ALGORITMO),
  kdf: z.object({
    algorithm: z.literal(KDF_ALGORITMO),
    iterations: z.literal(ITERACOES_PADRAO),
    keyLength: z.literal(TAMANHO_CHAVE),
    digest: z.literal('sha256'),
  }),
  salt: z.string().regex(BASE64_URL_REGEX).refine((valor) => possuiTamanhoBase64Url(valor, TAMANHO_SALT)),
  iv: z.string().regex(BASE64_URL_REGEX).refine((valor) => possuiTamanhoBase64Url(valor, TAMANHO_IV)),
  authTag: z.string().regex(BASE64_URL_REGEX).refine((valor) => possuiTamanhoBase64Url(valor, TAMANHO_AUTH_TAG)),
  ciphertext: z.string().regex(BASE64_URL_REGEX).refine(possuiCiphertextValido),
});
