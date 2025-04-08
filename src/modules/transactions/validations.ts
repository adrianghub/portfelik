import dayjs from "@/lib/date-utils";

export const validateType = (value: string): string | undefined =>
  ["income", "expense"].includes(value)
    ? undefined
    : "Please select income or expense";

export const validateAmount = (value: number): string | undefined =>
  value > 0 ? undefined : "Amount must be greater than 0";

export const validateDescription = (value: string): string | undefined => {
  if (!value?.trim()) return "Description is required";
  if (value.length > 50) return "Description must be less than 50 characters";
  return undefined;
};

export const getDateConstraints = () => {
  const now = dayjs();
  const currentYear = now.year();
  const currentMonth = now.month();

  const minDate = dayjs().startOf("month").format("YYYY-MM-DD");
  const maxDate = dayjs().endOf("year").format("YYYY-MM-DD");

  return { minDate, maxDate, currentYear, currentMonth };
};

export const validateDate = (value: string): string | undefined => {
  if (!value) return "Date is required";

  const { currentYear, currentMonth } = getDateConstraints();
  const selectedDate = dayjs(value);
  const selectedYear = selectedDate.year();
  const selectedMonth = selectedDate.month();

  if (selectedYear < currentYear) {
    return "Date cannot be before current year";
  }

  if (selectedYear === currentYear && selectedMonth < currentMonth) {
    return "Date cannot be before current month";
  }

  return undefined;
};

export const validateCategory = (value: string): string | undefined =>
  value?.trim() ? undefined : "Category is required";
