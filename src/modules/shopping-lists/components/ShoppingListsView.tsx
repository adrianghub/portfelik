import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDisplayDate } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/format-currency";
import { useFetchCategories } from "@/modules/shared/categories/useCategoriesQuery";
import type { Category } from "@/modules/shared/category";
import { CategoryCombobox } from "@/modules/shared/components/CategoryCombobox";
import { FloatingActionButtonGroup } from "@/modules/shared/components/FloatingActionButtonGroup";
import {
  useCreateShoppingList,
  useDeleteShoppingList,
  useShoppingLists,
} from "@/modules/shopping-lists/hooks/useShoppingListsQuery";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarIcon,
  CopyIcon,
  FilterIcon,
  ListIcon,
  Plus,
  ShoppingBagIcon,
  Trash2Icon,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShoppingListForm } from "./ShoppingListForm";

export function ShoppingListsView() {
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("active");

  const { data: activeLists = [], isLoading: loadingActive } = useShoppingLists(
    activeTab === "active" ? "active" : undefined,
  );
  const { data: completedLists = [], isLoading: loadingCompleted } =
    useShoppingLists(activeTab === "completed" ? "completed" : undefined);

  const createShoppingList = useCreateShoppingList();
  const deleteShoppingList = useDeleteShoppingList();
  const { data: categories = [], isLoading: categoriesLoading } =
    useFetchCategories();

  const { t } = useTranslation();

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

  const handleDuplicateList = async (list: ShoppingList) => {
    try {
      await createShoppingList.mutateAsync({
        name: `${list.name}`,
        items: list.items.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          completed: false,
        })),
        categoryId: list.categoryId,
      });

      setActiveTab("active");
    } catch (error) {
      console.error("Error duplicating shopping list:", error);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSelectedCategoryId("all");
  };

  const filteredActiveLists =
    selectedCategoryId !== "all"
      ? activeLists.filter((list) => list.categoryId === selectedCategoryId)
      : activeLists;

  const filteredCompletedLists =
    selectedCategoryId !== "all"
      ? completedLists.filter((list) => list.categoryId === selectedCategoryId)
      : completedLists;

  const expenseCategories = categories.filter(
    (category) => category.type === "expense",
  );

  return (
    <div className="py-6 px-4 md:px-6">
      <div className="mb-6">
        <div className="flex flex-row justify-between items-center mb-4 sm:mb-0">
          <h1 className="flex items-center flex-wrap">
            {t("shoppingLists.title")}
          </h1>
          <Button
            onClick={() => setIsFormDialogOpen(true)}
            className="hidden md:flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            <span>{t("shoppingLists.addList")}</span>
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {t("shoppingLists.filterByCategory")}
          </span>
          <CategoryCombobox
            categories={expenseCategories}
            value={selectedCategoryId}
            onValueChange={setSelectedCategoryId}
            isLoading={categoriesLoading}
          />
          {selectedCategoryId !== "all" && (
            <Button
              variant="ghost"
              onClick={() => setSelectedCategoryId("all")}
              size="sm"
            >
              {t("shoppingLists.clearFilter")}
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="active">
            {t("shoppingLists.activeLists")}
          </TabsTrigger>
          <TabsTrigger value="completed">
            {t("shoppingLists.completedLists")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {loadingActive ? (
            <div className="text-center p-4">
              {t("shoppingLists.loadingActiveLists")}
            </div>
          ) : filteredActiveLists.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-card">
              <ShoppingBagIcon className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {selectedCategoryId !== "all"
                  ? t("shoppingLists.noActiveListsInThisCategory")
                  : t("shoppingLists.noActiveLists")}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsFormDialogOpen(true)}
              >
                {t("shoppingLists.createFirstList")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredActiveLists.map((list) => (
                <ShoppingListCard
                  key={list.id}
                  list={list}
                  onDelete={() => handleDeleteList(list.id!)}
                  categories={categories}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {loadingCompleted ? (
            <div className="text-center p-4">
              {t("shoppingLists.loadingCompletedLists")}
            </div>
          ) : filteredCompletedLists.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-card">
              <CalendarIcon className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {selectedCategoryId !== "all"
                  ? t("shoppingLists.noCompletedListsInThisCategory")
                  : t("shoppingLists.noCompletedLists")}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredCompletedLists.map((list) => (
                <ShoppingListCard
                  key={list.id}
                  list={list}
                  onDelete={() => handleDeleteList(list.id!)}
                  onDuplicate={() => handleDuplicateList(list)}
                  isCompleted
                  categories={categories}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {activeTab === "active" && (
        <FloatingActionButtonGroup
          buttons={[
            {
              icon: Plus,
              onClick: () => setIsFormDialogOpen(true),
              label: t("shoppingLists.addList"),
            },
          ]}
        />
      )}

      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("shoppingLists.createShoppingList")}</DialogTitle>
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
  onDuplicate?: () => void;
  isCompleted?: boolean;
  categories: Category[];
}

function ShoppingListCard({
  list,
  onDelete,
  onDuplicate,
  isCompleted = false,
  categories,
}: ShoppingListCardProps) {
  const itemsCompleted = list.items.filter((item) => item.completed).length;
  const totalItems = list.items.length;
  const category = categories.find((c) => c.id === list.categoryId);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const handleCardClick = () => {
    navigate({ to: "/shopping-lists/$id", params: { id: list.id! } });
  };

  return (
    <div
      className="border rounded-md overflow-hidden bg-card transition-all hover:shadow cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h3 className="font-medium truncate">{list.name}</h3>
          <div className="flex items-center">
            {isCompleted && onDuplicate && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDuplicate();
                }}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title={t("shoppingLists.duplicateList")}
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              title={t("shoppingLists.deleteList")}
            >
              <Trash2Icon className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center text-sm text-muted-foreground mt-1">
          <CalendarIcon className="h-3 w-3 mr-1" />
          {formatDisplayDate(list.createdAt)}
        </div>
        {category && (
          <div className="text-xs mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            {category.name}
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center text-sm">
            <ListIcon className="h-3 w-3 mr-1" />
            <span>
              ({totalItems}) {t("shoppingLists.items")}
            </span>

            {list.groupId && (
              <span className="ml-2 text-muted-foreground" title="Shared list">
                <Users className="h-4 w-4" />
              </span>
            )}
          </div>

          {totalItems > 0 && (
            <div className="text-sm text-muted-foreground">
              {Math.round((itemsCompleted / totalItems) * 100)}%{" "}
              {t("shoppingLists.completed")}
            </div>
          )}
        </div>

        {isCompleted && list.totalAmount && (
          <div className="mt-2 font-medium">
            {t("shoppingLists.total")}: {formatCurrency(list.totalAmount)}
          </div>
        )}
      </div>
    </div>
  );
}
