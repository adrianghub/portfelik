import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useRef } from "react";

export const EditableCell = ({
  isEditing,
  value,
  onChange,
  type = "text",
  options,
}: {
  isEditing: boolean;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "select";
  options?: { value: string; label: string }[];
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (!isEditing) {
    return (
      <div className="font-medium">
        {type === "select" ? (
          <span className="capitalize">{value}</span>
        ) : (
          value
        )}
      </div>
    );
  }

  if (type === "select" && options) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="min-w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-[150px]"
    />
  );
};
