import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDisplayDate } from "@/lib/date-utils";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import { ShoppingListCompleteDialog } from "@/modules/shopping-lists/components/ShoppingListCompleteDialog";
import { type ShoppingListItem } from "@/modules/shopping-lists/shopping-list";
import {
  useCompleteShoppingList,
  useShoppingList,
  useUpdateShoppingList,
} from "@/modules/shopping-lists/useShoppingListsQuery";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  ShoppingCart,
} from "lucide-react";
import { useState } from "react";
import { ShoppingListItem as ShoppingListItemComponent } from "./ShoppingListItem";
import { ShoppingListItemDialog } from "./ShoppingListItemDialog";
import { ShoppingListNameDialog } from "./ShoppingListNameDialog";

interface ShoppingListDetailViewProps {
  id: string;
}

export function ShoppingListDetailView({ id }: ShoppingListDetailViewProps) {
  const navigate = useNavigate();
  const { data: shoppingList, isLoading } = useShoppingList(id);
  const updateShoppingList = useUpdateShoppingList();
  const completeShoppingList = useCompleteShoppingList();
  const { data: categories = [], isLoading: loadingCategories } =
    useFetchCategories();

  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = useState(false);
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [completingList, setCompletingList] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);

  const handleAddItem = (item: ShoppingListItem) => {
    if (!shoppingList) return;

    const updatedItems = [...shoppingList.items, item];
    updateShoppingList.mutate({
      id: shoppingList.id!,
      data: { items: updatedItems },
    });
  };

  const handleUpdateItem = (
    itemId: string,
    updates: Partial<ShoppingListItem>,
  ) => {
    if (!shoppingList) return;

    const updatedItems = shoppingList.items.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item,
    );

    updateShoppingList.mutate({
      id: shoppingList.id!,
      data: { items: updatedItems },
    });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!shoppingList) return;

    const updatedItems = shoppingList.items.filter(
      (item) => item.id !== itemId,
    );

    updateShoppingList.mutate({
      id: shoppingList.id!,
      data: { items: updatedItems },
    });
  };

  const handleUpdateListName = (name: string) => {
    if (!shoppingList) return;

    updateShoppingList.mutate({
      id: shoppingList.id!,
      data: { name },
    });
  };

  const handleCompleteListClick = () => {
    setIsCompletionDialogOpen(true);
  };

  const handleCompleteList = async () => {
    if (!shoppingList || !totalAmount || !selectedCategoryId) return;

    setCompletingList(true);

    try {
      await completeShoppingList.mutateAsync({
        id: shoppingList.id!,
        totalAmount: parseFloat(totalAmount),
        categoryId: selectedCategoryId,
      });

      setIsCompletionDialogOpen(false);
      navigate({ to: "/transactions" });
    } catch (error) {
      console.error("Error completing shopping list:", error);
    } finally {
      setCompletingList(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!shoppingList) {
    return <div>Shopping list not found</div>;
  }

  const isCompleted = shoppingList.status === "completed";
  const itemsCompleted = shoppingList.items.filter(
    (item) => item.completed,
  ).length;
  const totalItems = shoppingList.items.length;
  const progress = totalItems > 0 ? (itemsCompleted / totalItems) * 100 : 0;
  const allItemsCompleted = totalItems > 0 && itemsCompleted === totalItems;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/shopping-lists" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{shoppingList.name}</h1>
            {!isCompleted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditNameDialogOpen(true)}
                className="h-8 w-8 rounded-full"
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {!isCompleted && (
          <Button
            onClick={handleCompleteListClick}
            disabled={!allItemsCompleted || shoppingList.items.length === 0}
            className="hidden md:flex"
          >
            <CheckIcon className="h-4 w-4 mr-2" />
            Complete Shopping
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {itemsCompleted} of {totalItems} items completed
          </div>
          <div className="text-sm font-medium">{Math.round(progress)}%</div>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {isCompleted && (
        <div className="bg-muted p-4 rounded-md">
          <div className="text-sm text-muted-foreground">
            Completed on {formatDisplayDate(shoppingList.updatedAt)}
          </div>
          <div className="font-medium">
            Total amount: {shoppingList.totalAmount?.toFixed(2)} zł
          </div>
          <div className="text-sm">
            Category:{" "}
            {categories.find((c) => c.id === shoppingList.categoryId)?.name ||
              "Unknown"}
          </div>
        </div>
      )}

      <div className="bg-card rounded-md border">
        <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center">
          <div>
            <h2 className="font-medium">{totalItems} items</h2>
            <div className="text-sm text-muted-foreground">
              {itemsCompleted} of {totalItems} completed
            </div>
          </div>

          {!isCompleted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddItemDialog(true)}
              className="mt-4 md:mt-0 hidden md:flex"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          )}
        </div>

        <div className="divide-y">
          {shoppingList.items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No items in this list yet
            </div>
          ) : (
            shoppingList.items.map((item) => (
              <div key={item.id}>
                <ShoppingListItemComponent
                  item={item}
                  onUpdate={handleUpdateItem}
                  onDelete={handleDeleteItem}
                  disabled={isCompleted}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {!isCompleted && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 md:hidden z-10">
          <Button
            onClick={handleCompleteListClick}
            disabled={!allItemsCompleted || shoppingList.items.length === 0}
            className="rounded-full shadow-lg p-5 h-14 w-14 flex items-center justify-center bg-primary/90 hover:bg-primary"
            title="Complete Shopping"
          >
            <ShoppingCart className="h-6 w-6" />
          </Button>
          <Button
            onClick={() => setShowAddItemDialog(true)}
            className="rounded-full shadow-lg p-5 h-14 w-14 flex items-center justify-center bg-secondary/90 hover:bg-secondary"
            title="Add Item"
          >
            <PlusIcon className="h-6 w-6 text-black" />
          </Button>
        </div>
      )}

      <ShoppingListItemDialog
        open={showAddItemDialog}
        onOpenChange={setShowAddItemDialog}
        onAddItem={handleAddItem}
      />

      <ShoppingListNameDialog
        open={isEditNameDialogOpen}
        onOpenChange={setIsEditNameDialogOpen}
        onSave={handleUpdateListName}
        initialName={shoppingList.name}
      />

      <ShoppingListCompleteDialog
        open={isCompletionDialogOpen}
        onOpenChange={setIsCompletionDialogOpen}
        totalAmount={parseFloat(totalAmount)}
        setTotalAmount={(amount) => setTotalAmount(amount.toString())}
        selectedCategoryId={selectedCategoryId}
        setSelectedCategoryId={setSelectedCategoryId}
        handleCompleteList={handleCompleteList}
        completingList={completingList}
        loadingCategories={loadingCategories}
        categories={categories}
      />
    </div>
  );
}
