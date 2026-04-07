#!/usr/bin/env python3

import argparse
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SKILLS_DIR = REPO_ROOT / "skills"
VALID_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize(value: str) -> str:
    lowered = value.strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", lowered)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized


def parse_features(value: str) -> set[str]:
    if not value:
        return set()
    return {item.strip() for item in value.split(",") if item.strip()}


def render_skill(name: str) -> str:
    return (
        "---\n"
        f"name: {name}\n"
        "description: Replace this with what the skill does and when it should be used.\n"
        "---\n\n"
        f"# {name.replace('-', ' ').title()}\n\n"
        "Use this skill when:\n\n"
        "- The user asks for the workflow this skill covers\n"
        "- The task needs the bundled scripts or references in this folder\n\n"
        "## Quick Start\n\n"
        "1. State that you are using this skill and why it applies.\n"
        "2. Start with the smallest deterministic command or document read.\n"
        "3. Prefer bundled scripts for repeatable operations.\n"
        "4. Keep the response focused on the user task, not on the skill internals.\n"
        "\n"
        "## First Run Setup\n\n"
        "If this skill benefits from saved defaults, add a one-time setup path:\n\n"
        "```bash\n"
        "python scripts/setup.py\n"
        "```\n\n"
        "Recommended precedence:\n\n"
        "1. CLI flags\n"
        "2. Environment variables\n"
        "3. Persisted config under `~/.config/hoon-ch-skills/<skill-name>.json`\n\n"
        "If configuration can fail, add a lightweight `doctor` or `validate` command and tell users to start there instead of reading secret files directly.\n\n"
        "## Workflow\n\n"
        "1. Confirm that the skill applies.\n"
        "2. Run the smallest safe command that proves context or connectivity.\n"
        "3. Use higher-level helpers when they are reliable.\n"
        "4. Drop to the raw escape hatch when a helper hides an important server or tool error.\n"
        "5. Report the outcome in user-facing terms.\n\n"
        "## Failure Fallback\n\n"
        "- Surface the original error message.\n"
        "- Prefer a raw request, direct CLI, or lower-level script path when wrappers fail.\n"
        "- Document deployment-specific caveats in `references/` instead of bloating this file.\n\n"
        "## Examples\n\n"
        "```bash\n"
        "python scripts/setup.py\n"
        "python scripts/tool.py doctor\n"
        "python scripts/tool.py doctor --test\n"
        "```\n"
    )


def render_openai_yaml(name: str) -> str:
    display = name.replace("-", " ").title()
    return (
        "interface:\n"
        f'  display_name: "{display}"\n'
        '  short_description: "Replace with a short human-facing summary"\n'
        f'  default_prompt: "Use ${name} for the task described by the user."\n'
    )


def render_setup_py(name: str) -> str:
    return (
        "#!/usr/bin/env python3\n\n"
        "import argparse\n"
        "import json\n"
        "from pathlib import Path\n\n\n"
        'CONFIG_DIR = Path.home() / ".config" / "hoon-ch-skills"\n'
        f'CONFIG_PATH = CONFIG_DIR / "{name}.json"\n\n\n'
        "def main():\n"
        '    parser = argparse.ArgumentParser(description="One-time setup scaffold for this skill.")\n'
        '    parser.add_argument("--show-path", action="store_true")\n'
        "    args = parser.parse_args()\n\n"
        "    if args.show_path:\n"
        "        print(CONFIG_PATH)\n"
        "        return\n\n"
        "    CONFIG_DIR.mkdir(parents=True, exist_ok=True)\n"
        "    payload = {\n"
        '        "version": 1,\n'
        '        "todo": "Replace this stub with skill-specific prompts and saved defaults."\n'
        "    }\n"
        '    CONFIG_PATH.write_text(json.dumps(payload, indent=2) + "\\n")\n'
        "    CONFIG_PATH.chmod(0o600)\n"
        '    print(f"Created stub config at {CONFIG_PATH}")\n'
        '    print("Replace this script with skill-specific setup logic before publishing.")\n\n'
        '\nif __name__ == "__main__":\n'
        "    main()\n"
    )


def render_configuration_reference() -> str:
    return (
        "# Configuration Pattern\n\n"
        "Use this pattern for skills that benefit from persistent defaults.\n\n"
        "## Recommended Flow\n\n"
        "1. Provide `scripts/setup.py` for one-time configuration\n"
        "2. Save defaults under `~/.config/hoon-ch-skills/<skill-name>.json`\n"
        "3. Set file mode to `600` when secrets may be stored\n"
        "4. Resolve config in this order:\n"
        "   - CLI flags\n"
        "   - Environment variables\n"
        "   - Persisted config\n"
        "5. Provide a `doctor`, `validate`, or equivalent command for troubleshooting\n\n"
        "## Design Rules\n\n"
        "- Do not silently mutate shell profiles or global env files\n"
        "- Make persistence explicit\n"
        "- Let one-off CLI flags override saved values\n"
        "- Keep response bodies and server errors visible when setup validation fails\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Scaffold a new skill in this repository.")
    parser.add_argument("name", help="Skill name. Hyphen-case is preferred.")
    parser.add_argument(
        "--with",
        dest="features",
        default="agents",
        help="Comma-separated optional folders to create: agents,references,scripts,assets",
    )
    args = parser.parse_args()

    name = normalize(args.name)
    if not name or not VALID_NAME.fullmatch(name):
        print("Invalid skill name after normalization.", file=sys.stderr)
        return 1

    skill_dir = SKILLS_DIR / name
    if skill_dir.exists():
        print(f"Skill already exists: {skill_dir}", file=sys.stderr)
        return 1

    features = parse_features(args.features)
    allowed = {"agents", "references", "scripts", "assets"}
    invalid = sorted(features - allowed)
    if invalid:
        print(f"Unknown feature(s): {', '.join(invalid)}", file=sys.stderr)
        return 1

    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(render_skill(name))

    if "agents" in features:
        (skill_dir / "agents").mkdir()
        (skill_dir / "agents" / "openai.yaml").write_text(render_openai_yaml(name))
    for folder in sorted(features - {"agents"}):
        (skill_dir / folder).mkdir()
    if "scripts" in features:
        setup_path = skill_dir / "scripts" / "setup.py"
        setup_path.write_text(render_setup_py(name))
        setup_path.chmod(0o755)
    if "references" in features:
        (skill_dir / "references" / "configuration.md").write_text(render_configuration_reference())

    print(skill_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
