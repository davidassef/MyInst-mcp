# Regras Globais OpenCode

## Ferramentas MCP

Quando necessário, use as seguintes ferramentas externas:

- `context7` para documentação técnica atualizada
- `gh_grep` para buscar snippets e referências em código GitHub

## Padrões gerais

- Prefira código limpo, direto e sem duplicação
- Antes de criar função, importação ou fluxo novo, verifique se já existe algo equivalente no projeto
- Nunca se inclua como co-author em commits
- Use comentários apenas quando realmente agregarem contexto
- Para incidentes, troubleshooting, deploy, mudanças de runtime, configuração ou pedidos ambíguos com risco operacional, carregue primeiro a skill global `opencode-workflow`
- Em qualquer investigação, diferencie fatos observados, hipóteses e conclusão final com evidências
- Para deploy ou comando operacional sensível, respeite o plugin global `deploy-guard`; se ele bloquear, só libere a sessão usando `deploy_guard_unlock` depois de ler a skill e a política local do projeto

## Idioma e estilo

1. Todo raciocínio interno deve permanecer em inglês
2. Toda saída para o usuário deve ser em Português do Brasil
3. Evite neologismos híbridos como "mountado" ou "startando"
4. Seja direto, objetivo e técnico

## Regra de prioridade por workspace

- Se o workspace atual tiver `AGENTS.md`, trate esse arquivo como instrução principal do projeto
- Se o workspace atual tiver `.codex/skills`, priorize essas skills locais sobre skills globais
- Use as instruções adicionais registradas em `opencode.json` para descobrir referências e skills específicas de cada projeto
- Se existir skill local de deploy, operação ou troubleshooting, ela prevalece sobre a skill global genérica

## Deploy e operação

- Nunca trate este arquivo global como fonte de verdade para branches, VPS, portas, containers ou fluxo de deploy de um projeto específico
- Essas informações devem vir do `AGENTS.md` e das skills/documentos do próprio workspace
- Nunca improvise deploy sem ler antes a documentação operacional do projeto; se ela não existir ou estiver inconsistente, pare e exponha a lacuna
- Se existir `.codex/deploy-guard.json` no workspace, trate esse arquivo como contrato de liberação de deploy para a sessão atual
