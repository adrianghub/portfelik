import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsSearch } from "@/routes/settings";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileSection } from "./ProfileSection";
import { UserGroupsSection } from "./UserGroupsSection";

export function UserSettingsView() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/settings" }) as SettingsSearch;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    // Default to groups tab
    return search.tab || "groups";
  });

  const [activeSubtab, setActiveSubtab] = useState(() => {
    return search.subtab === "invitations" ? "invitations" : "groups";
  });

  useEffect(() => {
    if (search.invitation) {
      setActiveTab("groups");
    }
    if (search.tab) {
      setActiveTab(search.tab);
    }
    if (search.subtab === "invitations" || search.subtab === "groups") {
      setActiveSubtab(search.subtab);
    }
  }, [search.invitation, search.tab, search.subtab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate({
      to: "/settings",
      search: { tab: value },
      replace: true,
    });
  };

  const handleSubtabChange = (value: string) => {
    setActiveSubtab(value);
    navigate({
      to: "/settings",
      search: {
        tab: activeTab,
        subtab: value,
      },
      replace: true,
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t("settings.description")}
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="groups">{t("settings.groups.title")}</TabsTrigger>
          <TabsTrigger value="profile">
            {t("settings.profile.title")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.groups.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <UserGroupsSection
                activeTab={activeSubtab}
                onTabChange={handleSubtabChange}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.profile.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
