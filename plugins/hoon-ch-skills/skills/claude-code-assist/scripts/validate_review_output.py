#!/usr/bin/env python3

import argparse
import re
import sys
from pathlib import Path


INFRA_FAILURE_RE = re.compile(
    r"("
    r"authentication failed|invalid (api )?token|"
    r"rate ?limit (exceeded|hit)|quota (exceeded|exhausted)|"
    r"forbidden|permission denied|"
    r"status [45][0-9][0-9]([^0-9]|$)|"
    r"(^|[^0-9])(401|403|429)([^0-9]|$)|"
    r"context length exceeded|unauthori[sz]ed|failed to authenticate|"
    r"fatal error|panic:|uncaught exception"
    r")",
    re.IGNORECASE | re.MULTILINE,
)

PREVIOUS_MESSAGE_RE = re.compile(
    r"("
    r"previous message|previous review|earlier response|already delivered|"
    r"as mentioned|i already|prior attempt|previously provided"
    r")",
    re.IGNORECASE,
)


def first_non_empty_line(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def fail(message: str) -> int:
    print(f"invalid claude review output: {message}", file=sys.stderr)
    return 1


def validate(stdout_text: str, stderr_text: str) -> int:
    if not stdout_text.strip():
        return fail("stdout log is empty")

    if stderr_text.strip() and INFRA_FAILURE_RE.search(stderr_text):
        return fail("stderr contains a likely infrastructure failure")

    if PREVIOUS_MESSAGE_RE.search(stdout_text):
        return fail("stdout contains a previous-message reference instead of the current review")

    marker = first_non_empty_line(stdout_text)
    if marker not in {"Findings", "No findings."}:
        return fail("first non-empty line must be exactly Findings or No findings.")

    if marker == "No findings." and stdout_text.strip() != "No findings.":
        return fail("No findings. output must contain no additional text")

    if marker == "Findings":
        body = stdout_text.split(marker, 1)[1].strip()
        if not body:
            return fail("Findings output has no review body")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate captured Claude Code review stdout and stderr logs."
    )
    parser.add_argument("--stdout", required=True, help="Path to captured stdout markdown log")
    parser.add_argument("--stderr", required=True, help="Path to captured stderr log")
    args = parser.parse_args()

    stdout_text = Path(args.stdout).read_text(encoding="utf-8", errors="replace")
    stderr_text = Path(args.stderr).read_text(encoding="utf-8", errors="replace")
    return validate(stdout_text, stderr_text)


if __name__ == "__main__":
    raise SystemExit(main())
