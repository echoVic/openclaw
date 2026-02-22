import type { Api, Model } from "@mariozechner/pi-ai";

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

/**
 * Providers/endpoints known to reject the `developer` role.
 * These use OpenAI-compatible APIs but only accept system/user/assistant/tool.
 */
function needsDeveloperRoleDisabled(model: Model<"openai-completions">): boolean {
  const provider = (model.provider ?? "").toLowerCase();
  const baseUrl = (model.baseUrl ?? "").toLowerCase();
  const modelId = (model.modelId ?? "").toLowerCase();

  // z.ai
  if (provider === "zai" || baseUrl.includes("api.z.ai")) {
    return true;
  }

  // DashScope / Bailian (Aliyun) — #23575
  if (
    provider === "bailian" ||
    provider === "dashscope" ||
    baseUrl.includes("dashscope.aliyuncs.com")
  ) {
    return true;
  }

  // Qwen models via any provider (DashScope-compatible endpoints)
  if (modelId.includes("qwen")) {
    return true;
  }

  return false;
}

export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  if (!isOpenAiCompletionsModel(model)) {
    return model;
  }

  const compat = model.compat ?? undefined;
  if (compat?.supportsDeveloperRole === false) {
    return model;
  }

  if (!needsDeveloperRoleDisabled(model)) {
    return model;
  }

  model.compat = compat
    ? { ...compat, supportsDeveloperRole: false }
    : { supportsDeveloperRole: false };
  return model;
}
