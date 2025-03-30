import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { formatDisplayDate } from "@/lib/date-utils";
import { FloatingActionButtonGroup } from "@/modules/shared/components/FloatingActionButtonGroup";
import {
  Eye,
  Loader2,
  LogOut,
  Mail,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  useCreateGroup,
  useDeleteGroup,
  useGroupInvitations,
  useHandleInvitation,
  useLeaveGroup,
  useRemoveMember,
  useSentInvitations,
  useUserGroups,
} from "../hooks/useUserGroups";
import type { GroupInvitation, UserGroup } from "../user-group";
import { GroupDialog } from "./GroupDialog";
import { InviteMembersDialog } from "./InviteMembersDialog";
import { MembersDialog } from "./MembersDialog";

export function UserGroupsSection() {
  const { t } = useTranslation();
  const { userData } = useAuth();
  const userId = userData?.uid;
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("groups");

  const { data: groups = [], isLoading: loadingGroups } = useUserGroups();
  const createGroup = useCreateGroup();
  const deleteGroup = useDeleteGroup();
  const leaveGroup = useLeaveGroup();
  const removeMember = useRemoveMember();
  const handleInvitation = useHandleInvitation();
  const {
    data: receivedInvitations = [],
    isLoading: loadingReceivedInvitations,
  } = useGroupInvitations();
  const { data: sentInvitations = [], isLoading: loadingSentInvitations } =
    useSentInvitations();

  const handleDeleteGroup = async (groupId: string) => {
    try {
      if (confirm(t("settings.groups.confirmDelete"))) {
        await deleteGroup.mutateAsync(groupId);
      }
    } catch (error) {
      console.error("Error deleting group:", error);
      toast.error(t("settings.groups.deleteError"));
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      if (confirm(t("settings.groups.confirmLeave"))) {
        await leaveGroup.mutateAsync(groupId);
      }
    } catch (error) {
      console.error("Error leaving group:", error);
      toast.error(t("settings.groups.leaveError"));
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      await handleInvitation.mutateAsync({
        invitationId,
        status: "accepted",
        groupId:
          receivedInvitations?.find((inv) => inv.id === invitationId)
            ?.groupId || "",
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      toast.error(t("settings.groups.inviteAcceptError"));
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    try {
      await handleInvitation.mutateAsync({
        invitationId,
        status: "rejected",
        groupId:
          receivedInvitations?.find((inv) => inv.id === invitationId)
            ?.groupId || "",
      });
    } catch (error) {
      console.error("Error rejecting invitation:", error);
      toast.error(t("settings.groups.inviteRejectError"));
    }
  };

  const handleCancelInvitation = async (
    invitationId: string,
    groupId: string,
  ) => {
    try {
      await handleInvitation.mutateAsync({
        invitationId,
        status: "cancelled",
        groupId,
      });
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      toast.error(t("settings.groups.inviteCancelError"));
    }
  };

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    try {
      if (confirm(t("settings.groups.confirmRemoveMember"))) {
        await removeMember.mutateAsync({ groupId, memberId });
      }
    } catch (error) {
      console.error("Error removing member:", error);
      toast.error(t("settings.groups.removeMemberError"));
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="groups">
            <Users className="h-4 w-4 mr-2 hidden sm:inline" />
            {t("settings.groups.myGroups")}
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Mail className="h-4 w-4 mr-2 hidden sm:inline" />
            {t("settings.groups.invitations")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="space-y-6">
          {/* My Groups */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-medium">
                {t("settings.groups.myGroups")}
              </h2>

              {groups.length > 0 && (
                <Button
                  onClick={() => setIsGroupDialogOpen(true)}
                  className="ml-auto hidden md:flex"
                  disabled={createGroup.isPending}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span>{t("settings.groups.create")}</span>
                </Button>
              )}
            </div>

            {loadingGroups ? (
              <div className="flex items-center justify-center p-6 border rounded-md">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  {t("settings.groups.loading")}
                </span>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 border rounded-md bg-card">
                <Users className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground mb-4">
                  {t("settings.groups.noGroups")}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setIsGroupDialogOpen(true)}
                >
                  {t("settings.groups.createFirstGroup")}
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    userId={userId}
                    onDelete={handleDeleteGroup}
                    onLeave={handleLeaveGroup}
                    onRemoveMember={handleRemoveMember}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-6">
          {/* Received Invitations */}
          <div>
            <h2 className="text-lg font-medium mb-4">
              {t("settings.groups.receivedInvitations")}
            </h2>
            {loadingReceivedInvitations ? (
              <div className="flex items-center justify-center p-6 border rounded-md">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  {t("settings.groups.loading")}
                </span>
              </div>
            ) : receivedInvitations.length === 0 ? (
              <div className="text-center py-8 border rounded-md bg-card">
                <Mail className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">
                  {t("settings.groups.noInvitations")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {receivedInvitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    type="received"
                    onAccept={handleAcceptInvitation}
                    onReject={handleRejectInvitation}
                    isPending={handleInvitation.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sent Invitations */}
          <div className="mt-8">
            <h2 className="text-lg font-medium mb-4">
              {t("settings.groups.sentInvitations")}
            </h2>
            {loadingSentInvitations ? (
              <div className="flex items-center justify-center p-6 border rounded-md">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">
                  {t("settings.groups.loading")}
                </span>
              </div>
            ) : sentInvitations.length === 0 ? (
              <div className="text-center py-8 border rounded-md bg-card">
                <Mail className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">
                  {t("settings.groups.noSentInvitations")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sentInvitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    type="sent"
                    onCancel={(id) =>
                      handleCancelInvitation(id, invitation.groupId)
                    }
                    isPending={handleInvitation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <GroupDialog
        open={isGroupDialogOpen}
        onOpenChange={setIsGroupDialogOpen}
      />

      <FloatingActionButtonGroup
        buttons={[
          {
            icon: Plus,
            label: t("settings.groups.create"),
            onClick: () => setIsGroupDialogOpen(true),
          },
        ]}
      />
    </div>
  );
}

interface GroupCardProps {
  group: UserGroup;
  userId?: string;
  onDelete: (id: string) => void;
  onLeave: (id: string) => void;
  onRemoveMember: (groupId: string, memberId: string) => void;
}

function GroupCard({
  group,
  userId,
  onDelete,
  onLeave,
  onRemoveMember,
}: GroupCardProps) {
  const { t } = useTranslation();
  const isOwner = group.ownerId === userId;
  const deleteGroup = useDeleteGroup();
  const leaveGroup = useLeaveGroup();
  const removeMember = useRemoveMember();
  const [showMembersDialog, setShowMembersDialog] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-4 bg-card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-lg mb-1">{group.name}</h3>
            <p className="text-sm text-muted-foreground">
              <button
                onClick={() => setShowMembersDialog(true)}
                className="hover:underline flex items-center gap-1"
              >
                <Users className="h-3 w-3" />
                {t("settings.groups.members", {
                  count: group.memberIds.length,
                })}
              </button>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.groups.created")}:{" "}
              {formatDisplayDate(new Date(group.createdAt))}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isOwner ? (
              <Badge>{t("settings.groups.owner")}</Badge>
            ) : (
              <Badge variant="secondary">
                <Eye className="h-3 w-3 mr-1" />
                {t("settings.groups.member")}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-3">
          {isOwner ? (
            <>
              <InviteMembersDialog
                groupId={group.id!}
                groupName={group.name}
                trigger={
                  <Button variant="outline" size="sm" className="text-primary">
                    <UserPlus className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">
                      {t("settings.groups.invite")}
                    </span>
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(group.id!)}
                disabled={deleteGroup.isPending}
                className="text-destructive"
              >
                {deleteGroup.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">
                      {t("settings.groups.delete")}
                    </span>
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onLeave(group.id!)}
              disabled={leaveGroup.isPending}
              className="text-destructive"
            >
              {leaveGroup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LogOut className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">
                    {t("settings.groups.leave")}
                  </span>
                </>
              )}
            </Button>
          )}
        </div>

        {/* Members Dialog */}
        <MembersDialog
          group={group}
          userId={userId}
          isOpen={showMembersDialog}
          onClose={() => setShowMembersDialog(false)}
          onRemoveMember={onRemoveMember}
          isRemoving={removeMember.isPending}
        />
      </div>
    </div>
  );
}

interface InvitationCardProps {
  invitation: GroupInvitation;
  type: "sent" | "received";
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  isPending: boolean;
}

function InvitationCard({
  invitation,
  type,
  onAccept,
  onReject,
  onCancel,
  isPending,
}: InvitationCardProps) {
  const { t } = useTranslation();

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">{invitation.groupName}</h3>
          {type === "sent" && (
            <p className="text-sm text-muted-foreground mb-2">
              {t("settings.groups.sentTo")}: {invitation.invitedUserEmail}
            </p>
          )}
          <Badge variant="secondary" className="mt-1">
            {t(`settings.groups.invitationStatus.${invitation.status}`)}
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            {t("settings.groups.sent")}:{" "}
            {formatDisplayDate(new Date(invitation.createdAt))}
          </p>
        </div>

        {type === "received" && invitation.status === "pending" && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReject && onReject(invitation.id!)}
              disabled={isPending}
            >
              {t("settings.groups.reject")}
            </Button>
            <Button
              size="sm"
              onClick={() => onAccept && onAccept(invitation.id!)}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t("settings.groups.accept")}
            </Button>
          </div>
        )}

        {type === "sent" && invitation.status === "pending" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCancel && onCancel(invitation.id!)}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {t("settings.groups.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
