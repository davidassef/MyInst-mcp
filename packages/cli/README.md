# @myinst/cli

CLI oficial do MyInst para login, listagem, status, pull, push e Project State do vault.

## Instalacao

```bash
npm install -g @myinst/cli
```

## Uso

```bash
myinst --help
myinst login
myinst status
myinst pull
myinst push
myinst st
myinst ls
myinst status --client codex kimi
myinst push default --scope all --client codex
myinst state capture memory "Contexto do deploy" --body "Deploy ocorre por push e pull na VPS."
myinst state push .myinst/state/drafts/memory-contexto-do-deploy.json --reviewed
myinst state pull
myinst state search "deploy"
```

## Sync tipo repositorio remoto

`myinst status [projeto]` compara arquivos locais, vault remoto e `.myinst/sync-state.json`, mostrando pendências de pull, push e conflitos.

Por padrão, a CLI lê todas as estruturas de clientes detectadas no projeto atual. Isso inclui, por exemplo, `.claude`, `.codex`, `.cursor`, `.kimi-code`, `GEMINI.md`, `.qwen`, `.aider` e `.antigravity` quando existirem no repositório. Configurações globais da home do usuário só entram quando você usa `--scope global` ou `--scope all`.

Opções de sync:

- `--workspace <slug>` seleciona o workspace remoto.
- `--client <id...>` limita a operação a clientes específicos, como `codex`, `claude` ou `kimi`.
- `--scope <project|global|all>` seleciona o escopo. O padrão é `project`.

O manifesto é atualizado automaticamente após `myinst pull` e após `myinst push` bem-sucedido. Se houver conflito, `myinst push` é bloqueado até revisão manual.

Fluxo recomendado:

```bash
myinst pull
myinst status
# editar arquivos locais
myinst status
myinst push
```

Atalhos equivalentes:

```bash
myinst st   # myinst status
myinst ls   # myinst list
```

No monorepo, sem instalar o pacote global, use o script da raiz:

```bash
pnpm myinst status
pnpm myinst st
```

Estados exibidos:

- `Pendente de pull`: o vault remoto mudou ou possui item ausente no disco.
- `Pendente de push`: o disco local mudou ou possui item ausente no vault.
- `Conflitos`: local e remoto mudaram desde o último manifesto.
- `Sincronizado`: local, remoto e manifesto estão equivalentes.

O v1 não faz merge automático nem deleção automática.

Exemplo:

```text
Workspace: default
Projeto: default

Pendente de pull:
  claude     skill        deploy-local      remoto mais novo

Pendente de push:
  codex      instruction  agents            existe só local

Conflitos:
  kimi       skill        deploy            local e remoto mudaram
```

Cada linha usa a identidade estável `{ clientId, scope, workspace, project, type, slug }`. Assim, `codex/instruction/agents` e `claude/instruction/agents` são tratados como itens diferentes, mesmo tendo o mesmo `type` e `slug`.

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
