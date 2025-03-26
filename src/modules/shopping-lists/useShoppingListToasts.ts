import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function useShoppingListToasts() {
  const { t } = useTranslation();

  const showSuccessToast = (
    action: "create" | "update" | "delete" | "complete" | "duplicate",
  ) => {
    const messages = {
      create: t("shoppingLists.toasts.createSuccess"),
      update: t("shoppingLists.toasts.updateSuccess"),
      delete: t("shoppingLists.toasts.deleteSuccess"),
      complete: t("shoppingLists.toasts.completeSuccess"),
      duplicate: t("shoppingLists.toasts.duplicateSuccess"),
    };

    toast.success(messages[action]);
  };

  const showErrorToast = (
    action: "create" | "update" | "delete" | "complete" | "duplicate",
    error: unknown,
  ) => {
    const messages = {
      create: t("shoppingLists.toasts.createError"),
      update: t("shoppingLists.toasts.updateError"),
      delete: t("shoppingLists.toasts.deleteError"),
      complete: t("shoppingLists.toasts.completeError"),
      duplicate: t("shoppingLists.toasts.duplicateError"),
    };

    toast.error(messages[action]);
    console.error(`Error ${action}ing shopping list:`, error);
  };

  return {
    showSuccessToast,
    showErrorToast,
  };
}
