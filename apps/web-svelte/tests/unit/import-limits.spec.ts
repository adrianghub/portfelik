import { describe, expect, it } from "vitest";
import {
  checkImportFileSize,
  checkImportRowCount,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
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
});
