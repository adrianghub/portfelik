import { Button } from "@/components/ui/button";
import { type ShoppingListItem as ShoppingListItemType } from "@/modules/shopping-lists/shopping-list";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckIcon, GripVertical, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ShoppingListItemDialog } from "./ShoppingListItemDialog";

interface ShoppingListItemProps {
  item: ShoppingListItemType;
  onUpdate: (id: string, updates: Partial<ShoppingListItemType>) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export function ShoppingListItem({
  item,
  onUpdate,
  onDelete,
  disabled = false,
}: ShoppingListItemProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleToggle = () => {
    onUpdate(item.id, { completed: !item.completed });
  };

  const handleRowClick = (e: React.MouseEvent) => {
    if (!disabled && e.target === e.currentTarget) {
      handleToggle();
    }
  };

  const handleUpdateItem = (
    itemId: string,
    updates: Partial<ShoppingListItemType>,
  ) => {
    const updatedItem = {
      ...item,
      ...updates,
    };

    onUpdate(itemId, updatedItem);
  };

  return (
    <div ref={setNodeRef} style={style} className="relative border-b">
      <div
        className="flex items-center space-x-2 py-3 px-2 rounded hover:bg-accent/50 cursor-pointer w-full"
        onClick={handleRowClick}
      >
        {!disabled && (
          <div
            className="cursor-grab touch-none flex items-center px-1"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          disabled={disabled}
          className={`h-6 w-6 rounded-full p-0 shrink-0 ${
            item.completed ? "bg-primary text-primary-foreground" : "border"
          }`}
        >
          {item.completed && <CheckIcon className="h-3 w-3" />}
        </Button>

        <div
          className={`flex-1 ${
            item.completed ? "line-through text-muted-foreground" : ""
          }`}
          onClick={(e) => {
            if (!disabled) {
              e.stopPropagation();
              handleToggle();
            }
          }}
        >
          <div className="font-medium">{item.name}</div>
          {(item.quantity !== undefined || item.unit) && (
            <div className="text-sm text-muted-foreground">
              {item.quantity !== undefined && item.quantity}
              {item.quantity !== undefined && item.unit && " "}
              {item.unit}
            </div>
          )}
        </div>

        <div
          className="flex items-center space-x-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {!disabled && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEditDialog(true)}
              className="h-8 w-8"
            >
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(item.id)}
            disabled={disabled}
            className="h-8 w-8"
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ShoppingListItemDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onUpdateItem={handleUpdateItem}
        initialValues={item}
      />
    </div>
  );
}
