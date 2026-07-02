# @myinst/cli

CLI oficial do MyInst para login, listagem, status, pull, push, Project State e histórico de chats do vault.

Versão atual: `0.1.0-beta.8`.

## Instalacao

```bash
npm install -g @myinst/cli
```

## Uso

```bash
myinst --help
myinst login
myinst login --server https://api-myinst.lotoscore.com.br
myinst login --server http://localhost:3000 --api-key myinst_xxx
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
myinst chat push --project default --client codex --session sessao-1 --file chat.json
myinst chat list --project default --client codex --tag release
myinst chat show sessao-1 --project default
myinst chat export sessao-1 --project default --format markdown
myinst chat summarize sessao-1 --project default
```

## Sync tipo repositorio remoto

`myinst status [projeto]` compara arquivos locais, vault remoto e `.myinst/sync-state.json`, mostrando pendências de pull, push e conflitos.

Por padrão, a CLI lê estruturas de clientes detectadas no projeto atual. Quando mais de um client for detectado, informe `--client` explicitamente para evitar aplicar conteúdo no layout errado. Isso inclui, por exemplo, `.claude`, `.codex`, `.cursor`, `.kimi-code`, `GEMINI.md`, `.qwen`, `.aider` e `.antigravity` quando existirem no repositório. Configurações globais da home do usuário só entram quando você usa `--scope global` ou `--scope all`.

Opções de sync:

- `--workspace <slug>` seleciona o workspace remoto.
- `--client <id...>` limita a operação a clientes específicos, como `codex`, `claude` ou `kimi`.
- `--scope <project|global|all>` seleciona o escopo. O padrão é `project`.

O manifesto é atualizado automaticamente após `myinst pull` e após `myinst push` bem-sucedido. Se houver conflito, `myinst push` é bloqueado até revisão manual.

O sync bloqueia envio de segredos prováveis. Em `mcp_config` e settings, substitua valores reais por placeholders como `{{MYINST_API_KEY}}` e `{{DATABASE_URL}}`.

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

## Histórico de chats

`myinst chat` importa histórico apenas por arquivo explícito. A CLI não varre transcripts locais automaticamente.

Comandos disponíveis:

- `myinst chat push --project <slug> --client <client> --session <id> --file <json|md>` importa uma sessão.
- `myinst chat list --project <slug> [--client <client>] [--q <texto>] [--tag <tag>] [--from <iso>] [--to <iso>]` lista sessões importadas.
- `myinst chat show <session-id>` mostra mensagens.
- `myinst chat export <session-id> --format markdown` grava `.myinst/chats/<session-id>.md`.
- `myinst chat summarize <session-id>` atualiza o resumo no servidor.

Arquivos JSON devem conter `messages`; Markdown entra como uma mensagem única revisada. O backend bloqueia padrões prováveis de segredo antes de persistir.

## Requisitos

- Node.js 22+
- acesso a um servidor MyInst

## Repositorio

- Projeto: <https://github.com/davidassef/MyInst-mcp>
- Issues: <https://github.com/davidassef/MyInst-mcp/issues>
