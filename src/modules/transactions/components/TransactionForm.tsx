import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import dayjs, { formatDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format-currency";
import { logger } from "@/lib/logger";
import { useFetchCategories } from "@/modules/shared/categories/useCategoriesQuery";
import { CategoryCombobox } from "@/modules/shared/components/CategoryCombobox";
import {
  statuses,
  types,
  type Transaction,
  type TransactionStatus,
  type TransactionType,
} from "@/modules/transactions/transaction";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormField } from "../../shared/components/FormField";
import {
  getDateConstraints,
  validateAmount,
  validateCategory,
  validateDate,
  validateDescription,
  validateType,
} from "../validations";

interface TransactionFormProps {
  onSubmit: (transaction: Transaction) => void;
  initialValues: Partial<Transaction> | null;
  onCancel?: () => void;
}

export function TransactionForm({
  onSubmit,
  initialValues,
  onCancel,
}: TransactionFormProps) {
  const { t } = useTranslation();
  const { data: categories = [], isLoading: categoriesLoading } =
    useFetchCategories();
  const { minDate } = getDateConstraints();

  const initialAmount = initialValues?.amount
    ? Math.abs(initialValues.amount)
    : 0;

  const [transactionType, setTransactionType] = useState<TransactionType>(
    initialValues?.type ?? types.expense,
  );

  const [isRecurring, setIsRecurring] = useState(
    initialValues?.isRecurring ?? false,
  );
  const [recurringDay, setRecurringDay] = useState(
    initialValues?.recurringDate ||
      (initialValues?.date ? dayjs(initialValues.date).date() : dayjs().date()),
  );

  const [isDateInFuture, setIsDateInFuture] = useState(() => {
    if (initialValues?.date) {
      const selectedDate = dayjs(initialValues.date).startOf("day");
      const today = dayjs().startOf("day");
      return selectedDate.isAfter(today);
    }
    return false;
  });

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === "expense"),
    [categories],
  );

  const incomeCategories = useMemo(
    () => categories.filter((category) => category.type === "income"),
    [categories],
  );

  const filteredCategories = useMemo(
    () =>
      transactionType === "expense" ? expenseCategories : incomeCategories,
    [transactionType, expenseCategories, incomeCategories],
  );

  logger.debug("TransactionForm", "initialValues", initialValues);
  logger.debug(
    "TransactionForm",
    `Categories loaded: ${categories.length}, filtered: ${filteredCategories.length}`,
  );

  const form = useForm({
    defaultValues: {
      amount: initialAmount,
      description: initialValues?.description ?? "",
      date: initialValues?.date
        ? formatDate(dayjs(initialValues.date))
        : formatDate(dayjs()),
      type: initialValues?.type ?? types.expense,
      categoryId: initialValues?.categoryId ?? "",
      status: initialValues?.status ?? statuses.paid,
      isRecurring: initialValues?.isRecurring ?? false,
      recurringDate: initialValues?.recurringDate,
    },
    onSubmit: ({ value }) => {
      onSubmit({
        ...value,
        amount: Math.abs(value.amount),
        date: dayjs.utc(value.date).toISOString(),
        isRecurring,
        recurringDate: isRecurring ? recurringDay : undefined,
        status: calculateStatus(value.status),
      });
    },
  });

  useEffect(() => {
    const dateValue = form.getFieldValue("date") || "";
    const selectedDate = dayjs(dateValue).startOf("day");
    const today = dayjs().startOf("day");
    setIsDateInFuture(selectedDate.isAfter(today));
  }, [form]);

  const calculateStatus = (status: TransactionStatus): TransactionStatus => {
    if (
      isDateInFuture &&
      (status === statuses.draft || status === statuses.paid)
    ) {
      return statuses.upcoming;
    }

    if (status !== statuses.draft && status !== statuses.paid) {
      return status;
    }

    return status;
  };

  const allowedStatuses = isDateInFuture
    ? [statuses.draft, statuses.paid, statuses.upcoming]
    : [statuses.draft, statuses.paid];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-4 py-4">
        <form.Field
          name="type"
          validators={{
            onChange: ({ value }) => validateType(value),
          }}
        >
          {(field) => (
            <FormField
              name="type"
              label={t("transactions.transactionDialog.form.type")}
              error={field.state.meta.errors?.[0]}
            >
              <Select
                value={field.state.value}
                onValueChange={(value) => {
                  const typeValue = value as "income" | "expense";
                  field.handleChange(typeValue);
                  setTransactionType(typeValue);
                  form.setFieldValue("categoryId", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "transactions.transactionDialog.form.selectType",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">
                    {t("transactions.transactionDialog.form.income")}
                  </SelectItem>
                  <SelectItem value="expense">
                    {t("transactions.transactionDialog.form.expense")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
        </form.Field>

        <form.Field
          name="amount"
          validators={{
            onChange: ({ value }) => validateAmount(Math.abs(value)),
          }}
        >
          {(field) => (
            <FormField
              name="amount"
              label={t("transactions.transactionDialog.form.amount")}
              error={field.state.meta.errors?.[0]}
            >
              <Input
                id="amount"
                type="number"
                min="0.01"
                value={Math.abs(field.state.value) || ""}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  field.handleChange(Math.abs(value));
                }}
                placeholder={formatCurrency(0)}
                step="0.01"
              />
            </FormField>
          )}
        </form.Field>

        <form.Field
          name="description"
          validators={{
            onChange: ({ value }) => validateDescription(value),
          }}
        >
          {(field) => (
            <FormField
              name="description"
              label={t("transactions.transactionDialog.form.description")}
              error={field.state.meta.errors?.[0]}
            >
              <Input
                id="description"
                value={field.state.value || ""}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={t(
                  "transactions.transactionDialog.form.descriptionPlaceholder",
                )}
                maxLength={50}
              />
            </FormField>
          )}
        </form.Field>

        <form.Field
          name="date"
          validators={{
            onChange: ({ value }) => validateDate(value),
          }}
        >
          {(field) => (
            <FormField
              name="date"
              label={t("transactions.transactionDialog.form.date")}
              error={field.state.meta.errors?.[0]}
            >
              <Input
                id="date"
                type="date"
                min={minDate}
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value);

                  const selectedDate = dayjs(e.target.value).startOf("day");
                  const today = dayjs().startOf("day");
                  const newIsDateInFuture = selectedDate.isAfter(today);
                  setIsDateInFuture(newIsDateInFuture);

                  const currentStatus = form.getFieldValue("status");

                  // If date is in future and status is draft or paid, update to upcoming
                  if (
                    newIsDateInFuture &&
                    (currentStatus === statuses.draft ||
                      currentStatus === statuses.paid)
                  ) {
                    form.setFieldValue("status", statuses.upcoming);
                  }
                  // If date is not in future and status is upcoming, revert to paid
                  else if (
                    !newIsDateInFuture &&
                    currentStatus === statuses.upcoming
                  ) {
                    form.setFieldValue("status", statuses.paid);
                  }
                }}
              />
            </FormField>
          )}
        </form.Field>

        <form.Field
          name="categoryId"
          validators={{
            onChange: ({ value }) => validateCategory(value),
          }}
        >
          {(field) => (
            <FormField
              name="category"
              label={t("transactions.transactionDialog.form.category")}
              error={field.state.meta.errors?.[0]}
            >
              <CategoryCombobox
                categories={filteredCategories}
                value={field.state.value}
                onValueChange={field.handleChange}
                isLoading={categoriesLoading}
              />
            </FormField>
          )}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <FormField
              name="status"
              label={t("transactions.transactionDialog.form.status")}
              error={field.state.meta.errors?.[0]}
            >
              <Select
                value={field.state.value}
                onValueChange={(value) => {
                  field.handleChange(value as TransactionStatus);
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "transactions.transactionDialog.form.selectStatus",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {allowedStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </form.Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="isRecurring">
              {t("transactions.transactionDialog.form.isRecurring")}
            </Label>
            <Switch
              id="isRecurring"
              checked={isRecurring}
              onCheckedChange={setIsRecurring}
            />
          </div>

          {isRecurring && (
            <FormField
              name="recurringDate"
              label={t("transactions.transactionDialog.form.recurringDay")}
            >
              <Input
                id="recurringDate"
                type="number"
                min="1"
                max="31"
                value={recurringDay}
                onChange={(e) => {
                  const day = parseInt(e.target.value, 10);
                  if (!isNaN(day) && day >= 1 && day <= 31) {
                    setRecurringDay(day);
                  }
                }}
              />
            </FormField>
          )}
        </div>
      </div>

      <DialogFooter className="flex gap-2 mt-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("transactions.transactionDialog.form.cancel")}
        </Button>
        <Button type="submit">
          {t("transactions.transactionDialog.form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
