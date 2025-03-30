import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SettingsSearch } from "@/routes/settings";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserGroupsSection } from "./UserGroupsSection";

export function UserSettingsView() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/settings" }) as SettingsSearch;
  const [activeTab, setActiveTab] = useState("groups");

  useEffect(() => {
    if (search.invitation) {
      setActiveTab("groups");
    }
  }, [search.invitation]);

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
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="groups" className="flex-1 sm:flex-none">
            {t("settings.groups.title")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.groups.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <UserGroupsSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
