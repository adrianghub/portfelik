import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { flexRender, type Table as TableType } from "@tanstack/react-table";
import type { Transaction } from "../transaction";

interface TransactionTableBodyProps {
  table: TableType<Transaction>;
  isMobile: boolean;
  hasSelectedRows: boolean;
  setSelectedTransaction: (transaction: Transaction) => void;
  handleDelete: (id?: string) => void;
}

export function TransactionTableBody({
  table,
  isMobile,
  hasSelectedRows,
  setSelectedTransaction,
}: TransactionTableBodyProps) {
  return (
    <div className="rounded-md border isolate">
      <div className="relative w-full overflow-auto">
        <Table className="relative">
          {!isMobile && (
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header, index) => {
                    let stickyClass = "";
                    if (hasSelectedRows) {
                      if (index === 0) {
                        stickyClass = "sticky left-0 bg-background z-20";
                      } else if (index === 1) {
                        stickyClass = "sticky left-[45px] bg-background z-10";
                      }
                    } else if (index === 1) {
                      stickyClass = "sticky left-0 bg-background z-10";
                    }

                    return (
                      <TableHead
                        key={header.id}
                        className={cn("text-sm font-medium", stickyClass)}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
          )}
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className={isMobile ? "hover:bg-gray-50 cursor-pointer" : ""}
                onClick={() => {
                  if (isMobile) {
                    setSelectedTransaction(row.original);
                  }
                }}
              >
                {row.getVisibleCells().map((cell, index) => {
                  let stickyClass = "";
                  if (!isMobile) {
                    if (hasSelectedRows) {
                      if (index === 0) {
                        stickyClass = "sticky left-0 bg-background z-20";
                      } else if (index === 1) {
                        stickyClass = "sticky left-[45px] bg-background z-10";
                      }
                    } else if (index === 1) {
                      stickyClass = "sticky left-0 bg-background z-10";
                    }
                  }

                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(stickyClass, isMobile && "p-3")}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
