import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import dayjs, { formatDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import type { Transaction } from "@/modules/transactions/transaction";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
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
import { CategorySelect } from "./CategorySelect";

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
  const { data: categories = [] } = useFetchCategories();

  const [transactionType, setTransactionType] = useState<"income" | "expense">(
    initialValues?.type ?? "expense",
  );

  logger.debug("TransactionForm", "initialValues", initialValues);

  const form = useForm({
    defaultValues: {
      amount: initialValues?.amount ?? 0,
      description: initialValues?.description ?? "",
      date: initialValues?.date
        ? formatDate(dayjs(initialValues.date))
        : formatDate(dayjs()),
      type: initialValues?.type ?? "expense",
      categoryId: initialValues?.categoryId ?? "",
    },
    onSubmit: ({ value }) => {
      const selectedDate = dayjs.utc(value.date).toISOString();

      onSubmit({
        ...value,
        date: selectedDate,
      });
    },
  });

  const { t } = useTranslation();

  const { minDate, maxDate } = getDateConstraints();

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
            onChange: ({ value }) => validateAmount(value),
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
                onChange={(e) =>
                  field.handleChange(parseFloat(e.target.value) || 0)
                }
                placeholder="0.00 zł"
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
                max={maxDate}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
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
              name="categoryId"
              label={t("transactions.transactionDialog.form.category")}
              error={field.state.meta.errors?.[0]}
            >
              <CategorySelect
                value={field.state.value || ""}
                onChange={(value) => field.handleChange(value)}
                categories={categories}
                transactionType={transactionType}
                error={field.state.meta.errors?.[0]}
                placeholder={t(
                  "transactions.transactionDialog.form.categoryPlaceholder",
                )}
              />
            </FormField>
          )}
        </form.Field>
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
