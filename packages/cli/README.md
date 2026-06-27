# @myinst/cli

CLI oficial do MyInst para login, listagem, pull, push e Project State do vault.

## Instalacao

```bash
npm install -g @myinst/cli
```

## Uso

```bash
myinst --help
myinst login
myinst list
myinst pull
myinst push
myinst state capture memory "Contexto do deploy" --body "Deploy ocorre por push e pull na VPS."
myinst state push .myinst/state/drafts/memory-contexto-do-deploy.json --reviewed
myinst state pull
myinst state search "deploy"
```

## Project State

`myinst state capture` cria um draft local em `.myinst/state/drafts/` e não envia nada ao servidor. Revise o JSON, confirme que não há segredos e envie com `myinst state push`.

Comandos disponíveis:

- `myinst state capture <memory|decision|session> <titulo>` cria draft revisável.
- `myinst state push <draft> --reviewed` salva o estado revisado no vault.
- `myinst state pull [projeto]` materializa memórias, decisões e sessões em `.myinst/state/`.
- `myinst state search <query>` busca Project State com `scope=state`.

O push exige `metadata.reviewed=true` e bloqueia padrões prováveis de segredos como tokens, senhas, `.env` e connection strings.

## Requisitos

- Node.js 22+
- acesso a um servidor MyInst

## Repositorio

- Projeto: <https://github.com/davidassef/MyInst>
- Issues: <https://github.com/davidassef/MyInst/issues>
