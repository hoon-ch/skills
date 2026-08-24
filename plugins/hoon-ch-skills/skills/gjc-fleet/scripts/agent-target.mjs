/**
 * Exact Herdr agent identity and prompt-fallback policy.
 *
 * Herdr list responses have an outer command envelope whose `id` is not an
 * agent name.  Selection is deliberately shallow: only a leaf object with an
 * exact pane_id can be selected.  This module never searches serialized JSON
 * or guesses a name.
 */

import { BUDGETS, boundedUtf8 } from "./budget.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function isLeafAgent(value) {
  return isRecord(value) && text(value.pane_id) !== null;
}

function directLeaves(result) {
  return [result?.agent, result?.pane].filter(isLeafAgent);
}

function listedLeaves(result) {
  return Array.isArray(result?.agents) ? result.agents.filter(isLeafAgent) : [];
}

export function selectLeafAgent(payload, paneId) {
  const requestedPaneId = text(paneId);
  if (!requestedPaneId) return null;
  const result = isRecord(payload?.result) ? payload.result : {};
  const direct = directLeaves(result);
  const candidates = direct.length > 0 ? direct : listedLeaves(result);
  const matches = candidates.filter((candidate) => candidate.pane_id === requestedPaneId);
  return matches.length === 1 ? matches[0] : null;
}

export function describeAgentSelection(payload, paneId) {
  const requestedPaneId = text(paneId);
  const result = isRecord(payload?.result) ? payload.result : {};
  const direct = directLeaves(result);
  const listed = listedLeaves(result);
  if (!requestedPaneId) {
    return {
      selected: false,
      reason: (direct.length > 0 || listed.length > 0) ? "pane_id_required" : "agent_not_available",
    };
  }
  const candidates = direct.length > 0 ? direct : listed;
  const matches = candidates.filter((candidate) => candidate.pane_id === requestedPaneId);
  return {
    selected: matches.length === 1,
    reason: matches.length === 1
      ? null
      : matches.length === 0
        ? "pane_id_not_found"
        : "pane_id_ambiguous",
  };
}

function requirePromptInput(paneId, prompt) {
  const selectedPaneId = text(paneId);
  const selectedPrompt = text(prompt);
  if (!selectedPaneId) throw new Error("pane_id is required; agent names are not a selection key");
  if (!selectedPrompt) throw new Error("prompt is required");
  return { paneId: selectedPaneId, prompt: selectedPrompt };
}

export function buildPromptPlan({ paneId, prompt, manuallyDetected = false } = {}) {
  const input = requirePromptInput(paneId, prompt);
  return {
    pane_id: input.paneId,
    target_kind: "pane_id",
    manually_detected_gjc: manuallyDetected === true,
    primary: {
      action: "agent_prompt",
      target: input.paneId,
      prompt: input.prompt,
      wait: true,
      timeout_ms: BUDGETS.agentFallbackWaitMs,
    },
    fallback: {
      trigger_error: "agent_not_ready",
      max_attempts: BUDGETS.agentFallbackMaxAttempts,
      actions: [
        { action: "pane_send_text", pane_id: input.paneId, text: input.prompt },
        { action: "pane_send_keys", pane_id: input.paneId, keys: ["enter"] },
      ],
      wait: {
        timeout_ms: BUDGETS.agentFallbackWaitMs,
        success: ["lifecycle_transition", "artifact_ready"],
      },
    },
  };
}

export function nextPromptStep({
  paneId,
  prompt,
  errorCode = null,
  fallbackAttempts = 0,
  manuallyDetected = false,
} = {}) {
  const plan = buildPromptPlan({ paneId, prompt, manuallyDetected });
  if (errorCode === null) {
    if (fallbackAttempts > 0) {
      return {
        action: "stop",
        reason: "fallback already used; reconcile lifecycle or artifact instead of prompting again",
        fallback_attempts: fallbackAttempts,
      };
    }
    return { ...plan.primary, fallback_attempts: fallbackAttempts };
  }
  if (errorCode !== "agent_not_ready") {
    return {
      action: "stop",
      reason: boundedUtf8(`prompt failed with ${errorCode}; no name guess or retry is allowed`, 512),
      fallback_attempts: fallbackAttempts,
    };
  }
  if (fallbackAttempts >= BUDGETS.agentFallbackMaxAttempts) {
    return {
      action: "stop",
      reason: "agent_not_ready fallback budget exhausted",
      fallback_attempts: fallbackAttempts,
    };
  }
  return {
    ...plan.fallback,
    fallback_attempts: fallbackAttempts + 1,
  };
}

export function reconcileFallback({
  fallbackAttempts = 0,
  lifecycleTransition = false,
  artifactReady = false,
} = {}) {
  if (fallbackAttempts !== BUDGETS.agentFallbackMaxAttempts) {
    return {
      status: "blocked",
      reason: "fallback must be attempted exactly once before reconciliation",
    };
  }
  if (lifecycleTransition === true || artifactReady === true) {
    return {
      status: "observed",
      evidence: lifecycleTransition === true ? "lifecycle_transition" : "artifact_ready",
    };
  }
  return {
    status: "blocked",
    reason: "bounded fallback wait ended without lifecycle transition or artifact",
  };
}
