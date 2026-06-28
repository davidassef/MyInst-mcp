# MCP Server

O `@myinst/mcp-server` roda localmente na máquina do usuário e conecta clientes MCP ao vault MyInst hospedado.

## Papel do pacote

Ele existe para:

- autenticar automaticamente no backend via login no navegador ou, opcionalmente, com `MYINST_API_KEY`
- listar workspaces e projetos
- materializar conteúdo do vault localmente
- importar estruturas conhecidas de clientes
- sincronizar mudanças locais de volta

## Instalação

```bash
npm install -g @myinst/mcp-server
```

Binário exposto:

```bash
myinst-mcp
```

## Configuração

### Codex

Arquivo: `C:\Users\seu-usuario\.codex\config.toml`

```toml
[mcp_servers.myinst]
command = "myinst-mcp"

[mcp_servers.myinst.env]
MYINST_SERVER = "https://api-myinst.lotoscore.com.br"
```

### Claude Code

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_SERVER": "https://api-myinst.lotoscore.com.br"
      }
    }
  }
}
```

### Cursor e outros clientes compatíveis

Use o mesmo binário e as mesmas variáveis de ambiente nos campos equivalentes do cliente.

Na primeira execução sem credencial local, o MCP inicia um callback temporário em `localhost`, abre o navegador em `/connect-mcp`, redireciona para login quando necessário e gera a API key automaticamente após autorização. Essa credencial fica salva localmente na máquina do usuário.

Gerar uma API key manual e configurar `MYINST_API_KEY` continua suportado, mas é um fallback para ambientes sem navegador, automação bloqueada ou configuração manual controlada.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `MYINST_API_KEY` | Não | API key manual da conta. Se omitida, o MCP usa login automático por navegador |
| `MYINST_SERVER` | Não | URL da API MyInst. Em produção: `https://api-myinst.lotoscore.com.br` |
| `MYINST_MODEL` | Não | modelo usado para match automático de perfil no pull |

