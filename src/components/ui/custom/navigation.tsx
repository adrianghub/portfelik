import { NavLink } from "@/components/ui/custom/nav-link";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";

// Route type that matches valid TanStack router routes
type ValidRoute =
  | "/transactions"
  | "/admin"
  | "/admin/categories"
  | "/admin/dashboard";

interface NavItem {
  to: ValidRoute;
  label: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/transactions", label: "Transactions" },
  { to: "/admin", label: "Admin" },
];

export function Navigation() {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-gray-100 shadow">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" className="text-xl font-bold text-gray-800">
              Portfelik
            </Link>
          </div>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center">
            <div className="flex space-x-8">
              <NavLinks />
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-blue-600 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
                  <span className="sr-only">Open main menu</span>
                  <Menu className="h-6 w-6" />
                </button>
              </SheetTrigger>
              <SheetContent>
                <div className="mt-6 flex flex-col gap-4">
                  <MobileNavLinks onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </header>
  );
}

function NavLinks() {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          activeOptions={item.exact ? { exact: true } : undefined}
          className="transition-colors duration-200 hover:text-blue-600"
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

function MobileNavLinks({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          isMobile
          onNavigate={onNavigate}
          activeOptions={item.exact ? { exact: true } : undefined}
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );
}
