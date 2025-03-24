import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDisplayDate } from "@/lib/date-utils";
import type { Category } from "@/modules/shared/category";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import {
  useCreateShoppingList,
  useDeleteShoppingList,
  useShoppingLists,
} from "@/modules/shopping-lists/useShoppingListsQuery";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarIcon,
  CopyIcon,
  FilterIcon,
  ListIcon,
  Plus,
  ShoppingBagIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
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
  const { data: categories = [] } = useFetchCategories();

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
    // Reset filters when switching tabs
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

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filter by category:</span>
          <Select
            value={selectedCategoryId}
            onValueChange={setSelectedCategoryId}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {expenseCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCategoryId !== "all" && (
            <Button
              variant="ghost"
              onClick={() => setSelectedCategoryId("all")}
              size="sm"
            >
              Clear
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
          <TabsTrigger value="active">Active Lists</TabsTrigger>
          <TabsTrigger value="completed">Completed Lists</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {loadingActive ? (
            <div className="text-center p-4">Loading active lists...</div>
          ) : filteredActiveLists.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-card">
              <ShoppingBagIcon className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {selectedCategoryId !== "all"
                  ? "No active shopping lists in this category"
                  : "No active shopping lists"}
              </p>
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
            <div className="text-center p-4">Loading completed lists...</div>
          ) : filteredCompletedLists.length === 0 ? (
            <div className="text-center py-8 border rounded-md bg-card">
              <CalendarIcon className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {selectedCategoryId !== "all"
                  ? "No completed shopping lists in this category"
                  : "No completed shopping lists"}
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
                title="Duplicate list"
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
              className="text-red-600 hover:text-red-600 hover:bg-red-50"
              title="Delete list"
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
    </div>
  );
}
