import { describe, expect, it } from "vitest";
import { resolveCronDeliveryPlan } from "./delivery.js";
import type { CronJob } from "./types.js";

describe("resolveCronDeliveryPlan", () => {
  it("honors delivery.mode=deliver", () => {
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
    expect(plan.channel).toBe("telegram");
    expect(plan.to).toBe("123");
  });

  it("honors delivery.mode=announce", () => {
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
      delivery: { mode: "announce", channel: "telegram", to: "123" },
      state: { nextRunAtMs: 0 },
    };

    const plan = resolveCronDeliveryPlan(job);
    expect(plan.mode).toBe("announce");
    expect(plan.requested).toBe(true);
    expect(plan.channel).toBe("telegram");
    expect(plan.to).toBe("123");
  });
});
