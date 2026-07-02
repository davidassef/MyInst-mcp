#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_DIR="${HOME}/.config/opencode"
PROJECTS_DIR="${CONFIG_DIR}/projects"
INSTRUCTIONS_DIR="${CONFIG_DIR}/instructions"
SKILLS_DIR="${CONFIG_DIR}/skills"
CONFIG_JSON="${CONFIG_DIR}/opencode.json"
SEARCH_ROOT="${1:-${HOME}/Documentos}"

mkdir -p "$PROJECTS_DIR" "$INSTRUCTIONS_DIR" "$SKILLS_DIR"

python3 - "$SEARCH_ROOT" "$PROJECTS_DIR" "$INSTRUCTIONS_DIR" "$CONFIG_JSON" <<'PY'
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

search_root = Path(sys.argv[1]).expanduser().resolve()
projects_dir = Path(sys.argv[2]).expanduser().resolve()
instructions_dir = Path(sys.argv[3]).expanduser().resolve()
config_json = Path(sys.argv[4]).expanduser().resolve()

global_skill_paths = [
    str((Path.home() / ".config" / "opencode" / "skills").resolve()),
    str((Path.home() / ".codex" / "skills").resolve()),
]
generic_instruction = str((instructions_dir / "project-routing.md").resolve())


def safe_slug(root: Path, existing: set[str]) -> str:
    base = root.name or "workspace"
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in base).strip("-") or "workspace"
    if slug not in existing:
        return slug
    suffix = hashlib.sha1(str(root).encode()).hexdigest()[:8]
    return f"{slug}-{suffix}"


def discover_roots(root: Path) -> list[Path]:
    found: dict[str, Path] = {}
    for current, dirs, files in os.walk(root):
        path = Path(current)
        dirs[:] = [
            d
            for d in dirs
            if d not in {".git", "node_modules", "dist", "build", ".next", ".cache", ".venv", "vendor"}
        ]

        project_root: Path | None = None
        if ".codex" in dirs and (path / ".codex" / "skills").is_dir():
            project_root = path
        elif "AGENTS.md" in files and (path / ".git").exists():
            project_root = path

        if project_root is not None:
            found[str(project_root)] = project_root
            dirs[:] = []

    return sorted(found.values(), key=lambda item: str(item))


def ensure_symlink(link_path: Path, target: Path) -> None:
    if link_path.exists() or link_path.is_symlink():
        if link_path.is_symlink() and link_path.resolve() == target.resolve():
            return
        if link_path.is_dir() and not link_path.is_symlink():
            shutil.rmtree(link_path)
        else:
            link_path.unlink()
    link_path.symlink_to(target)


def write_instruction(project_root: Path, instruction_path: Path) -> None:
    docs_path = project_root / "docs"
    backend_doc_path = project_root / "whaticket" / "backend" / "doc"
    skill_path = project_root / ".codex" / "skills"
    deploy_guard_path = project_root / ".codex" / "deploy-guard.json"
    agents_path = project_root / "AGENTS.md"

    lines = [
        f"# Workspace {project_root.name}",
        "",
        f"Quando o workspace atual estiver em `{project_root}`:",
        "",
        "- trate `AGENTS.md` do workspace como instrução principal do projeto" if agents_path.exists() else "- o workspace não tem `AGENTS.md` raiz; use a documentação do projeto como referência principal",
    ]

    if skill_path.is_dir():
        lines.append("- priorize as skills locais versionadas em `.codex/skills`")
    if deploy_guard_path.is_file():
        lines.append("- antes de comando sensível de deploy, use `.codex/deploy-guard.json` como contrato local de liberação da sessão")

    refs: list[str] = []
    if docs_path.is_dir():
        refs.append("`docs/`")
    if backend_doc_path.is_dir():
        refs.append("`whaticket/backend/doc/`")
    if refs:
        lines.extend(["- use como referências rápidas: " + ", ".join(refs)])

    lines.extend(
        [
            "",
            "Se existir skill local no repositório para o assunto, ela prevalece sobre skill global genérica do cliente.",
        ]
    )

    instruction_path.write_text("\n".join(lines) + "\n")


project_roots = discover_roots(search_root)
existing_dirs = {item.name for item in projects_dir.iterdir() if item.is_dir()}
existing_roots: dict[str, str] = {}
for item in projects_dir.iterdir():
    if not item.is_dir():
        continue
    root_file = item / "workspace-root.txt"
    if root_file.exists():
        existing_roots[root_file.read_text().strip()] = item.name
registered: list[dict[str, str]] = []

for root in project_roots:
    slug = existing_roots.get(str(root)) or safe_slug(root, existing_dirs)
    existing_dirs.add(slug)

    project_dir = projects_dir / slug
    project_dir.mkdir(parents=True, exist_ok=True)

    (project_dir / "workspace-root.txt").write_text(str(root) + "\n")

    agents_path = root / "AGENTS.md"
    skill_path = root / ".codex" / "skills"
    docs_path = root / "docs"
    backend_doc_path = root / "whaticket" / "backend" / "doc"

    if agents_path.exists():
      ensure_symlink(project_dir / "AGENTS.md", agents_path)
    if skill_path.is_dir():
      ensure_symlink(project_dir / "skills", skill_path)
    if docs_path.is_dir():
      ensure_symlink(project_dir / "docs", docs_path)
    if backend_doc_path.is_dir():
      ensure_symlink(project_dir / "backend-doc", backend_doc_path)

    instruction_path = instructions_dir / f"{slug}-routing.md"
    write_instruction(root, instruction_path)

    registered.append(
        {
            "slug": slug,
            "root": str(root),
            "skills_path": str((project_dir / "skills").resolve()) if skill_path.is_dir() else "",
            "instruction_path": str(instruction_path.resolve()),
        }
    )

cfg = json.loads(config_json.read_text())
cfg.setdefault("skills", {})
cfg["skills"]["paths"] = [
    *(item["skills_path"] for item in registered if item["skills_path"]),
    *global_skill_paths,
]
cfg["instructions"] = [generic_instruction, *(item["instruction_path"] for item in registered)]

config_json.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"projects": registered}, indent=2, ensure_ascii=False))
PY
