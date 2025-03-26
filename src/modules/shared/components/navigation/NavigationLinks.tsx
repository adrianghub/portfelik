import { useTranslation } from "react-i18next";
import { NavLink } from "./NavLink";

type ValidRoute =
  | "/"
  | "/transactions"
  | "/login"
  | "/admin"
  | "/admin/categories"
  | "/shopping-lists";

interface NavItem {
  to: ValidRoute;
  label: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/transactions", label: "nav.transactions" },
  { to: "/shopping-lists", label: "nav.shoppingLists" },
  { to: "/admin", label: "nav.admin" },
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
  const { t } = useTranslation();

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
                ? "transition-colors duration-200 hover:text-accent-foreground"
                : undefined
            }
          >
            {t(item.label)}
          </NavLink>
        ),
      )}
    </>
  );
}
