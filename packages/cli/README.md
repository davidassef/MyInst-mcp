# @myinst/cli

CLI oficial do MyInst para login, listagem, status, pull, push, Project State e histórico de chats do vault.

Versão atual: `0.1.0-beta.11`.

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
myinst status myinst --workspace meus-projetos --client codex kimi
myinst push myinst --workspace meus-projetos --scope all --client codex
myinst state capture memory "Contexto do deploy" --body "Deploy ocorre por push e pull na VPS."
myinst state push .myinst/state/drafts/memory-contexto-do-deploy.json --reviewed
myinst state pull myinst --workspace meus-projetos
myinst state search "deploy" --workspace meus-projetos --project myinst
myinst chat push --workspace meus-projetos --project myinst --client codex --session sessao-1 --file chat.json
myinst chat import --workspace meus-projetos --project myinst --client codex --include history --path ~/.codex/sessions --dry-run
myinst chat import --workspace meus-projetos --project myinst --client codex --include history --path ~/.codex/sessions --reviewed
myinst chat list --workspace meus-projetos --project myinst --client codex --tag release
myinst chat show sessao-1 --workspace meus-projetos --project myinst
myinst chat export sessao-1 --workspace meus-projetos --project myinst --format markdown
myinst chat summarize sessao-1 --workspace meus-projetos --project myinst
```

## Aviso de atualização

A CLI consulta o npm no início de cada execução e avisa em `stderr` quando existir uma versão `latest` mais nova de `@myinst/cli`.

O aviso não bloqueia o comando, falhas de rede são ignoradas e a checagem pode ser desativada em automações:

```bash
MYINST_DISABLE_UPDATE_CHECK=1 myinst status myinst --workspace meus-projetos
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

No `pull` nativo, configurações de client são protegidas por padrão. Se o arquivo local já existir, o MyInst preserva o conteúdo da máquina e ignora o item remoto correspondente; se o arquivo não existir, ele pode criar a versão redigida do vault. Isso evita sobrescrever API keys, caminhos locais, providers, modelos e ajustes específicos do notebook.

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

`myinst chat` importa histórico apenas por fonte explícita. A CLI não varre transcripts locais, caches ou diretórios internos de clientes automaticamente.

Chats não entram no `myinst pull/push` de arquivos nativos. Eles usam um fluxo próprio por `{ workspace, project, client, session }`, permitindo filtrar e exportar conversas por cliente de origem.

Comandos disponíveis:

- `myinst chat push --project <slug> --client <client> --session <id> --file <json|md>` importa uma sessão.
- `myinst chat import --project <slug> --client codex --include history --path <arquivo|diretorio> --reviewed` importa histórico Codex JSONL com adapter dedicado.
- `myinst chat list --project <slug> [--client <client>] [--q <texto>] [--tag <tag>] [--from <iso>] [--to <iso>]` lista sessões importadas.
- `myinst chat show <session-id>` mostra mensagens.
- `myinst chat export <session-id> --format markdown` grava `.myinst/chats/<session-id>.md`.
- `myinst chat summarize <session-id>` atualiza o resumo no servidor.

Arquivos JSON devem conter `messages`; Markdown entra como uma mensagem única revisada. O import dedicado de Codex aceita `.jsonl` do histórico, incluindo o formato `payload` do Codex desktop, e exige `--dry-run` ou `--reviewed`. Mensagens com segredo provável que não puderem ser redigidas granularmente viram `{{SECRET}}`. A categoria `cache` existe no contrato, mas fica bloqueada até existir persistência segura por client. O backend bloqueia padrões prováveis de segredo antes de persistir.

JSON recomendado:

```json
{
  "title": "Correção do sync Codex",
  "summary": "Resumo opcional revisado.",
  "metadata": {
    "tags": ["codex", "sync"],
    "source": "codex-export"
  },
  "messages": [
    { "role": "user", "content": "Corrija o pull do Codex." },
    { "role": "assistant", "content": "Pull ajustado e validado." }
  ]
}
```

Use `--client codex`, `--client claude`, `--client cursor`, `--client kimi` ou outro ID controlado para preservar a origem da sessão. Suporte a `history` e `cache` é implementado client por client, porque cada ferramenta guarda dados em estrutura própria. O export grava Markdown em `.myinst/chats/`; ele não reescreve o histórico interno do client.

O import grava todas as sessões encontradas no `--path` dentro do projeto informado por `--workspace` e `--project`. Ele ainda não separa automaticamente sessões por `cwd`; se `~/.codex/sessions` tiver conversas de vários repositórios, use `--dry-run` e importe apenas arquivos ou subdiretórios que pertencem ao projeto correto.

## Requisitos

- Node.js 22+
- acesso a um servidor MyInst

## Repositorio

- Projeto: <https://github.com/davidassef/MyInst-mcp>
- Issues: <https://github.com/davidassef/MyInst-mcp/issues>
