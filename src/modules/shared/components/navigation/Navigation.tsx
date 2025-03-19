import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/firebase/firebase";
import { saveFCMToken } from "@/lib/notifications";
import {
  checkNotificationSupport,
  getFCMToken,
  requestNotificationPermission,
} from "@/lib/service-worker";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { MobileMenu } from "./MobileMenu";
import { NavigationLinks } from "./NavigationLinks";
import { NotificationButton } from "./NotificationButton";

/**
 * Custom hook to handle notification setup
 */
function useNotificationSetup() {
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(Notification.permission);

  useEffect(() => {
    const { permission } = checkNotificationSupport();
    setNotificationPermission(permission);
  }, []);

  const handleNotificationPermission = async () => {
    try {
      if (notificationPermission === "granted") {
        console.log("Notifications are already enabled.");
        return;
      }

      const granted = await requestNotificationPermission();
      setNotificationPermission(granted ? "granted" : "denied");

      if (granted) {
        const token = await getFCMToken();
        if (token) await saveFCMToken(token);
      } else {
        alert("Please enable notifications in your browser settings.");
      }
    } catch (error) {
      console.error("Error enabling notifications:", error);
      alert("Failed to enable notifications.");
    }
  };

  return { notificationPermission, handleNotificationPermission };
}

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
    <header className="bg-gray-100 shadow">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" className="text-xl font-bold text-gray-800">
              Portfelik
            </Link>
          </div>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <NavigationLinks isAdmin={isAdmin} />
            <div className="flex items-center space-x-4">
              {isAuthenticated && (
                <NotificationButton
                  permission={notificationPermission}
                  onClick={handleNotificationPermission}
                />
              )}
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

          {/* Mobile menu */}
          <div className="md:hidden flex items-center">
            <MobileMenu
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              notificationPermission={notificationPermission}
              onNotificationClick={handleNotificationPermission}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </nav>
    </header>
  );
}
