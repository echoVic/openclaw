import { describe, expect, it } from "vitest";
import { resolveCronDeliveryPlan } from "./delivery.js";
import type { CronJob } from "./types.js";

describe("cron delivery mode contract", () => {
  it("treats delivery.mode=deliver as requested", () => {
    const job: CronJob = {
      id: "job",
      name: "Job",
      enabled: true,
      createdAtMs: 0,
      updatedAtMs: 0,
      schedule: { kind: "cron", expr: "* * * * *", tz: "UTC" },
      sessionTarget: "isolated",
      wakeMode: "now",
      payload: { kind: "agentTurn", message: "hi" },
      delivery: { mode: "deliver", channel: "telegram", to: "123" },
      state: { nextRunAtMs: 0 },
    };

    const plan = resolveCronDeliveryPlan(job);
    expect(plan.mode).toBe("deliver");
    expect(plan.requested).toBe(true);
  });
});
