export interface DebtAmortizationInput {
  currentBalance: number;
  annualRate: number;
  monthlyPayment: number;
  extraMonthlyPayment?: number;
  /** One-time principal reduction applied before the first interest accrual. */
  lumpSumPayment?: number;
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

export interface DebtLumpSumComparison {
  baseline: DebtAmortizationResult;
  withLump: DebtAmortizationResult;
  interestSaved: number;
  monthsSaved: number;
  previousDailyInterest: number;
  newDailyInterest: number;
}

export const BELKA_RATE = 0.19;

export interface DebtInvestComparison {
  overpayInterestSaved: number;
  investNominalGain: number;
  investNetGain: number;
  effectiveInvestReturnPct: number;
  recommendation: "overpay" | "invest" | "tie";
  /** Gross market return needed to beat the loan after Belka (19%). */
  breakEvenGrossReturn: number;
}

/** Effective annual return after 19% Belka on nominal gains. */
export function effectiveReturnAfterBelka(grossReturnPct: number): number {
  return grossReturnPct * (1 - BELKA_RATE);
}

/** Gross return % an investment must earn to match a tax-free loan rate. */
export function breakEvenGrossBeatsLoan(loanRatePct: number): number {
  return loanRatePct / (1 - BELKA_RATE);
}

const DEFAULT_MAX_MONTHS = 600;

export function simulateAmortization(input: DebtAmortizationInput): DebtAmortizationResult {
  const extra = input.extraMonthlyPayment ?? 0;
  const monthlyRate = input.annualRate / 100 / 12;
  const maxMonths = input.maxMonths ?? DEFAULT_MAX_MONTHS;
  const months: DebtAmortizationMonth[] = [];
  const lump = input.lumpSumPayment ?? 0;
  let balance = Math.max(0, input.currentBalance - lump);
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
  input: Omit<DebtAmortizationInput, "extraMonthlyPayment" | "lumpSumPayment">,
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

export function compareLumpSumOverpay(
  input: Omit<DebtAmortizationInput, "extraMonthlyPayment" | "lumpSumPayment">,
  lumpSumPayment: number
): DebtLumpSumComparison {
  const baseline = simulateAmortization({ ...input, extraMonthlyPayment: 0 });
  const withLump = simulateAmortization({ ...input, extraMonthlyPayment: 0, lumpSumPayment });
  const newBalance = Math.max(0, input.currentBalance - lumpSumPayment);
  return {
    baseline,
    withLump,
    interestSaved: Math.max(0, baseline.totalInterest - withLump.totalInterest),
    monthsSaved: Math.max(0, baseline.payoffMonths - withLump.payoffMonths),
    previousDailyInterest: approximateDailyInterest(input.currentBalance, input.annualRate),
    newDailyInterest: approximateDailyInterest(newBalance, input.annualRate),
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
  input: Omit<DebtAmortizationInput, "extraMonthlyPayment" | "lumpSumPayment">,
  extraMonthlyPayment: number,
  assumedInvestReturnPct: number
): DebtInvestComparison {
  const overpay = compareOverpay(input, extraMonthlyPayment);
  const months = overpay.baseline.payoffMonths || 1;
  const monthlyInvestRate = assumedInvestReturnPct / 100 / 12;
  let investGain = 0;
  if (monthlyInvestRate > 0) {
    investGain =
      extraMonthlyPayment * ((Math.pow(1 + monthlyInvestRate, months) - 1) / monthlyInvestRate);
  } else {
    investGain = extraMonthlyPayment * months;
  }

  const overpayInterestSaved = overpay.interestSaved;
  const effectiveInvestReturnPct = effectiveReturnAfterBelka(assumedInvestReturnPct);
  const investNetGain = investGain * (1 - BELKA_RATE);
  const breakEvenGrossReturn = breakEvenGrossBeatsLoan(input.annualRate);

  let recommendation: DebtInvestComparison["recommendation"] = "tie";
  if (effectiveInvestReturnPct < input.annualRate - 0.25) recommendation = "overpay";
  else if (effectiveInvestReturnPct > input.annualRate + 0.25) recommendation = "invest";

  return {
    overpayInterestSaved,
    investNominalGain: investGain,
    investNetGain,
    effectiveInvestReturnPct,
    recommendation,
    breakEvenGrossReturn,
  };
}
