#!/usr/bin/env python3

import argparse
import json
import mimetypes
import os
import re
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
CATALOG_PATH = SCRIPT_DIR / "endpoint_catalog.json"
CONFIG_DIR = Path.home() / ".config" / "hoon-ch-skills"
CONFIG_PATH = CONFIG_DIR / "plane-api.json"
CONFIG_VERSION = 1
CATALOG_REQUIRED_KEYS = {
    "group",
    "resource",
    "action",
    "method",
    "path_template",
    "scope",
    "supports_fields",
    "supports_expand",
    "pagination_mode",
    "body_shape_hint",
    "notes",
}
PATH_PARAM_NAMES = [
    "workspace_slug",
    "project_id",
    "project_identifier",
    "work_item_id",
    "state_id",
    "label_id",
    "type_id",
    "property_id",
    "value_id",
    "option_id",
    "link_id",
    "activity_id",
    "comment_id",
    "attachment_id",
    "page_id",
    "cycle_id",
    "module_id",
    "milestone_id",
    "estimate_id",
    "estimate_point_id",
    "worklog_id",
    "epic_id",
    "initiative_id",
    "customer_id",
    "request_id",
    "teamspace_id",
    "invitation_id",
    "member_id",
    "asset_id",
]
COMMON_BODY_FIELDS = {
    "name": "name",
    "title": "title",
    "description_html": "description_html",
    "description_stripped": "description_stripped",
    "priority": "priority",
    "state": "state",
    "access": "access",
    "color": "color",
    "start_date": "start_date",
    "end_date": "end_date",
    "target_date": "target_date",
    "external_id": "external_id",
    "external_source": "external_source",
}
ARRAY_BODY_FIELDS = {
    "project_ids": "project_ids",
    "epic_ids": "epic_ids",
    "label_ids": "label_ids",
    "member_ids": "member_ids",
    "work_item_ids": "work_item_ids",
    "issue_ids": "issue_ids",
    "assignee_ids": "assignee_ids",
}
WORKFLOW_SPECS = {
    "upload-attachment": {
        "kind": "upload",
        "presign_resource": "attachments",
        "presign_action": "create-upload",
        "complete_resource": "attachments",
        "complete_action": "complete-upload",
    },
    "upload-user-asset": {
        "kind": "upload",
        "presign_resource": "user-assets",
        "presign_action": "create-upload",
        "complete_resource": "user-assets",
        "complete_action": "update",
    },
    "upload-workspace-asset": {
        "kind": "upload",
        "presign_resource": "workspace-assets",
        "presign_action": "create-upload",
        "complete_resource": "workspace-assets",
        "complete_action": "update",
    },
    "cycle-add-work-items": {
        "kind": "invoke",
        "resource": "cycles",
        "action": "add-work-items",
        "array_body": ("issue_ids", "work_item_ids"),
    },
    "cycle-remove-work-item": {
        "kind": "invoke",
        "resource": "cycles",
        "action": "remove-work-item",
    },
    "cycle-transfer-work-items": {
        "kind": "invoke",
        "resource": "cycles",
        "action": "transfer-work-items",
        "field_map": {"new_cycle_id": "new_cycle_id"},
    },
    "module-add-work-items": {
        "kind": "invoke",
        "resource": "modules",
        "action": "add-work-items",
        "array_body": ("issues", "work_item_ids"),
    },
    "module-remove-work-item": {
        "kind": "invoke",
        "resource": "modules",
        "action": "remove-work-item",
    },
    "initiative-add-projects": {
        "kind": "invoke",
        "resource": "initiative-projects",
        "action": "add",
        "array_body": ("projects", "project_ids"),
    },
    "initiative-remove-projects": {
        "kind": "invoke",
        "resource": "initiative-projects",
        "action": "remove",
        "array_body": ("projects", "project_ids"),
    },
    "initiative-add-epics": {
        "kind": "invoke",
        "resource": "initiative-epics",
        "action": "add",
        "array_body": ("epics", "epic_ids"),
    },
    "initiative-remove-epics": {
        "kind": "invoke",
        "resource": "initiative-epics",
        "action": "remove",
        "array_body": ("epics", "epic_ids"),
    },
    "initiative-add-labels": {
        "kind": "invoke",
        "resource": "initiative-labels",
        "action": "add-to-initiative",
        "array_body": ("labels", "label_ids"),
    },
    "initiative-remove-labels": {
        "kind": "invoke",
        "resource": "initiative-labels",
        "action": "remove-from-initiative",
        "array_body": ("labels", "label_ids"),
    },
    "teamspace-add-members": {
        "kind": "invoke",
        "resource": "teamspace-members",
        "action": "add",
        "array_body": ("members", "member_ids"),
    },
    "teamspace-remove-members": {
        "kind": "invoke",
        "resource": "teamspace-members",
        "action": "remove",
        "array_body": ("members", "member_ids"),
    },
    "teamspace-add-projects": {
        "kind": "invoke",
        "resource": "teamspace-projects",
        "action": "add",
        "array_body": ("projects", "project_ids"),
    },
    "teamspace-remove-projects": {
        "kind": "invoke",
        "resource": "teamspace-projects",
        "action": "remove",
        "array_body": ("projects", "project_ids"),
    },
    "customer-link-work-items": {
        "kind": "invoke",
        "resource": "customers",
        "action": "link-work-items",
        "array_body": ("issues", "work_item_ids"),
    },
    "customer-unlink-work-item": {
        "kind": "invoke",
        "resource": "customers",
        "action": "unlink-work-item",
    },
    "work-item-page-link-create": {
        "kind": "invoke",
        "resource": "work-item-pages",
        "action": "create",
        "field_map": {"page_id": "page"},
    },
    "work-item-page-link-list": {
        "kind": "invoke",
        "resource": "work-item-pages",
        "action": "list",
    },
    "work-item-page-link-get": {
        "kind": "invoke",
        "resource": "work-item-pages",
        "action": "get",
    },
    "work-item-page-link-delete": {
        "kind": "invoke",
        "resource": "work-item-pages",
        "action": "delete",
    },
    "project-scan": {
        "kind": "scan",
    },
    "pages-probe": {
        "kind": "pages_probe",
    },
}


