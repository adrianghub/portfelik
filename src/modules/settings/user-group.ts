export interface UserGroup {
  id?: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  memberEmails: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupInvitation {
  id?: string;
  groupId: string;
  groupName: string;
  invitedUserEmail: string;
  invitedUserId: string;
  status: GroupInvitationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type GroupInvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled";
