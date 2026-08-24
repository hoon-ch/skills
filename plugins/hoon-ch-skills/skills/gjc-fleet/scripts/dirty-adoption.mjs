/**
 * Dirty-work reservation and adoption policy.
 *
 * A dirty path is not automatically safe to edit, but it is not automatically
 * a reason to abandon an implementation either.  Adoption is an explicit,
 * bounded assignment backed by a read-only baseline review.
 */

import {
  BUDGETS,
  boundedUtf8,
  compactSample,
  isIgnoredPath,
  uniqueSorted,
} from "./budget.mjs";

export const DIRTY_RESERVATION_MODES = Object.freeze([
  "preserve_no_touch",
  "preserve_and_continue",
]);

const SHA256 = /^[a-f0-9]{64}$/i;
const CONTINUE_RE = /(?:implement|implementation|complete|completion|finish|extend|continue|carry\s+on|build|integrat|fix|update|verify|verification|구현|완성|마무리|이어|확장|통합|수정|검증)/i;
const NO_TOUCH_RE = /(?:read[-\s]?only|analysis[-\s]?only|inspect(?:ion)?\s+only|do\s+not\s+(?:edit|touch|change)|no[-\s]?touch|preserve\s+without|freeze|읽기\s*전용|분석만|건드리지|변경하지\s*말|동결)/i;
const TARGET_RE = /(?:gui|cli|rust|core|backend|feature|parity|equivalence|interface|기능|동등|패리티|프론트|백엔드)/i;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function normalizePath(value) {
  return text(value).replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function safePath(value) {
  const path = normalizePath(value);
  return path.length > 0 &&
    !path.includes("\0") &&
    !path.startsWith("/") &&
    !path.split("/").includes("..") &&
    !path.includes("*") &&
    !path.includes("?") &&
    !isIgnoredPath(path);
}

export function normalizeExactPaths(value) {
  return uniqueSorted((Array.isArray(value) ? value : [])
    .filter(safePath)
    .map(normalizePath));
}

function samePaths(left, right) {
  const a = normalizeExactPaths(left);
  const b = normalizeExactPaths(right);
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

function patternMatches(path, pattern) {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);
  if (!normalizedPattern || normalizedPattern.includes("..")) return false;
  let source = "^";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === "*" && normalizedPattern[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`).test(normalizedPath);
}

function featureTargetMatchesDirtyPaths(dirtyPaths, featureTargets) {
  const paths = normalizeExactPaths(dirtyPaths);
  const targets = Array.isArray(featureTargets)
    ? featureTargets.filter((target) => typeof target === "string" && target.trim().length > 0)
    : [];
  if (paths.length === 0 || targets.length === 0) return false;
  return paths.every((path) => targets.some((target) => patternMatches(path, target)));
}

function inferredFeatureMatch(objective, dirtyPaths) {
  const value = text(objective);
  const paths = normalizeExactPaths(dirtyPaths);
  if (!value || paths.length === 0 || !TARGET_RE.test(value)) return false;

  const featurePath = (path) => {
    const components = path.split("/");
    return components.includes("cli") ||
      components.includes("core") ||
      components.includes("gui") ||
      components.includes("app") ||
      components.includes("backend") ||
      /(?:^|\/)Cargo\.(?:toml|lock)$/.test(path);
  };
  return paths.every(featurePath);
}

export function dirtyReservationQuestion(dirtyPaths = []) {
  const sample = compactSample(dirtyPaths, { maxCount: 3, maxItemBytes: 96 });
  const suffix = sample.length > 0 ? ` (예: ${sample.join(", ")})` : "";
  return boundedUtf8(
    `기존 미커밋 작업${suffix}이 목표와 겹칠 수 있습니다. 기존 변경을 baseline으로 보존하면서 같은 경로를 이어서 구현할까요(preserve_and_continue), 아니면 기존 경로는 건드리지 않을까요(preserve_no_touch)?`,
    BUDGETS.receiptFieldMaxBytes,
  );
}

export function inferDirtyReservationMode(objective, {
  dirtyPaths = [],
  featureTargets = [],
  explicitMode = null,
} = {}) {
  const paths = normalizeExactPaths(dirtyPaths);
  if (explicitMode !== null) {
    if (DIRTY_RESERVATION_MODES.includes(explicitMode)) {
      return {
        status: "resolved",
        mode: explicitMode,
        confidence: "explicit",
        target_match: false,
        question: null,
      };
    }
    return {
      status: "awaiting_user",
      mode: null,
      confidence: "invalid_explicit_mode",
      target_match: false,
      question: dirtyReservationQuestion(paths),
    };
  }

  if (paths.length === 0) {
    return {
      status: "resolved",
      mode: "preserve_no_touch",
      confidence: "no_dirty_paths",
      target_match: false,
      question: null,
    };
  }

  const targetMatch = featureTargetMatchesDirtyPaths(paths, featureTargets) ||
    inferredFeatureMatch(objective, paths);
  if (CONTINUE_RE.test(text(objective)) || targetMatch) {
    return {
      status: "resolved",
      mode: "preserve_and_continue",
      confidence: targetMatch ? "feature_target_matches_dirty_paths" : "explicit_continue_intent",
      target_match: targetMatch,
      question: null,
    };
  }
  if (NO_TOUCH_RE.test(text(objective))) {
    return {
      status: "resolved",
      mode: "preserve_no_touch",
      confidence: "explicit_no_touch_intent",
      target_match: false,
      question: null,
    };
  }
  return {
    status: "awaiting_user",
    mode: null,
    confidence: "ambiguous",
    target_match: false,
    question: dirtyReservationQuestion(paths),
  };
}

function validDigest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function reviewPaths(review) {
  if (!isRecord(review)) return [];
  return normalizeExactPaths(review.reviewed_paths ?? review.paths ?? review.path_review);
}

function reviewStatus(review) {
  return typeof review?.status === "string" ? review.status.toLowerCase() : "";
}

function ownershipPaths(ownership) {
  if (!isRecord(ownership)) return [];
  return normalizeExactPaths(ownership.paths ?? ownership.owned_paths ?? ownership.assignment);
}

function ownershipId(ownership) {
  if (!isRecord(ownership)) return "";
  return text(ownership.worker_id ?? ownership.owner_id ?? ownership.owner);
}

function proofPaths(proof) {
  if (!isRecord(proof)) return [];
  return normalizeExactPaths(proof.preserved_paths ?? proof.paths ?? proof.path_review);
}

function proofStatus(proof) {
  return typeof proof?.status === "string" ? proof.status.toLowerCase() : "";
}

function adoptionInput(input) {
  const source = isRecord(input) ? input : {};
  const review = source.baseline_review ?? source.baselineReview ?? null;
  const ownership = source.worker_ownership ?? source.workerOwnership ?? null;
  let proof = source.post_diff_proof ?? source.postDiffProof ?? null;
  if (source.post_diff_preserved === true && !proof) {
    proof = {
      status: "preserved",
      baseline_digest: source.baseline_digest ?? review?.baseline_digest ?? null,
      preserved_paths: source.adopted_paths ?? source.paths ?? [],
      worker_id: ownershipId(ownership) || text(source.worker_id),
    };
  }
  return {
    mode: source.mode ?? source.dirty_mode ?? null,
    baseline_paths: normalizeExactPaths(source.baseline_paths ?? source.dirty_paths),
    adopted_paths: normalizeExactPaths(source.adopted_paths ?? source.paths ?? source.assignment?.paths),
    baseline_digest: source.baseline_digest ?? review?.baseline_digest ?? null,
    expected_baseline_digest: source.expected_baseline_digest ?? source.baseline_artifact?.sha256 ?? null,
    review,
    ownership,
    proof,
    worker_id: text(source.worker_id) || ownershipId(ownership),
  };
}

export function validateDirtyAdoption(input = {}, { requirePostDiff = false } = {}) {
  const source = adoptionInput(input);
  const errors = [];
  if (!DIRTY_RESERVATION_MODES.includes(source.mode)) {
    errors.push("dirty reservation mode must be preserve_no_touch or preserve_and_continue");
  }
  if (source.mode === "preserve_no_touch" && source.adopted_paths.length > 0) {
    errors.push("preserve_no_touch cannot adopt dirty paths");
  }
  if (source.mode === "preserve_and_continue") {
    if (source.adopted_paths.length === 0) errors.push("preserve_and_continue requires an exact adopted path list");
    if (!source.adopted_paths.every((path) => source.baseline_paths.includes(path))) {
      errors.push("adopted paths must be a subset of the reserved baseline paths");
    }
    const status = reviewStatus(source.review);
    if (!["reviewed", "passed", "ready", "complete"].includes(status)) {
      errors.push("a read-only baseline review is required before dirty adoption");
    } else if (!samePaths(reviewPaths(source.review), source.adopted_paths)) {
      errors.push("baseline review paths must exactly equal the adopted assignment");
    }
    if (!validDigest(source.baseline_digest)) {
      errors.push("dirty adoption requires a baseline digest");
    }
    if (source.expected_baseline_digest &&
        String(source.baseline_digest).toLowerCase() !== String(source.expected_baseline_digest).toLowerCase()) {
      errors.push("dirty adoption baseline digest does not match the reserved artifact");
    }
    const owner = source.worker_id || ownershipId(source.ownership);
    if (!owner) {
      errors.push("dirty adoption requires a worker owner");
    }
    if (!samePaths(ownershipPaths(source.ownership), source.adopted_paths)) {
      errors.push("worker ownership paths must exactly equal the adopted assignment");
    }
    if (ownershipId(source.ownership) !== owner) {
      errors.push("worker ownership must identify the adopting worker");
    }
    if (requirePostDiff) {
      const proof = source.proof;
      if (proofStatus(proof) !== "preserved") {
        errors.push("post-diff preservation proof is required before completion");
      }
      if (String(proof?.baseline_digest).toLowerCase() !== String(source.baseline_digest).toLowerCase()) {
        errors.push("post-diff proof must carry the reserved baseline digest");
      }
      if (!samePaths(proofPaths(proof), source.adopted_paths)) {
        errors.push("post-diff proof paths must exactly equal the adopted assignment");
      }
      if (text(proof?.worker_id) !== owner) {
        errors.push("post-diff proof must identify the adopting worker");
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors: errors.map((error) => boundedUtf8(error, BUDGETS.receiptFieldMaxBytes)),
    mode: source.mode,
    baseline_paths: source.baseline_paths,
    adopted_paths: source.adopted_paths,
    baseline_digest: validDigest(source.baseline_digest) ? source.baseline_digest.toLowerCase() : null,
    worker_id: source.worker_id || null,
    post_diff_proof_valid: requirePostDiff && errors.length === 0,
  };
}

export function compactDirtyAdoption(input = {}) {
  const source = adoptionInput(input);
  return {
    mode: source.mode,
    adopted_paths: compactSample(source.adopted_paths),
    adopted_count: source.adopted_paths.length,
    baseline_digest: validDigest(source.baseline_digest) ? source.baseline_digest.toLowerCase() : null,
    worker_id: source.worker_id || null,
    baseline_reviewed: ["reviewed", "passed", "ready", "complete"].includes(reviewStatus(source.review)),
    post_diff_preserved: proofStatus(source.proof) === "preserved",
  };
}
