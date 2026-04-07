#!/usr/bin/env python3

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = REPO_ROOT / "skills"
MARKETPLACE_PATH = REPO_ROOT / ".claude-plugin" / "marketplace.json"
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


def main() -> int:
    errors: list[str] = []
    if not SKILLS_DIR.exists():
        errors.append(f"Missing skills directory: {SKILLS_DIR}")
    else:
        for skill_dir in sorted(path for path in SKILLS_DIR.iterdir() if path.is_dir()):
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                errors.append(f"Missing SKILL.md: {skill_dir}")
                continue
            try:
                frontmatter = parse_frontmatter(skill_md.read_text())
            except ValueError as exc:
                errors.append(f"{skill_md}: {exc}")
                continue
            name = frontmatter.get("name")
            description = frontmatter.get("description")
            if not name:
                errors.append(f"{skill_md}: missing frontmatter name")
            if not description:
                errors.append(f"{skill_md}: missing frontmatter description")
            if name and name != skill_dir.name:
                errors.append(f"{skill_md}: frontmatter name '{name}' does not match folder '{skill_dir.name}'")
            skill_text = skill_md.read_text()
            for section in REQUIRED_SKILL_SECTIONS:
                if section not in skill_text:
                    errors.append(f"{skill_md}: missing section '{section}'")
            openai_yaml = skill_dir / "agents" / "openai.yaml"
            if openai_yaml.exists() and "display_name:" not in openai_yaml.read_text():
                errors.append(f"{openai_yaml}: missing display_name")

    if not MARKETPLACE_PATH.exists():
        errors.append(f"Missing marketplace manifest: {MARKETPLACE_PATH}")
    else:
        try:
            manifest = json.loads(MARKETPLACE_PATH.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"{MARKETPLACE_PATH}: invalid JSON ({exc})")
        else:
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
                    if name != "all-skills" and len(skills) < 2:
                        errors.append(
                            f"{MARKETPLACE_PATH}: plugin '{name}' should contain at least two skills or stay unpublished"
                        )

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print("Repository is valid!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
