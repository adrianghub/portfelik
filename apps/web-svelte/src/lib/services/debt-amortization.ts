export interface DebtAmortizationInput {
  currentBalance: number;
  annualRate: number;
  monthlyPayment: number;
  extraMonthlyPayment?: number;
  maxMonths?: number;
}

export interface DebtAmortizationMonth {
  monthIndex: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}

export interface DebtAmortizationResult {
  months: DebtAmortizationMonth[];
  totalInterest: number;
  payoffMonths: number;
  payoffYears: number;
  payoffMonthsRemainder: number;
}

export interface DebtOverpayComparison {
  baseline: DebtAmortizationResult;
  withExtra: DebtAmortizationResult;
  interestSaved: number;
  monthsSaved: number;
}

export interface DebtInvestComparison {
  overpayInterestSaved: number;
  investNominalGain: number;
  recommendation: "overpay" | "invest" | "tie";
  breakEvenGrossReturn: number;
}

const DEFAULT_MAX_MONTHS = 600;

export function simulateAmortization(input: DebtAmortizationInput): DebtAmortizationResult {
  const extra = input.extraMonthlyPayment ?? 0;
  const monthlyRate = input.annualRate / 100 / 12;
  const maxMonths = input.maxMonths ?? DEFAULT_MAX_MONTHS;
  const months: DebtAmortizationMonth[] = [];
  let balance = input.currentBalance;
  let totalInterest = 0;

  for (let i = 0; i < maxMonths && balance > 0.01; i++) {
    const interest = balance * monthlyRate;
    const scheduled = input.monthlyPayment + extra;
    const payment = Math.min(scheduled, balance + interest);
    const principal = Math.max(0, payment - interest);
    balance = Math.max(0, balance - principal);
    totalInterest += interest;
    months.push({
      monthIndex: i + 1,
      interest,
      principal,
      payment,
      balance,
    });
    if (payment <= interest + 0.01 && balance > 0.01) {
      break;
    }
  }

  const payoffMonths = months.length;
  return {
    months,
    totalInterest,
    payoffMonths,
    payoffYears: Math.floor(payoffMonths / 12),
    payoffMonthsRemainder: payoffMonths % 12,
  };
}

export function compareOverpay(
  input: Omit<DebtAmortizationInput, "extraMonthlyPayment">,
  extraMonthlyPayment: number
): DebtOverpayComparison {
  const baseline = simulateAmortization({ ...input, extraMonthlyPayment: 0 });
  const withExtra = simulateAmortization({ ...input, extraMonthlyPayment });
  return {
    baseline,
    withExtra,
    interestSaved: Math.max(0, baseline.totalInterest - withExtra.totalInterest),
    monthsSaved: Math.max(0, baseline.payoffMonths - withExtra.payoffMonths),
  };
}

export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mies.`;
  if (rem === 0) return `${years} lat`;
  return `${years} lat ${rem} mies.`;
}

/** Display-only: approximate daily interest from current balance. */
export function approximateDailyInterest(currentBalance: number, annualRate: number): number {
  return (currentBalance * (annualRate / 100)) / 365;
}

export function compareOverpayVsInvest(
  input: Omit<DebtAmortizationInput, "extraMonthlyPayment">,
  extraMonthlyPayment: number,
  assumedInvestReturnPct: number
): DebtInvestComparison {
  const overpay = compareOverpay(input, extraMonthlyPayment);
  const months = overpay.withExtra.payoffMonths || 1;
  const monthlyInvestRate = assumedInvestReturnPct / 100 / 12;
  let investGain = 0;
  if (monthlyInvestRate > 0) {
    investGain =
      extraMonthlyPayment * ((Math.pow(1 + monthlyInvestRate, months) - 1) / monthlyInvestRate);
  } else {
    investGain = extraMonthlyPayment * months;
  }

  const overpayInterestSaved = overpay.interestSaved;
  let recommendation: DebtInvestComparison["recommendation"] = "tie";
  // v1: compare gross annual rates (no Belka); loan rate is the guaranteed overpay return.
  if (assumedInvestReturnPct < input.annualRate - 0.25) recommendation = "overpay";
  else if (assumedInvestReturnPct > input.annualRate + 0.25) recommendation = "invest";

  const breakEvenGrossReturn =
    input.currentBalance > 0 && months > 0
      ? (overpayInterestSaved / (extraMonthlyPayment * months)) * 12 * 100
      : assumedInvestReturnPct;

  return {
    overpayInterestSaved,
    investNominalGain: investGain,
    recommendation,
    breakEvenGrossReturn,
  };
}
