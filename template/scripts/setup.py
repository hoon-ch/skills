#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


CONFIG_DIR = Path.home() / ".config" / "hoon-ch-skills"
CONFIG_PATH = CONFIG_DIR / "my-skill.json"


def main():
    parser = argparse.ArgumentParser(description="One-time setup scaffold for this skill.")
    parser.add_argument("--show-path", action="store_true")
    args = parser.parse_args()

    if args.show_path:
        print(CONFIG_PATH)
        return

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "todo": "Replace this stub with skill-specific prompts and saved defaults."
    }
    CONFIG_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    CONFIG_PATH.chmod(0o600)
    print(f"Created stub config at {CONFIG_PATH}")
    print("Replace this script with skill-specific setup logic before publishing.")


if __name__ == "__main__":
    main()
