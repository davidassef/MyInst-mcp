import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const VERSAO = 1;
const TAMANHO_IV = 12;

export interface SegredoServidorCifrado {
  version: typeof VERSAO;
  algorithm: typeof ALGORITMO;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function criptografarSegredoServidor({
  plaintext,
  secretServidor,
}: {
  plaintext: string;
  secretServidor: string;
}): SegredoServidorCifrado {
  const iv = randomBytes(TAMANHO_IV);
  const chave = derivarChave(secretServidor);
  const cipher = createCipheriv(ALGORITMO, chave, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: VERSAO,
    algorithm: ALGORITMO,
    iv: iv.toString('base64url'),
    authTag: authTag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

export function descriptografarSegredoServidor({
  envelope,
  secretServidor,
}: {
  envelope: unknown;
  secretServidor: string;
}): string {
  const envelopeValidado = validarEnvelopeServidor(envelope);
  const decipher = createDecipheriv(
    ALGORITMO,
    derivarChave(secretServidor),
    Buffer.from(envelopeValidado.iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(envelopeValidado.authTag, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelopeValidado.ciphertext, 'base64url')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

function validarEnvelopeServidor(envelope: unknown): SegredoServidorCifrado {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('Envelope cifrado inválido.');
  }

  const envelopeParcial = envelope as Partial<SegredoServidorCifrado>;
  if (
    envelopeParcial.version !== VERSAO
    || envelopeParcial.algorithm !== ALGORITMO
    || typeof envelopeParcial.iv !== 'string'
    || typeof envelopeParcial.authTag !== 'string'
    || typeof envelopeParcial.ciphertext !== 'string'
  ) {
    throw new Error('Envelope cifrado inválido.');
  }

  return envelopeParcial as SegredoServidorCifrado;
}

function derivarChave(secretServidor: string): Buffer {
  return createHash('sha256').update(secretServidor).digest();
}
