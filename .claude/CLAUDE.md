# Regras de roteamento global do OpenCode


## intra-connect-saas-53147030-routing.md

# Workspace intra-connect-saas

Quando o workspace atual estiver em `/home/rhapp/Documentos/intra-connect-saas`:

- trate `AGENTS.md` do workspace como instrução principal do projeto
- priorize as skills locais versionadas em `.codex/skills`
- use como referências rápidas: `docs/`, `whaticket/backend/doc/`

Se existir skill local no repositório para o assunto, ela prevalece sobre skill global genérica do cliente.


## intra-connect-saas-routing.md

# Workspace intra-connect-saas

Quando o workspace atual estiver em `/home/rhapp/Documentos/intra-connect-saas`:

- trate `AGENTS.md` do workspace como instrução principal do projeto
- priorize as skills locais versionadas em `.opencode/skills`, depois `.codex/skills`
- use como referências rápidas: `docs/`, `whaticket/backend/doc/`

Se existir skill local no repositório para o assunto, ela prevalece sobre skill global genérica do cliente.


## intrasign-routing.md

# Workspace intrasign

Quando o workspace atual estiver em `/home/rhapp/Documentos/intrasign`:

- trate `AGENTS.md` do workspace como instrução principal do projeto
- priorize as skills locais versionadas em `.codex/skills`
- antes de comando sensível de deploy, use `.codex/deploy-guard.json` como contrato local de liberação da sessão
- use como referências rápidas: `docs/`

Se existir skill local no repositório para o assunto, ela prevalece sobre skill global genérica do cliente.


## project-routing.md

# Roteamento de projetos no OpenCode

Para qualquer workspace:

- se houver `AGENTS.md` no projeto, trate esse arquivo como instrução principal
- se houver `.codex/skills`, priorize essas skills locais sobre skills globais
- se houver documentação operacional do projeto, prefira essa documentação a qualquer regra genérica do cliente
- para incidentes, deploy, troubleshooting, runtime e mudanças de configuração, carregue a skill global `opencode-workflow` e depois substitua suas regras genéricas pelas regras locais do workspace
- se houver skill local para deploy, operação ou troubleshooting, ela prevalece sobre a skill global
- nunca deduza fluxo operacional a partir do arquivo global; confirme sempre no próprio workspace
- se houver `.codex/deploy-guard.json`, o agente deve responder corretamente a esse contrato local usando `deploy_guard_unlock` antes de qualquer comando sensível de deploy

Quando existir instrução específica cadastrada para o workspace atual, ela complementa este arquivo.


## replica-ora-routing.md

# Workspace Replica ORA

Quando o workspace atual estiver em `/home/rhapp/Documentos/Replica ORA`:

- trate `AGENTS.md` do workspace como instrução principal do projeto
- priorize as skills locais versionadas em `.codex/skills`
- use como referências rápidas: `docs/`

Se existir skill local no repositório para o assunto, ela prevalece sobre skill global genérica do cliente.

