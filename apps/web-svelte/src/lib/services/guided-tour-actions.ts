import { qk } from "$lib/query-keys";
import { requestGuidedTourRestart } from "$lib/guided-tour/ui.svelte";
import { writeGuidedTourProgressLocal } from "$lib/services/guided-tour";
import { updateProfile } from "$lib/services/profiles";
import type { Json } from "$lib/supabase.types";
import type { Profile } from "$lib/types";
import type { QueryClient } from "@tanstack/svelte-query";

export async function resetGuidedTourForReplay(
  queryClient: QueryClient,
  userId: string,
  profile: Profile
): Promise<void> {
  writeGuidedTourProgressLocal({});
  const nextSettings = { ...profile.settings, guidedTour: {} as Json };
  queryClient.setQueryData<Profile>(qk.profile(userId), (old) =>
    old ? { ...old, settings: nextSettings } : old
  );
  await updateProfile(userId, { settings: nextSettings });
  await queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
  requestGuidedTourRestart();
}
