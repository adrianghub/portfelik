import {
  interestAccruedFromLinkedPayments,
  resolveDebtReplay,
} from "$lib/services/debt-balance-replay";

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

export interface AnnuityInvestResult {
  months: number;
  totalContributed: number;
  futureValue: number;
  nominalGain: number;
  netGain: number;
}

export interface DebtLumpInvestComparison {
  lumpSumPayment: number;
  interestSaved: number;
  monthsSaved: number;
  baselineLoanMonths: number;
  overpayPayoffMonths: number;
  postPayoffInvestMonths: number;
  freedPaymentInvestNetGain: number;
  investFutureValue: number;
  investNominalGain: number;
  investNetGain: number;
  overpayTotalBenefit: number;
  investTotalBenefit: number;
  effectiveInvestReturnPct: number;
  recommendation: "overpay" | "invest" | "tie";
  breakEvenGrossReturn: number;
}

export interface DebtInvestComparison {
  overpayInterestSaved: number;
  overpayActiveMonths: number;
  baselineLoanMonths: number;
  postPayoffInvestMonths: number;
  postPayoffInvestNetGain: number;
  /** Net gain from investing the freed minimum payment after early payoff. */
  freedPaymentInvestNetGain: number;
  investHorizonMonths: number;
  investTotalContributed: number;
  investFutureValue: number;
  investNominalGain: number;
  investNetGain: number;
  overpayTotalBenefit: number;
  investTotalBenefit: number;
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

/** Whole calendar days from `fromIso` (exclusive anchor) to `toIso` (inclusive end). */
export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / 86_400_000);
}

/** Compound daily interest on outstanding balance since the anchor date. */
export function accrueBalanceWithDailyInterest(
  balance: number,
  annualRatePct: number,
  anchorDateIso: string,
  asOfDateIso: string
): number {
  if (balance <= 0.01 || annualRatePct <= 0) return balance;
  const days = daysBetween(anchorDateIso, asOfDateIso);
  if (days <= 0) return balance;
  const dailyRate = annualRatePct / 100 / 365;
  return balance * Math.pow(1 + dailyRate, days);
}

export interface DebtDisplayBalanceInput {
  currentBalance: number;
  annualRate: number;
  /** ISO date (YYYY-MM-DD) the stored balance was last written - accrual anchor. */
  anchorDateIso: string;
  asOfDateIso: string;
}

/**
 * Canonical remaining balance shown on every surface (plan detail, cards, net worth,
 * scenarios): stored balance plus daily compound interest accrued from its anchor date.
 * After a linked rata sync, anchor is terms.updated_at so only days since the last
 * payment are accrued — replay already handled interest inside that payment period.
 */
export function debtDisplayBalance(input: DebtDisplayBalanceInput): number {
  return accrueBalanceWithDailyInterest(
    input.currentBalance,
    input.annualRate,
    input.anchorDateIso,
    input.asOfDateIso
  );
}

export interface EstimateInterestAccruedInput {
  originalAmount: number;
  currentBalance: number;
  annualRate: number;
  anchorBalance?: number | null;
  balanceAnchorDate?: string | null;
  /** When dated linked raty are available, replay interest per payment period. */
  linkedPayments?: { amount: number; date?: string }[];
}

/**
 * Estimated total interest accrued since the loan start, for reference display only.
 * With linked raty: sum monthly interest from each replayed payment period.
 * Without linked raty: approximate from the current holdings balance × daily rate × elapsed
 * days - matches the "~40 zł/dzień × okres" mental model and reflects overpayments already
 * baked into the stored balance, instead of averaging against the original principal.
 */
