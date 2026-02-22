import { describe, expect, it } from "vitest";

type ModelFailoverConfig = {
  retrySameProfileOnTimeout?: number;
  retryBackoffMs?: number[];
};

/**
 * Resolve effective retry config from user config with defaults.
 */
function resolveRetryConfig(config?: ModelFailoverConfig) {
  return {
    maxRetries: config?.retrySameProfileOnTimeout ?? 1,
    backoffMs: config?.retryBackoffMs ?? [300, 1200],
  };
}

/**
 * Compute jittered backoff delay for a given attempt index.
 */
function computeBackoffDelay(backoffMs: number[], attemptIndex: number): number {
  const clamped = Math.min(attemptIndex, backoffMs.length - 1);
  const baseDelay = backoffMs[clamped] ?? 300;
  const jitter = Math.random() * 0.3 * baseDelay;
  return Math.floor(baseDelay + jitter);
}

/**
 * Determine whether to retry the same profile or rotate.
 * Returns { retry: true, delayMs } or { retry: false }.
 */
function shouldRetrySameProfile(params: {
  isTimeoutFailure: boolean;
  lastProfileId: string | undefined;
  lastTimeoutProfileId: string | undefined;
  consecutiveTimeouts: number;
  config?: ModelFailoverConfig;
}): { retry: boolean; consecutiveTimeouts: number; delayMs?: number } {
  if (!params.isTimeoutFailure || !params.lastProfileId) {
    return { retry: false, consecutiveTimeouts: 0 };
  }

  const { maxRetries, backoffMs } = resolveRetryConfig(params.config);

  const consecutive =
    params.lastProfileId === params.lastTimeoutProfileId
      ? params.consecutiveTimeouts + 1
      : 1;

  if (consecutive <= maxRetries) {
    const delayMs = computeBackoffDelay(backoffMs, consecutive - 1);
    return { retry: true, consecutiveTimeouts: consecutive, delayMs };
  }

  return { retry: false, consecutiveTimeouts: consecutive };
}

describe("timeout retry logic", () => {
  describe("resolveRetryConfig", () => {
    it("uses defaults when config is undefined", () => {
      const { maxRetries, backoffMs } = resolveRetryConfig(undefined);
      expect(maxRetries).toBe(1);
      expect(backoffMs).toEqual([300, 1200]);
    });

    it("respects custom config values", () => {
      const { maxRetries, backoffMs } = resolveRetryConfig({
        retrySameProfileOnTimeout: 3,
        retryBackoffMs: [500, 1000, 2000],
      });
      expect(maxRetries).toBe(3);
      expect(backoffMs).toEqual([500, 1000, 2000]);
    });

    it("allows disabling retry with 0", () => {
      const { maxRetries } = resolveRetryConfig({ retrySameProfileOnTimeout: 0 });
      expect(maxRetries).toBe(0);
    });
  });

  describe("computeBackoffDelay", () => {
    it("selects correct base delay for each attempt", () => {
      const backoffMs = [300, 1200];
      // Attempt 0 → 300ms base
      for (let i = 0; i < 50; i++) {
        const delay = computeBackoffDelay(backoffMs, 0);
        expect(delay).toBeGreaterThanOrEqual(300);
        expect(delay).toBeLessThanOrEqual(390); // 300 + 30% jitter
      }
      // Attempt 1 → 1200ms base
      for (let i = 0; i < 50; i++) {
        const delay = computeBackoffDelay(backoffMs, 1);
        expect(delay).toBeGreaterThanOrEqual(1200);
        expect(delay).toBeLessThanOrEqual(1560); // 1200 + 30% jitter
      }
    });

    it("clamps to last entry for out-of-range attempts", () => {
      const backoffMs = [300, 1200];
      for (let i = 0; i < 50; i++) {
        const delay = computeBackoffDelay(backoffMs, 5);
        expect(delay).toBeGreaterThanOrEqual(1200);
        expect(delay).toBeLessThanOrEqual(1560);
      }
    });
  });

  describe("shouldRetrySameProfile", () => {
    it("retries on first timeout with default config", () => {
      const result = shouldRetrySameProfile({
        isTimeoutFailure: true,
        lastProfileId: "profile-a",
        lastTimeoutProfileId: undefined,
        consecutiveTimeouts: 0,
      });
      expect(result.retry).toBe(true);
      expect(result.consecutiveTimeouts).toBe(1);
      expect(result.delayMs).toBeGreaterThanOrEqual(300);
    });

    it("rotates after retries exhausted", () => {
      const result = shouldRetrySameProfile({
        isTimeoutFailure: true,
        lastProfileId: "profile-a",
        lastTimeoutProfileId: "profile-a",
        consecutiveTimeouts: 1,
      });
      expect(result.retry).toBe(false);
      expect(result.consecutiveTimeouts).toBe(2);
    });

    it("resets counter on different profile", () => {
      const result = shouldRetrySameProfile({
        isTimeoutFailure: true,
        lastProfileId: "profile-b",
        lastTimeoutProfileId: "profile-a",
        consecutiveTimeouts: 5,
      });
      expect(result.retry).toBe(true);
      expect(result.consecutiveTimeouts).toBe(1);
    });

    it("resets counter on non-timeout failure", () => {
      const result = shouldRetrySameProfile({
        isTimeoutFailure: false,
        lastProfileId: "profile-a",
        lastTimeoutProfileId: "profile-a",
        consecutiveTimeouts: 3,
      });
      expect(result.retry).toBe(false);
      expect(result.consecutiveTimeouts).toBe(0);
    });

    it("skips retry when no profile id", () => {
      const result = shouldRetrySameProfile({
        isTimeoutFailure: true,
        lastProfileId: undefined,
        lastTimeoutProfileId: undefined,
        consecutiveTimeouts: 0,
      });
      expect(result.retry).toBe(false);
    });

    it("skips retry when maxRetries is 0", () => {
      const result = shouldRetrySameProfile({
        isTimeoutFailure: true,
        lastProfileId: "profile-a",
        lastTimeoutProfileId: undefined,
        consecutiveTimeouts: 0,
        config: { retrySameProfileOnTimeout: 0 },
      });
      expect(result.retry).toBe(false);
    });
  });
});
