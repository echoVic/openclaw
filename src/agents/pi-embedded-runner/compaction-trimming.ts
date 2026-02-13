import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import { sanitizeToolUseResultPairing } from "../session-transcript-repair.js";

/**
 * Default ratio of contextTokens used as the compaction target when
 * `compaction.targetTokens` is not explicitly configured.
 */
export const DEFAULT_COMPACTION_TARGET_RATIO = 0.25;

/**
 * Default fraction of messages to retain when compaction fails and the
 * fallback strategy kicks in.
 */
export const DEFAULT_FALLBACK_RETAIN_PERCENT = 0.2;

/**
 * After compaction, trim the oldest messages until the total estimated token
 * count is at or below `targetTokens`. The first message (typically the
 * compaction summary) is always preserved.
 *
 * Returns the trimmed message array and the estimated token count after
 * trimming, or `undefined` if no trimming was needed.
 */
export function trimToTargetTokens(
  messages: AgentMessage[],
  targetTokens: number,
): { trimmed: AgentMessage[]; tokensAfter: number } | undefined {
  if (messages.length === 0) {
    return undefined;
  }

  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateTokens(msg);
  }

  if (totalTokens <= targetTokens) {
    return undefined;
  }

  // Keep removing the oldest messages (index 1+, preserve index 0 which is
  // the compaction summary) until we fit within the target.
  const kept = [messages[0]];
  let keptTokens = estimateTokens(messages[0]);

  // Walk backwards from the newest message, collecting until we'd exceed the budget.
  const candidates: AgentMessage[] = [];
  let candidateTokens = 0;
  for (let i = messages.length - 1; i >= 1; i--) {
    const msgTokens = estimateTokens(messages[i]);
    if (keptTokens + candidateTokens + msgTokens > targetTokens) {
      break;
    }
    candidates.push(messages[i]);
    candidateTokens += msgTokens;
  }

  // Reverse to restore chronological order
  candidates.reverse();
  kept.push(...candidates);
  keptTokens += candidateTokens;

  // Repair orphaned tool_use / tool_result pairs after trimming
  const repaired = sanitizeToolUseResultPairing(kept);

  // Re-estimate after repair (repair may have removed additional messages)
  let repairedTokens = 0;
  for (const msg of repaired) {
    repairedTokens += estimateTokens(msg);
  }

  return { trimmed: repaired, tokensAfter: repairedTokens };
}

/**
 * Fallback compaction: when LLM-based compaction fails, retain only the most
 * recent `retainPercent` fraction of messages. Repairs orphaned tool pairs.
 *
 * Returns the retained messages and estimated token count.
 */
export function fallbackCompact(
  messages: AgentMessage[],
  retainPercent: number = DEFAULT_FALLBACK_RETAIN_PERCENT,
): { messages: AgentMessage[]; tokensAfter: number } {
  if (messages.length === 0) {
    return { messages: [], tokensAfter: 0 };
  }

  const clampedPercent = Math.max(0.05, Math.min(1.0, retainPercent));
  const retainCount = Math.max(1, Math.ceil(messages.length * clampedPercent));
  const retained = messages.slice(-retainCount);

  // Repair orphaned tool_use / tool_result pairs
  const repaired = sanitizeToolUseResultPairing(retained);

  let tokensAfter = 0;
  for (const msg of repaired) {
    tokensAfter += estimateTokens(msg);
  }

  return { messages: repaired, tokensAfter };
}
