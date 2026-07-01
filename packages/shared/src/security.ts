export interface RedacaoSegredos {
  texto: string;
  possuiSegredos: boolean;
  chavesRedigidas: string[];
}

const PLACEHOLDER_REGEX = /\{\{[^}]+\}\}/g;
const PLACEHOLDER_COMPLETO_REGEX = /^\{\{[^}]+\}\}$/;

const PADROES_SEGREDO = [
  /\bmyinst_[A-Za-z0-9_-]{16,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{10,}\b/i,
  /\bsk-[A-Za-z0-9_-]{8,}\b/,
  /\bghp_[A-Za-z0-9_]{8,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/,
  /\bDATABASE_URL\s*[:=]\s*["']?[^"'\s]+/i,
  /\bpassword\s*=\s*[^"'\s]+/i,
  /(^|[\\/])\.env(\.|$|[\\/])/i,
];

const TERMOS_CHAVE_SENSIVEL = [
  'token',
  'secret',
  'password',
  'senha',
  'api_key',
  'apikey',
  'auth',
  'credential',
  'oauth',
];

export function detectarSegredoProvavelEmTexto(texto: string): boolean {
  const textoSemPlaceholders = removerPlaceholders(texto);

  if (PADROES_SEGREDO.some((padrao) => padrao.test(textoSemPlaceholders))) {
    return true;
  }

  return textoSemPlaceholders
    .split(/\r?\n/)
    .some((linha) => {
      const chaveValor = extrairChaveValor(linha);
      if (!chaveValor) return false;
      if (!ehChaveSensivel(chaveValor.chave)) return false;
      return valorPareceSegredoReal(chaveValor.valor);
    });
}

export function detectarSegredoProvavelEmValor(valor: unknown): boolean {
  if (typeof valor === 'string') {
    return detectarSegredoProvavelEmTexto(valor);
  }

  if (Array.isArray(valor)) {
    return valor.some((entrada) => detectarSegredoProvavelEmValor(entrada));
  }

  if (!valor || typeof valor !== 'object') {
    return false;
  }

  return Object.entries(valor as Record<string, unknown>).some(([chave, entrada]) => {
    if (ehChaveSensivel(chave) && typeof entrada === 'string') {
      return valorPareceSegredoReal(entrada);
    }

    return detectarSegredoProvavelEmValor(entrada);
  });
}

export function redigirSegredosEmTexto(texto: string): RedacaoSegredos {
  try {
    const valor = JSON.parse(texto) as unknown;
    const chavesRedigidas = new Set<string>();
    const valorRedigido = redigirValorEstruturado(valor, chavesRedigidas);

    return {
      texto: `${JSON.stringify(valorRedigido, null, 2)}\n`,
      possuiSegredos: chavesRedigidas.size > 0,
      chavesRedigidas: [...chavesRedigidas],
    };
  } catch {
    return redigirTextoChaveValor(texto);
  }
}

function redigirValorEstruturado(valor: unknown, chavesRedigidas: Set<string>): unknown {
  if (typeof valor === 'string') {
    return redigirStringEstruturada(valor, chavesRedigidas);
  }

  if (Array.isArray(valor)) {
    return valor.map((entrada) => redigirValorEstruturado(entrada, chavesRedigidas));
  }

  if (!valor || typeof valor !== 'object') {
    return valor;
  }

  const objeto = valor as Record<string, unknown>;
  const redigido: Record<string, unknown> = {};

  for (const [chave, entrada] of Object.entries(objeto)) {
    if (ehChaveSensivel(chave) && typeof entrada === 'string' && valorPareceSegredoReal(entrada)) {
      chavesRedigidas.add(chave);
      redigido[chave] = placeholderParaChave(chave);
      continue;
    }

    redigido[chave] = redigirValorEstruturado(entrada, chavesRedigidas);
  }

  return redigido;
}

function redigirStringEstruturada(valor: string, chavesRedigidas: Set<string>): string {
  const redacaoChaveValor = redigirTextoChaveValor(valor);
  if (redacaoChaveValor.possuiSegredos) {
    for (const chave of redacaoChaveValor.chavesRedigidas) {
      chavesRedigidas.add(chave);
    }

    return redacaoChaveValor.texto;
  }

  const valorSemPlaceholders = removerPlaceholders(valor);
  if (!PADROES_SEGREDO.some((padrao) => padrao.test(valorSemPlaceholders))) {
    return valor;
  }

  chavesRedigidas.add('secret');
  return '{{SECRET}}';
}

function redigirTextoChaveValor(texto: string): RedacaoSegredos {
  const chavesRedigidas = new Set<string>();
  const linhas = texto.split('\n').map((linha) => {
    const chaveValor = extrairChaveValor(linha);
    if (!chaveValor || !ehChaveSensivel(chaveValor.chave) || !valorPareceSegredoReal(chaveValor.valor)) {
      return linha;
    }

    chavesRedigidas.add(chaveValor.chave);
    return `${chaveValor.prefixo}${placeholderParaChave(chaveValor.chave)}`;
  });

  return {
    texto: linhas.join('\n'),
    possuiSegredos: chavesRedigidas.size > 0,
    chavesRedigidas: [...chavesRedigidas],
  };
}

function extrairChaveValor(linha: string) {
  const match = linha.match(/^(\s*["']?[\w.-]+["']?\s*[:=]\s*)(.+)$/);
  if (!match) return null;

  return {
    prefixo: match[1],
    chave: match[1]
      .replace(/[:=]\s*$/, '')
      .trim()
      .replace(/^["']|["']$/g, ''),
    valor: match[2].trim().replace(/^["']|["']$/g, ''),
  };
}

function removerPlaceholders(texto: string) {
  return texto.replace(PLACEHOLDER_REGEX, '');
}

function valorPareceSegredoReal(valor: string): boolean {
  const valorLimpo = valor.trim().replace(/^["']|["']$/g, '').replace(/[,;]$/, '');

  if (!valorLimpo || PLACEHOLDER_COMPLETO_REGEX.test(valorLimpo)) {
    return false;
  }

  if (/^(true|false|null|undefined)$/i.test(valorLimpo)) {
    return false;
  }

  if (/^https?:\/\//i.test(valorLimpo)) {
    return false;
  }

  if (/^(placeholder|example|exemplo|sua_key_aqui)$/i.test(valorLimpo)) {
    return false;
  }

  return valorLimpo.length >= 6 || PADROES_SEGREDO.some((padrao) => padrao.test(valorLimpo));
}

function ehChaveSensivel(chave: string) {
  const normalizada = chave
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return TERMOS_CHAVE_SENSIVEL.some((termo) => normalizada.includes(termo.replace(/[^a-z0-9]/g, '')));
}

function placeholderParaChave(chave: string) {
  return `{{${chave.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}}}`;
}
