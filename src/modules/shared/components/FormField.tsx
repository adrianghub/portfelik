import { Label } from "@/components/ui/label";
import { cn } from "@/lib/styling-utils";

interface FormFieldProps {
  name: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  name,
  label,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name} className="text-sm font-medium">
        {label}
      </Label>
      <div>
        {children}
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>
    </div>
  );
}