export function estimateInterestAccruedSince(
  input: EstimateInterestAccruedInput,
  startDateIso: string,
  asOfDateIso: string
): number {
  if (input.annualRate <= 0) return 0;
  const days = daysBetween(startDateIso, asOfDateIso);
  if (days <= 0) return 0;

  if (input.linkedPayments && input.linkedPayments.length > 0) {
    const replayInput = {
      originalAmount: input.originalAmount,
      annualRate: input.annualRate,
      linkedExpenses: input.linkedPayments,
      anchorBalance: input.anchorBalance,
      balanceAnchorDate: input.balanceAnchorDate,
    };
    const { forwardExpenses } = resolveDebtReplay(replayInput);
    if (forwardExpenses.length > 0) {
      return interestAccruedFromLinkedPayments(replayInput);
    }
  }

  const balance = Math.max(0, input.currentBalance);
  return approximateDailyInterest(balance, input.annualRate) * days;
}

/** Monthly interest on the current balance at the plan rate. */
export function monthlyInterestAmount(currentBalance: number, annualRate: number): number {
  return currentBalance * (annualRate / 100 / 12);
}

/** True when the scheduled payment does not cover monthly interest (negative amortization risk). */
export function isPaymentBelowMonthlyInterest(
  currentBalance: number,
  annualRate: number,
  monthlyPayment: number
): boolean {
  if (currentBalance <= 0.01) return false;
  return monthlyPayment < monthlyInterestAmount(currentBalance, annualRate) - 0.01;
}

/** Future value of a single lump-sum contribution compounded monthly. */
export function lumpSumInvestGain(
  amount: number,
  months: number,
  grossAnnualReturnPct: number
): Pick<AnnuityInvestResult, "futureValue" | "nominalGain" | "netGain"> {
  if (amount <= 0 || months <= 0) {
    return { futureValue: amount, nominalGain: 0, netGain: 0 };
  }
  const monthlyRate = grossAnnualReturnPct / 100 / 12;
  const futureValue = monthlyRate > 0 ? amount * Math.pow(1 + monthlyRate, months) : amount;
  const nominalGain = Math.max(0, futureValue - amount);
  const netGain = nominalGain * (1 - BELKA_RATE);
  return { futureValue, nominalGain, netGain };
}

/** Future value and net gain from monthly contributions at a gross annual return. */
export function annuityInvestGain(
  monthlyPayment: number,
  months: number,
  grossAnnualReturnPct: number
): AnnuityInvestResult {
  if (months <= 0 || monthlyPayment <= 0) {
    return { months: 0, totalContributed: 0, futureValue: 0, nominalGain: 0, netGain: 0 };
  }
  const monthlyRate = grossAnnualReturnPct / 100 / 12;
  const totalContributed = monthlyPayment * months;
  let futureValue = totalContributed;
  if (monthlyRate > 0) {
    futureValue = monthlyPayment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  }
  const nominalGain = Math.max(0, futureValue - totalContributed);
  const netGain = nominalGain * (1 - BELKA_RATE);
  return { months, totalContributed, futureValue, nominalGain, netGain };
}

/**
 * Compare overpay vs invest at the same end date (baseline loan maturity).
 * Overpay path: interest saved while nadpłacasz, then invest surplus + freed minimum payment until baseline horizon.
 * Invest path: invest the monthly surplus for the full baseline loan life (minimum payment continues).
 */
