interface EnvVaultCommandParams {
  workspaceSlug: string;
  projectSlug: string;
  name: string;
  environment?: string | null;
}

export function montarComandoEnvVaultPull(params: EnvVaultCommandParams): string {
  const partes = [
    'myinst',
    'env',
    'pull',
    '--workspace',
    escaparArgumentoShell(params.workspaceSlug),
    '--project',
    escaparArgumentoShell(params.projectSlug),
    '--name',
    escaparArgumentoShell(params.name),
  ];

  if (params.environment) {
    partes.push('--environment', escaparArgumentoShell(params.environment));
  }

  partes.push('--output', '.env.local');

  return partes.join(' ');
}

export function montarComandoEnvVaultPush(params: EnvVaultCommandParams): string {
  const partes = [
    'myinst',
    'env',
    'push',
    '--workspace',
    escaparArgumentoShell(params.workspaceSlug),
    '--project',
    escaparArgumentoShell(params.projectSlug),
    '--file',
    '.env.local',
    '--name',
    escaparArgumentoShell(params.name || 'local'),
  ];

  if (params.environment) {
    partes.push('--environment', escaparArgumentoShell(params.environment));
  }

  return partes.join(' ');
}

function escaparArgumentoShell(valor: string): string {
  if (/^[a-zA-Z0-9._-]+$/.test(valor)) {
    return valor;
  }

  return `"${valor.replace(/(["\\$`])/g, '\\$1')}"`;
}
