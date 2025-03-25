import { useAuth } from "@/lib/AuthContext";
import { Navigation } from "@/modules/shared/components/navigation/Navigation";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

function RootLayout() {
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
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

export const Route = createRootRoute({
  component: RootLayout,
});
