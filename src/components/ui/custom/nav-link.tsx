import { cn } from "@/lib/utils";
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
          "block w-full px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50",
          className,
        )}
        activeProps={{
          className:
            "text-blue-700 bg-blue-50 font-bold border-l-4 border-blue-600 pl-2",
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
        "text-lg font-medium text-gray-700 hover:text-gray-900 relative py-5",
        className,
      )}
      activeProps={{
        className:
          "text-blue-700 font-bold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600",
        ...activeProps,
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
