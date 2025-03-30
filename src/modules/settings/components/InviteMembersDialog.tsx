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
import { useMobileDialog } from "@/hooks/useMobileDialog";
import {
  useCreateInvitation,
  useUserGroups,
} from "@/modules/settings/hooks/useUserGroups";
import { groupInvitationService } from "@/modules/settings/UserGroupService";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { GroupInvitation } from "../user-group";

interface InviteMembersDialogProps {
  groupId: string;
  groupName: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function InviteMembersDialog({
  groupId,
  groupName,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: InviteMembersDialogProps) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([""]);
  const [isCheckingEmails, setIsCheckingEmails] = useState(false);
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { data: groups } = useUserGroups();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const { contentRef } = useMobileDialog(isOpen);

  const createInvitation = useCreateInvitation();

  const handleAddEmail = () => {
    // Only add a new email field if the last one is not empty
    if (emails[emails.length - 1].trim() !== "") {
      setEmails([...emails, ""]);
    }
  };

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
  };

  const handleEmailChange = (index: number, value: string) => {
    const newEmails = [...emails];
    newEmails[index] = value;
    setEmails(newEmails);

    // Clear error when user types
    if (error) setError(null);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async () => {
    setError(null);
    setIsCheckingEmails(true);

    try {
      // Filter and validate emails
      const validEmails = emails.filter((email) => email.trim() !== "");

      if (validEmails.length === 0) {
        setError(t("settings.groups.inviteError.noEmails"));
        setIsCheckingEmails(false);
        return;
      }

      // Validate email format
      const invalidEmail = validEmails.find((email) => !validateEmail(email));
      if (invalidEmail) {
        setError(
          t("settings.groups.inviteError.invalidEmail", {
            email: invalidEmail,
          }),
        );
        setIsCheckingEmails(false);
        return;
      }

      // Check if any of the invited users are already members
      const currentGroup = groups?.find((g) => g.id === groupId);
      if (!currentGroup) {
        setError(t("settings.groups.inviteError.groupNotFound"));
        setIsCheckingEmails(false);
        return;
      }

      // Check if any email belongs to existing members
      const memberEmail = validEmails.find((email) =>
        currentGroup.memberEmails.includes(email),
      );

      if (memberEmail) {
        setError(
          t("settings.groups.inviteError.alreadyMember", {
            email: memberEmail,
          }),
        );
        setIsCheckingEmails(false);
        return;
      }

      // Check for existing invitations
      const existingInvitations =
        await groupInvitationService.getSentInvitations(currentGroup.ownerId);

      // Process invitations (one by one to provide better error feedback)
      for (const email of validEmails) {
        const existingInvitation = existingInvitations.find(
          (inv: GroupInvitation) =>
            inv.groupId === groupId &&
            inv.invitedUserEmail === email &&
            inv.status === "pending",
        );

        if (existingInvitation) {
          setError(t("settings.groups.inviteError.alreadySent", { email }));
          setIsCheckingEmails(false);
          return;
        }

        await createInvitation.mutateAsync({
          groupId,
          groupName,
          invitedUserEmail: email,
          createdBy: currentGroup.ownerId,
        });
      }

      // Show success message only if we sent multiple invitations
      // For single invitations, the createInvitation hook already shows a toast
      if (validEmails.length > 1) {
        toast.success(
          t("settings.groups.multipleInvitesSuccess", {
            count: validEmails.length,
          }),
        );
      }

      setIsOpen(false);
      setEmails([""]);
      setIsCheckingEmails(false);
    } catch (error) {
      setIsCheckingEmails(false);
      setError(
        error instanceof Error
          ? error.message
          : t("settings.groups.inviteError.failed"),
      );
    }
  };

  const handleClose = () => {
    setEmails([""]);
    setError(null);
    setIsOpen(false);
  };

  const isPending = createInvitation.isPending || isCheckingEmails;
  const hasValidEmail = emails.some((email) => email.trim() !== "");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        ref={contentRef}
        className="w-full max-w-md mx-auto sm:max-w-lg p-4 sm:p-6 overflow-y-auto max-h-[95vh]"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t("settings.groups.inviteMembers")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.groups.inviteMembersDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-4">
            <Label className="text-sm font-medium">
              {t("settings.groups.emails")}
            </Label>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {emails.map((email, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={t("settings.groups.inviteEmail")}
                    value={email}
                    onChange={(e) => handleEmailChange(index, e.target.value)}
                    className={`flex-1 ${!validateEmail(email) && email.trim() !== "" ? "border-destructive" : ""}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (
                          index === emails.length - 1 &&
                          email.trim() !== ""
                        ) {
                          handleAddEmail();
                        } else if (hasValidEmail && !error) {
                          handleSubmit();
                        }
                      }
                    }}
                    autoFocus={index === 0 && emails.length === 1}
                  />
                  {emails.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveEmail(index)}
                      className="text-destructive hover:text-destructive"
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={handleAddEmail}
              className="w-full"
              disabled={emails[emails.length - 1].trim() === "" || isPending}
              type="button"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("settings.groups.addAnotherEmail")}
            </Button>
          </div>

          {error && (
            <div className="text-sm text-destructive flex items-start gap-2 p-3 bg-destructive/10 rounded-md">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
              className="w-full sm:w-auto"
              type="button"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!hasValidEmail || isPending}
              className="w-full sm:w-auto"
              type="button"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("settings.groups.sending")}
                </>
              ) : (
                t("settings.groups.send")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