class PlaneApiError(Exception):
    def __init__(self, status, body, reason, headers=None):
        super().__init__(reason)
        self.status = status
        self.body = body
        self.reason = reason
        self.headers = headers or {}


def parse_json_like(value):
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def parse_kv(value):
    if "=" not in value:
        raise SystemExit(f"Expected key=value, got: {value}")
    key, raw = value.split("=", 1)
    return key.strip(), parse_json_like(raw.strip())


def parse_csv(value):
    if value is None:
        return None
    return [item.strip() for item in value.split(",") if item.strip()]


def read_body_arg(value):
    if value is None:
        return None
    if value.startswith("@"):
        return json.loads(Path(value[1:]).read_text())
    return json.loads(value)


def load_catalog():
    data = json.loads(CATALOG_PATH.read_text())
    return data["entries"]


def load_persisted_config(path=CONFIG_PATH):
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    return data if isinstance(data, dict) else {}


def write_persisted_config(config, path=CONFIG_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(config)
    payload["version"] = CONFIG_VERSION
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    path.chmod(0o600)


def validate_catalog(entries):
    seen = set()
    for index, entry in enumerate(entries):
        missing = CATALOG_REQUIRED_KEYS - set(entry)
        if missing:
            raise SystemExit(f"Catalog entry {index} missing keys: {sorted(missing)}")
        key = (entry["resource"], entry["action"])
        if key in seen:
            raise SystemExit(f"Duplicate catalog entry: {key}")
        seen.add(key)


def find_entry(entries, resource, action):
    for entry in entries:
        if entry["resource"] == resource and entry["action"] == action:
            return entry
    raise SystemExit(f"Catalog entry not found for resource={resource} action={action}")


def pick_value(cli_value, env_name, persisted_value):
    if cli_value not in (None, ""):
        return cli_value, "cli"
    env_value = os.getenv(env_name)
    if env_value not in (None, ""):
        return env_value, "env"
    if persisted_value not in (None, ""):
        return persisted_value, "persisted"
    return None, None


def pick_auth(args, persisted):
    sources = [
        ("cli", {"oauth_token": args.oauth_token, "api_key": args.api_key}),
        ("env", {"oauth_token": os.getenv("PLANE_OAUTH_TOKEN"), "api_key": os.getenv("PLANE_API_KEY")}),
        (
            "persisted",
            {}
            if args.no_persisted_config
            else {
                "oauth_token": persisted.get("oauth_token"),
                "api_key": persisted.get("api_key"),
            },
        ),
    ]
    for source_name, values in sources:
        if values.get("oauth_token") not in (None, ""):
            return "oauth_token", values["oauth_token"], source_name
        if values.get("api_key") not in (None, ""):
            return "api_key", values["api_key"], source_name
    return None, None, None


def redact(value):
    if value in (None, ""):
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def resolve_settings(args, allow_incomplete=False):
    persisted = {} if args.no_persisted_config else load_persisted_config()
    base_url, base_source = pick_value(args.base_url, "PLANE_BASE_URL", persisted.get("base_url"))
    workspace_slug, workspace_source = pick_value(
        args.workspace, "PLANE_WORKSPACE_SLUG", persisted.get("workspace_slug")
    )
    auth_kind, auth_value, auth_source = pick_auth(args, persisted)

    settings = {
        "base_url": base_url.rstrip("/") if base_url else None,
        "workspace_slug": workspace_slug,
        "api_key": auth_value if auth_kind == "api_key" else None,
        "oauth_token": auth_value if auth_kind == "oauth_token" else None,
        "_config_path": str(CONFIG_PATH),
        "_persisted_exists": CONFIG_PATH.exists(),
        "_sources": {
            "base_url": base_source,
            "workspace_slug": workspace_source,
            "auth": auth_source,
            "auth_kind": auth_kind,
        },
    }

    if allow_incomplete:
        return settings

    missing = []
    if not settings["base_url"]:
        missing.append("PLANE_BASE_URL")
    if not settings["workspace_slug"]:
        missing.append("PLANE_WORKSPACE_SLUG")
    if not auth_kind:
        missing.append("PLANE_API_KEY or PLANE_OAUTH_TOKEN")
    if missing:
        hint = " Run `python scripts/setup.py` to save defaults for future use."
        raise SystemExit(f"Missing Plane configuration: {', '.join(missing)}.{hint}")
    return settings


def auth_headers(settings):
    if settings["oauth_token"]:
        return {"Authorization": f"Bearer {settings['oauth_token']}"}
    return {"X-API-Key": settings["api_key"]}


def infer_reason(status, body):
    if isinstance(body, dict) and body.get("cloudflare_error"):
        code = body.get("error_code")
        if code == 1010:
            return "Cloudflare blocked the request based on the client signature. Try a different User-Agent or network path."
        return "Cloudflare blocked the request before Plane handled it."
    if status in (401, 403):
        return "Authentication failed or the token lacks permission."
    if status == 404:
        return "Resource not found or endpoint path does not match the deployed Plane server."
    if status == 429:
        return "Plane API rate limit exceeded."
    if status >= 500:
        return "Plane server error."
    if body:
        return "Plane API returned an error response."
    return "Request failed."


def parse_body(raw):
    if raw == "":
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def build_url(settings, path):
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not path.startswith("/"):
        path = "/" + path
    return settings["base_url"] + path


def encode_query(query):
    items = []
    for key, value in query.items():
        if value is None or value == "":
            continue
        if isinstance(value, list):
            items.append((key, ",".join(str(v) for v in value)))
        else:
            items.append((key, str(value)))
    return urllib.parse.urlencode(items)


def api_request(settings, method, path, data=None, headers=None, query=None):
    url = build_url(settings, path)
    if query:
        encoded = encode_query(query)
        if encoded:
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}{encoded}"

    payload = None if data is None else json.dumps(data).encode("utf-8")
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "curl/8.7.1",
        **auth_headers(settings),
    }
    if headers:
        request_headers.update(headers)
    if payload is not None:
        request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, data=payload, headers=request_headers, method=method.upper())
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return response.status, parse_body(raw), dict(response.headers.items())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        body = parse_body(raw)
        raise PlaneApiError(exc.code, body, infer_reason(exc.code, body), dict(exc.headers.items())) from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Network error: {exc}") from exc


