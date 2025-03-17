import { Link } from "@tanstack/react-router";

export function AdminCard({
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
