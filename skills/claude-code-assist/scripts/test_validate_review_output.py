#!/usr/bin/env python3

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "validate_review_output.py"


class ValidateReviewOutputTest(unittest.TestCase):
    def run_validator(self, stdout_text: str, stderr_text: str = "") -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            stdout_path = tmp / "stdout.md"
            stderr_path = tmp / "stderr.log"
            stdout_path.write_text(stdout_text, encoding="utf-8")
            stderr_path.write_text(stderr_text, encoding="utf-8")
            return subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--stdout",
                    str(stdout_path),
                    "--stderr",
                    str(stderr_path),
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

    def test_findings_marker_first_line_passes(self) -> None:
        result = self.run_validator(
            "Findings\n\n- [P1] Missing retry guard in review output handling.\n"
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_exact_no_findings_passes(self) -> None:
        result = self.run_validator("No findings.\n")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_previous_message_response_fails(self) -> None:
        result = self.run_validator(
            "The review is already delivered in the previous message - 11 findings.\n"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("previous-message reference", result.stderr)

    def test_marker_not_first_non_empty_line_fails(self) -> None:
        result = self.run_validator("I will review this now.\n\nFindings\n- [P1] Issue.\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("first non-empty line", result.stderr)

    def test_no_findings_with_extra_text_fails(self) -> None:
        result = self.run_validator("No findings.\n\nReviewed the plan successfully.\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No findings", result.stderr)

    def test_auth_failure_in_stderr_fails(self) -> None:
        result = self.run_validator("Findings\n- [P1] Issue.\n", "Error: status 401\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("infrastructure failure", result.stderr)


if __name__ == "__main__":
    unittest.main()
