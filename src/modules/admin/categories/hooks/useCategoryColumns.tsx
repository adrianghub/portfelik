import type { Category } from "@/modules/shared/category";
import { type ColumnDef } from "@tanstack/react-table";
import { ActionButtons } from "../components/ActionButtons";
import { EditableCell } from "../components/EditableCell";

interface UseCategoryColumnsProps {
  editingId: string | null;
  editForm: { name: string; type: "income" | "expense" } | null;
  updateFormField: (field: "name" | "type", value: string) => void;
  handleStartEdit: (category: Category) => void;
  handleCancelEdit: () => void;
  handleUpdateCategory: () => void;
  confirmDelete: (categoryId: string) => void;
  isSaveDisabled: boolean;
}

export const useCategoryColumns = ({
  editingId,
  editForm,
  updateFormField,
  handleStartEdit,
  handleCancelEdit,
  handleUpdateCategory,
  confirmDelete,
  isSaveDisabled,
}: UseCategoryColumnsProps) => {
  const columns: ColumnDef<Category>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const category = row.original;
        const isEditing = editingId === category.id;

        return (
          <EditableCell
            isEditing={isEditing}
            value={isEditing ? (editForm?.name ?? "") : category.name}
            onChange={(value) => updateFormField("name", value)}
          />
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const category = row.original;
        const isEditing = editingId === category.id;

        return (
          <EditableCell
            isEditing={isEditing}
            value={isEditing ? (editForm?.type ?? "expense") : category.type}
            onChange={(value) => updateFormField("type", value)}
            type="select"
            options={[
              { value: "income", label: "Income" },
              { value: "expense", label: "Expense" },
            ]}
          />
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const category = row.original;
        const isEditing = editingId === category.id;

        return (
          <ActionButtons
            isEditing={isEditing}
            onEditStart={() => handleStartEdit(category)}
            onEditCancel={handleCancelEdit}
            onEditSave={handleUpdateCategory}
            onDelete={() => confirmDelete(category.id)}
            isSaveDisabled={isSaveDisabled}
          />
        );
      },
    },
  ];

  return columns;
};
