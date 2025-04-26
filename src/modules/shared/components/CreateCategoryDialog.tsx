import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddCategory,
  useFetchCategories,
} from "@/modules/shared/categories/useCategoriesQuery";
import { FormField } from "@/modules/shared/components/FormField";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface CreateCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryCreated?: (categoryId: string) => void;
}

export function CreateCategoryDialog({
  open,
  onOpenChange,
  onCategoryCreated,
}: CreateCategoryDialogProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addCategory = useAddCategory();
  const { data: categories = [] } = useFetchCategories();

  const form = useForm({
    defaultValues: {
      name: "",
      type: "expense" as "income" | "expense",
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      try {
        const categoryExists = categories.some(
          (category) =>
            category.name.toLowerCase() === value.name.toLowerCase() &&
            category.type === value.type,
        );

        if (categoryExists) {
          return {
            error: {
              name: t("settings.categories.validation.nameExists"),
            },
          };
        }

        const result = await addCategory.mutateAsync({
          id: "",
          name: value.name,
          type: value.type,
        });

        form.reset();
        onOpenChange(false);

        if (result && result.id && onCategoryCreated) {
          onCategoryCreated(result.id);
        }
      } catch (error) {
        console.error("Error creating category:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const validateName = (value: string) => {
    if (!value) return t("settings.categories.validation.nameRequired");
    if (value.length > 50)
      return t("settings.categories.validation.nameMaxLength");

    const categoryExists = categories.some(
      (category) =>
        category.name.toLowerCase() === value.toLowerCase() &&
        category.type === form.getFieldValue("type"),
    );

    if (categoryExists) {
      return t("settings.categories.validation.nameExists");
    }

    return undefined;
  };

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("settings.categories.createNew")}</DialogTitle>
          <DialogDescription>
            {t("settings.categories.createNewDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => validateName(value),
            }}
          >
            {(field) => (
              <FormField
                name="name"
                label={t("settings.categories.name")}
                error={field.state.meta.errors?.[0]}
              >
                <Input
                  placeholder={t("settings.categories.namePlaceholder")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormField>
            )}
          </form.Field>

          <form.Field name="type">
            {(field) => (
              <FormField
                name="type"
                label={t("settings.categories.type")}
                error={field.state.meta.errors?.[0]}
              >
                <Select
                  value={field.state.value}
                  onValueChange={(value) => {
                    const typeValue = value as "income" | "expense";
                    field.handleChange(typeValue);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("settings.categories.typePlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">
                      {t("settings.categories.typeExpense")}
                    </SelectItem>
                    <SelectItem value="income">
                      {t("settings.categories.typeIncome")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </form.Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => form.handleSubmit()}
            >
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
