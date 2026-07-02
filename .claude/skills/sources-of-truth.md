# Sources Of Truth

## Authority Order

Use this order by default:
1. Workspace `AGENTS.md`
2. Local skills committed with the project
3. Project documentation and runbooks
4. Repository code and checked-in configuration
5. Live runtime evidence
6. Global OpenCode rules and generic skills

## Discovery Checklist

- Find the repository root and confirm whether `AGENTS.md` exists.
- Search for local skills in `.codex/skills`, `.opencode/skills`, `.agent/skills`, `.claude/skills`.
- Search for operational docs with `rg --files docs . | rg 'deploy|runbook|architecture|ops|manual|readme'`.
- Inspect the code paths directly related to the symptom before proposing a change.
- If the problem depends on current runtime behavior, collect logs, process state, health endpoints, or HTTP responses.

## Evidence Model

Classify what you find:
- Fact: directly observed from code, command output, logs, or documented project source
- Hypothesis: plausible explanation not yet proven
- Conclusion: hypothesis confirmed by evidence and surviving contradiction checks

Never present a hypothesis as if it were already a fact.