Fallback manual:

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_API_KEY": "{{MYINST_API_KEY}}",
        "MYINST_SERVER": "https://api-myinst.lotoscore.com.br"
      }
    }
  }
}
```

## Fluxo oficial

O fluxo padrão é local-first:

1. `myinst_pull`
2. trabalho local sobre arquivos reais
3. `myinst_push`

`myinst_search` continua disponível, mas como descoberta pontual.

Todo pull canônico cria ou atualiza `.myinst/MYINST.md` para deixar esse contrato explícito para o agente, e também gera `.claude/MYINST.md` como alternativa de compatibilidade.

## Project State

Project State preserva continuidade de trabalho por projeto sem sincronizar chats ou caches brutos.

Use:

- `myinst_state_capture` para criar um draft local em `.myinst/state/drafts/`.
- `myinst_state_push` para enviar somente drafts revisados com `metadata.reviewed=true`.
- `myinst_state_pull` para materializar memórias, decisões e resumos de sessões em `.myinst/state/`.
- `myinst_state_search` para consultar continuidade do projeto.

O v1 aceita apenas:

- memórias revisadas;
- decisões técnicas;
- resumos seguros de sessões.

Ficam fora do v1:

- transcripts completos de chats;
- cache bruto;
- diretórios `sessions/**`, `history/**`, bancos locais, JSONL operacional e telemetry.

## Segurança operacional para agentes

O agente deve tratar o conteúdo como sensível:

- nunca sincronizar segredos reais;
- nunca enviar `token`, `api key`, `senha`, `secret`, `oauth`, `.env` ou credenciais.
- substituir valores sensíveis por placeholders genéricos, por exemplo `{{API_KEY}}`, `{{DATABASE_URL}}`, `{{SECRET_KEY}}`.
- se o arquivo original exigir segredo operacional, manter somente metadados estruturais e pedir ao usuário aplicar valor localmente.
- usar `dryRun` antes de `myinst_push` para validar impacto.
- quando houver erro de bloqueio, reportar somente contexto técnico e plano de correção, sem divulgar dados.

Checklist de segurança pré-push:

- validar conteúdo revisado no diretório alvo;
- confirmar ausência de segredos reais no texto;
- garantir placeholders `{{...}}` para chaves e URLs sensíveis;
- só executar `myinst_push` após revisão.

## Descoberta multi-cliente

O MCP mantém um registro central de adapters com níveis de suporte.

Clientes desta fase:

| Cliente | Suporte | Escopo |
|---------|---------|--------|
| Claude Code | `full` | projeto |
| Codex | `full` | projeto e global |
| Cursor | `partial` | projeto e global |
| Gemini CLI | `partial` | projeto e global |
| OpenCode | `partial` | projeto e global |
| Qwen Code | `partial` | projeto |
| Aider | `partial` | projeto e global |
| Antigravity | `experimental` | projeto e global |
| Kimi Code | `partial` | projeto e global |

Antes de sincronizar, use:

```text
myinst_list_sync_targets
```

Quando houver múltiplos clientes detectados e `clients` não for informado, o MCP não sincroniza silenciosamente. Ele retorna a lista encontrada e pede seleção explícita.

## Tools disponíveis

### `myinst_list_workspaces`

Lista workspaces da conta autenticada.

### `myinst_create_workspace`

Cria um workspace e deixa o backend criar o projeto default dentro dele.

Parâmetros:

- `name`
- `slug`
- `description?`

### `myinst_update_workspace`

Edita `name`, `slug` ou `description` de um workspace.

Se o `slug` mudar, use o novo slug nas chamadas seguintes. O MCP não cria alias nem redirecionamento de slug antigo.

### `myinst_delete_workspace`

Remove um workspace não padrão.

Parâmetros:

- `workspace`
- `confirm`

`confirm=true` é obrigatório para evitar exclusão acidental por agente. O backend bloqueia exclusão do workspace default.

### `myinst_list_projects`

Lista projetos do workspace informado ou do workspace default.

### `myinst_create_project`

Cria um projeto em um workspace.

Parâmetros:

- `name`
- `slug`
- `description?`
- `workspace?`

Se `workspace` for omitido, usa o workspace default.

### `myinst_update_project`

Edita `name`, `slug` ou `description` de um projeto.

Parâmetros:

- `project`
- `workspace?`
- `name?`
- `slug?`
- `description?`

Se o `slug` mudar, use o novo slug nas chamadas seguintes. O MCP não mantém alias do slug antigo.

### `myinst_delete_project`

Remove um projeto não padrão.

Parâmetros:

- `project`
- `workspace?`
- `confirm`

`confirm=true` é obrigatório. O backend bloqueia exclusão do projeto default.

### `myinst_list_sync_targets`

Detecta clientes locais disponíveis, escopo, paths conhecidos, tipos suportados e nível de suporte.

Parâmetros:

- `sourceDir?`
- `scope?`
- `clients?`

### `myinst_pull`

Puxa conteúdo do vault.

Parâmetros principais:

- `workspace?`
- `project?`
- `types?`
- `tags?`
- `model?`
- `dryRun?`
- `targetDir?`
- `conflictStrategy?`
- `clients?`
- `scope?`
- `targetFormat?`

Formatos:

- `myinst`: materializa o formato canônico do MyInst
- `native`: exporta para os caminhos nativos dos clientes selecionados

### `myinst_push`

Lê estruturas conhecidas do diretório local e envia para o vault.

Parâmetros principais:

- `workspace?`
- `project?`
- `sourceDir?`
- `types?`
- `dryRun?`
- `clients?`
- `scope?`

### `myinst_import`

Importa estruturas locais para o vault, normalmente organizando globais em pastas previsíveis como:

- `codex-global`
- `cursor-global`
- `gemini-global`
- `kimi-global`

Parâmetros principais:

- `sourceDir`
- `workspace?`
- `project?`
- `folderName?`
- `dryRun?`
- `overwrite?`
- `clients?`
- `scope?`

### `myinst_create_client_profile_item`

Cria uma configuração global em `Client Profiles`, fora de workspace e projeto.

Parâmetros:

- `clientId`
- `type`
- `title`
- `slug`
- `body`
- `description?`
- `metadata?`
- `tags?`
- `isActive?`

O MCP bloqueia conteúdo com padrão provável de segredo. Use placeholders `{{...}}`.

### `myinst_update_client_profile_item`

Edita uma configuração global de `Client Profiles`.

Parâmetros:

- `clientId`
- `itemSlug`
- `type?`
- `title?`
- `slug?`
- `body?`
- `description?`
- `metadata?`
- `tags?`
- `isActive?`

Se o `slug` mudar, use o novo slug nas chamadas seguintes.

### `myinst_delete_client_profile_item`

Remove uma configuração global de `Client Profiles`.

Parâmetros:

- `clientId`
- `itemSlug`
- `confirm`

`confirm=true` é obrigatório para exclusão.

### `myinst_replicate_client_profile`

Replica `Client Profiles` globais compatíveis entre clients suportados no v1.

Parâmetros principais:

- `sourceClient`
- `targetClient`
- `dryRun?`
- `types?`
- `overwrite?`

Política padrão:

- copiar apenas itens ausentes
- não sobrescrever o destino por padrão
- ignorar e relatar tipos sem equivalente nativo claro

Exemplo de dry run:

```text
myinst_replicate_client_profile sourceClient="claude" targetClient="opencode" dryRun=true
```

Exemplo de execução real:

```text
myinst_replicate_client_profile sourceClient="codex" targetClient="opencode"
```

### `myinst_search`

Busca textual no vault para descoberta.

### `myinst_status`

Mostra mudanças temporais no vault desde uma data. Esta tool consulta o estado remoto do backend; não compara arquivos locais com manifesto.

### `myinst_state_capture`

Cria um draft local revisável. Não envia nada ao servidor.

### `myinst_state_push`

Salva Project State no vault. Exige `metadata.reviewed=true` e bloqueia padrões prováveis de segredo.

### `myinst_state_pull`

Materializa Project State em `.myinst/state/`.

### `myinst_state_search`

Busca memórias, decisões e sessões do projeto com `scope=state`.

## CLI e manifesto local

A CLI standalone tem um fluxo complementar ao MCP para trabalho local-first:

```bash
myinst pull default
myinst status default
myinst push default
```

Após `myinst pull` ou `myinst push` bem-sucedido, a CLI grava `.myinst/sync-state.json` no repositório. Esse manifesto guarda o último snapshot remoto conhecido e permite que `myinst status` compare três estados:

- manifesto local;
- arquivos locais reconhecidos pela CLI;
- snapshot remoto retornado por `/api/v1/sync/pull`.

O resultado separa `Pendente de pull`, `Pendente de push`, `Conflitos` e `Sincronizado`. O `myinst push` bloqueia envio quando há conflito, para evitar sobrescrever mudanças remotas sem revisão.

A CLI usa os mesmos adapters multi-cliente do MCP. Por padrão, `myinst status`, `myinst pull` e `myinst push` varrem o escopo `project` de todos os clients detectados no repositório. Use `--client <id...>` para limitar clientes e `--scope global` ou `--scope all` para incluir estruturas globais da home do usuário.

Exemplos:

```bash
myinst status default --client codex kimi
myinst push default --scope project
myinst pull default --scope all --client codex
```

## Estruturas reconhecidas

Exemplos suportados nesta fase:

- `.claude/skills`, `.claude/agents`, `.claude/memory`, `.claude/snippets`, `.claude/hooks`, `.claude/CLAUDE.md`, `.claude/.mcp.json`
- `.codex/skills/<slug>/SKILL.md`, `.codex/AGENTS.md`, `.codex/.mcp.json`, `AGENTS.md`, `.mcp.json`
- `.cursor/rules/*.mdc`, `.cursor/rules/*.md`, `.cursor/mcp.json`
- `GEMINI.md`
- `opencode.json`
- `.qwen/AGENTS.md`
- `.aider.conf.yml`, `CONVENTIONS.md`
- `.antigravity`, `~/.gemini/antigravity-cli/settings.json`
- `.kimi-code/skills/<slug>/SKILL.md`, `.kimi-code/skills/<slug>.md`, `.kimi-code/mcp.json`

### Kimi Code

O adapter do Kimi Code tem suporte parcial. Ele sincroniza apenas artefatos persistentes com formato conhecido, sem varredura genérica do diretório.

Escopos detectados:

- `project`: `.kimi-code/skills` e `.kimi-code/mcp.json` dentro do repositório atual.
- `global`: `~/.kimi-code/skills` e `~/.kimi-code/mcp.json` na home do usuário.

Tipos suportados:

- `skill`: arquivos `.md` em `.kimi-code/skills` ou `SKILL.md` dentro de subpastas.
- `mcp_config`: arquivo `.kimi-code/mcp.json`.

Exemplos:

```text
myinst_list_sync_targets scope="all" clients=["kimi"]
myinst_import scope="global" clients=["kimi"] dryRun=true
myinst_pull targetFormat="native" scope="project" clients=["kimi"]
```

Limites:

- não sincroniza cache, sessões, histórico, telemetry, runtime interno nem arquivos arbitrários;
- não replica Kimi para outros clients no v1;
- se outros clients forem detectados junto com Kimi, informe `clients=["kimi"]` explicitamente para evitar sync ambíguo.

## Dry run

Use `dryRun: true` para ver:

- clientes detectados
- tipos encontrados
- itens compatíveis
- itens ignorados por falta de suporte nativo

## Replicação entre clients

O v1 da replicação entre clients é propositalmente restrito a `Client Profiles` globais.

Pares suportados agora:

| Origem | Destino | Estado | Tipos realmente replicados |
|--------|---------|--------|----------------------------|
| Claude | OpenCode | `suportado` | `instruction` |
| Codex | OpenCode | `suportado` | `instruction` |

Pares documentados como futuros:

| Origem | Destino | Estado |
|--------|---------|--------|
| Claude | Codex | `planejado` |
| Codex | Claude | `planejado` |
| OpenCode | Claude | `planejado` |
| OpenCode | Codex | `planejado` |
| Cursor | OpenCode | `não suportado no v1` |
| Gemini | OpenCode | `não suportado no v1` |
| Qwen | OpenCode | `não suportado no v1` |
| Aider | OpenCode | `não suportado no v1` |
| Antigravity | OpenCode | `não suportado no v1` |
| Kimi | OpenCode | `não suportado no v1` |

Limites do v1:

- atua apenas sobre `Client Profiles`, não sobre `workspace/project`
- não converte configs heterogêneas como `settings.json`, `config.toml` e `opencode.json`
- não rebaixa automaticamente `agent`, `command`, `output_style` ou `setting` para `instruction`
- usa `dryRun` como caminho recomendado antes da gravação real

## Observações

- o formato canônico MyInst continua sendo o default operacional
- exportação nativa não garante paridade total entre todos os clientes
- clients experimentais retornam aviso explícito e não entram em sync silencioso
