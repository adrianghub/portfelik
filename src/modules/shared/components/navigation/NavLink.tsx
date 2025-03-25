import { cn } from "@/lib/cn";
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
          "block w-full px-3 py-4 text-base font-medium text-gray-700 hover:text-gray-900",
          className,
        )}
        activeProps={{
          className: "text-blue-700 bg-blue-50 font-bold",
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
        className: "!text-blue-600 font-bold",
        ...activeProps,
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
