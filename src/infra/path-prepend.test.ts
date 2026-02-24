import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyPathPrepend, mergePathPrepend, normalizePathPrepend } from "./path-prepend.js";

const d = path.delimiter; // ":" on POSIX, ";" on Windows

describe("normalizePathPrepend", () => {
  it("returns empty array for undefined", () => {
    expect(normalizePathPrepend(undefined)).toEqual([]);
  });
  it("deduplicates and trims entries", () => {
    expect(normalizePathPrepend([" /a ", "/b", "/a"])).toEqual(["/a", "/b"]);
  });
  it("filters empty strings", () => {
    expect(normalizePathPrepend(["", " ", "/a"])).toEqual(["/a"]);
  });
});

describe("mergePathPrepend", () => {
  it("returns existing when prepend is empty", () => {
    expect(mergePathPrepend(`/usr/bin${d}/bin`, [])).toBe(`/usr/bin${d}/bin`);
  });
  it("prepends to existing PATH", () => {
    const result = mergePathPrepend(`/usr/bin${d}/bin`, ["/custom"]);
    expect(result).toMatch(/^\/custom/);
    expect(result).toContain("/usr/bin");
    expect(result).toContain("/bin");
  });
  it("deduplicates entries", () => {
    const result = mergePathPrepend(`/usr/bin${d}/bin`, ["/usr/bin", "/custom"]);
    const parts = result!.split(d);
    const usrBinCount = parts.filter((p) => p === "/usr/bin").length;
    expect(usrBinCount).toBe(1);
  });
  it("handles undefined existing PATH", () => {
    const result = mergePathPrepend(undefined, ["/custom"]);
    expect(result).toBe("/custom");
  });
});

describe("applyPathPrepend", () => {
  it("prepends to PATH key", () => {
    const env: Record<string, string> = { PATH: `/usr/bin${d}/bin` };
    applyPathPrepend(env, ["/custom"]);
    expect(env.PATH).toMatch(/^\/custom/);
    expect(env.PATH).toContain("/usr/bin");
  });

  it("handles Windows-style Path key (case-insensitive lookup)", () => {
    const env: Record<string, string> = { Path: "C:\\Windows\\System32;C:\\Windows" };
    applyPathPrepend(env, ["C:\\Users\\user\\npm"]);
    // Should modify the existing "Path" key, not create a new "PATH" key
    expect(env.Path).toContain("C:\\Users\\user\\npm");
    expect(env.Path).toContain("C:\\Windows\\System32");
    expect(env.PATH).toBeUndefined();
  });

  it("creates PATH key when no path key exists", () => {
    const env: Record<string, string> = {};
    applyPathPrepend(env, ["/custom"]);
    expect(env.PATH).toBe("/custom");
  });

  it("skips when requireExisting and no path key", () => {
    const env: Record<string, string> = {};
    applyPathPrepend(env, ["/custom"], { requireExisting: true });
    expect(env.PATH).toBeUndefined();
  });

  it("applies when requireExisting and Path key exists (Windows)", () => {
    const env: Record<string, string> = { Path: "C:\\Windows" };
    applyPathPrepend(env, ["C:\\custom"], { requireExisting: true });
    expect(env.Path).toContain("C:\\custom");
    expect(env.Path).toContain("C:\\Windows");
  });

  it("does nothing when prepend is empty", () => {
    const env: Record<string, string> = { PATH: "/usr/bin" };
    applyPathPrepend(env, []);
    expect(env.PATH).toBe("/usr/bin");
  });

  it("does nothing when prepend is undefined", () => {
    const env: Record<string, string> = { PATH: "/usr/bin" };
    applyPathPrepend(env, undefined);
    expect(env.PATH).toBe("/usr/bin");
  });
});
