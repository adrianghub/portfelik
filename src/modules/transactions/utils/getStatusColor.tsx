import type { TransactionStatus } from "@/modules/transactions/transaction";
import { AlertCircle, Calendar, CheckCircle, Pencil } from "lucide-react";

export const getStatusDisplayProperties = (status: TransactionStatus) => {
  switch (status) {
    case "paid":
      return {
        color: "text-green-800",
        icon: <CheckCircle className="h-4 w-4" />,
      };
    case "draft":
      return {
        color: "text-gray-800",
        icon: <Pencil className="h-4 w-4" />,
      };
    case "upcoming":
      return {
        color: "text-blue-800",
        icon: <Calendar className="h-4 w-4" />,
      };
    case "overdue":
      return {
        color: "text-red-800",
        icon: <AlertCircle className="h-4 w-4" />,
      };
    default:
      return {
        color: "text-gray-800",
        icon: <Pencil className="h-4 w-4" />,
      };
  }
};
