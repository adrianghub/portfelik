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
  const minYear = dayjs("2024-01-01").year();
  const minDate = dayjs("2024-01-01").format("YYYY-MM-DD");

  return { minDate, minYear };
};

export const validateDate = (value: string): string | undefined => {
  if (!value) return "Date is required";

  const { minYear } = getDateConstraints();
  const selectedDate = dayjs(value);
  const selectedYear = selectedDate.year();

  if (selectedYear < minYear) {
    return "Date cannot be before 2024";
  }

  return undefined;
};

export const validateCategory = (value: string): string | undefined =>
  value?.trim() ? undefined : "Category is required";