export function compareOverpayVsInvest(
  input: Omit<DebtAmortizationInput, "extraMonthlyPayment" | "lumpSumPayment">,
  extraMonthlyPayment: number,
  assumedInvestReturnPct: number
): DebtInvestComparison {
  const overpay = compareOverpay(input, extraMonthlyPayment);
  const baselineLoanMonths = overpay.baseline.payoffMonths || 1;
  const overpayActiveMonths = overpay.withExtra.payoffMonths || 1;
  const postPayoffInvestMonths = Math.max(0, baselineLoanMonths - overpayActiveMonths);

  const investFull = annuityInvestGain(
    extraMonthlyPayment,
    baselineLoanMonths,
    assumedInvestReturnPct
  );
  const postPayoffInvest = annuityInvestGain(
    extraMonthlyPayment,
    postPayoffInvestMonths,
    assumedInvestReturnPct
  );
  const freedPaymentInvest = annuityInvestGain(
    input.monthlyPayment,
    postPayoffInvestMonths,
    assumedInvestReturnPct
  );

  const overpayInterestSaved = overpay.interestSaved;
  const overpayTotalBenefit =
    overpayInterestSaved + postPayoffInvest.netGain + freedPaymentInvest.netGain;
  const investTotalBenefit = investFull.netGain;
  const effectiveInvestReturnPct = effectiveReturnAfterBelka(assumedInvestReturnPct);
  const breakEvenGrossReturn = breakEvenGrossBeatsLoan(input.annualRate);

  const tieBand = 0.02;
  let recommendation: DebtInvestComparison["recommendation"] = "tie";
  if (overpayTotalBenefit > investTotalBenefit * (1 + tieBand)) recommendation = "overpay";
  else if (investTotalBenefit > overpayTotalBenefit * (1 + tieBand)) recommendation = "invest";

  return {
    overpayInterestSaved,
    overpayActiveMonths,
    baselineLoanMonths,
    postPayoffInvestMonths,
    postPayoffInvestNetGain: postPayoffInvest.netGain,
    freedPaymentInvestNetGain: freedPaymentInvest.netGain,
    investHorizonMonths: baselineLoanMonths,
    investTotalContributed: investFull.totalContributed,
    investFutureValue: investFull.futureValue,
    investNominalGain: investFull.nominalGain,
    investNetGain: investFull.netGain,
    overpayTotalBenefit,
    investTotalBenefit,
    effectiveInvestReturnPct,
    recommendation,
    breakEvenGrossReturn,
  };
}

/**
 * Compare one-time lump-sum overpay vs investing the same amount until baseline loan maturity.
 */
export function compareLumpSumVsInvest(
  input: Omit<DebtAmortizationInput, "extraMonthlyPayment" | "lumpSumPayment">,
  lumpSumPayment: number,
  assumedInvestReturnPct: number
): DebtLumpInvestComparison {
  const lump = compareLumpSumOverpay(input, lumpSumPayment);
  const baselineLoanMonths = lump.baseline.payoffMonths || 1;
  const overpayPayoffMonths = lump.withLump.payoffMonths || 1;
  const postPayoffInvestMonths = Math.max(0, baselineLoanMonths - overpayPayoffMonths);

  const freedPaymentInvest = annuityInvestGain(
    input.monthlyPayment,
    postPayoffInvestMonths,
    assumedInvestReturnPct
  );
  const investLump = lumpSumInvestGain(lumpSumPayment, baselineLoanMonths, assumedInvestReturnPct);

  const overpayTotalBenefit = lump.interestSaved + freedPaymentInvest.netGain;
  const investTotalBenefit = investLump.netGain;
  const effectiveInvestReturnPct = effectiveReturnAfterBelka(assumedInvestReturnPct);
  const breakEvenGrossReturn = breakEvenGrossBeatsLoan(input.annualRate);

  const tieBand = 0.02;
  let recommendation: DebtLumpInvestComparison["recommendation"] = "tie";
  if (overpayTotalBenefit > investTotalBenefit * (1 + tieBand)) recommendation = "overpay";
  else if (investTotalBenefit > overpayTotalBenefit * (1 + tieBand)) recommendation = "invest";

  return {
    lumpSumPayment,
    interestSaved: lump.interestSaved,
    monthsSaved: lump.monthsSaved,
    baselineLoanMonths,
    overpayPayoffMonths,
    postPayoffInvestMonths,
    freedPaymentInvestNetGain: freedPaymentInvest.netGain,
    investFutureValue: investLump.futureValue,
    investNominalGain: investLump.nominalGain,
    investNetGain: investLump.netGain,
    overpayTotalBenefit,
    investTotalBenefit,
    effectiveInvestReturnPct,
    recommendation,
    breakEvenGrossReturn,
  };
}
