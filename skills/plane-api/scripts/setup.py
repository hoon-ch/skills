#!/usr/bin/env python3

import argparse
import getpass
import sys

from plane_api import CONFIG_PATH, PlaneApiError, load_persisted_config, test_connection, write_persisted_config


def prompt_value(label, default=None):
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or default


def prompt_secret(label, keep_existing=False):
    suffix = " [press Enter to keep current value]" if keep_existing else ""
    value = getpass.getpass(f"{label}{suffix}: ").strip()
    return value or None


def choose_auth_mode(args, existing):
    if args.api_key and args.oauth_token:
        raise SystemExit("Specify either --api-key or --oauth-token, not both.")
    if args.api_key:
        return "api-key"
    if args.oauth_token:
        return "oauth"
    if args.auth_mode:
        return args.auth_mode
    default = "oauth" if existing.get("oauth_token") else "api-key"
    if not sys.stdin.isatty():
        return default
    choice = prompt_value("Auth mode (api-key/oauth)", default)
    if choice not in {"api-key", "oauth"}:
        raise SystemExit("Auth mode must be 'api-key' or 'oauth'.")
    return choice


def test_saved_config(config):
    settings = {
        "base_url": config["base_url"],
        "workspace_slug": config["workspace_slug"],
        "api_key": config.get("api_key"),
        "oauth_token": config.get("oauth_token"),
    }
    status, body, _headers = test_connection(settings)
    return status, body


def main():
    parser = argparse.ArgumentParser(description="Save persistent defaults for the plane-api skill.")
    parser.add_argument("--base-url")
    parser.add_argument("--workspace")
    parser.add_argument("--api-key")
    parser.add_argument("--oauth-token")
    parser.add_argument("--auth-mode", choices=["api-key", "oauth"])
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-test", action="store_true")
    parser.add_argument("--show-path", action="store_true")
    args = parser.parse_args()

    if args.show_path:
        print(CONFIG_PATH)
        return

    existing = load_persisted_config()
    if CONFIG_PATH.exists() and not args.force and not sys.stdin.isatty():
        raise SystemExit("Config already exists. Re-run with --force to overwrite it in non-interactive mode.")

    base_url = args.base_url or existing.get("base_url")
    workspace_slug = args.workspace or existing.get("workspace_slug")

    if sys.stdin.isatty():
        base_url = prompt_value("Plane base URL", base_url)
        workspace_slug = prompt_value("Workspace slug", workspace_slug)

    if not base_url or not workspace_slug:
        raise SystemExit("Both base URL and workspace slug are required.")

    auth_mode = choose_auth_mode(args, existing)
    keep_existing_secret = bool(existing.get("api_key") if auth_mode == "api-key" else existing.get("oauth_token"))

    if auth_mode == "api-key":
        api_key = args.api_key
        if api_key is None and sys.stdin.isatty():
            api_key = prompt_secret("Plane API key", keep_existing_secret)
        if api_key is None:
            api_key = existing.get("api_key")
        if not api_key:
            raise SystemExit("API key is required for auth mode 'api-key'.")
        config = {
            "base_url": base_url.rstrip("/"),
            "workspace_slug": workspace_slug,
            "api_key": api_key,
            "oauth_token": None,
        }
    else:
        oauth_token = args.oauth_token
        if oauth_token is None and sys.stdin.isatty():
            oauth_token = prompt_secret("Plane OAuth token", keep_existing_secret)
        if oauth_token is None:
            oauth_token = existing.get("oauth_token")
        if not oauth_token:
            raise SystemExit("OAuth token is required for auth mode 'oauth'.")
        config = {
            "base_url": base_url.rstrip("/"),
            "workspace_slug": workspace_slug,
            "api_key": None,
            "oauth_token": oauth_token,
        }

    write_persisted_config(config)
    print(f"Saved config to {CONFIG_PATH}")
    print("Permission mode is set to 600.")

    if args.skip_test:
        print("Skipped connection test.")
        return

    try:
        status, body = test_saved_config(config)
        count = body.get("count") if isinstance(body, dict) else None
        print(f"Connection test succeeded with status {status}.")
        if count is not None:
            print(f"Projects visible to this token: {count}")
    except PlaneApiError as exc:
        print(f"Saved config, but test failed with status {exc.status}.", file=sys.stderr)
        print(f"Reason: {exc.reason}", file=sys.stderr)
        print(exc.body, file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
