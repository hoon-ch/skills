/**
 * Run-owned repository runtime state.
 *
 * Git intentionally does not describe ignored runtime state such as a
 * repo-local .gjc directory.  This helper snapshots that state outside the
 * product tree, classifies only run-owned additions as disposable, and
 * preserves pre-existing or unexplained state.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { BUDGETS, boundedUtf8, compactSample, uniqueSorted } from "./budget.mjs";

export const REPO_RUNTIME_ROOT = ".gjc";
export const RESOURCE_SNAPSHOT_SCHEMA = "gjc-fleet-resource-snapshot/v1";
const MAX_ENTRIES = 20_000;
const MAX_HASH_BYTES = 32 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/i;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function boundedPath(value) {
  return boundedUtf8(String(value ?? "").replaceAll("\\", "/"), BUDGETS.pathSampleItemMaxBytes);
}

function pathIsInsideRuntime(path) {
  const normalized = String(path ?? "").replaceAll("\\", "/").replace(/^\.\/+/, "");
  return normalized === REPO_RUNTIME_ROOT || normalized.startsWith(`${REPO_RUNTIME_ROOT}/`);
}

function externalArtifactPath(path, repoRoot) {
  if (!isAbsolute(path)) throw new Error("resource snapshot artifact must be an absolute path");
  const artifact = resolve(path);
  const root = resolve(repoRoot);
  if (artifact === root || artifact.startsWith(`${root}/`)) {
    throw new Error("resource snapshot artifact must be outside the target repository");
  }
  mkdirSync(resolve(artifact, ".."), { recursive: true });
  return artifact;
}

function fileDescriptor(absolute, relativePath, entries) {
  if (entries.length >= MAX_ENTRIES) return;
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    entries.push({ path: relativePath, type: "unreadable", size: null, sha256: null });
    return;
  }
  if (stat.isDirectory()) {
    entries.push({ path: relativePath, type: "directory", size: 0, sha256: null });
    let children = [];
    try {
      children = readdirSync(absolute).sort();
    } catch {
      entries.push({ path: `${relativePath}/<unreadable>`, type: "unreadable", size: null, sha256: null });
      return;
    }
    for (const child of children) {
      fileDescriptor(join(absolute, child), `${relativePath}/${child}`, entries);
      if (entries.length >= MAX_ENTRIES) return;
    }
    return;
  }
  if (stat.isSymbolicLink()) {
    let target = "";
    try {
      target = readlinkSync(absolute);
    } catch {
      target = "";
    }
    entries.push({
      path: relativePath,
      type: "symlink",
      size: stat.size,
      sha256: digest(Buffer.from(target, "utf8")),
    });
    return;
  }
  if (!stat.isFile()) {
    entries.push({ path: relativePath, type: "other", size: stat.size, sha256: null });
    return;
  }
  let sha256 = null;
  if (stat.size <= MAX_HASH_BYTES) {
    try {
      sha256 = digest(readFileSync(absolute));
    } catch {
      sha256 = null;
    }
  }
  entries.push({
    path: relativePath,
    type: "file",
    size: stat.size,
    sha256,
  });
}

function shallowDescriptor(absolute, relativePath) {
  try {
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) return { path: relativePath, type: "directory", size: 0, sha256: null };
    if (stat.isSymbolicLink()) {
      return {
        path: relativePath,
        type: "symlink",
        size: stat.size,
        sha256: digest(Buffer.from(readlinkSync(absolute), "utf8")),
      };
    }
    if (!stat.isFile()) return { path: relativePath, type: "other", size: stat.size, sha256: null };
    let sha256 = null;
    if (stat.size <= MAX_HASH_BYTES) sha256 = digest(readFileSync(absolute));
    return { path: relativePath, type: "file", size: stat.size, sha256 };
  } catch {
    return { path: relativePath, type: "unreadable", size: null, sha256: null };
  }
}

function snapshotDigest(entries) {
  const canonical = entries
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}\0${entry.type}\0${entry.size ?? ""}\0${entry.sha256 ?? ""}\n`)
    .join("");
  return digest(Buffer.from(canonical, "utf8"));
}

function entryMap(snapshot) {
  const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  return new Map(entries.map((entry) => [entry.path, entry]));
}

function equalEntry(left, right) {
  return left?.type === right?.type &&
    left?.size === right?.size &&
    left?.sha256 === right?.sha256;
}

function normalizeOwnedRoots(value) {
  return uniqueSorted((Array.isArray(value) ? value : [])
    .map((item) => typeof item === "string" ? item.replaceAll("\\", "/").replace(/^\.\/+/, "") : "")
    .filter((path) => pathIsInsideRuntime(path)));
}

function pathUnderRoot(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function publicSnapshot(snapshot) {
  return {
    schema: RESOURCE_SNAPSHOT_SCHEMA,
    root: snapshot.root,
    exists: snapshot.exists,
    entry_count: snapshot.entry_count,
    truncated: snapshot.truncated,
    digest: snapshot.digest,
    sample: compactSample(snapshot.entries.map((entry) => entry.path), {
      maxCount: BUDGETS.pathSampleMaxCount,
      maxItemBytes: BUDGETS.pathSampleItemMaxBytes,
    }),
    artifact: snapshot.artifact ?? null,
  };
}

export function snapshotRepoRuntime(repoRoot, {
  artifactPath = null,
  focusRoots = [],
} = {}) {
  const root = resolve(repoRoot);
  const runtime = join(root, REPO_RUNTIME_ROOT);
  const entries = [];
  const exists = existsSync(runtime);
  if (exists) {
    entries.push(shallowDescriptor(runtime, REPO_RUNTIME_ROOT));
    try {
      for (const child of readdirSync(runtime).sort()) {
        entries.push(shallowDescriptor(join(runtime, child), `${REPO_RUNTIME_ROOT}/${child}`));
      }
    } catch {
      entries.push({ path: `${REPO_RUNTIME_ROOT}/<unreadable>`, type: "unreadable", size: null, sha256: null });
    }
    fileDescriptor(runtime, REPO_RUNTIME_ROOT, entries);
    for (const focusRoot of normalizeOwnedRoots(focusRoots)) {
      const focused = [];
      const absolute = resolve(root, focusRoot);
      if (existsSync(absolute)) fileDescriptor(absolute, focusRoot, focused);
      entries.push(...focused);
    }
  }
  const deduplicated = [...new Map(entries.map((entry) => [entry.path, entry])).values()]
    .sort((left, right) => left.path.localeCompare(right.path));
  const snapshot = {
    schema: RESOURCE_SNAPSHOT_SCHEMA,
    root: runtime,
    exists,
    entry_count: deduplicated.length,
    truncated: deduplicated.length >= MAX_ENTRIES,
    digest: snapshotDigest(deduplicated),
    entries: deduplicated,
    artifact: null,
  };
  if (artifactPath !== null) {
    const artifact = externalArtifactPath(artifactPath, root);
    const publicValue = publicSnapshot(snapshot);
    writeFileSync(artifact, `${JSON.stringify(publicValue, null, 2)}\n`, { mode: 0o600 });
    snapshot.artifact = {
      path: artifact,
      bytes: Buffer.byteLength(JSON.stringify(publicValue)),
      sha256: digest(Buffer.from(JSON.stringify(publicValue), "utf8")),
    };
  }
  return snapshot;
}

export const snapshotRepoGjc = snapshotRepoRuntime;

export function classifyRepoRuntime({
  baseline,
  current,
  runOwnedRoots = [],
  ownerId = null,
} = {}) {
  const before = baseline ?? { exists: false, entries: [] };
  const after = current ?? { exists: false, entries: [] };
  const beforeMap = entryMap(before);
  const afterMap = entryMap(after);
  const created = [...afterMap.keys()].filter((path) => !beforeMap.has(path)).sort();
  const removed = [...beforeMap.keys()].filter((path) => !afterMap.has(path)).sort();
  const modified = [...afterMap.keys()]
    .filter((path) => beforeMap.has(path) && !equalEntry(beforeMap.get(path), afterMap.get(path)))
    .sort();
  const roots = normalizeOwnedRoots(runOwnedRoots);
  const ownedCreated = created.filter((path) => roots.some((root) => pathUnderRoot(path, root)));
  const unexplainedCreated = created.filter((path) =>
    !ownedCreated.includes(path) &&
    !(path === REPO_RUNTIME_ROOT && before.exists !== true));
  const ownedModified = modified.filter((path) => roots.some((root) => pathUnderRoot(path, root)));
  const unexplainedModified = modified.filter((path) => !ownedModified.includes(path));
  const createdByFleet = ownedCreated.length > 0 && unexplainedCreated.length === 0;
  const preExistingPreserved = before.exists === true;
  let status = "absent";
  if (after.exists && createdByFleet && !preExistingPreserved) status = "fleet_created";
  else if (preExistingPreserved) status = "pre_existing_preserved";
  else if (after.exists) status = "unowned_drift";

  return {
    status,
    baseline_exists: before.exists === true,
    current_exists: after.exists === true,
    baseline_digest: before.digest ?? null,
    current_digest: after.digest ?? null,
    created_count: created.length,
    removed_count: removed.length,
    modified_count: modified.length,
    fleet_created_count: ownedCreated.length,
    unexplained_created_count: unexplainedCreated.length,
    unexplained_modified_count: unexplainedModified.length,
    created_sample: compactSample(created),
    fleet_created_sample: compactSample(ownedCreated),
    unexplained_sample: compactSample(uniqueSorted([...unexplainedCreated, ...unexplainedModified])),
    owned_roots: roots,
    owner_id: typeof ownerId === "string" && ownerId.trim().length > 0 ? boundedUtf8(ownerId.trim(), 128) : null,
    ownership_proven: createdByFleet,
    pre_existing_preserved: preExistingPreserved,
    cleanup_allowed: createdByFleet && (unexplainedCreated.length === 0) && (unexplainedModified.length === 0),
    cleanup_roots: createdByFleet && !preExistingPreserved ? [REPO_RUNTIME_ROOT] : roots,
  };
}

export function cleanupRunOwnedRuntime(repoRoot, classification, { artifactPath = null } = {}) {
  const root = resolve(repoRoot);
  const classificationValue = isRecord(classification) ? classification : {};
  if (classificationValue.cleanup_allowed !== true) {
    return {
      status: "preserved",
      reason: "runtime ownership was not proven; no repository-local state was removed",
      classification: classificationValue,
    };
  }
  const roots = normalizeOwnedRoots(classificationValue.cleanup_roots);
  for (const ownedRoot of roots) {
    const absolute = resolve(root, ownedRoot);
    if (absolute !== join(root, REPO_RUNTIME_ROOT) &&
        !absolute.startsWith(`${join(root, REPO_RUNTIME_ROOT)}/`)) {
      throw new Error(`refusing to clean path outside ${REPO_RUNTIME_ROOT}: ${ownedRoot}`);
    }
    rmSync(absolute, { recursive: true, force: true });
  }
  const finalSnapshot = snapshotRepoRuntime(root, { artifactPath });
  return {
    status: "cleaned",
    classification: classificationValue,
    final: publicSnapshot(finalSnapshot),
    baseline_restored: classificationValue.baseline_exists
      ? finalSnapshot.digest === classificationValue.baseline_digest
      : !finalSnapshot.exists,
  };
}

export function recordRunOwnedResource(ledger = {}, {
  type = "repo_runtime",
  id,
  path,
  ownerId = null,
} = {}) {
  const normalizedPath = typeof path === "string"
    ? path.replaceAll("\\", "/").replace(/^\.\/+/, "")
    : "";
  if (!id || !pathIsInsideRuntime(normalizedPath)) {
    throw new Error("run-owned runtime resources require an id and a .gjc-relative path");
  }
  const resource = {
    type: boundedUtf8(type, 64),
    id: boundedUtf8(id, 128),
    path: boundedPath(normalizedPath),
    owner_id: ownerId ? boundedUtf8(ownerId, 128) : null,
  };
  const owned = Array.isArray(ledger.owned) ? ledger.owned : [];
  const created = Array.isArray(ledger.created) ? ledger.created : [];
  return {
    ...ledger,
    owned: [...owned, resource],
    created: [...created, resource],
  };
}

export function compactResourceClassification(classification = {}) {
  const source = isRecord(classification) ? classification : {};
  return {
    status: boundedUtf8(source.status ?? "unknown", 32),
    ownership_proven: source.ownership_proven === true,
    pre_existing_preserved: source.pre_existing_preserved === true,
    cleanup_allowed: source.cleanup_allowed === true,
    created_count: Number.isInteger(source.created_count) ? source.created_count : 0,
    fleet_created_count: Number.isInteger(source.fleet_created_count) ? source.fleet_created_count : 0,
    unexplained_created_count: Number.isInteger(source.unexplained_created_count) ? source.unexplained_created_count : 0,
    unexplained_modified_count: Number.isInteger(source.unexplained_modified_count) ? source.unexplained_modified_count : 0,
    created_sample: compactSample(source.created_sample),
    fleet_created_sample: compactSample(source.fleet_created_sample),
    unexplained_sample: compactSample(source.unexplained_sample),
    owner_id: source.owner_id ? boundedUtf8(source.owner_id, 128) : null,
    baseline_digest: SHA256.test(source.baseline_digest ?? "") ? source.baseline_digest.toLowerCase() : null,
    current_digest: SHA256.test(source.current_digest ?? "") ? source.current_digest.toLowerCase() : null,
  };
}
