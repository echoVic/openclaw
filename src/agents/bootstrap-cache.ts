import { loadWorkspaceBootstrapFiles, type WorkspaceBootstrapFile } from "./workspace.js";

/** Cache entries expire after 30 seconds so file changes are picked up
 *  without requiring a gateway restart. The inner readFileWithCache layer
 *  already does mtime-based invalidation, but this outer per-session cache
 *  previously had no TTL and prevented the mtime check from ever running. */
const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  files: WorkspaceBootstrapFile[];
  cachedAtMs: number;
};

const cache = new Map<string, CacheEntry>();

export async function getOrLoadBootstrapFiles(params: {
  workspaceDir: string;
  sessionKey: string;
}): Promise<WorkspaceBootstrapFile[]> {
  const existing = cache.get(params.sessionKey);
  if (existing && Date.now() - existing.cachedAtMs < CACHE_TTL_MS) {
    return existing.files;
  }

  const files = await loadWorkspaceBootstrapFiles(params.workspaceDir);
  cache.set(params.sessionKey, { files, cachedAtMs: Date.now() });
  return files;
}

export function clearBootstrapSnapshot(sessionKey: string): void {
  cache.delete(sessionKey);
}

export function clearAllBootstrapSnapshots(): void {
  cache.clear();
}
