import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { isSharedTransaction } from "@/modules/transactions/hooks/useTransactionsQuery";
import type { Transaction } from "@/modules/transactions/transaction";
import { Users } from "lucide-react";

interface SharedTransactionIndicatorProps {
  transaction: Transaction;
}

export function SharedTransactionIndicator({
  transaction,
}: SharedTransactionIndicatorProps) {
  const { userData } = useAuth();
  const currentUserId = userData?.uid;

  if (!isSharedTransaction(transaction, currentUserId)) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className="ml-2 gap-1 px-2 text-xs font-normal text-muted-foreground"
    >
      <Users className="h-3 w-3" />
    </Badge>
  );
}
