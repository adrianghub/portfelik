export const DEMO_PREFIX = "Demo:";

export function isDemoDescription(description: string | null | undefined): boolean {
  return (description ?? "").startsWith(DEMO_PREFIX);
}

export function isDemoPlanName(name: string | null | undefined): boolean {
  return (name ?? "").startsWith(DEMO_PREFIX);
}

/** Demo can be loaded whenever no demo rows are active (clear first to reload). */
export function canSeedDemo(input: { demoActive: boolean }): boolean {
  return !input.demoActive;
}

export function hasDemoData(input: {
  transactions: { description: string; is_demo?: boolean }[];
  plans: { name: string; is_demo?: boolean }[];
  netWorthItems?: { label: string; is_demo?: boolean }[];
}): boolean {
  return (
    input.transactions.some((tx) => tx.is_demo || isDemoDescription(tx.description)) ||
    input.plans.some((plan) => plan.is_demo || isDemoPlanName(plan.name)) ||
    (input.netWorthItems ?? []).some((item) => item.is_demo || isDemoDescription(item.label))
  );
}
