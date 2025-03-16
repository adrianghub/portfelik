import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Admin Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AdminCard
          title="Categories"
          description="Manage transaction categories"
          link="/admin/categories"
        />

        {/* Add more admin cards as needed */}
      </div>
    </div>
  );
}

function AdminCard({
  title,
  description,
  link,
}: {
  title: string;
  description: string;
  link: string;
}) {
  return (
    <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{description}</p>
      <Link to={link} className="text-blue-600 hover:text-blue-800 font-medium">
        Manage →
      </Link>
    </div>
  );
}
