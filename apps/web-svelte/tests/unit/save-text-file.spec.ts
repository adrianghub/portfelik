import { beforeEach, describe, expect, it, vi } from "vitest";

const writeFile = vi.fn(async (_options: unknown) => undefined);
const getUri = vi.fn(async (_options: unknown) => ({ uri: "file:///cache/export.json" }));
const deleteFile = vi.fn(async (_options: unknown) => undefined);
const readdir = vi.fn(async (_options: unknown) => ({
  files: [{ name: "jakstoimy-export.json" }, { name: "other.txt" }],
}));
const share = vi.fn(async (_options: unknown) => undefined);
const isNativeCapacitor = vi.fn(() => false);

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    writeFile: (options: unknown) => writeFile(options),
    getUri: (options: unknown) => getUri(options),
    deleteFile: (options: unknown) => deleteFile(options),
    readdir: (options: unknown) => readdir(options),
  },
}));

vi.mock("@capacitor/share", () => ({
  Share: { share: (options: unknown) => share(options) },
}));

vi.mock("$lib/services/pwa", () => ({
  isNativeCapacitor: () => isNativeCapacitor(),
}));

import { clearNativeExportCache, saveTextFile } from "$lib/services/save-text-file";

describe("saveTextFile", () => {
  beforeEach(() => {
    writeFile.mockReset();
    getUri.mockClear();
    deleteFile.mockReset();
    readdir.mockClear();
    share.mockReset();
    isNativeCapacitor.mockReset();
    isNativeCapacitor.mockReturnValue(false);
  });

  it("downloads in the browser", async () => {
    const click = vi.fn();
    const createElement = vi.fn(() => ({ click, href: "", download: "" }));
    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:1",
      revokeObjectURL: vi.fn(),
    });

    await expect(saveTextFile("a.csv", "a,b", "text/csv")).resolves.toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("shares a cache file in the native shell and ignores a cancelled sheet", async () => {
    isNativeCapacitor.mockReturnValue(true);
    share.mockRejectedValueOnce(new Error("Share canceled"));

    await expect(saveTextFile("a.json", "{}", "application/json")).resolves.toBe(false);
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "a.json", data: "{}", directory: "CACHE" })
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["file:///cache/export.json"] })
    );
    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "a.json", directory: "CACHE" })
    );
  });

  it("removes leftover JakStoimy exports from the native cache", async () => {
    isNativeCapacitor.mockReturnValue(true);
    await clearNativeExportCache();
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "jakstoimy-export.json", directory: "CACHE" })
    );
  });
});
