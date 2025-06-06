import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { UserData } from "@/modules/admin/users/UserService";
import { useTransactionColumns } from "@/modules/transactions/hooks/useTransactionTableColumns";
import type { Transaction } from "@/modules/transactions/transaction";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useState } from "react";
import { useTransactionTableData } from "../hooks/useTransactionTableData";
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
  userData: UserData | null;
}

export function TransactionTable({
  transactions,
  onEdit,
  rowSelection,
  setRowSelection,
  userData,
}: TransactionTableProps) {
  const {
    userEmails,
    shoppingLists,
    deletingId,
    loadingUsers,
    loadingShoppingLists,
    handleDelete,
    getCategoryName,
  } = useTransactionTableData(transactions, userData?.uid);

  const isMobile = useMediaQuery("(max-width: 768px)");
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const hasSelectedRows = Object.keys(rowSelection).some(
    (id) => rowSelection[id],
  );

  const columns = useTransactionColumns({
    isMobile,
    onEdit,
    userEmails,
    shoppingLists,
    loadingUsers,
    loadingShoppingLists,
    deletingId,
    getCategoryName,
    handleDelete,
    setSelectedTransaction,
    userData,
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
        userData={userData}
      />
    </>
  );
}
