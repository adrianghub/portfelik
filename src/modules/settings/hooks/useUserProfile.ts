import { useAuth } from "@/hooks/useAuth";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { deleteUser } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { userService } from "../UserService";

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (updates: {
      name?: string;
      settings?: { notificationsEnabled: boolean };
    }) => {
      if (!userData?.uid) throw new Error("User not authenticated");

      return userService.updateUserProfile(userData.uid, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.USERS] });
      toast.success(t("settings.profile.saveSuccess"));
    },
    onError: (error) => {
      console.error("Error updating profile:", error);
      toast.error(t("settings.profile.saveError"));
      throw error;
    },
  });
}

export function useDeleteUserAccount() {
  const queryClient = useQueryClient();
  const { userData, currentUser } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      if (!userData?.uid || !currentUser)
        throw new Error("User not authenticated");

      await userService.deleteUserAccount(userData.uid);
      await deleteUser(currentUser);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.USERS] });
      toast.success(t("settings.profile.deleteSuccess"));
      navigate({ to: "/login" });
    },
    onError: (error) => {
      console.error("Error deleting account:", error);
      toast.error(t("settings.profile.deleteError"));
      throw error;
    },
  });
}
