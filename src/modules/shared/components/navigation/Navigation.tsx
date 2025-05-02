import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/lib/firebase/firebase";
import { useNotificationSetup } from "@/modules/shared/notifications/hooks/useNotificationSetup";
import { Link, useNavigate } from "@tanstack/react-router";
import { t } from "i18next";
import { LogOut } from "lucide-react";
import { MobileMenu } from "./MobileMenu";
import { NavigationLinks } from "./NavigationLinks";
import { NotificationButton } from "./NotificationButton";

export function Navigation() {
  const { isAuthenticated, userData } = useAuth();
  const navigate = useNavigate();
  const isAdmin = userData?.role === "admin";
  const { notificationPermission, handleNotificationPermission } =
    useNotificationSetup();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <>
      <header className="sticky top-0 z-100 hidden md:block bg-background shadow border-b border-border">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-xl font-bold text-foreground">
                {t("app.name")}
              </Link>
            </div>

            <div className="flex items-center space-x-8">
              <NavigationLinks isAdmin={isAdmin} />
              <div className="flex items-center space-x-4">
                {isAuthenticated && (
                  <NotificationButton
                    permission={notificationPermission}
                    onClick={handleNotificationPermission}
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  {t("auth.signOut")}
                </Button>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-lg z-50">
        <div className="flex items-center justify-between h-16 px-4">
          <Link to="/" className="text-xl font-bold text-foreground">
            {t("app.name")}
          </Link>
          <MobileMenu
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            notificationPermission={notificationPermission}
            onNotificationClick={handleNotificationPermission}
            onLogout={handleLogout}
          />
        </div>
      </nav>
    </>
  );
}
