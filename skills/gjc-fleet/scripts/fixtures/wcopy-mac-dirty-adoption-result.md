## Summary

Inventory complete. The current parser covers most GUI device operations, but `rust/wcopy-cli/src/main.rs` rejects every parsed command as unsupported. Implementing executable parity would require reserved pre-existing dirty paths, so no product code was changed. The reserved set remains preserved.

## Findings

- **P0:** CLI dispatch is an unsupported-command stub for every operation.
- **P1:** GUI `keys_builtin_count` has no matching CLI command.
- **P1:** Native Rust ABI dispatch is limited to `info`, `read`, `safe_write`, and `deep_decode`; GUI APDU, NTAG, format, clone, and Chameleon verbs have no CLI adapter.
- **P2:** Focused tests pass but report three dead-code warnings in reserved `output.rs`.

## Fixed

None. Product paths touched: none.

## Withdrawn

None.

## Out of scope

Reserved CLI/backend integration, GUI/probe/docs changes, and hardware verification.

## Verification

- **Live:** `/Users/hoon-ch/.cargo/bin/cargo test -p wcopy` - 9 passed, 0 failed, 3 warnings. Full output: `artifact://11`.
- **Gated:** no global gate run; it is needed after reserved backend integration lands.
- **Skip:** hardware behavior was not claimed.
- Evidence: external bounded status, worker report, and test ledger artifacts.

FIX_DONE fixed=0 withdrawn=0 out_of_scope=3 verification=live owned_paths=0 reserved_preserved=true
