import { createAdminLoader } from "@/lib/ProtectedRoute";
import { AdminCard } from "@/modules/admin/AdminCard";
import { UserManager } from "@/modules/admin/users/components/UserManager";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  component: AdminView,
  loader: createAdminLoader(),
});

function AdminView() {
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AdminCard
              title="Categories"
              description="Manage transaction categories"
              link="/admin/categories"
            />
          </div>

          <div className="mt-8">
            <h2 className="text-2xl font-bold mb-6">User Management</h2>
            <UserManager />
          </div>
        </div>
      </div>
    </div>
  );
}
