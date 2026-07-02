import { describe, expect, it } from 'vitest';
import { montarComandoEnvVaultPull, montarComandoEnvVaultPush } from './envVaultCommands';

describe('envVaultCommands', () => {
  it('monta comando pull com workspace, projeto, nome e ambiente sem segredo', () => {
    const comando = montarComandoEnvVaultPull({
      workspaceSlug: 'meus-projetos',
      projectSlug: 'myinst',
      name: 'local',
      environment: 'production',
    });

    expect(comando).toBe('myinst env pull --workspace meus-projetos --project myinst --name local --environment production --output .env.local');
    expect(comando).not.toContain('MYINST_ENV_VAULT_SECRET');
  });

  it('monta comando push seguro para criação pela CLI', () => {
    const comando = montarComandoEnvVaultPush({
      workspaceSlug: 'meus-projetos',
      projectSlug: 'myinst',
      name: 'local',
      environment: 'local',
    });

    expect(comando).toBe('myinst env push --workspace meus-projetos --project myinst --file .env.local --name local --environment local');
    expect(comando).not.toContain('segredo');
  });

  it('escapa argumentos que não são slugs simples', () => {
    const comando = montarComandoEnvVaultPull({
      workspaceSlug: 'cliente acme',
      projectSlug: 'api-supernosso',
      name: 'prod.local',
    });

    expect(comando).toBe('myinst env pull --workspace "cliente acme" --project api-supernosso --name prod.local --output .env.local');
  });
});
