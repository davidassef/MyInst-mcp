# @myinst/mcp-server

Servidor MCP local do MyInst para sincronizar contexto agentic com o vault remoto.

## Instalação

```bash
npm install -g @myinst/mcp-server
```

## Configuração

### Configuração automática (recomendado)

Configure o MCP no seu cliente sem precisar de API key manual:

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp"
    }
  }
}
```

Na primeira execução, o MCP abrirá automaticamente o browser para você fazer login e vincular sua conta. As credenciais são salvas localmente em `~/.myinst/credentials.json`.

### Configuração manual (alternativo)

Se preferir usar variáveis de ambiente:

```bash
MYINST_API_KEY=myinst_xxx MYINST_SERVER=https://api-myinst.lotoscore.com.br myinst-mcp
```

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

## O que ele faz

- lista workspaces e projetos
- cria, edita e remove workspaces e projetos com proteção para deletes
- materializa o vault em formato canônico
- exporta para formatos nativos de clientes suportados
- importa estruturas locais conhecidas
- sincroniza mudanças locais de volta para o backend
- cria, edita e remove itens globais de Client Profiles
- replica client profiles globais compatíveis entre clients suportados

## Fluxo oficial

O fluxo recomendado continua sendo:

```text
myinst_pull -> trabalho local -> myinst_push
```

## Segurança operacional

Antes de executar `myinst_push`, o agente deve respeitar:

- nunca incluir segredos em texto plano (`token`, `api key`, `secret`, `password`, `.env`, `oauth`, `cookie`);
- substituir valores sensíveis por placeholders `{{...}}`;
- se um valor for obrigatório para operação local, manter estrutura do arquivo e pedir preenchimento manual no ambiente do usuário;
- usar `dryRun` para validar ações antes de gravar no vault;
- manter `.myinst/MYINST.md` como fonte de operação e não como banco de segredos.
- manter `.claude/MYINST.md` como cópia de compatibilidade, quando aplicável.

Checklist obrigatória de pré-push:

- revisar o conteúdo local no projeto selecionado;
- confirmar `sem segredos reais` em texto plano;
- garantir `placeholders` nos campos sensíveis;
- só então executar `myinst_push`.

`myinst_pull` cria ou atualiza `.myinst/MYINST.md` para instruir o agente sobre:

- diferenca entre `scope=project` e `scope=global`
- uso de `clients` quando houver multiplos clientes detectados
- fluxo correto `pull -> trabalho local -> push`
- regra de que configuracoes globais vao para `Client Profiles`, nao para projetos

## Escopos

- `project`: conteudo do repositorio atual, salvo em `workspace/project`
- `global`: configuracoes e skills globais de cliente, salvas em `Client Profiles`
- `all`: combina os dois, separando o destino correto por item

## Descoberta multi-cliente

O pacote detecta clientes locais suportados e exige seleção explícita quando encontra múltiplas origens.

Ferramenta principal para inspeção:

```text
myinst_list_sync_targets
```

Clientes desta fase:

- Claude Code
- Codex
- Cursor
- Gemini CLI
- OpenCode
- Qwen Code
- Aider
- Antigravity
- Kimi Code

### Kimi Code

O suporte ao Kimi Code é parcial e cobre apenas arquivos com estrutura estável:

- projeto: `.kimi-code/skills` e `.kimi-code/mcp.json`
- global: `~/.kimi-code/skills` e `~/.kimi-code/mcp.json`

Tipos sincronizados:

- `skill`: `.kimi-code/skills/<slug>/SKILL.md` ou `.kimi-code/skills/<slug>.md`
- `mcp_config`: `.kimi-code/mcp.json`

Exemplos:

```text
myinst_list_sync_targets scope="all" clients=["kimi"]
myinst_import scope="global" clients=["kimi"] dryRun=true
myinst_pull targetFormat="native" scope="project" clients=["kimi"]
```

O MCP não sincroniza cache, histórico, sessões, telemetry, runtime interno ou arquivos arbitrários do Kimi.

## Replicação entre clients

O v1 expõe replicação segura apenas para `Client Profiles` globais e somente nos pares:

- `claude -> opencode`
- `codex -> opencode`

Tool:

```text
myinst_replicate_client_profile
```

Política padrão:

- copiar apenas itens ausentes
- não sobrescrever por padrão
- ignorar e relatar tipos sem equivalente nativo claro

## Administração via MCP

O MCP também expõe operações explícitas para administrar o vault sem abrir o painel web:

- `myinst_create_workspace`
- `myinst_update_workspace`
- `myinst_delete_workspace`
- `myinst_create_project`
- `myinst_update_project`
- `myinst_delete_project`
- `myinst_create_client_profile_item`
- `myinst_update_client_profile_item`
- `myinst_delete_client_profile_item`

Deletes exigem `confirm=true`. O backend continua aplicando proteções para entidades de compatibilidade.

Itens globais de Client Profiles ficam fora de workspace/projeto. Use essas tools para ajustes pontuais; para sincronização recorrente de arquivos locais, prefira `myinst_pull`, `myinst_push` e `myinst_import`.

## CLI standalone e status local

Para operadores humanos fora do fluxo MCP, use `@myinst/cli`. A CLI mantém `.myinst/sync-state.json` no repositório e oferece status de sincronização tipo repositório remoto:

```bash
myinst login
myinst pull myinst --workspace meus-projetos --client codex
myinst status myinst --workspace meus-projetos --client codex
myinst push myinst --workspace meus-projetos --client codex
myinst status myinst --workspace meus-projetos --client codex kimi
```

`myinst status` compara o manifesto local, os arquivos reconhecidos no disco e o snapshot remoto do vault. O resultado mostra pendências de pull, pendências de push e conflitos. Quando há conflito, `myinst push` é bloqueado até revisão manual.

A CLI usa os adapters compartilhados com o MCP. Quando mais de um client for detectado, use `--client <id...>` para escolher o alvo e evitar escrita no layout errado. Use `--scope global` ou `--scope all` para incluir estruturas globais da home do usuário.

## Histórico de chats

Chats dos clients não fazem parte do sync nativo de arquivos do MCP. Use a CLI ou a API para importar sessões revisadas por arquivo explícito:

```bash
myinst chat push --workspace meus-projetos --project myinst --client codex --session sessao-1 --file chat.json
myinst chat list --workspace meus-projetos --project myinst --client codex
myinst chat export sessao-1 --workspace meus-projetos --project myinst --format markdown
```

O MyInst preserva `client` e `session` para filtros, busca, exportação e resumo. Ele não varre `.codex/sessions`, `.claude/projects`, `history/**` ou caches internos automaticamente.

## Tipos sincronizáveis

- `skill`
- `instruction`
- `mcp_config`
- `agent`
- `hook`
- `memory`
- `snippet`
- `command`
- `output_style`
- `setting`

Nem todo cliente suporta todos os tipos em formato nativo. O MCP informa explicitamente o que foi ignorado.

## Ajuda

```bash
myinst-mcp --help
myinst-mcp --version
```

## Requisitos

- Node.js 22+
- Backend MyInst acessível
- Browser disponível (para autenticação automática na primeira execução)

## Documentação complementar

- Projeto: <https://github.com/davidassef/MyInst-mcp>
- Guia MCP: <https://github.com/davidassef/MyInst-mcp/blob/main/docs/mcp-server.md>
- Issues: <https://github.com/davidassef/MyInst-mcp/issues>
