import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function useTransactionToasts() {
  const { t } = useTranslation();

  const showSuccessToast = (action: "create" | "update" | "delete") => {
    const messages = {
      create: t("transactions.toasts.createSuccess"),
      update: t("transactions.toasts.updateSuccess"),
      delete: t("transactions.toasts.deleteSuccess"),
    };

    toast.success(messages[action]);
  };

  const showErrorToast = (
    action: "create" | "update" | "delete",
    error: unknown,
  ) => {
    const messages = {
      create: t("transactions.toasts.createError"),
      update: t("transactions.toasts.updateError"),
      delete: t("transactions.toasts.deleteError"),
    };

    toast.error(messages[action]);
    console.error(`Error ${action}ing transaction:`, error);
  };

  return {
    showSuccessToast,
    showErrorToast,
  };
}
