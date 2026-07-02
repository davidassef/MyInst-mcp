# Publicação no npm

## Pré-requisitos

- Conta no npm (npmjs.com)
- Organização `@myinst` criada no npm
- Login via `npm login`

## Publicar @myinst/shared

O pacote shared é dependência do mcp-server, então precisa ser publicado primeiro.

```bash
cd packages/shared
pnpm publish --access public --tag latest
```

## Publicar @myinst/mcp-server

```bash
cd packages/mcp-server
pnpm publish --access public --tag latest
```

## Publicar @myinst/cli

Release atual preparada: `@myinst/cli@0.1.0-beta.11`.

Essa release mantém `@myinst/shared@0.1.0-beta.9` como dependência publicada e não exige republicar `@myinst/mcp-server`, pois a mudança é específica do CLI.

Essa release publica:

- `myinst state capture` cria drafts locais em `.myinst/state/drafts/`.
- `myinst state push --reviewed` envia somente conteúdo revisado.
- `myinst state pull` materializa memórias, decisões e sessões em `.myinst/state/`.
- `myinst state search` busca Project State com `scope=state`.
- `myinst chat push/import/list/show/export/summarize` gerencia histórico de chats por fonte explícita, sem varredura automática de transcripts. O import dedicado começa por `codex/history`; cache ainda fica bloqueado.
- `myinst chat import --client codex --include history` reconhece o formato `payload` do Codex desktop e redige mensagens sensíveis inteiras quando necessário.
- `myinst` avisa em `stderr` quando existir uma versão `latest` mais nova no npm e permite opt-out com `MYINST_DISABLE_UPDATE_CHECK=1`.
- `myinst login` abre o fluxo browser por padrão e mantém `--api-key` para login manual.
- `myinst pull/push/status` exigem `--client` quando múltiplos clients são detectados.
- Sync bloqueia segredos prováveis e usa placeholders em configs sensíveis.

Antes de publicar esta release:

```bash
pnpm --filter @myinst/cli lint
pnpm --filter @myinst/cli test
pnpm --filter @myinst/cli build
pnpm --filter @myinst/cli pack --pack-destination .tmp/npm-pack
```

Publicação:

```bash
cd packages/cli
pnpm publish --access public --tag latest
```

## Verificar publicação

```bash
npm view @myinst/shared version dist-tags
npm view @myinst/mcp-server version dist-tags
npm view @myinst/cli version dist-tags
npx @myinst/mcp-server --version
npx @myinst/cli --help
npx @myinst/cli --version
npx @myinst/cli state --help
npx @myinst/cli chat --help
```

Se a release beta atual também deve ficar disponível pelo dist-tag `beta`, alinhe o pacote alterado depois da publicação:

```bash
npm dist-tag add @myinst/cli@0.1.0-beta.11 beta
npm dist-tag add @myinst/cli@0.1.0-beta.11 latest
```

## Atualizar versão

Use `pnpm version` para bumpar versões:

```bash
cd packages/mcp-server
pnpm version patch  # 0.1.0 -> 0.1.1
pnpm version minor  # 0.1.0 -> 0.2.0
pnpm version major  # 0.1.0 -> 1.0.0
```

```bash
cd packages/cli
pnpm version patch
```

## Notas

- Nunca use `npm publish` direto neste monorepo; use `pnpm publish` para que dependências `workspace:*` sejam reescritas no tarball publicado
- Os manifests publicados não podem conter dependências `workspace:*`; rode `pnpm --filter @myinst/cli pack --pack-destination .tmp/npm-pack` antes de publicar quando a release for apenas do CLI
- Para esta release, publique apenas `@myinst/cli@0.1.0-beta.11`
- A validação `npx @myinst/cli --version` usa o dist-tag padrão `latest`; use outro tag somente se também ajustar o comando de validação
- A release `0.1.0-beta.11` deve ficar publicada em `latest` e `beta`; revise `dist-tags` para evitar que qualquer tag continue apontando para uma versão anterior
- O campo `files` no package.json garante que apenas `dist/` é publicado
- O `prepublishOnly` script garante que o build roda antes de publicar
- A licença AGPL-3.0 é incluída automaticamente
