import { describe, expect, it } from 'vitest';
import {
  detectarSegredoProvavelEmTexto,
  detectarSegredoProvavelEmValor,
  redigirSegredosEmTexto,
} from '../src/security.js';

describe('segurança compartilhada', () => {
  it('ignora placeholders explícitos', () => {
    expect(detectarSegredoProvavelEmTexto('MYINST_API_KEY={{MYINST_API_KEY}}')).toBe(false);
    expect(detectarSegredoProvavelEmValor({ token: '{{TOKEN_ACESSO}}' })).toBe(false);
  });

  it('detecta padrões reais de segredo em texto e metadata', () => {
    expect(detectarSegredoProvavelEmTexto('Authorization: Bearer abcdefghijklmnop')).toBe(true);
    expect(detectarSegredoProvavelEmValor({
      config: {
        apiKey: 'myinst_12345678901234567890',
      },
    })).toBe(true);
  });

  it('redige valores estruturados usando placeholders por chave', () => {
    const redacao = redigirSegredosEmTexto(JSON.stringify({
      env: {
        MYINST_API_KEY: 'myinst_12345678901234567890',
        DATABASE_URL: '{{DATABASE_URL}}',
      },
    }));

    expect(redacao.possuiSegredos).toBe(true);
    expect(redacao.chavesRedigidas).toContain('MYINST_API_KEY');
    expect(redacao.texto).toContain('"MYINST_API_KEY": "{{MYINST_API_KEY}}"');
    expect(redacao.texto).toContain('"DATABASE_URL": "{{DATABASE_URL}}"');
  });
});
