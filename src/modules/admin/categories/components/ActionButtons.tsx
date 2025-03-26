import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";

interface ActionButtonsProps {
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onDelete: () => void;
  isSaveDisabled?: boolean;
}

export const ActionButtons = ({
  isEditing,
  onEditStart,
  onEditCancel,
  onEditSave,
  onDelete,
  isSaveDisabled = false,
}: ActionButtonsProps) => {
  if (isEditing) {
    return (
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onEditCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onEditSave} disabled={isSaveDisabled}>
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onEditStart}>
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="text-red-600 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
