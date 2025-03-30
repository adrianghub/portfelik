import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMobileDialog } from "@/hooks/useMobileDialog";
import type { UserGroup } from "@/modules/settings/user-group";
import { Loader2, Trash2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MembersDialogProps {
  group: UserGroup;
  userId?: string;
  isOpen: boolean;
  onClose: () => void;
  onRemoveMember: (groupId: string, memberId: string) => void;
  isRemoving?: boolean;
}

export function MembersDialog({
  group,
  userId,
  isOpen,
  onClose,
  onRemoveMember,
  isRemoving = false,
}: MembersDialogProps) {
  const { t } = useTranslation();
  const isOwner = group.ownerId === userId;
  const { contentRef } = useMobileDialog(isOpen);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        ref={contentRef}
        className="w-full max-w-md mx-auto sm:max-w-lg p-4 sm:p-6 overflow-y-auto max-h-[95vh]"
      >
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("settings.groups.memberList")}
          </DialogTitle>
          <DialogDescription>
            {group.name} -{" "}
            {t("settings.groups.members", { count: group.memberIds.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 rounded-md border">
            {group.memberIds.map((memberId, index) => (
              <div
                key={memberId}
                className="flex items-center justify-between text-sm p-3 border-b last:border-b-0 hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {group.memberEmails[index].charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span
                      className={`${memberId === userId ? "font-medium text-primary" : ""}`}
                    >
                      {group.memberEmails[index]}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {memberId === group.ownerId && t("settings.groups.owner")}
                      {memberId === userId &&
                        memberId !== group.ownerId &&
                        t("settings.groups.you")}
                    </div>
                  </div>
                </div>
                {isOwner && memberId !== userId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveMember(group.id!, memberId)}
                    disabled={isRemoving}
                    className="h-8 w-8 p-0"
                    title={t("settings.groups.removeMember")}
                    aria-label={t("settings.groups.removeMember")}
                  >
                    {isRemoving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
