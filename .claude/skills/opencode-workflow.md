# OpenCode Workflow

## Overview

Use this skill to keep work grounded in evidence instead of assumption. Start from the real workspace context, separate facts from hypotheses, make the smallest defensible change, and verify with objective signals before claiming success.

Read these references before acting:
- `references/sources-of-truth.md` for authority order and discovery
- `references/execution-checklists.md` for debugging, deploy, validation, and closeout checklists

## Trigger And Triage

Use this workflow when the task involves one of these conditions:
- incident, bug, regression, unexpected behavior, failing test, bad deploy, broken environment, auth/CORS/runtime issue
- deploy, rollback, migration, infra change, secret/env change, manual server action, or any operation that can break production or homologation
- ambiguous request where the right answer depends on repository conventions, workspace docs, or live runtime evidence
- requests to explain root cause, prove what happened, or document a safe operational process

Do not load this skill for trivial self-contained tasks such as plain rewriting, simple translations, or one-line local commands with no project risk.

## Core Workflow

1. Read the local authority first.
2. Map facts, unknowns, and risks before proposing a fix.
3. Verify hypotheses from code, docs, logs, requests, runtime state, or official docs.
4. Apply the smallest change that resolves the verified cause.
5. Validate with commands, tests, health checks, or direct endpoint checks.
6. Close by reporting evidence, remaining risks, and required next steps.

## Non-Negotiable Rules

- Never treat global OpenCode config as source of truth for project-specific branches, servers, ports, domains, deploy order, or runtime topology.
- Never improvise deploy flow if the workspace has a local deploy skill or operational document. Read it first.
- If the workspace has no trustworthy deploy documentation and the action is risky, stop improvising and document the gap.
- Never report a fix from intuition alone. Every conclusion needs an observed signal.
- When the request asks for cause analysis, explicitly separate:
  - observed facts
  - working hypotheses
  - rejected hypotheses
  - final conclusion with evidence

## Workspace Discovery Order

Use this order of authority unless the workspace says otherwise:
1. Root `AGENTS.md`
2. Local skills such as `.codex/skills`, `.opencode/skills`, `.agent/skills`, `.claude/skills`
3. Workspace operational docs such as `docs/`, `README`, runbooks, architecture notes, deploy manuals
4. Real code and configuration in the repository
5. Live runtime evidence: logs, process state, container state, HTTP responses, health endpoints, CI output
6. Global OpenCode instructions and generic skills

If two sources disagree, prefer the more local and more recently verifiable one. When in doubt, verify from runtime.

## Debugging Pattern

For incidents and regressions:
- Reproduce the symptom or collect the exact error text.
- Identify the boundary where the failure appears: browser, frontend, API, proxy, worker, queue, database, third-party service.
- For each boundary, collect one concrete signal before moving on.
- Prefer disproof over confirmation. Kill weak hypotheses early.
- Fix the verified cause, not the loudest symptom.

## Deploy And Operations Pattern

For deploys, migrations, restarts, or server changes:
- Read the workspace deploy skill or deploy manual before any command that changes state.
- If the workspace uses `deploy-guard`, treat the block as mandatory and unlock only after confirming the local policy file.
- Prefer deploy via the repository flow defined by the project, usually push/pull Git plus controlled restart, never ad-hoc file edits on servers unless the project explicitly documents that path.
- Confirm prerequisites first: branch, remote sync, env, secrets, migrations, candidate validation, rollback path.
- Record the exact verification checks to run after the change.
- If the documented flow and the live environment diverge, stop and reconcile before continuing.

## Validation Standard

Do not claim success until you have at least one direct verification signal that matches the task:
- test command passing
- build passing
- health endpoint returning expected status
- endpoint preflight or request returning expected headers/body/status
- container or process healthy
- user-visible smoke test behaving correctly

If you could not validate, say that plainly and state what remains unverified.

## Final Response Contract

When finishing operational or debugging work, report:
- what was observed
- what was used to reach the conclusion
- what change was made, if any
- how it was verified
- what still remains as risk, dependency, or follow-up

Keep the report short, but never hide the evidence chain.

## Common Failure Modes

- Assuming the first visible error is the root cause.
- Changing code before checking env, proxy, container, DNS, headers, or runtime state.
- Treating stale documentation as truth without verifying the live system.
- Claiming "fixed" after one code change without a direct validation step.
- Reusing a deploy recipe from another project instead of reading the local one.