import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { Transaction } from "@/modules/transactions/transaction";
import { useTransactionColumns } from "@/modules/transactions/useTransactionTableColumns";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useState } from "react";
import { useTransactionTableData } from "../useTransactionTableData";
import { TransactionDetailsSheet } from "./TransactionDetailsSheet";
import { TransactionTableBody } from "./TransactionTableBody";

interface TransactionTableProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
  showUserInfo?: boolean;
  rowSelection: Record<string, boolean>;
  setRowSelection: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
}

export function TransactionTable({
  transactions,
  onEdit,
  showUserInfo = false,
  rowSelection,
  setRowSelection,
}: TransactionTableProps) {
  const {
    userEmails,
    shoppingLists,
    deletingId,
    loadingUsers,
    loadingShoppingLists,
    handleDelete,
    getCategoryName,
  } = useTransactionTableData(transactions, showUserInfo);

  const isMobile = useMediaQuery("(max-width: 768px)");
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const hasSelectedRows = Object.keys(rowSelection).some(
    (id) => rowSelection[id],
  );

  const columns = useTransactionColumns({
    isMobile,
    onEdit,
    showUserInfo,
    userEmails,
    shoppingLists,
    loadingUsers,
    loadingShoppingLists,
    deletingId,
    getCategoryName,
    handleDelete,
    setSelectedTransaction,
  });

  const table = useReactTable({
    data: transactions,
    columns,
    getRowId: (row) => row.id ?? "",
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    enableMultiRowSelection: true,
  });

  return (
    <>
      <TransactionTableBody
        table={table}
        isMobile={isMobile}
        hasSelectedRows={hasSelectedRows}
        setSelectedTransaction={setSelectedTransaction}
        handleDelete={handleDelete}
      />

      <TransactionDetailsSheet
        selectedTransaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
        onEdit={onEdit}
        handleDelete={handleDelete}
        getCategoryName={getCategoryName}
        userEmails={userEmails}
        shoppingLists={shoppingLists}
        loadingUsers={loadingUsers}
        loadingShoppingLists={loadingShoppingLists}
        showUserInfo={showUserInfo}
      />
    </>
  );
}