def rate_limit_info(headers):
    mapping = {k.lower(): v for k, v in headers.items()}
    remaining = mapping.get("x-ratelimit-remaining")
    reset = mapping.get("x-ratelimit-reset")
    if remaining is None and reset is None:
        return None
    return {"remaining": remaining, "reset": reset}


def print_output(status, body, headers, pretty, meta=None):
    payload = {"status": status, "body": body}
    rate = rate_limit_info(headers)
    if rate:
        payload["rate_limit"] = rate
    if meta:
        payload["meta"] = meta
    if pretty:
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(json.dumps(payload, ensure_ascii=False))


def print_error(exc, pretty):
    payload = {"status": exc.status, "reason": exc.reason, "body": exc.body}
    rate = rate_limit_info(exc.headers)
    if rate:
        payload["rate_limit"] = rate
    if pretty:
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), file=sys.stderr)
    else:
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)


def add_common_auth_flags(parser):
    parser.add_argument("--base-url")
    parser.add_argument("--workspace")
    parser.add_argument("--api-key")
    parser.add_argument("--oauth-token")
    parser.add_argument("--no-persisted-config", action="store_true")
    parser.add_argument("--pretty", action="store_true")


def add_query_flags(parser):
    parser.add_argument("--fields")
    parser.add_argument("--expand")
    parser.add_argument("--per-page", type=int)
    parser.add_argument("--cursor")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--offset", type=int)
    parser.add_argument("--order-by")
    parser.add_argument("--query", action="append", default=[])


