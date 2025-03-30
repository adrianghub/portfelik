import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useMobileDialog } from "@/hooks/useMobileDialog";
import { useCreateGroup } from "@/modules/settings/hooks/useUserGroups";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface GroupDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GroupDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: GroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const { userData } = useAuth();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const { contentRef } = useMobileDialog(isOpen);

  const createGroup = useCreateGroup();

  const handleCreateGroup = () => {
    setError(null);

    // Validate group name
    if (!newGroupName.trim()) {
      setError(t("settings.groups.validation.nameRequired"));
      return;
    }

    if (newGroupName.length < 3) {
      setError(t("settings.groups.validation.nameMinLength"));
      return;
    }

    if (newGroupName.length > 50) {
      setError(t("settings.groups.validation.nameMaxLength"));
      return;
    }

    if (!userData?.uid || !userData?.email) {
      setError(t("settings.groups.validation.userNotFound"));
      return;
    }

    createGroup.mutate(
      {
        name: newGroupName.trim(),
        ownerId: userData.uid,
        memberIds: [userData.uid],
        memberEmails: [userData.email],
      },
      {
        onSuccess: () => {
          setNewGroupName("");
          setIsOpen(false);
          setError(null);
        },
        onError: (error) => {
          setError(
            error instanceof Error
              ? error.message
              : t("settings.groups.validation.createFailed"),
          );
        },
      },
    );
  };

  const handleClose = () => {
    setNewGroupName("");
    setError(null);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        ref={contentRef}
        className="w-full max-w-md mx-auto sm:max-w-lg p-4 sm:p-6 overflow-y-auto max-h-[95vh]"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t("settings.groups.createGroup")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.groups.createGroupDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="groupName" className="text-sm font-medium">
              {t("settings.groups.groupName")}
            </Label>
            <Input
              id="groupName"
              placeholder={t("settings.groups.groupNamePlaceholder")}
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroupName.trim()) {
                  handleCreateGroup();
                }
              }}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-2">
                <X className="h-4 w-4 flex-shrink-0" />
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={createGroup.isPending}
              className="w-full sm:w-auto"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || createGroup.isPending}
              className="w-full sm:w-auto"
            >
              {createGroup.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("settings.groups.creating")}
                </>
              ) : (
                t("settings.groups.create")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
