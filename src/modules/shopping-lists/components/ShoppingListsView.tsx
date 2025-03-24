import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDisplayDate } from "@/lib/date-utils";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import {
  useCreateShoppingList,
  useDeleteShoppingList,
  useShoppingLists,
} from "@/modules/shopping-lists/useShoppingListsQuery";
import { Link } from "@tanstack/react-router";
import {
  CalendarIcon,
  ListIcon,
  Plus,
  ShoppingBagIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { ShoppingListForm } from "./ShoppingListForm";

export function ShoppingListsView() {
  const { data: activeLists = [], isLoading: loadingActive } =
    useShoppingLists("active");
  const { data: completedLists = [], isLoading: loadingCompleted } =
    useShoppingLists("completed");
  const createShoppingList = useCreateShoppingList();
  const deleteShoppingList = useDeleteShoppingList();

  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);

  const handleCreateList = async (list: Omit<ShoppingList, "id">) => {
    try {
      await createShoppingList.mutateAsync(list);
      setIsFormDialogOpen(false);
    } catch (error) {
      console.error("Error creating shopping list:", error);
    }
  };

  const handleDeleteList = async (id: string) => {
    if (confirm("Are you sure you want to delete this shopping list?")) {
      try {
        await deleteShoppingList.mutateAsync(id);
      } catch (error) {
        console.error("Error deleting shopping list:", error);
      }
    }
  };

  return (
    <div className="py-6 px-4 md:px-6">
      <div className="mb-6">
        <div className="flex flex-row justify-between items-center mb-4 sm:mb-0">
          <h1 className="flex items-center flex-wrap">Shopping Lists</h1>
          <Button
            onClick={() => setIsFormDialogOpen(true)}
            className="flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden lg:inline">Add List</span>
            <span className="lg:hidden">Add</span>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="active">Active Lists</TabsTrigger>
          <TabsTrigger value="completed">Completed Lists</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {loadingActive ? (
            <div className="text-center p-4">Loading active lists...</div>
          ) : activeLists.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-card">
              <ShoppingBagIcon className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No active shopping lists</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsFormDialogOpen(true)}
              >
                Create your first list
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeLists.map((list) => (
                <ShoppingListCard
                  key={list.id}
                  list={list}
                  onDelete={() => handleDeleteList(list.id!)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {loadingCompleted ? (
            <div className="text-center p-4">Loading completed lists...</div>
          ) : completedLists.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-card">
              <CalendarIcon className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                No completed shopping lists
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {completedLists.map((list) => (
                <ShoppingListCard
                  key={list.id}
                  list={list}
                  onDelete={() => handleDeleteList(list.id!)}
                  isCompleted
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Shopping List</DialogTitle>
          </DialogHeader>
          <ShoppingListForm
            onSubmit={handleCreateList}
            onCancel={() => setIsFormDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ShoppingListCardProps {
  list: ShoppingList;
  onDelete: () => void;
  isCompleted?: boolean;
}

function ShoppingListCard({
  list,
  onDelete,
  isCompleted = false,
}: ShoppingListCardProps) {
  const itemsCompleted = list.items.filter((item) => item.completed).length;
  const totalItems = list.items.length;

  return (
    <div className="border rounded-md overflow-hidden bg-card transition-all hover:shadow">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h3 className="font-medium truncate">{list.name}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center text-sm text-muted-foreground mt-1">
          <CalendarIcon className="h-3 w-3 mr-1" />
          {formatDisplayDate(list.createdAt)}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center text-sm">
            <ListIcon className="h-3 w-3 mr-1" />
            <span>
              {totalItems} {totalItems === 1 ? "item" : "items"}
            </span>
          </div>

          {totalItems > 0 && (
            <div className="text-sm text-muted-foreground">
              {Math.round((itemsCompleted / totalItems) * 100)}% complete
            </div>
          )}
        </div>

        {isCompleted && list.totalAmount && (
          <div className="mt-2 font-medium">
            Total: {list.totalAmount.toFixed(2)} zł
          </div>
        )}
      </div>

      <Link
        to="/shopping-lists/$id"
        params={{ id: list.id! }}
        className="block p-3 text-center text-sm border-t bg-card hover:bg-accent transition-colors"
      >
        View List
      </Link>
    </div>
  );
}
