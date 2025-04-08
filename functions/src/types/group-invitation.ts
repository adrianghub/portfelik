import type { TransactionStatus } from "./transaction";

export interface GroupInvitation {
  id?: string;
  groupId: string;
  groupName: string;
  invitedUserEmail: string;
  invitedUserId: string;
  createdBy: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
}
