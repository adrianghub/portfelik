import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserData } from "@/lib/auth-context";
import { useUsersContext } from "./useUsersContext";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserData;
  onCancel: () => void;
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  onCancel,
}: DeleteUserDialogProps) {
  const { removeUser, isLoading } = useUsersContext();

  const handleDelete = async () => {
    await removeUser(user.uid);
    onOpenChange(false);
    onCancel();
  };

  const handleCancel = () => {
    onOpenChange(false);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete user {user.email}? This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading}
          >
            Delete User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
