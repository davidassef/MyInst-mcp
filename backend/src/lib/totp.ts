import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const INTERVALO_SEGUNDOS = 30;
const DIGITOS = 6;
const JANELA_PADRAO = 1;

export function gerarSegredoTotp(): string {
  return codificarBase32(randomBytes(20));
}

export function gerarCodigoTotp(secret: string, dataReferencia = new Date()): string {
  const contador = Math.floor(dataReferencia.getTime() / 1000 / INTERVALO_SEGUNDOS);
  return gerarCodigoPorContador(secret, contador);
}

export function verificarCodigoTotp({
  secret,
  code,
  dataReferencia = new Date(),
  janela = JANELA_PADRAO,
}: {
  secret: string;
  code: string;
  dataReferencia?: Date;
  janela?: number;
}): boolean {
  if (!/^[0-9]{6}$/.test(code)) return false;

  const contadorAtual = Math.floor(dataReferencia.getTime() / 1000 / INTERVALO_SEGUNDOS);

  for (let deslocamento = -janela; deslocamento <= janela; deslocamento += 1) {
    const codigoEsperado = gerarCodigoPorContador(secret, contadorAtual + deslocamento);
    if (compararCodigoSeguro(codigoEsperado, code)) return true;
  }

  return false;
}

export function criarTotpUri({
  issuer,
  accountName,
  secret,
}: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const label = `${issuer}:${accountName}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(INTERVALO_SEGUNDOS),
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

function gerarCodigoPorContador(secret: string, contador: number): string {
  const chave = decodificarBase32(secret);
  const contadorBuffer = Buffer.alloc(8);
  contadorBuffer.writeBigUInt64BE(BigInt(contador));

  const hmac = createHmac('sha1', chave).update(contadorBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codigoBinario = (
    ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff)
  );
  const codigo = codigoBinario % 10 ** DIGITOS;

  return codigo.toString().padStart(DIGITOS, '0');
}

function codificarBase32(bytes: Buffer): string {
  let bits = '';
  let resultado = '';

  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }

  for (let indice = 0; indice < bits.length; indice += 5) {
    const bloco = bits.slice(indice, indice + 5).padEnd(5, '0');
    resultado += BASE32_ALFABETO[Number.parseInt(bloco, 2)];
  }

  return resultado;
}

function decodificarBase32(secret: string): Buffer {
  const normalizado = secret.toUpperCase().replace(/=+$/g, '');
  let bits = '';

  for (const caractere of normalizado) {
    const valor = BASE32_ALFABETO.indexOf(caractere);
    if (valor === -1) {
      throw new Error('Segredo TOTP inválido.');
    }

    bits += valor.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let indice = 0; indice + 8 <= bits.length; indice += 8) {
    bytes.push(Number.parseInt(bits.slice(indice, indice + 8), 2));
  }

  return Buffer.from(bytes);
}

function compararCodigoSeguro(codigoEsperado: string, code: string): boolean {
  const esperado = Buffer.from(codigoEsperado);
  const recebido = Buffer.from(code);
  if (esperado.length !== recebido.length) return false;

  return timingSafeEqual(esperado, recebido);
}
