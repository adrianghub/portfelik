import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type TransactionToastAction = "create" | "update" | "delete" | "refresh";

export function useTransactionToasts() {
  const { t } = useTranslation();

  const showSuccessToast = (action: TransactionToastAction) => {
    const messages = {
      create: t("transactions.toasts.createSuccess"),
      update: t("transactions.toasts.updateSuccess"),
      delete: t("transactions.toasts.deleteSuccess"),
      refresh: t("transactions.toasts.refreshSuccess"),
    };

    toast.success(messages[action]);
  };

  const showErrorToast = (action: TransactionToastAction, error: unknown) => {
    const messages = {
      create: t("transactions.toasts.createError"),
      update: t("transactions.toasts.updateError"),
      delete: t("transactions.toasts.deleteError"),
      refresh: t("transactions.toasts.refreshError"),
    };

    toast.error(messages[action]);
    console.error(`Error ${action}ing transaction:`, error);
  };

  return {
    showSuccessToast,
    showErrorToast,
  };
}
