# Publicação no npm

## Pré-requisitos

- Conta no npm (npmjs.com)
- Organização `@myinst` criada no npm
- Login via `npm login`

## Publicar @myinst/shared

O pacote shared é dependência do mcp-server, então precisa ser publicado primeiro.

```bash
cd packages/shared
pnpm build
npm publish --access public
```

## Publicar @myinst/mcp-server

```bash
cd packages/mcp-server
pnpm build
npm publish --access public
```

## Publicar @myinst/cli

Release atual preparada: `@myinst/cli@0.1.0-beta.2`.

Essa release publica o suporte de Project State da CLI:

- `myinst state capture` cria drafts locais em `.myinst/state/drafts/`.
- `myinst state push --reviewed` envia somente conteúdo revisado.
- `myinst state pull` materializa memórias, decisões e sessões em `.myinst/state/`.
- `myinst state search` busca Project State com `scope=state`.

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
pnpm build
npm publish --access public
```

## Verificar publicação

```bash
npm info @myinst/mcp-server
npx @myinst/mcp-server --version
npm info @myinst/cli
npx @myinst/cli --help
npx @myinst/cli --version
npx @myinst/cli state --help
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

- O `workspace:*` no `@myinst/shared` é automaticamente resolvido pelo pnpm para a versão real ao publicar
- Para a release `@myinst/cli@0.1.0-beta.2`, `@myinst/shared@0.1.0-beta.1` já está publicado e não precisa de novo publish se não houver alteração nele
- O campo `files` no package.json garante que apenas `dist/` é publicado
- O `prepublishOnly` script garante que o build roda antes de publicar
- A licença AGPL-3.0 é incluída automaticamente
