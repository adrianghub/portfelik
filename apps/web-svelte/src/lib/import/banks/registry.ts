// Single source of truth for import adapters + their labels/detection.
import { parseCsv } from "../csv/parse";
import { ingAdapter } from "./ing";
import { mbankAdapter } from "./mbank";
import type { DetectionResult, ImportAdapter, ImportAdapterKind, ImportSourceKind } from "./types";

// Only implemented adapters are registered. The full ImportAdapterKind union is
// accepted by the DB so follow-up adapters slot in without another migration.
export const IMPORT_ADAPTERS: readonly ImportAdapter[] = Object.freeze([mbankAdapter, ingAdapter]);

const RANK: Record<NonNullable<DetectionResult>["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Best (highest-confidence) detection across all adapters, else null. */
export function detectImportAdapter(text: string): DetectionResult {
  const rows = parseCsv(text).rows;
  let best: DetectionResult = null;
  for (const adapter of IMPORT_ADAPTERS) {
    const result = adapter.detect({ text, rows });
    if (result && (best === null || RANK[result.confidence] > RANK[best.confidence])) {
      best = result;
    }
  }
  return best;
}

export function getImportAdapter(kind: ImportAdapterKind): ImportAdapter {
  const adapter = IMPORT_ADAPTERS.find((a) => a.kind === kind);
  if (!adapter) throw new Error(`unknown_import_adapter_kind: ${kind}`);
  return adapter;
}

export function listImportAdapters(filter?: { sourceKind?: ImportSourceKind }): ImportAdapter[] {
  if (!filter?.sourceKind) return [...IMPORT_ADAPTERS];
  return IMPORT_ADAPTERS.filter((a) => a.sourceKind === filter.sourceKind);
}

export function importAdapterLabel(kind: ImportAdapterKind): string {
  return IMPORT_ADAPTERS.find((a) => a.kind === kind)?.label ?? kind;
}
