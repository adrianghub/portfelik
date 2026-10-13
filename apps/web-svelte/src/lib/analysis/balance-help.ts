import { shortDayMonth } from "$lib/cockpit/month-window";
import * as m from "$lib/paraglide/messages";
import type { CashBalanceSemantics } from "$lib/services/cash-position";

/**
 * Explanation behind the Analyses balance info icon.
 * A saved start-of-day amount is not described as a checked bank balance.
 */
export function analysisBalanceHelp(input: {
  reconstructed: boolean;
  semantics: CashBalanceSemantics;
  anchorDate: string;
  clippedFrom: string | null;
}): string {
  const date = shortDayMonth(input.anchorDate);
  const parts: string[] = [];
  if (input.reconstructed) parts.push(m.analysis_balance_help_reconstructed());
  parts.push(
    input.semantics === "end_of_day"
      ? m.analysis_balance_help_confirmed({ date })
      : m.analysis_balance_help_legacy({ date })
  );
  if (input.clippedFrom) {
    parts.push(m.analysis_history_from({ date: shortDayMonth(input.clippedFrom) }));
  }
  return parts.join(" ");
}