def add_request_body_flags(parser):
    parser.add_argument("--body")
    parser.add_argument("--data")
    parser.add_argument("--set", action="append", default=[])


def add_known_param_flags(parser):
    for name in PATH_PARAM_NAMES:
        parser.add_argument(f"--{name.replace('_', '-')}")
    for name in COMMON_BODY_FIELDS:
        parser.add_argument(f"--{name.replace('_', '-')}")
    for name in ARRAY_BODY_FIELDS:
        parser.add_argument(f"--{name.replace('_', '-')}")
    parser.add_argument("--new-cycle-id")
    parser.add_argument("--header", action="append", default=[])
    parser.add_argument("--param", action="append", default=[])


def collect_known_params(args, settings):
    values = {"workspace_slug": settings["workspace_slug"]}
    for name in PATH_PARAM_NAMES:
        value = getattr(args, name, None)
        if value is not None:
            values[name] = value
    for item in getattr(args, "param", []) or []:
        key, value = parse_kv(item)
        values[key] = value
    return values


def collect_query(args):
    query = {}
    if getattr(args, "fields", None):
        query["fields"] = args.fields
    if getattr(args, "expand", None):
        query["expand"] = args.expand
    if getattr(args, "per_page", None) is not None:
        query["per_page"] = args.per_page
    if getattr(args, "cursor", None):
        query["cursor"] = args.cursor
    if getattr(args, "limit", None) is not None:
        query["limit"] = args.limit
    if getattr(args, "offset", None) is not None:
        query["offset"] = args.offset
    if getattr(args, "order_by", None):
        query["order_by"] = args.order_by
    for item in getattr(args, "query", []) or []:
        key, value = parse_kv(item)
        query[key] = value
    return query


def collect_body(args):
    if getattr(args, "body", None):
        return read_body_arg(args.body)
    if getattr(args, "data", None):
        return read_body_arg(args.data)

    body = {}
    for attr, field_name in COMMON_BODY_FIELDS.items():
        value = getattr(args, attr, None)
        if value is not None:
            body[field_name] = value
    for attr, field_name in ARRAY_BODY_FIELDS.items():
        value = getattr(args, attr, None)
        if value:
            body[field_name] = parse_csv(value)
    if getattr(args, "new_cycle_id", None):
        body["new_cycle_id"] = args.new_cycle_id
    for item in getattr(args, "set", []) or []:
        key, value = parse_kv(item)
        body[key] = value
    return body or None


def collect_extra_headers(args):
    headers = {}
    for item in getattr(args, "header", []) or []:
        key, value = item.split("=", 1)
        headers[key.strip()] = value.strip()
    return headers


def render_path(template, params):
    placeholders = re.findall(r"{([^}]+)}", template)
    missing = [name for name in placeholders if params.get(name) in (None, "")]
    if missing:
        raise SystemExit(f"Missing path parameters: {', '.join(sorted(missing))}")
    path = template
    for name in placeholders:
        path = path.replace("{" + name + "}", str(params[name]))
    return path


def test_connection(settings):
    return api_request(
        settings,
        method="GET",
        path=f"/api/v1/workspaces/{settings['workspace_slug']}/projects/",
        query={"per_page": 1},
    )


def cmd_request(args, settings, entries):
    headers = collect_extra_headers(args)
    body = collect_body(args)
    query = collect_query(args)
    status, payload, response_headers = api_request(
        settings,
        method=args.method,
        path=args.path,
        data=body,
        headers=headers,
        query=query,
    )
    print_output(status, payload, response_headers, args.pretty)


def cmd_catalog_list(args, settings, entries):
    filtered = entries
    if args.group:
        filtered = [entry for entry in filtered if entry["group"] == args.group]
    if args.resource:
        filtered = [entry for entry in filtered if entry["resource"] == args.resource]
    if args.action:
        filtered = [entry for entry in filtered if entry["action"] == args.action]

    if args.pretty:
        print(json.dumps({"count": len(filtered), "entries": filtered}, ensure_ascii=False, indent=2, sort_keys=True))
        return

    for entry in filtered:
        print(f"{entry['group']}\t{entry['resource']}\t{entry['action']}\t{entry['method']}\t{entry['path_template']}")


def cmd_catalog_show(args, settings, entries):
    entry = find_entry(entries, args.resource, args.action)
    print(json.dumps(entry, ensure_ascii=False, indent=2, sort_keys=True))


