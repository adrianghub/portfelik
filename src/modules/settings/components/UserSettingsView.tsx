import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsSearch } from "@/routes/settings";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CategoriesSection } from "./CategoriesSection";
import { ProfileSection } from "./ProfileSection";
import { UserGroupsSection } from "./UserGroupsSection";

export function UserSettingsView() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/settings" }) as SettingsSearch;
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(search.tab || "groups");
  const [groupsSubtab, setGroupsSubtab] = useState(
    search.subtab === "invitations" ? "invitations" : "groups",
  );

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value !== search.tab) {
      navigate({
        to: "/settings",
        search: { tab: value },
        replace: true,
      });
    }
  };

  const handleSubtabChange = (value: string) => {
    setGroupsSubtab(value);
    // Only update URL if it's actually changed to avoid loops
    if (value !== search.subtab) {
      navigate({
        to: "/settings",
        search: {
          tab: "groups",
          subtab: value,
        },
        replace: true,
      });
    }
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
        defaultValue="groups"
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="groups">{t("settings.groups.title")}</TabsTrigger>
          <TabsTrigger value="categories">
            {t("settings.categories.title")}
          </TabsTrigger>
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
                activeTab={groupsSubtab}
                onTabChange={handleSubtabChange}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.categories.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoriesSection />
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
