#!/usr/bin/env python3

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = REPO_ROOT / "skills"
MARKETPLACE_PATH = REPO_ROOT / ".claude-plugin" / "marketplace.json"
CODEX_MARKETPLACE_PATH = REPO_ROOT / ".agents" / "plugins" / "marketplace.json"
CODEX_PLUGIN_PATH = REPO_ROOT / "plugins" / "hoon-ch-skills"
CODEX_PLUGIN_MANIFEST_PATH = CODEX_PLUGIN_PATH / ".codex-plugin" / "plugin.json"
REQUIRED_SKILL_SECTIONS = (
    "## Quick Start",
    "## Workflow",
    "## Failure Fallback",
    "## Examples",
)


def parse_frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        raise ValueError("Missing YAML frontmatter start")
    data: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return data
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    raise ValueError("Missing YAML frontmatter end")


def load_json(path: Path, errors: list[str]) -> dict:
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        errors.append(f"{path}: invalid JSON ({exc})")
        return {}
    if not isinstance(data, dict):
        errors.append(f"{path}: expected JSON object")
        return {}
    return data


def normalized_skill_body(text: str) -> str:
    lines = text.splitlines()
    body_start = 0
    if lines and lines[0].strip() == "---":
        for index, line in enumerate(lines[1:], start=1):
            if line.strip() == "---":
                body_start = index + 1
                break
    body_lines = [
        line.rstrip()
        for line in lines[body_start:]
        if not line.startswith("# ")
    ]
    return "\n".join(body_lines).strip()


def files_by_relative_path(root: Path) -> dict[Path, Path]:
    return {
        path.relative_to(root): path
        for path in root.rglob("*")
        if path.is_file()
        and "__pycache__" not in path.parts
        and path.suffix != ".pyc"
    }


def validate_codex_plugin_skill_mirror(errors: list[str]) -> None:
    mirror = CODEX_PLUGIN_PATH / "skills"
    if not mirror.exists():
        errors.append(f"Missing Codex plugin skills path: {mirror}")
        return
    if mirror.is_symlink():
        errors.append(f"{mirror}: must be a real directory, not a symlink")
        return
    if not mirror.is_dir():
        errors.append(f"{mirror}: must be a directory")
        return

    source_files = files_by_relative_path(SKILLS_DIR)
    mirror_files = files_by_relative_path(mirror)
    missing = sorted(source_files.keys() - mirror_files.keys())
    extra = sorted(mirror_files.keys() - source_files.keys())
    changed = sorted(
        rel_path
        for rel_path in source_files.keys() & mirror_files.keys()
        if source_files[rel_path].read_bytes() != mirror_files[rel_path].read_bytes()
    )
    if missing:
        errors.append(f"{mirror}: missing mirrored files: {', '.join(map(str, missing))}")
    if extra:
        errors.append(f"{mirror}: contains extra mirrored files: {', '.join(map(str, extra))}")
    if changed:
        errors.append(f"{mirror}: mirrored files differ from skills/: {', '.join(map(str, changed))}")


