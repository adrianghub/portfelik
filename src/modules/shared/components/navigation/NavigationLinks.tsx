import { NavLink } from "./NavLink";

type ValidRoute =
  | "/"
  | "/transactions"
  | "/login"
  | "/admin"
  | "/admin/categories";

interface NavItem {
  to: ValidRoute;
  label: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/transactions", label: "Transactions" },
  { to: "/admin", label: "Admin" },
];

interface NavigationLinksProps {
  isAdmin?: boolean;
  isMobile?: boolean;
  onNavigate?: () => void;
}

export function NavigationLinks({
  isAdmin,
  isMobile,
  onNavigate,
}: NavigationLinksProps) {
  return (
    <>
      {NAV_ITEMS.filter((item) => !item.to.startsWith("/admin") || isAdmin).map(
        (item) => (
          <NavLink
            key={item.to}
            to={item.to}
            isMobile={isMobile}
            onNavigate={onNavigate}
            activeOptions={item.exact ? { exact: true } : undefined}
            className={
              !isMobile
                ? "transition-colors duration-200 hover:text-blue-600"
                : undefined
            }
          >
            {item.label}
          </NavLink>
        ),
      )}
    </>
  );
}
