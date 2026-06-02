# Harbor Credentials

Use this reference before running Harbor API operations that need
authentication.

## Account Choice

Choose the credential by task type:

- Operator account: project creation, scanner settings, retention, immutability,
  replication, GC, RBAC, OIDC, system configuration, and incident response.
- Robot account: image push, image pull, CI/CD, Kubernetes `imagePullSecret`,
  and other artifact automation.

Do not use a broad operator account for routine artifact push/pull automation.
Do not expect a robot account to be enough for registry administration.

## Credential Resolution Order

Prefer the first available source that matches the user's environment:

1. Explicit environment variables for one-off work.
2. A configured command reference such as `password_cmd`.
3. 1Password CLI `op`.
4. Apple Keychain `security`.
5. Windows Credential Manager through PowerShell.
6. Freedesktop Secret Service through `secret-tool`.
7. `pass` or another CLI password manager through a configured command.
8. `.netrc` for curl-only workflows.
9. Prompt the user when no safe non-interactive source exists.

Never store raw passwords or tokens in `SKILL.md`, reference files, repo files,
chat output, shell history, or long-lived plaintext config.

## Optional Hint File

If the user wants smooth repeated API access, they may create:

```json
{
  "base_url": "https://harbor.example.com",
  "operator_user": "user@example.com",
  "operator_password_cmd": "op read 'op://Infra/Harbor Operator/password'",
  "robot_user": "robot$ci-push",
  "robot_password_cmd": "op read 'op://Infra/Harbor Robot/token'"
}
```

This file may contain usernames, URLs, and commands that retrieve secrets. It
must not contain the secret values themselves.

Treat `*_password_cmd` values as trusted local commands configured by the user.
Run them with `bash -c "$HARBOR_PASSWORD_CMD"` so quoted secret paths with
spaces are parsed correctly.

## Backend Examples

1Password:

```bash
HARBOR_PASSWORD="$(op read 'op://Infra/Harbor Operator/password')"
```

Apple Keychain:

```bash
security add-generic-password -U -s harbor-api -a "$HARBOR_USER" -w
HARBOR_PASSWORD="$(security find-generic-password -s harbor-api -a "$HARBOR_USER" -w)"
```

Windows Credential Manager through the community `CredentialManager` PowerShell
module:

```powershell
Install-Module CredentialManager -Scope CurrentUser
$cred = Get-StoredCredential -Target "harbor-api"
$env:HARBOR_USER = $cred.UserName
$env:HARBOR_PASSWORD = $cred.GetNetworkCredential().Password
```

Freedesktop Secret Service:

```bash
HARBOR_PASSWORD="$(secret-tool lookup service harbor-api username "$HARBOR_USER")"
```

Pass:

```bash
HARBOR_PASSWORD="$(pass show infra/harbor/operator)"
```

Environment variables:

```bash
export HARBOR_URL=https://harbor.example.com
export HARBOR_USER=user@example.com
export HARBOR_PASSWORD_CMD="op read 'op://Infra/Harbor Operator/password'"
```

Use `HARBOR_PASSWORD` directly only for short-lived interactive sessions. Prefer
`HARBOR_PASSWORD_CMD` for repeatable work so the secret stays in the user's
password manager or OS keychain.

`.netrc`:

```text
machine harbor.example.com
  login user@example.com
  password <token>
```

Use `.netrc` only with restrictive permissions:

```bash
chmod 600 ~/.netrc
curl --netrc-file ~/.netrc "$HARBOR_URL/api/v2.0/projects"
```

## API Call Pattern

Prefer building credentials in local variables and avoid printing them:

```bash
HARBOR_URL="${HARBOR_URL:-https://harbor.example.com}"
HARBOR_USER="${HARBOR_USER:-user@example.com}"
HARBOR_PASSWORD="$(bash -c "$HARBOR_PASSWORD_CMD")"
HARBOR_HOST="${HARBOR_URL#https://}"
HARBOR_HOST="${HARBOR_HOST#http://}"
HARBOR_HOST="${HARBOR_HOST%%/*}"

curl -fsS --netrc-file <(printf 'machine %s login %s password %s\n' \
  "$HARBOR_HOST" "$HARBOR_USER" "$HARBOR_PASSWORD") \
  "$HARBOR_URL/api/v2.0/projects?page_size=50" | jq
```

The process-substitution form above expects Bash or Zsh. If the shell does not
support `<(...)`, write a temporary netrc file with mode `600`, use it once, and
remove it immediately.

If the credential backend is locked or unavailable, stop and ask the user to
unlock or provide the correct secret source. Do not fall back to searching
history, dotfiles, logs, or Kubernetes Secret dumps for credentials.
