import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

const isAdmin = () => {
  // TODO: Replace with real admin check
  return true;
};

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  beforeLoad: () => {
    if (!isAdmin()) {
      return redirect({
        to: "/transactions",
        replace: true,
      });
    }
  },
});

function AdminLayout() {
  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage application settings and configuration
          </p>
        </div>

        <div className="mt-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