def main() -> int:
    errors: list[str] = []
    if not SKILLS_DIR.exists():
        errors.append(f"Missing skills directory: {SKILLS_DIR}")
    else:
        descriptions: dict[str, Path] = {}
        bodies: dict[str, Path] = {}
        for skill_dir in sorted(path for path in SKILLS_DIR.iterdir() if path.is_dir()):
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                errors.append(f"Missing SKILL.md: {skill_dir}")
                continue
            skill_text = skill_md.read_text()
            try:
                frontmatter = parse_frontmatter(skill_text)
            except ValueError as exc:
                errors.append(f"{skill_md}: {exc}")
                continue
            name = frontmatter.get("name")
            description = frontmatter.get("description")
            if not name:
                errors.append(f"{skill_md}: missing frontmatter name")
            if not description:
                errors.append(f"{skill_md}: missing frontmatter description")
            elif description in descriptions:
                errors.append(f"{skill_md}: duplicate description also used by {descriptions[description]}")
            else:
                descriptions[description] = skill_md
            if name and name != skill_dir.name:
                errors.append(f"{skill_md}: frontmatter name '{name}' does not match folder '{skill_dir.name}'")
            body = normalized_skill_body(skill_text)
            if body and body in bodies:
                errors.append(f"{skill_md}: duplicate skill body also used by {bodies[body]}")
            elif body:
                bodies[body] = skill_md
            for section in REQUIRED_SKILL_SECTIONS:
                if section not in skill_text:
                    errors.append(f"{skill_md}: missing section '{section}'")
            openai_yaml = skill_dir / "agents" / "openai.yaml"
            if openai_yaml.exists() and "display_name:" not in openai_yaml.read_text():
                errors.append(f"{openai_yaml}: missing display_name")

    for template_skill in sorted(REPO_ROOT.glob("template/**/SKILL.md")):
        errors.append(f"{template_skill}: template files must not be named SKILL.md")

    if not MARKETPLACE_PATH.exists():
        errors.append(f"Missing marketplace manifest: {MARKETPLACE_PATH}")
    else:
        manifest = load_json(MARKETPLACE_PATH, errors)
        if manifest:
            plugins = manifest.get("plugins")
            if not isinstance(plugins, list) or not plugins:
                errors.append(f"{MARKETPLACE_PATH}: missing plugins array")
            else:
                seen_names: set[str] = set()
                for plugin in plugins:
                    name = plugin.get("name")
                    if not name:
                        errors.append(f"{MARKETPLACE_PATH}: plugin missing name")
                        continue
                    if name in seen_names:
                        errors.append(f"{MARKETPLACE_PATH}: duplicate plugin name '{name}'")
                    seen_names.add(name)
                    skills = plugin.get("skills")
                    if not isinstance(skills, list) or not skills:
                        errors.append(f"{MARKETPLACE_PATH}: plugin '{name}' has no skills")
                        continue
                    for rel_path in skills:
                        skill_path = (REPO_ROOT / rel_path).resolve()
                        if not skill_path.exists():
                            errors.append(f"{MARKETPLACE_PATH}: plugin '{name}' references missing path '{rel_path}'")
                    if name == "all-skills" and SKILLS_DIR.exists():
                        published = {
                            f"./skills/{path.name}"
                            for path in sorted(SKILLS_DIR.iterdir())
                            if path.is_dir()
                        }
                        listed = set(skills)
                        missing = sorted(published - listed)
                        extra = sorted(listed - published)
                        if missing:
                            errors.append(
                                f"{MARKETPLACE_PATH}: all-skills missing published skills: {', '.join(missing)}"
                            )
                        if extra:
                            errors.append(
                                f"{MARKETPLACE_PATH}: all-skills references non-published skills: {', '.join(extra)}"
                            )
                    if name != "all-skills" and len(skills) < 2:
                        errors.append(
                            f"{MARKETPLACE_PATH}: plugin '{name}' should contain at least two skills or stay unpublished"
                        )

    if not CODEX_MARKETPLACE_PATH.exists():
        errors.append(f"Missing Codex plugin marketplace: {CODEX_MARKETPLACE_PATH}")
    else:
        codex_marketplace = load_json(CODEX_MARKETPLACE_PATH, errors)
        if codex_marketplace:
            if codex_marketplace.get("name") != "hoon-ch-skills":
                errors.append(f"{CODEX_MARKETPLACE_PATH}: name must be hoon-ch-skills")
            interface = codex_marketplace.get("interface")
            if not isinstance(interface, dict) or not interface.get("displayName"):
                errors.append(f"{CODEX_MARKETPLACE_PATH}: missing interface.displayName")
        plugins = codex_marketplace.get("plugins") if codex_marketplace else None
        if not isinstance(plugins, list) or not plugins:
            errors.append(f"{CODEX_MARKETPLACE_PATH}: missing plugins array")
        else:
            matching = [plugin for plugin in plugins if plugin.get("name") == "hoon-ch-skills"]
            if len(matching) != 1:
                errors.append(f"{CODEX_MARKETPLACE_PATH}: expected exactly one hoon-ch-skills entry")
            else:
                entry = matching[0]
                source = entry.get("source")
                if not isinstance(source, dict) or source.get("source") != "local":
                    errors.append(f"{CODEX_MARKETPLACE_PATH}: hoon-ch-skills source must be local")
                elif source.get("path") != "./plugins/hoon-ch-skills":
                    errors.append(
                        f"{CODEX_MARKETPLACE_PATH}: hoon-ch-skills path must be ./plugins/hoon-ch-skills"
                    )
                policy = entry.get("policy")
                if not isinstance(policy, dict):
                    errors.append(f"{CODEX_MARKETPLACE_PATH}: hoon-ch-skills missing policy")
                else:
                    if policy.get("installation") not in {"NOT_AVAILABLE", "AVAILABLE", "INSTALLED_BY_DEFAULT"}:
                        errors.append(f"{CODEX_MARKETPLACE_PATH}: invalid installation policy")
                    if policy.get("authentication") not in {"ON_INSTALL", "ON_USE"}:
                        errors.append(f"{CODEX_MARKETPLACE_PATH}: invalid authentication policy")
                if not entry.get("category"):
                    errors.append(f"{CODEX_MARKETPLACE_PATH}: hoon-ch-skills missing category")

    if not CODEX_PLUGIN_MANIFEST_PATH.exists():
        errors.append(f"Missing Codex plugin manifest: {CODEX_PLUGIN_MANIFEST_PATH}")
    else:
        codex_manifest = load_json(CODEX_PLUGIN_MANIFEST_PATH, errors)
        if codex_manifest:
            if codex_manifest.get("name") != "hoon-ch-skills":
                errors.append(f"{CODEX_PLUGIN_MANIFEST_PATH}: name must be hoon-ch-skills")
            if codex_manifest.get("skills") != "./skills/":
                errors.append(f"{CODEX_PLUGIN_MANIFEST_PATH}: skills must be ./skills/")
            interface = codex_manifest.get("interface")
            if not isinstance(interface, dict) or not interface.get("displayName"):
                errors.append(f"{CODEX_PLUGIN_MANIFEST_PATH}: missing interface.displayName")

    validate_codex_plugin_skill_mirror(errors)

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print("Repository is valid!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
