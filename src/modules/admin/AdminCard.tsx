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
    <div className="bg-background shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">{description}</p>
      <Link
        to={link}
        className="text-primary hover:text-primary/80 font-medium"
      >
        Manage →
      </Link>
    </div>
  );
}