def cmd_catalog_validate(args, settings, entries):
    validate_catalog(entries)
    summary = {}
    for entry in entries:
        summary.setdefault(entry["group"], 0)
        summary[entry["group"]] += 1
    print(json.dumps({"count": len(entries), "groups": summary}, ensure_ascii=False, indent=2, sort_keys=True))


def cmd_invoke(args, settings, entries):
    entry = find_entry(entries, args.resource, args.action)
    params = collect_known_params(args, settings)
    query = collect_query(args)
    headers = collect_extra_headers(args)
    body = collect_body(args)
    path = render_path(entry["path_template"], params)
    status, payload, response_headers = api_request(
        settings,
        method=entry["method"],
        path=path,
        data=body,
        headers=headers,
        query=query,
    )
    print_output(status, payload, response_headers, args.pretty, meta={"resource": args.resource, "action": args.action})


def cmd_doctor(args, settings, entries):
    persisted = {} if args.no_persisted_config else load_persisted_config()
    payload = {
        "config_path": settings["_config_path"],
        "persisted_exists": settings["_persisted_exists"],
        "resolved": {
            "base_url": settings["base_url"],
            "workspace_slug": settings["workspace_slug"],
            "auth_kind": settings["_sources"]["auth_kind"],
            "api_key": redact(settings["api_key"]),
            "oauth_token": redact(settings["oauth_token"]),
        },
        "sources": settings["_sources"],
        "persisted_keys": sorted(persisted.keys()),
    }
    missing = []
    if not settings["base_url"]:
        missing.append("base_url")
    if not settings["workspace_slug"]:
        missing.append("workspace_slug")
    if not settings["_sources"]["auth_kind"]:
        missing.append("auth")
    payload["missing"] = missing

    if args.test and not missing:
        try:
            status, body, headers = test_connection(settings)
            payload["test"] = {"status": status, "body": body, "rate_limit": rate_limit_info(headers)}
        except PlaneApiError as exc:
            payload["test"] = {"status": exc.status, "body": exc.body, "reason": exc.reason}
    elif args.test:
        payload["test"] = {
            "status": "skipped",
            "reason": "Configuration is incomplete. Run `python scripts/setup.py` first.",
        }

    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def scan_section(settings, entries, resource, action, params, query=None):
    entry = find_entry(entries, resource, action)
    path = render_path(entry["path_template"], params)
    try:
        status, body, headers = api_request(
            settings,
            entry["method"],
            path,
            query=query,
        )
        return {
            "resource": resource,
            "action": action,
            "status": status,
            "body": body,
            "rate_limit": rate_limit_info(headers),
        }
    except PlaneApiError as exc:
        payload = {
            "resource": resource,
            "action": action,
            "status": exc.status,
            "reason": exc.reason,
            "body": exc.body,
        }
        if exc.status == 404:
            payload["unavailable_on_deployment"] = True
        return payload


def project_scan_summary(scan_results, preview_count):
    project_body = scan_results["project"].get("body")
    states_body = scan_results["states"].get("body")
    labels_body = scan_results["labels"].get("body")
    modules_body = scan_results["modules"].get("body")
    work_items_body = scan_results["work_items"].get("body")
    features_result = scan_results["project_features"]

    project_summary = None
    if isinstance(project_body, dict):
        project_summary = {
            "id": project_body.get("id"),
            "name": project_body.get("name"),
            "identifier": project_body.get("identifier"),
            "description": project_body.get("description"),
            "page_view": project_body.get("page_view"),
            "module_view": project_body.get("module_view"),
            "cycle_view": project_body.get("cycle_view"),
            "intake_view": project_body.get("intake_view"),
            "issue_views_view": project_body.get("issue_views_view"),
            "is_issue_type_enabled": project_body.get("is_issue_type_enabled"),
            "is_time_tracking_enabled": project_body.get("is_time_tracking_enabled"),
        }

    def summarize_collection(body, name_key="name", extra_keys=None):
        extra_keys = extra_keys or []
        if not isinstance(body, dict):
            return {"count": None, "preview": []}
        results = body.get("results", [])
        preview = []
        for item in results[:preview_count]:
            row = {"id": item.get("id"), name_key: item.get(name_key)}
            for key in extra_keys:
                row[key] = item.get(key)
            preview.append(row)
        return {
            "count": body.get("total_count", body.get("count")),
            "preview": preview,
        }

    summary = {
        "project": project_summary,
        "states": summarize_collection(states_body, extra_keys=["group"]),
        "labels": summarize_collection(labels_body),
        "modules": summarize_collection(modules_body, extra_keys=["status", "total_issues"]),
        "work_items": summarize_collection(work_items_body, extra_keys=["state", "priority", "sequence_id"]),
        "project_features": None,
    }

    if features_result.get("status") == 200 and not features_result.get("unavailable_on_deployment"):
        summary["project_features"] = {
            "available": True,
            "data": features_result["body"],
        }
    else:
        summary["project_features"] = {
            "available": False,
            "status": features_result.get("status"),
            "reason": features_result.get("reason"),
            "unavailable_on_deployment": features_result.get("unavailable_on_deployment", False),
            "body": features_result.get("body"),
        }

    return summary


