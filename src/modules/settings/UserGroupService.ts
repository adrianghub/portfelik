import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import { t } from "@/lib/i18n/translations";
import type { GroupInvitation, UserGroup } from "@/modules/settings/user-group";
import { doc, getDoc, getFirestore, orderBy, where } from "firebase/firestore";

export class UserGroupService extends FirestoreService<UserGroup> {
  constructor() {
    super(COLLECTIONS.USER_GROUPS);
  }

  async createGroup(
    group: Omit<UserGroup, "id" | "createdAt" | "updatedAt">,
  ): Promise<UserGroup> {
    const now = new Date().toISOString();
    // Get the owner's email
    const db = getFirestore();
    const ownerDoc = await getDoc(doc(db, COLLECTIONS.USERS, group.ownerId));
    if (!ownerDoc.exists()) {
      throw new Error(t("settings.groups.validation.userNotFound"));
    }
    const ownerData = ownerDoc.data();

    return this.create({
      ...group,
      memberEmails: [ownerData.email],
      createdAt: now,
      updatedAt: now,
    });
  }

  async getUserGroups(userId: string): Promise<UserGroup[]> {
    const constraints = [
      where("memberIds", "array-contains", userId),
      orderBy("createdAt", "desc"),
    ];
    return this.query(constraints);
  }

  async getGroupById(id: string): Promise<UserGroup | null> {
    return this.getById(id);
  }

  async updateGroup(
    id: string,
    updates: Partial<UserGroup>,
  ): Promise<UserGroup> {
    return this.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteGroup(id: string): Promise<void> {
    // First, delete all invitations related to this group
    const invitationService = new GroupInvitationService();
    const invitations = await invitationService.getAll([
      where("groupId", "==", id),
    ]);

    // Delete all invitations in parallel
    await Promise.all(
      invitations.map((invitation) =>
        invitationService.deleteInvitation(invitation.id!),
      ),
    );

    // Finally, delete the group itself
    return this.delete(id);
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    const group = await this.getGroupById(groupId);
    if (!group) {
      throw new Error(t("settings.groups.inviteError.groupNotFound"));
    }

    // Don't allow the owner to leave the group
    if (group.ownerId === userId) {
      throw new Error(t("settings.groups.leaveError.ownerCannotLeave"));
    }

    // Get the user's email
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, userId));
    if (!userDoc.exists()) {
      throw new Error(t("settings.groups.validation.userNotFound"));
    }
    const userData = userDoc.data();

    // Remove the user from memberIds and memberEmails
    const updatedMemberIds = group.memberIds.filter((id) => id !== userId);
    const updatedMemberEmails = group.memberEmails.filter(
      (email) => email !== userData.email,
    );
    await this.updateGroup(groupId, {
      memberIds: updatedMemberIds,
      memberEmails: updatedMemberEmails,
    });
  }

  async removeMember(
    groupId: string,
    ownerId: string,
    memberId: string,
  ): Promise<void> {
    const group = await this.getGroupById(groupId);
    if (!group) {
      throw new Error(t("settings.groups.inviteError.groupNotFound"));
    }

    // Only the owner can remove members
    if (group.ownerId !== ownerId) {
      throw new Error(t("settings.groups.removeMemberError.notOwner"));
    }

    // Don't allow removing the owner
    if (memberId === ownerId) {
      throw new Error(t("settings.groups.removeMemberError.cannotRemoveOwner"));
    }

    // Get the member's email
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, memberId));
    if (!userDoc.exists()) {
      throw new Error(t("settings.groups.removeMemberError.memberNotFound"));
    }
    const userData = userDoc.data();

    // Remove the member from memberIds and memberEmails
    const updatedMemberIds = group.memberIds.filter((id) => id !== memberId);
    const updatedMemberEmails = group.memberEmails.filter(
      (email) => email !== userData.email,
    );
    await this.updateGroup(groupId, {
      memberIds: updatedMemberIds,
      memberEmails: updatedMemberEmails,
    });
  }
}

export class GroupInvitationService extends FirestoreService<GroupInvitation> {
  constructor() {
    super(COLLECTIONS.GROUP_INVITATIONS);
  }

  async createInvitation(
    invitation: Omit<GroupInvitation, "id" | "createdAt" | "updatedAt">,
  ): Promise<GroupInvitation> {
    const now = new Date().toISOString();
    return this.create({
      ...invitation,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateInvitation(
    id: string,
    updates: Partial<Omit<GroupInvitation, "id" | "createdAt" | "updatedAt">>,
  ): Promise<GroupInvitation> {
    return this.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  async getReceivedInvitations(userEmail: string): Promise<GroupInvitation[]> {
    const constraints = [
      where("invitedUserEmail", "==", userEmail),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
    ];
    return this.query(constraints);
  }

  async getSentInvitations(userId: string): Promise<GroupInvitation[]> {
    const constraints = [
      where("createdBy", "==", userId),
      orderBy("createdAt", "desc"),
    ];
    return this.query(constraints);
  }

  async updateInvitationStatus(
    id: string,
    status: GroupInvitation["status"],
  ): Promise<GroupInvitation> {
    return this.update(id, {
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteInvitation(id: string): Promise<void> {
    return this.delete(id);
  }
}

export const userGroupService = new UserGroupService();
export const groupInvitationService = new GroupInvitationService();
