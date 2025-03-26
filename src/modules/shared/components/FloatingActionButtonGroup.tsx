import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LucideIcon } from "lucide-react";

export interface FloatingActionButtonProps {
  icon: LucideIcon;
  onClick: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  iconClassName?: string;
}

export interface FloatingActionButtonGroupProps {
  buttons: FloatingActionButtonProps[];
  className?: string;
}

export function FloatingActionButton({
  icon: Icon,
  onClick,
  label,
  className,
  iconClassName,
  disabled,
}: FloatingActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        "rounded-full shadow-lg p-5 h-14 w-14 flex items-center justify-center bg-secondary hover:bg-secondary/90",
        className,
      )}
      aria-label={label}
      disabled={disabled}
    >
      <Icon className={cn("h-4 w-4 text-foreground", iconClassName)} />
    </Button>
  );
}

export function FloatingActionButtonGroup({
  buttons,
  className,
}: FloatingActionButtonGroupProps) {
  if (!buttons.length) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 md:hidden z-50",
        className,
      )}
    >
      {buttons.map((button, index) => (
        <FloatingActionButton key={index} {...button} />
      ))}
    </div>
  );
}
