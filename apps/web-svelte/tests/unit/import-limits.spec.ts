import { describe, expect, it, vi } from "vitest";
import {
  checkImportFileSize,
  checkImportRowCount,
  findUnsupportedImportCurrencies,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  readImportFileBytes,
} from "$lib/import/import-limits";

describe("import-limits", () => {
  it("accepts files at the byte limit", () => {
    expect(checkImportFileSize(IMPORT_MAX_FILE_BYTES)).toBeNull();
  });

  it("rejects oversized files", () => {
    expect(checkImportFileSize(IMPORT_MAX_FILE_BYTES + 1)).toBe("file_too_large");
  });

  it("accepts row counts at the limit", () => {
    expect(checkImportRowCount(IMPORT_MAX_ROWS)).toBeNull();
  });

  it("rejects too many rows", () => {
    expect(checkImportRowCount(IMPORT_MAX_ROWS + 1)).toBe("too_many_rows");
  });

  it("finds unique non-PLN currencies in mixed rows", () => {
    expect(
      findUnsupportedImportCurrencies([
        { currency: "PLN" },
        { currency: "eur" },
        { currency: " USD " },
        { currency: "EUR" },
      ])
    ).toEqual(["EUR", "USD"]);
  });

  it("does not read an oversized file into memory", async () => {
    const arrayBuffer = vi.fn<() => Promise<ArrayBuffer>>();

    const result = await readImportFileBytes({
      size: IMPORT_MAX_FILE_BYTES + 1,
      arrayBuffer,
    });

    expect(result).toEqual({ ok: false, violation: "file_too_large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("reads and returns a file within the size limit", async () => {
    const bytes = new ArrayBuffer(8);
    const arrayBuffer = vi.fn(async () => bytes);

    const result = await readImportFileBytes({ size: bytes.byteLength, arrayBuffer });

    expect(result).toEqual({ ok: true, bytes });
    expect(arrayBuffer).toHaveBeenCalledOnce();
  });
});
