import { cn } from "@/lib/styling-utils";
import { Link, LinkProps } from "@tanstack/react-router";

interface NavLinkProps extends Omit<LinkProps, "activeProps"> {
  children: React.ReactNode;
  isMobile?: boolean;
  onNavigate?: () => void;
  className?: string;
  activeProps?: {
    className?: string;
    [key: string]: unknown;
  };
}

export function NavLink({
  children,
  isMobile = false,
  onNavigate,
  className,
  activeProps,
  ...props
}: NavLinkProps) {
  if (isMobile) {
    return (
      <Link
        onClick={onNavigate}
        className={cn(
          "block w-full px-3 py-4 text-base font-medium text-foreground hover:text-foreground",
          className,
        )}
        activeProps={{
          className: "text-accent-foreground bg-accent font-bold",
          ...activeProps,
        }}
        {...props}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      className={cn(
        "text-lg font-medium text-foreground hover:text-foreground relative py-5",
        className,
      )}
      activeProps={{
        className: "!text-accent-foreground font-bold",
        ...activeProps,
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
