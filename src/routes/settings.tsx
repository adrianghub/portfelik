import { createProtectedLoader } from "@/lib/protected-route";
import { UserSettingsView } from "@/modules/settings/components/UserSettingsView";
import { createFileRoute } from "@tanstack/react-router";

export interface SettingsSearch {
  invitation?: string;
  tab?: string;
  subtab?: string;
}

export const Route = createFileRoute("/settings")({
  component: UserSettingsView,
  loader: createProtectedLoader(),
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    return {
      invitation: search.invitation as string | undefined,
      tab: search.tab as string | undefined,
      subtab: search.subtab as string | undefined,
    };
  },
});
