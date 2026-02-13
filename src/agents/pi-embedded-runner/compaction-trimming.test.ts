import { describe, expect, it, vi } from "vitest";

// Mock the external dependencies before importing the module under test
vi.mock("@mariozechner/pi-coding-agent", () => ({
  estimateTokens: vi.fn((msg: { content?: string }) => {
    // Simple mock: estimate based on content length / 4
    const content =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((c: { text?: string }) => c.text ?? "").join("")
          : "";
    return Math.max(1, Math.ceil(content.length / 4));
  }),
}));

vi.mock("../session-transcript-repair.js", () => ({
  sanitizeToolUseResultPairing: vi.fn((msgs: unknown[]) => msgs),
}));

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { estimateTokens } from "@mariozechner/pi-coding-agent";
import { sanitizeToolUseResultPairing } from "../session-transcript-repair.js";
import {
  DEFAULT_COMPACTION_TARGET_RATIO,
  DEFAULT_FALLBACK_RETAIN_PERCENT,
  fallbackCompact,
  trimToTargetTokens,
} from "./compaction-trimming.js";

function makeMessage(role: string, content: string): AgentMessage {
  return { role, content } as AgentMessage;
}

describe("trimToTargetTokens", () => {
  it("returns undefined when total tokens are within target", () => {
    const messages = [makeMessage("assistant", "summary"), makeMessage("user", "hi")];
    // "summary" = 7 chars → ~2 tokens, "hi" = 2 chars → ~1 token = ~3 total
    const result = trimToTargetTokens(messages, 100);
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty messages", () => {
    const result = trimToTargetTokens([], 100);
    expect(result).toBeUndefined();
  });

  it("trims older messages to fit within target, preserving first (summary) message", () => {
    const messages = [
      makeMessage("assistant", "a".repeat(100)), // ~25 tokens (summary)
      makeMessage("user", "b".repeat(100)), // ~25 tokens (old)
      makeMessage("assistant", "c".repeat(100)), // ~25 tokens (old)
      makeMessage("user", "d".repeat(100)), // ~25 tokens (newest)
    ];
    // Total ~100 tokens, target = 60
    // Should keep message[0] (summary, ~25) + message[3] (newest, ~25) = ~50
    const result = trimToTargetTokens(messages, 60);
    expect(result).toBeDefined();
    expect(result!.trimmed.length).toBeLessThan(messages.length);
    // First message (summary) should always be preserved
    expect(result!.trimmed[0]).toBe(messages[0]);
    // Last message (newest) should be preserved
    expect(result!.trimmed[result!.trimmed.length - 1]).toBe(messages[3]);
    expect(result!.tokensAfter).toBeLessThanOrEqual(60);
  });

  it("preserves chronological order after trimming", () => {
    const messages = [
      makeMessage("assistant", "a".repeat(40)), // ~10 tokens
      makeMessage("user", "b".repeat(40)), // ~10 tokens
      makeMessage("assistant", "c".repeat(40)), // ~10 tokens
      makeMessage("user", "d".repeat(40)), // ~10 tokens
      makeMessage("assistant", "e".repeat(40)), // ~10 tokens
    ];
    // Total ~50 tokens, target = 35
    const result = trimToTargetTokens(messages, 35);
    expect(result).toBeDefined();
    // Verify order: first message should be summary, rest in chronological order
    const roles = result!.trimmed.map((m) => m.content);
    for (let i = 1; i < roles.length; i++) {
      const prevIdx = messages.findIndex((m) => m.content === roles[i - 1]);
      const currIdx = messages.findIndex((m) => m.content === roles[i]);
      expect(currIdx).toBeGreaterThan(prevIdx);
    }
  });

  it("calls sanitizeToolUseResultPairing after trimming", () => {
    const messages = [
      makeMessage("assistant", "a".repeat(100)),
      makeMessage("user", "b".repeat(100)),
      makeMessage("assistant", "c".repeat(100)),
      makeMessage("user", "d".repeat(100)),
    ];
    trimToTargetTokens(messages, 60);
    expect(sanitizeToolUseResultPairing).toHaveBeenCalled();
  });

  it("keeps only summary when target is very small", () => {
    const messages = [
      makeMessage("assistant", "sum"), // ~1 token
      makeMessage("user", "b".repeat(400)), // ~100 tokens
      makeMessage("assistant", "c".repeat(400)), // ~100 tokens
    ];
    const result = trimToTargetTokens(messages, 2);
    expect(result).toBeDefined();
    expect(result!.trimmed.length).toBe(1);
    expect(result!.trimmed[0]).toBe(messages[0]);
  });
});

describe("fallbackCompact", () => {
  it("returns empty for empty messages", () => {
    const result = fallbackCompact([]);
    expect(result.messages).toEqual([]);
    expect(result.tokensAfter).toBe(0);
  });

  it("retains the newest fraction of messages (default 20%)", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage(i % 2 === 0 ? "user" : "assistant", `msg-${i}`),
    );
    const result = fallbackCompact(messages);
    // 10 * 0.2 = 2 messages retained
    expect(result.messages.length).toBe(2);
    // Should be the last 2 messages
    expect(result.messages[0]).toBe(messages[8]);
    expect(result.messages[1]).toBe(messages[9]);
  });

  it("retains custom fraction of messages", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage(i % 2 === 0 ? "user" : "assistant", `msg-${i}`),
    );
    const result = fallbackCompact(messages, 0.5);
    // 10 * 0.5 = 5 messages retained
    expect(result.messages.length).toBe(5);
    expect(result.messages[0]).toBe(messages[5]);
  });

  it("clamps retainPercent to minimum 5%", () => {
    const messages = Array.from({ length: 100 }, (_, i) => makeMessage("user", `m${i}`));
    const result = fallbackCompact(messages, 0.01); // below 5% minimum
    // ceil(100 * 0.05) = 5
    expect(result.messages.length).toBe(5);
  });

  it("clamps retainPercent to maximum 100%", () => {
    const messages = Array.from({ length: 5 }, (_, i) => makeMessage("user", `m${i}`));
    const result = fallbackCompact(messages, 2.0); // above 100%
    expect(result.messages.length).toBe(5);
  });

  it("always retains at least 1 message", () => {
    const messages = [makeMessage("user", "only")];
    const result = fallbackCompact(messages, 0.05);
    expect(result.messages.length).toBe(1);
  });

  it("calls sanitizeToolUseResultPairing", () => {
    vi.mocked(sanitizeToolUseResultPairing).mockClear();
    const messages = Array.from({ length: 5 }, (_, i) => makeMessage("user", `m${i}`));
    fallbackCompact(messages, 0.5);
    expect(sanitizeToolUseResultPairing).toHaveBeenCalled();
  });

  it("returns correct tokensAfter estimate", () => {
    const messages = Array.from(
      { length: 4 },
      () => makeMessage("user", "a".repeat(40)), // ~10 tokens each
    );
    const result = fallbackCompact(messages, 0.5);
    // 2 messages retained, each ~10 tokens
    expect(result.tokensAfter).toBeGreaterThan(0);
    expect(result.tokensAfter).toBe(result.messages.reduce((sum, m) => sum + estimateTokens(m), 0));
  });
});

describe("constants", () => {
  it("DEFAULT_COMPACTION_TARGET_RATIO is 0.25", () => {
    expect(DEFAULT_COMPACTION_TARGET_RATIO).toBe(0.25);
  });

  it("DEFAULT_FALLBACK_RETAIN_PERCENT is 0.2", () => {
    expect(DEFAULT_FALLBACK_RETAIN_PERCENT).toBe(0.2);
  });
});
