import { useAuth } from "@/hooks/useAuth";
import { COLLECTIONS } from "@/lib/firebase/firestore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { groupInvitationService, userGroupService } from "../UserGroupService";
import type { GroupInvitation } from "../user-group";

export function useUserGroups() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  const { data: groups, isLoading } = useQuery({
    queryKey: [COLLECTIONS.USER_GROUPS, userId],
    queryFn: async () => {
      console.log("Fetching groups for user:", userId);
      const userGroups = await userGroupService.getUserGroups(userId!);
      console.log("Fetched groups:", userGroups);
      return userGroups;
    },
    enabled: !!userId,
  });

  return { data: groups, isLoading };
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const createGroup = useMutation({
    mutationFn: async (group: {
      name: string;
      ownerId: string;
      memberIds: string[];
      memberEmails: string[];
    }) => {
      console.log("Creating group with data:", group);
      const createdGroup = await userGroupService.createGroup(group);
      console.log("Created group:", createdGroup);
      return createdGroup;
    },
    onSuccess: () => {
      console.log("Group created successfully, invalidating queries");
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.USER_GROUPS] });
      toast.success(t("settings.groups.groupCreated"));
    },
    onError: (error) => {
      console.error("Error creating group:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.groups.validation.createFailed"),
      );
      throw error;
    },
  });

  return createGroup;
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (groupId: string) => userGroupService.deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.USER_GROUPS] });
      queryClient.invalidateQueries({
        queryKey: [COLLECTIONS.GROUP_INVITATIONS],
      });
      toast.success(t("settings.groups.deleteSuccess"));
    },
    onError: (error) => {
      toast.error(t("settings.groups.deleteError"));
      throw error;
    },
  });
}

export function useGroupInvitations() {
  const { userData } = useAuth();
  const userEmail = userData?.email;

  return useQuery({
    queryKey: [COLLECTIONS.GROUP_INVITATIONS, "received", userEmail],
    queryFn: () => groupInvitationService.getReceivedInvitations(userEmail!),
    enabled: !!userEmail,
  });
}

export function useSentInvitations() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: [COLLECTIONS.GROUP_INVITATIONS, "sent", userId],
    queryFn: () => groupInvitationService.getSentInvitations(userId!),
    enabled: !!userId,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      groupId,
      groupName,
      invitedUserEmail,
      createdBy,
    }: {
      groupId: string;
      groupName: string;
      invitedUserEmail: string;
      createdBy: string;
    }) => {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(invitedUserEmail)) {
        throw new Error(
          t("settings.groups.inviteError.invalidEmail", {
            email: invitedUserEmail,
          }),
        );
      }

      const group = await userGroupService.getGroupById(groupId);
      if (!group) {
        throw new Error(t("settings.groups.inviteError.groupNotFound"));
      }

      // Check if the invited email is not the owner's email
      if (group.memberEmails[0] === invitedUserEmail) {
        throw new Error(t("settings.groups.inviteError.cannotInviteYourself"));
      }

      const existingInvitations =
        await groupInvitationService.getSentInvitations(createdBy);
      const existingInvitation = existingInvitations.find(
        (inv) =>
          inv.groupId === groupId &&
          inv.invitedUserEmail === invitedUserEmail &&
          inv.status === "pending",
      );

      if (existingInvitation) {
        throw new Error(
          t("settings.groups.inviteError.alreadySent", {
            email: invitedUserEmail,
          }),
        );
      }

      return groupInvitationService.createInvitation({
        groupId,
        groupName,
        invitedUserEmail,
        invitedUserId: "", // Empty string as we don't know the user's ID yet
        createdBy,
        status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [COLLECTIONS.GROUP_INVITATIONS],
      });
      toast.success(t("settings.groups.inviteSuccess"));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.groups.inviteError.failed"),
      );
      throw error;
    },
  });
}

// Internal helper hook - not exported as it's only used by useHandleInvitation
function useDeleteInvitationInternal() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      invitationId,
    }: {
      invitationId: string;
      showToast?: boolean;
    }) => groupInvitationService.deleteInvitation(invitationId),
    onSuccess: (_, { showToast = true }) => {
      queryClient.invalidateQueries({
        queryKey: [COLLECTIONS.GROUP_INVITATIONS],
      });
      if (showToast) {
        toast.success(t("settings.groups.inviteCancelSuccess"));
      }
    },
    onError: (error) => {
      toast.error(t("settings.groups.inviteCancelError"));
      throw error;
    },
  });
}

export function useHandleInvitation() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const { t } = useTranslation();
  const deleteInvitation = useDeleteInvitationInternal();

  const handleInvitation = useMutation({
    mutationFn: async ({
      invitationId,
      status,
      groupId,
    }: {
      invitationId: string;
      status: GroupInvitation["status"];
      groupId: string;
    }) => {
      if (status === "accepted") {
        if (!userData?.uid) {
          throw new Error(t("settings.groups.validation.userNotFound"));
        }

        // Get the group
        const group = await userGroupService.getGroupById(groupId);
        if (!group) {
          throw new Error(t("settings.groups.inviteError.groupNotFound"));
        }

        // Check if user is already a member
        if (group.memberIds.includes(userData.uid)) {
          throw new Error(
            t("settings.groups.inviteError.alreadyMember", {
              email: userData.email || "",
            }),
          );
        }

        // Update the invitation with the user's ID and status first
        await groupInvitationService.updateInvitation(invitationId, {
          invitedUserId: userData.uid,
          status: "accepted",
        });

        // Add user to group with their ID and email
        await userGroupService.updateGroup(groupId, {
          memberIds: [...group.memberIds, userData.uid],
          memberEmails: [...group.memberEmails, userData.email || ""],
        });

        // Delete the invitation after accepting - don't show toast here
        await deleteInvitation.mutateAsync({ invitationId, showToast: false });
      } else if (status === "rejected" || status === "cancelled") {
        // Update invitation status
        await groupInvitationService.updateInvitationStatus(
          invitationId,
          status,
        );
        // Delete the invitation after rejecting or cancelling - don't show toast here
        await deleteInvitation.mutateAsync({ invitationId, showToast: false });
      }

      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.USER_GROUPS] });
      queryClient.invalidateQueries({
        queryKey: [COLLECTIONS.GROUP_INVITATIONS],
      });

      if (status === "accepted") {
        toast.success(t("settings.groups.inviteAcceptSuccess"));
      } else if (status === "rejected") {
        toast.success(t("settings.groups.inviteRejectSuccess"));
      } else if (status === "cancelled") {
        toast.success(t("settings.groups.inviteCancelSuccess"));
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.groups.inviteError.failed"),
      );
      throw error;
    },
  });

  return handleInvitation;
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (groupId: string) =>
      userGroupService.leaveGroup(groupId, userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.USER_GROUPS] });
      toast.success(t("settings.groups.leaveSuccess"));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.groups.leaveError"),
      );
      throw error;
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      groupId,
      memberId,
    }: {
      groupId: string;
      memberId: string;
    }) => userGroupService.removeMember(groupId, userId!, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [COLLECTIONS.USER_GROUPS] });
      toast.success(t("settings.groups.removeMemberSuccess"));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.groups.removeMemberError"),
      );
      throw error;
    },
  });
}
