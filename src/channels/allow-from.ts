export function mergeAllowFromSources(params: {
  allowFrom?: Array<string | number>;
  storeAllowFrom?: string[];
  /** When dmPolicy is "allowlist", persisted pairings are excluded so that
   *  only the explicit config allowFrom list is enforced (#22599). */
  dmPolicy?: string;
}): string[] {
  const storeEntries = params.dmPolicy === "allowlist" ? [] : (params.storeAllowFrom ?? []);
  return [...(params.allowFrom ?? []), ...storeEntries]
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export function firstDefined<T>(...values: Array<T | undefined>) {
  for (const value of values) {
    if (typeof value !== "undefined") {
      return value;
    }
  }
  return undefined;
}

export function isSenderIdAllowed(
  allow: { entries: string[]; hasWildcard: boolean; hasEntries: boolean },
  senderId: string | undefined,
  allowWhenEmpty: boolean,
): boolean {
  if (!allow.hasEntries) {
    return allowWhenEmpty;
  }
  if (allow.hasWildcard) {
    return true;
  }
  if (!senderId) {
    return false;
  }
  return allow.entries.includes(senderId);
}
