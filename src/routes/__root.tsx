import { Navigation } from "@/components/ui/custom/navigation";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
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
