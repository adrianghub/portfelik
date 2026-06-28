export const DEMO_PREFIX = "Demo:";

export function isDemoDescription(description: string | null | undefined): boolean {
  return (description ?? "").startsWith(DEMO_PREFIX);
}

export function isDemoPlanName(name: string | null | undefined): boolean {
  return (name ?? "").startsWith(DEMO_PREFIX);
}

export function canSeedDemo(transactionCount: number): boolean {
  return transactionCount === 0;
}

export function hasDemoData(input: {
  transactions: { description: string }[];
  plans: { name: string }[];
}): boolean {
  return (
    input.transactions.some((tx) => isDemoDescription(tx.description)) ||
    input.plans.some((plan) => isDemoPlanName(plan.name))
  );
}
