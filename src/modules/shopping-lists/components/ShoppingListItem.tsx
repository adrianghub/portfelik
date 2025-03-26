import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type ShoppingListItem as ShoppingListItemType } from "@/modules/shopping-lists/shopping-list";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Edit, GripVertical, Trash2Icon } from "lucide-react";
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
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined),
    );

    onUpdate(itemId, filteredUpdates);
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

        <Checkbox
          checked={item.completed}
          onCheckedChange={handleToggle}
          disabled={disabled}
          className="h-4 w-4"
        />

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
            >
              <Edit className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(item.id)}
            disabled={disabled}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2Icon className="w-4 h-4" />
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
