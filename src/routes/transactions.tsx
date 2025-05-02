import { createProtectedLoader } from "@/lib/protected-route";
import { TransactionsView } from "@/modules/transactions/components/TransactionsView";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const transactionsSearchSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const Route = createFileRoute("/transactions")({
  component: TransactionsView,
  loader: createProtectedLoader(),
  validateSearch: transactionsSearchSchema,
});
