import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/modules/shared/category";

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  categories: Category[];
  transactionType?: "income" | "expense";
  error?: string;
  placeholder?: string;
}

export function CategorySelect({
  value,
  onChange,
  categories,
  transactionType,
  error,
  placeholder = "Select category",
}: CategorySelectProps) {
  const filteredCategories = transactionType
    ? categories.filter((cat) => cat.type === transactionType)
    : categories;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={error ? "border-red-500" : ""}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filteredCategories.map((category) => (
          <SelectItem key={category.id} value={category.id!}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
