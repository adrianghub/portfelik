import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/firebase/firebase";
import { NavLink } from "@/modules/shared/components/NavLink";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";

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

export function Navigation() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, userData } = useAuth();
  const navigate = useNavigate();

  const isAdmin = userData?.role === "admin";

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

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
              <NavLinks isAdmin={isAdmin} />
            </div>
            <div className="ml-8">
              {isAuthenticated ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/login">Login</Link>
                </Button>
              )}
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
                  <MobileNavLinks
                    onNavigate={() => setOpen(false)}
                    isAdmin={isAdmin}
                  />
                  <div className="mt-4">
                    {isAuthenticated ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          handleLogout();
                          setOpen(false);
                        }}
                        className="flex items-center gap-2 w-full"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="w-full"
                      >
                        <Link to="/login" onClick={() => setOpen(false)}>
                          Login
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
    </header>
  );
}

function NavLinks({ isAdmin }: { isAdmin?: boolean }) {
  // Filter out admin routes if user is not an admin
  const filteredNavItems = NAV_ITEMS.filter(
    (item) => !item.to.startsWith("/admin") || isAdmin,
  );

  return (
    <>
      {filteredNavItems.map((item) => (
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

function MobileNavLinks({
  onNavigate,
  isAdmin,
}: {
  onNavigate: () => void;
  isAdmin?: boolean;
}) {
  // Filter out admin routes if user is not an admin
  const filteredNavItems = NAV_ITEMS.filter(
    (item) => !item.to.startsWith("/admin") || isAdmin,
  );

  return (
    <>
      {filteredNavItems.map((item) => (
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
