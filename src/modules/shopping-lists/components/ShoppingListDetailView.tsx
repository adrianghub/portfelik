import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDisplayDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format-currency";
import { useFetchCategories } from "@/modules/shared/categories/useCategoriesQuery";
import { FloatingActionButtonGroup } from "@/modules/shared/components/FloatingActionButtonGroup";
import { ShoppingListCompleteDialog } from "@/modules/shopping-lists/components/ShoppingListCompleteDialog";
import {
  useCompleteShoppingList,
  useUpdateShoppingList,
} from "@/modules/shopping-lists/hooks/useShoppingListItemsQuery";
import {
  useCreateShoppingList,
  useShoppingList,
} from "@/modules/shopping-lists/hooks/useShoppingListsQuery";
import {
  type ShoppingList,
  type ShoppingListItem,
} from "@/modules/shopping-lists/shopping-list";
import { useAddTransaction } from "@/modules/transactions/hooks/useTransactionsQuery";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShoppingListDetailForm } from "./ShoppingListDetailForm";
import { ShoppingListItem as ShoppingListItemComponent } from "./ShoppingListItem";
import { ShoppingListItemDialog } from "./ShoppingListItemDialog";

interface ShoppingListDetailViewProps {
  id: string;
}

export function ShoppingListDetailView({ id }: ShoppingListDetailViewProps) {
  const navigate = useNavigate();
  const { data: shoppingList, isLoading } = useShoppingList(id);
  const updateShoppingList = useUpdateShoppingList();
  const completeShoppingList = useCompleteShoppingList();
  const createShoppingList = useCreateShoppingList();
  const { data: categories = [] } = useFetchCategories();
  const addTransaction = useAddTransaction();

  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = useState(false);
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [completingList, setCompletingList] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { t } = useTranslation();

  const handleAddItem = (item: ShoppingListItem) => {
    if (!shoppingList) return;

    const updatedItems = [...shoppingList.items, item];
    updateShoppingList.mutate({
      id: shoppingList.id!,
      shoppingList: { items: updatedItems },
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
      shoppingList: { items: updatedItems },
    });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!shoppingList) return;

    const updatedItems = shoppingList.items.filter(
      (item) => item.id !== itemId,
    );

    updateShoppingList.mutate({
      id: shoppingList.id!,
      shoppingList: { items: updatedItems },
    });
  };

  const handleUpdateListName = (shoppingList: ShoppingList) => {
    if (!shoppingList) return;

    updateShoppingList.mutate({
      id: shoppingList.id!,
      shoppingList,
    });
  };

  const handleCompleteListClick = () => {
    setIsCompletionDialogOpen(true);
  };

  const handleCompleteList = async () => {
    if (!shoppingList || !totalAmount || !shoppingList.categoryId) return;

    setCompletingList(true);

    try {
      // Create a transaction first
      const transaction = {
        amount: parseFloat(totalAmount),
        description: t("shoppingLists.shoppingListDetailView.shoppingList", {
          name: shoppingList.name,
        }),
        date: new Date().toISOString(),
        type: "expense" as const,
        categoryId: shoppingList.categoryId,
        shoppingListId: shoppingList.id,
        status: "paid" as const,
        isRecurring: false,
      };

      const result = await addTransaction.mutateAsync(transaction);

      await completeShoppingList.mutateAsync({
        id: shoppingList.id!,
        totalAmount: parseFloat(totalAmount),
        categoryId: shoppingList.categoryId,
        linkedTransactionId: result.id,
      });

      setIsCompletionDialogOpen(false);
      navigate({ to: "/transactions" });
    } catch (error) {
      console.error("Error completing shopping list:", error);
    } finally {
      setCompletingList(false);
    }
  };

  const handleDuplicateList = async () => {
    if (!shoppingList) return;

    try {
      await createShoppingList.mutateAsync({
        name: `${shoppingList.name}`,
        items: shoppingList.items.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          completed: false,
        })),
        categoryId: shoppingList.categoryId,
      });
      navigate({ to: "/shopping-lists" });
    } catch (error) {
      console.error("Error duplicating shopping list:", error);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!shoppingList) return;

    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = shoppingList.items.findIndex(
        (item) => item.id === active.id,
      );
      const newIndex = shoppingList.items.findIndex(
        (item) => item.id === over.id,
      );

      const updatedItems = arrayMove(shoppingList.items, oldIndex, newIndex);

      updateShoppingList.mutate({
        id: shoppingList.id!,
        shoppingList: { items: updatedItems },
      });
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
    return (
      <div>
        {t("shoppingLists.shoppingListDetailView.shoppingListNotFound")}
      </div>
    );
  }

  const isCompleted = shoppingList.status === "completed";
  const itemsCompleted = shoppingList.items.filter(
    (item) => item.completed,
  ).length;
  const totalItems = shoppingList.items.length;
  const progress = totalItems > 0 ? (itemsCompleted / totalItems) * 100 : 0;
  const allItemsCompleted = totalItems > 0 && itemsCompleted === totalItems;
  const selectedCategory = categories.find(
    (c) => c.id === shoppingList.categoryId,
  );

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
            <h1 className="font-bold flex items-center">
              <div className="truncate max-w-2xl">{shoppingList.name}</div>
              {shoppingList.groupId && (
                <span
                  className="ml-2 text-muted-foreground"
                  title={t("shoppingLists.shoppingListDetailView.sharedList")}
                >
                  <Users className="h-5 w-5" />
                </span>
              )}
            </h1>
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

        <div className="flex gap-2">
          {isCompleted && (
            <Button onClick={handleDuplicateList} className="flex items-center">
              <CopyIcon className="h-4 w-4 mr-2" />
              {t("shoppingLists.shoppingListDetailView.duplicateList")}
            </Button>
          )}

          {!isCompleted && (
            <Button
              onClick={handleCompleteListClick}
              disabled={!allItemsCompleted || shoppingList.items.length === 0}
              className="hidden md:flex"
            >
              <CheckIcon className="h-4 w-4 mr-2" />
              {t("shoppingLists.shoppingListDetailView.completeShopping")}
            </Button>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-background pt-4 pb-2 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 border-b">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {t("shoppingLists.shoppingListDetailView.progress", {
                total: totalItems,
                count: itemsCompleted,
              })}
            </div>
            <div className="text-sm font-medium">{Math.round(progress)}%</div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {isCompleted && (
        <div className="bg-muted p-4 rounded-md">
          <div className="text-sm text-muted-foreground">
            {t("shoppingLists.shoppingListDetailView.completedOn", {
              date: formatDisplayDate(shoppingList.updatedAt),
            })}
          </div>
          <div className="font-medium">
            {t("shoppingLists.shoppingListDetailView.totalAmount", {
              amount: shoppingList.totalAmount
                ? formatCurrency(shoppingList.totalAmount)
                : formatCurrency(0),
            })}
          </div>
          <div className="text-sm">
            {t("shoppingLists.shoppingListDetailView.category", {
              category:
                selectedCategory?.name ||
                t("shoppingLists.shoppingListDetailView.none"),
            })}
          </div>
        </div>
      )}

      <div className="bg-card rounded-md border">
        <div className="p-4 border-b flex flex-col md:flex-row justify-between items-center">
          <div>
            <h2 className="font-medium">
              {t("shoppingLists.shoppingListDetailView.items", {
                count: totalItems,
              })}
            </h2>
          </div>

          {!isCompleted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddItemDialog(true)}
              className="mt-4 md:mt-0 hidden md:flex"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              {t("shoppingLists.shoppingListDetailView.addItem")}
            </Button>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="divide-y">
            {shoppingList.items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t("shoppingLists.shoppingListDetailView.noItems")}
              </div>
            ) : (
              <SortableContext
                items={shoppingList.items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {shoppingList.items.map((item) => (
                  <div key={item.id}>
                    <ShoppingListItemComponent
                      item={item}
                      onUpdate={handleUpdateItem}
                      onDelete={handleDeleteItem}
                      disabled={isCompleted}
                    />
                  </div>
                ))}
              </SortableContext>
            )}
          </div>
        </DndContext>
      </div>

      {!isCompleted && (
        <FloatingActionButtonGroup
          buttons={[
            {
              icon: ShoppingCart,
              onClick: handleCompleteListClick,
              disabled: !allItemsCompleted || shoppingList.items.length === 0,
              label: t("shoppingLists.shoppingListDetailView.completeShopping"),
              className: "bg-primary/90 hover:bg-primary text-background",
              iconClassName: "text-background",
            },
            {
              icon: PlusIcon,
              onClick: () => setShowAddItemDialog(true),
              label: t("shoppingLists.shoppingListDetailView.addItem"),
            },
          ]}
        />
      )}

      <ShoppingListItemDialog
        open={showAddItemDialog}
        onOpenChange={setShowAddItemDialog}
        onAddItem={handleAddItem}
      />

      <ShoppingListDetailForm
        open={isEditNameDialogOpen}
        onOpenChange={setIsEditNameDialogOpen}
        onSave={handleUpdateListName}
        initialValues={shoppingList}
      />

      <ShoppingListCompleteDialog
        open={isCompletionDialogOpen}
        onOpenChange={setIsCompletionDialogOpen}
        totalAmount={parseFloat(totalAmount)}
        setTotalAmount={(amount) => setTotalAmount(amount.toString())}
        handleCompleteList={handleCompleteList}
        completingList={completingList}
        categories={categories}
        selectedCategory={selectedCategory}
      />
    </div>
  );
}
