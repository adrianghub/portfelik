import * as m from "$lib/paraglide/messages";
import { polishPluralForm } from "$lib/utils/polish-plural";

export function importActionLabel(count: number): string {
  const form = polishPluralForm(count);
  if (form === "one") return m.bank_review_commit_action_one({ count });
  if (form === "few") return m.bank_review_commit_action_few({ count });
  return m.bank_review_commit_action({ count });
}

export function importSuccessLabel(count: number): string {
  const form = polishPluralForm(count);
  if (form === "one") return m.bank_commit_success_one({ count });
  if (form === "few") return m.bank_commit_success_few({ count });
  return m.bank_commit_success({ count });
}
