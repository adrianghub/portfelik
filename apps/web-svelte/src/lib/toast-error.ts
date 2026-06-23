import { toast } from "svelte-sonner";
import { errorMessage, type ErrorMessageOpts } from "$lib/services/supabase-errors";

/** Toast a mapped, user-facing message for a thrown error. */
export function toastError(err: unknown, opts?: ErrorMessageOpts): void {
  toast.error(errorMessage(err, opts));
}
