import { describe, expect, it } from 'vitest';
import { resumirChatSessionSchema } from '../src/schemas/index.js';

describe('schemas', () => {
  it('aceita body ausente para resumo automatico de chat', () => {
    expect(resumirChatSessionSchema.parse(undefined)).toEqual({});
  });
});