def make_multipart_body(fields, file_path, content_type):
    boundary = f"----plane-api-{uuid.uuid4().hex}"
    chunks = []

    def add_text(name, value):
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(f"{value}\r\n".encode())

    for key, value in fields.items():
        add_text(key, value)

    filename = Path(file_path).name
    file_bytes = Path(file_path).read_bytes()
    chunks.append(f"--{boundary}\r\n".encode())
    chunks.append(
        (
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode()
    )
    chunks.append(file_bytes)
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return boundary, b"".join(chunks)


def raw_upload(url, fields, file_path, content_type):
    boundary, body = make_multipart_body(fields, file_path, content_type)
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "curl/8.7.1"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return response.status, parse_body(raw), dict(response.headers.items())


def workflow_upload(args, settings, entries, spec):
    file_path = Path(args.file)
    if not file_path.exists():
        raise SystemExit(f"File not found: {file_path}")
    content_type = args.content_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    presign_entry = find_entry(entries, spec["presign_resource"], spec["presign_action"])
    params = collect_known_params(args, settings)
    presign_path = render_path(presign_entry["path_template"], params)
    presign_body = {
        "name": file_path.name,
        "type": content_type,
        "size": file_path.stat().st_size,
    }
    if args.external_id:
        presign_body["external_id"] = args.external_id
    if args.external_source:
        presign_body["external_source"] = args.external_source

    if args.dry_run:
        output = {
            "workflow": args.workflow_name,
            "steps": [
                {"step": 1, "method": presign_entry["method"], "path": presign_path, "body": presign_body},
                {"step": 2, "method": "POST", "path": "<presigned upload_data.url>", "body": "<multipart form upload>"},
                {"step": 3, "method": "PATCH", "path": "<completion path>", "body": None},
            ],
            "note": "Use --execute to run the upload workflow.",
        }
        print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
        return

    status, payload, response_headers = api_request(settings, presign_entry["method"], presign_path, presign_body)
    upload_data = payload.get("upload_data", {}) if isinstance(payload, dict) else {}
    upload_url = upload_data.get("url")
    fields = upload_data.get("fields")
    asset_id = None
    if isinstance(payload, dict):
        asset_id = payload.get("asset_id") or payload.get("attachment", {}).get("id")
    if not upload_url or not fields:
        raise SystemExit("Upload credentials response did not include upload_data.url and upload_data.fields")

    upload_status, upload_body, _upload_headers = raw_upload(upload_url, fields, str(file_path), content_type)

    complete_entry = find_entry(entries, spec["complete_resource"], spec["complete_action"])
    complete_params = dict(params)
    complete_params["asset_id"] = asset_id
    complete_params["attachment_id"] = asset_id
    complete_path = render_path(complete_entry["path_template"], complete_params)
    complete_status, complete_payload, complete_headers = api_request(
        settings, complete_entry["method"], complete_path, None
    )

    print(
        json.dumps(
            {
                "workflow": args.workflow_name,
                "presign": {"status": status, "body": payload, "rate_limit": rate_limit_info(response_headers)},
                "upload": {"status": upload_status, "body": upload_body},
                "complete": {
                    "status": complete_status,
                    "body": complete_payload,
                    "rate_limit": rate_limit_info(complete_headers),
                },
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


def workflow_invoke(args, settings, entries, spec):
    entry = find_entry(entries, spec["resource"], spec["action"])
    params = collect_known_params(args, settings)
    body = {}
    if "array_body" in spec:
        body_key, source_attr = spec["array_body"]
        raw = getattr(args, source_attr, None)
        if not raw:
            raise SystemExit(f"--{source_attr.replace('_', '-')} is required")
        body[body_key] = parse_csv(raw)
    if "field_map" in spec:
        for field_name, source_attr in spec["field_map"].items():
            value = getattr(args, source_attr, None)
            if value is None:
                raise SystemExit(f"--{source_attr.replace('_', '-')} is required")
            body[field_name] = value
    query = collect_query(args)
    path = render_path(entry["path_template"], params)
    if args.dry_run:
        print(
            json.dumps(
                {
                    "workflow": args.workflow_name,
                    "method": entry["method"],
                    "path": path,
                    "body": body or None,
                    "query": query or None,
                    "note": "Use --execute to perform the request.",
                },
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
        )
        return
    status, payload, headers = api_request(
        settings,
        entry["method"],
        path,
        data=body or None,
        query=query,
    )
    print_output(status, payload, headers, args.pretty, meta={"workflow": args.workflow_name})


def workflow_project_scan(args, settings, entries):
    params = collect_known_params(args, settings)
    preview_count = args.per_page or 5
    list_query = {"per_page": preview_count}

    scan_results = {
        "project": scan_section(settings, entries, "projects", "get", params),
        "states": scan_section(settings, entries, "states", "list", params, list_query),
        "labels": scan_section(settings, entries, "labels", "list", params, list_query),
        "modules": scan_section(settings, entries, "modules", "list", params, list_query),
        "work_items": scan_section(settings, entries, "work-items", "list", params, list_query),
        "project_features": scan_section(settings, entries, "project-features", "get", params),
    }

    payload = {
        "workflow": args.workflow_name,
        "project_id": params.get("project_id"),
        "preview_count": preview_count,
        "summary": project_scan_summary(scan_results, preview_count),
        "sections": scan_results,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def probe_get(settings, label, path, query=None):
    try:
        status, body, headers = api_request(settings, "GET", path, query=query)
        return {
            "label": label,
            "method": "GET",
            "path": path,
            "status": status,
            "body": body,
            "rate_limit": rate_limit_info(headers),
        }
    except PlaneApiError as exc:
        payload = {
            "label": label,
            "method": "GET",
            "path": path,
            "status": exc.status,
            "reason": exc.reason,
            "body": exc.body,
        }
        if exc.status == 404:
            payload["unavailable_on_deployment"] = True
        return payload


def workflow_pages_probe(args, settings, entries):
    params = collect_known_params(args, settings)
    project_id = params.get("project_id")
    if not project_id:
        raise SystemExit("--project-id is required")

    workspace_slug = params["workspace_slug"]
    project_path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/"
    workspace_pages_path = f"/api/v1/workspaces/{workspace_slug}/pages/"
    project_pages_path = f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/pages/"
    app_project_pages_path = f"/api/workspaces/{workspace_slug}/projects/{project_id}/pages/"

    probes = [
        probe_get(settings, "project", project_path),
        probe_get(
            settings,
            "workspace_pages_collection",
            workspace_pages_path,
            query={"per_page": args.per_page or 5},
        ),
        probe_get(
            settings,
            "project_pages_collection",
            project_pages_path,
            query={"per_page": args.per_page or 5},
        ),
        probe_get(
            settings,
            "app_project_pages_collection",
            app_project_pages_path,
            query={"per_page": args.per_page or 5},
        ),
    ]

    if params.get("work_item_id"):
        work_item_pages_path = (
            f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/"
            f"work-items/{params['work_item_id']}/pages/"
        )
        probes.append(
            probe_get(
                settings,
                "work_item_page_links_collection",
                work_item_pages_path,
                query={"per_page": args.per_page or 5},
            )
        )

    project_probe = probes[0]
    project_body = project_probe.get("body") if project_probe.get("status") == 200 else None
    page_view = project_body.get("page_view") if isinstance(project_body, dict) else None
    project_pages_probe = probes[2]
    app_project_pages_probe = probes[3]
    workspace_pages_probe = probes[1]

    if (
        project_probe.get("status") == 200
        and project_pages_probe.get("status") == 404
        and app_project_pages_probe.get("status") in (200, 401, 403)
    ):
        conclusion = (
            "Project access works and Plane exposes pages through its app route, but the documented "
            "API-key /api/v1 project pages route is not available on this deployment."
        )
        recommendation = (
            "Treat project pages as unsupported by the official API-key surface unless this deployment "
            "adds a bridge or Plane exposes the route in a later version. Use session-auth app APIs only "
            "for browser-like automation, or fall back to work items/repo docs."
        )
    elif project_probe.get("status") == 200 and project_pages_probe.get("status") == 404:
        conclusion = (
            "Project access works, but the documented project pages collection route is not matched "
            "by this deployment's public /api/v1 router."
        )
        recommendation = (
            "Do not retry project page creation through the same API-key route. Use a work item or repo "
            "document as the fallback, then inspect the Plane server version, route table, or session-only app API."
        )
    elif project_pages_probe.get("status") == 200:
        conclusion = "The documented project pages collection route is available on this deployment."
        recommendation = "Project page create/get calls can use the catalog-backed pages endpoints."
    elif project_pages_probe.get("status") in (401, 403):
        conclusion = "The project pages route exists or is protected, but this token cannot access it."
        recommendation = (
            "Check whether the route requires a different token scope, OAuth bearer auth, "
            "or browser session auth."
        )
    else:
        conclusion = "Project pages availability is inconclusive from the public /api/v1 probe."
        recommendation = "Compare the deployed Plane version and route table against the official API docs."

    payload = {
        "workflow": args.workflow_name,
        "project_id": project_id,
        "work_item_id": params.get("work_item_id"),
        "summary": {
            "project_accessible": project_probe.get("status") == 200,
            "page_view": page_view,
            "workspace_pages_status": workspace_pages_probe.get("status"),
            "project_pages_status": project_pages_probe.get("status"),
            "app_project_pages_status": app_project_pages_probe.get("status"),
            "project_pages_unavailable_on_deployment": project_pages_probe.get(
                "unavailable_on_deployment", False
            ),
            "conclusion": conclusion,
            "recommendation": recommendation,
        },
        "probes": probes,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def cmd_workflow(args, settings, entries):
    spec = WORKFLOW_SPECS[args.workflow_name]
    if spec["kind"] == "upload":
        return workflow_upload(args, settings, entries, spec)
    if spec["kind"] == "scan":
        return workflow_project_scan(args, settings, entries)
    if spec["kind"] == "pages_probe":
        return workflow_pages_probe(args, settings, entries)
    return workflow_invoke(args, settings, entries, spec)


def build_parser():
    parser = argparse.ArgumentParser(description="Generic Plane HTTP API client for official /api/v1 endpoints.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    request = subparsers.add_parser("request", help="Send an arbitrary Plane HTTP request.")
    add_common_auth_flags(request)
    add_query_flags(request)
    add_request_body_flags(request)
    add_known_param_flags(request)
    request.add_argument("--method", required=True, choices=["GET", "POST", "PATCH", "DELETE"])
    request.add_argument("--path", required=True)
    request.set_defaults(handler=cmd_request)

    catalog = subparsers.add_parser("catalog", help="Inspect the endpoint catalog.")
    catalog_subparsers = catalog.add_subparsers(dest="catalog_command", required=True)
    catalog_list = catalog_subparsers.add_parser("list", help="List catalog entries.")
    catalog_list.add_argument("--group")
    catalog_list.add_argument("--resource")
    catalog_list.add_argument("--action")
    catalog_list.add_argument("--pretty", action="store_true")
    catalog_list.set_defaults(handler=cmd_catalog_list)
    catalog_show = catalog_subparsers.add_parser("show", help="Show one catalog entry.")
    catalog_show.add_argument("resource")
    catalog_show.add_argument("action")
    catalog_show.set_defaults(handler=cmd_catalog_show)
    catalog_validate = catalog_subparsers.add_parser("validate", help="Validate the catalog file.")
    catalog_validate.set_defaults(handler=cmd_catalog_validate)

    doctor = subparsers.add_parser("doctor", help="Show resolved configuration and optionally test it.")
    add_common_auth_flags(doctor)
    doctor.add_argument("--test", action="store_true")
    doctor.set_defaults(handler=cmd_doctor)

    invoke = subparsers.add_parser("invoke", help="Invoke a catalog-backed action.")
    add_common_auth_flags(invoke)
    add_query_flags(invoke)
    add_request_body_flags(invoke)
    add_known_param_flags(invoke)
    invoke.add_argument("resource")
    invoke.add_argument("action")
    invoke.set_defaults(handler=cmd_invoke)

    workflow = subparsers.add_parser("workflow", help="Run a multi-step or aliased workflow.")
    workflow_subparsers = workflow.add_subparsers(dest="workflow_name", required=True)
    for workflow_name, spec in WORKFLOW_SPECS.items():
        wf = workflow_subparsers.add_parser(workflow_name, help=workflow_name)
        add_common_auth_flags(wf)
        add_query_flags(wf)
        add_known_param_flags(wf)
        wf.add_argument("--dry-run", action="store_true")
        wf.add_argument("--execute", action="store_true")
        if spec["kind"] == "upload":
            wf.add_argument("--file", required=True)
            wf.add_argument("--content-type")
        wf.set_defaults(handler=cmd_workflow)

    return parser


def main():
    entries = load_catalog()
    validate_catalog(entries)
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "catalog":
        return args.handler(args, None, entries)

    allow_incomplete = args.command == "doctor"
    settings = resolve_settings(args, allow_incomplete=allow_incomplete)
    if args.command == "workflow" and not args.execute:
        args.dry_run = True
    try:
        args.handler(args, settings, entries)
    except PlaneApiError as exc:
        print_error(exc, getattr(args, "pretty", False))
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
