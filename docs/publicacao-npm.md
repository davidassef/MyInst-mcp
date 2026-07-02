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

Release atual preparada: `@myinst/cli@0.1.0-beta.8`.

Essa release depende também de `@myinst/shared@0.1.0-beta.8` e `@myinst/mcp-server@0.1.0-beta.8`, pois o sync multi-client, a validação de segredos e o login browser compartilham código entre os pacotes.

Essa release publica:

- `myinst state capture` cria drafts locais em `.myinst/state/drafts/`.
- `myinst state push --reviewed` envia somente conteúdo revisado.
- `myinst state pull` materializa memórias, decisões e sessões em `.myinst/state/`.
- `myinst state search` busca Project State com `scope=state`.
- `myinst chat push/list/show/export/summarize` gerencia histórico de chats por arquivo explícito, sem varredura automática de transcripts.
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
pnpm release:check -- --skip-npm

cd packages/shared
pnpm publish --access public --tag latest

cd ../mcp-server
pnpm publish --access public --tag latest

cd ../cli
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

Se a release beta atual também deve ficar disponível pelo dist-tag `beta`, alinhe os três pacotes depois da publicação:

```bash
npm dist-tag add @myinst/shared@0.1.0-beta.8 beta
npm dist-tag add @myinst/mcp-server@0.1.0-beta.8 beta
npm dist-tag add @myinst/cli@0.1.0-beta.8 beta
npm dist-tag add @myinst/shared@0.1.0-beta.8 latest
npm dist-tag add @myinst/mcp-server@0.1.0-beta.8 latest
npm dist-tag add @myinst/cli@0.1.0-beta.8 latest
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
- Os manifests publicados não podem conter dependências `workspace:*`; rode `pnpm release:check -- --skip-npm` antes de publicar para validar pack e instalação local
- Para esta release, publique `@myinst/shared@0.1.0-beta.8` antes de `@myinst/mcp-server@0.1.0-beta.8` e `@myinst/cli@0.1.0-beta.8`
- A validação `npx @myinst/cli --version` usa o dist-tag padrão `latest`; use outro tag somente se também ajustar o comando de validação
- A release `0.1.0-beta.8` deve ficar publicada em `latest` e `beta`; revise `dist-tags` para evitar que qualquer tag continue apontando para uma versão anterior
- O campo `files` no package.json garante que apenas `dist/` é publicado
- O `prepublishOnly` script garante que o build roda antes de publicar
- A licença AGPL-3.0 é incluída automaticamente
