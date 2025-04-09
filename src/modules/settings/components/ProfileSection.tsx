import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDeleteUserAccount,
  useUpdateUserProfile,
} from "../hooks/useUserProfile";

export function ProfileSection() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const [name, setName] = useState("");
  const [lastSavedName, setLastSavedName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const updateProfile = useUpdateUserProfile();
  const deleteAccount = useDeleteUserAccount();

  useEffect(() => {
    setName(userData?.name || "");
    setLastSavedName(userData?.name || "");
  }, [userData]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleSaveProfile = async () => {
    if (!userData) return;

    setIsSaving(true);
    try {
      await updateProfile.mutateAsync({
        name: name,
      });
      setLastSavedName(name);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!userData) return;

    setIsDeleting(true);
    try {
      await deleteAccount.mutateAsync();
    } catch (error) {
      setIsDeleting(false);
    }
  };

  const isNameChanged = name !== lastSavedName && name.trim() !== "";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("settings.profile.name")}</Label>
          <Input
            id="name"
            value={name}
            onChange={handleNameChange}
            placeholder={t("settings.profile.namePlaceholder")}
          />
        </div>

        <Button
          onClick={handleSaveProfile}
          disabled={isSaving || !isNameChanged}
          className="mt-4"
        >
          {isSaving ? t("settings.profile.saving") : t("settings.profile.save")}
        </Button>
      </div>

      <div className="pt-6 border-t">
        <h3 className="text-lg font-medium text-destructive mb-4">
          {t("settings.profile.dangerZone")}
        </h3>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              {isDeleting
                ? t("settings.profile.deleting")
                : t("settings.profile.deleteAccount")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings.profile.deleteAccountConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings.profile.deleteAccountConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("settings.profile.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("settings.profile.confirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
