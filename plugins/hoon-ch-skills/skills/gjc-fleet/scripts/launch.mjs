/**
 * GJC launch policy for workers and probes.
 *
 * Persistent session state must never default to the target repository.  Use
 * --no-session for an ephemeral worker, or pass an absolute run-directory
 * --session-dir when a session artifact is required.
 */

import { isAbsolute, resolve } from "node:path";

export const GJC_RUNTIME_FLAGS = Object.freeze({
  noSession: "--no-session",
  sessionDir: "--session-dir",
  noMcp: "--no-mcp",
});

export function buildGjcLaunch({
  model = null,
  preset = null,
  thinking = null,
  sessionDir = null,
  noSession = sessionDir === null,
  noMcp = true,
} = {}) {
  if ((model === null) === (preset === null)) {
    throw new Error("GJC launch requires exactly one model or preset");
  }
  if (sessionDir !== null && noSession === true) {
    throw new Error("GJC launch cannot combine --session-dir with --no-session");
  }
  const args = ["gjc"];
  if (model !== null) {
    if (typeof model !== "string" || !model.includes("/")) throw new Error("GJC model must be PROVIDER/MODEL");
    args.push("--model", model);
    if (thinking !== null) args.push("--thinking", thinking);
  } else {
    if (typeof preset !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(preset)) {
      throw new Error("GJC preset must be a simple profile name");
    }
    if (thinking !== null) throw new Error("--thinking is only valid with an explicit model");
    args.push("--mpreset", preset);
  }
  if (sessionDir !== null) {
    if (typeof sessionDir !== "string" || !isAbsolute(sessionDir)) {
      throw new Error("--session-dir must be an absolute external path");
    }
    args.push(GJC_RUNTIME_FLAGS.sessionDir, resolve(sessionDir));
  } else if (noSession) {
    args.push(GJC_RUNTIME_FLAGS.noSession);
  }
  if (noMcp) args.push(GJC_RUNTIME_FLAGS.noMcp);
  return args;
}

export function validateExternalSessionDir(sessionDir, targetRepo) {
  if (typeof sessionDir !== "string" || !isAbsolute(sessionDir)) {
    return { valid: false, reason: "session directory must be an absolute path" };
  }
  if (typeof targetRepo === "string" && isAbsolute(targetRepo)) {
    const session = resolve(sessionDir);
    const target = resolve(targetRepo);
    if (session === target || session.startsWith(`${target}/`)) {
      return { valid: false, reason: "session directory must be outside the target repository" };
    }
  }
  return { valid: true, reason: null };
}
