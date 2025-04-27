import { Loader } from "@/components/Loader";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useAuth } from "@/hooks/useAuth";
import { registerServiceWorker } from "@/lib/service-worker";
import { Navigation } from "@/modules/shared/components/navigation/Navigation";
import {
  createRootRoute,
  ErrorComponent,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

async function registerSW() {
  const sw = await registerServiceWorker();

  if (sw) {
    console.log("[Service worker] - Registered");
  } else {
    console.log("[Service worker] - Not registered");
  }
}

function RootLayout() {
  const navigate = useNavigate();
  const { userData, isLoading, currentUser } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const currentPath = window.location.pathname;
    const isLoginPage = currentPath === "/login";
    const isRootPage = currentPath === "/";

    if (!currentUser) {
      if (!isLoginPage) {
        navigate({ to: "/login", search: { redirect: "/transactions" } });
      }
      return;
    }

    if (isRootPage) {
      navigate({ to: "/transactions" });
    }

    registerSW();
  }, [userData, navigate, isLoading, currentUser]);

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <OfflineIndicator />
      {currentUser && <Navigation />}
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 mb-12">
          <Outlet />
        </div>
      </main>
      {process.env.NODE_ENV === "development" && <TanStackRouterDevtools />}
    </div>
  );
}

function ErrorBoundary({ error }: { error: Error }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold text-destructive mb-4">
        {t("common.error.title")}
      </h1>
      <p className="text-muted-foreground mb-4">
        {t("common.error.description")}
      </p>
      <ErrorComponent error={error} />
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: ErrorBoundary,
});
