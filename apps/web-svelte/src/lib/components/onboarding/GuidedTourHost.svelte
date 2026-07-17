<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { track, trackOnce } from "$lib/analytics";
  import GuidedTourChrome from "$lib/components/onboarding/GuidedTourChrome.svelte";
  import TourSpotlight from "$lib/components/onboarding/TourSpotlight.svelte";
  import WelcomeTourDialog from "$lib/components/onboarding/WelcomeTourDialog.svelte";
  import { setGuidedTourContext } from "$lib/guided-tour/context";
  import { guidedTourUi } from "$lib/guided-tour/ui.svelte";
  import { fetchDemoProbe, hasDemoData, seedDemoData } from "$lib/services/demo-data";
  import {
    TOUR_SCENES,
    advanceGuidedTour,
    completeGuidedTour,
    dismissGuidedTour,
    firstIncompleteSceneIndex,
    mergeGuidedTourProgress,
    readGuidedTourProgress,
    routesMatch,
    sceneAt,
    sceneRouteParts,
    shouldOfferWelcomeTour,
    shouldResumeGuidedTour,
    writeGuidedTourProgressLocal,
    type GuidedTourPath,
    type GuidedTourProgress,
  } from "$lib/services/guided-tour";
  import { updateProfile } from "$lib/services/profiles";
  import { fetchPlans } from "$lib/services/plans";
  import type { Profile } from "$lib/types";
  import type { Json } from "$lib/supabase.types";
  import { tourSceneBody } from "$lib/content/onboarding";
  import { createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  interface Props {
    profile: Profile | null;
    userId: string | null;
  }

  let { profile, userId }: Props = $props();

  const queryClient = useQueryClient();
  const uid = $derived(session.userId ?? userId);

  const demoProbeQuery = createQuery(() => ({
    queryKey: uid
      ? qk.transactions.list(uid, "demo-probe")
      : ["user", "", "transactions", "demo-probe"],
    queryFn: fetchDemoProbe,
    enabled: !!uid,
  }));

  const plansQuery = createQuery(() => ({
    queryKey: uid ? qk.plans(uid) : ["user", "", "plans"],
    queryFn: fetchPlans,
    enabled: !!uid,
  }));

  const demoActive = $derived(
    hasDemoData({
      transactions: demoProbeQuery.data?.transactions ?? [],
      plans: plansQuery.data ?? [],
      netWorthItems: demoProbeQuery.data?.netWorthItems ?? [],
    })
  );

  let welcomeOpen = $state(false);
  let running = $state(false);
  let showExit = $state(false);
  let sceneIndex = $state(0);
  let demoLoading = $state(false);
  let bootstrapped = $state(false);
  let progress = $state<GuidedTourProgress>({});
  let lastRestartNonce = $state(0);
  let suppressProfileSync = $state(false);

  $effect(() => {
    if (!profile || suppressProfileSync) return;
    progress = readGuidedTourProgress(profile.settings);
  });

  const currentScene = $derived(showExit ? null : sceneAt(sceneIndex));
  const currentSceneId = $derived(currentScene?.id ?? null);

  const sceneBody = $derived(currentScene ? tourSceneBody(currentScene.id) : "");

  async function persistProgress(next: GuidedTourProgress): Promise<void> {
    writeGuidedTourProgressLocal(next);
    if (!userId || !profile) return;
    await updateProfile(userId, {
      settings: {
        ...profile.settings,
        guidedTour: next as unknown as Json,
      },
    });
    await queryClient.invalidateQueries({ queryKey: qk.profile(requireSessionUserId()) });
  }

  async function startTour(path: GuidedTourPath, fromIndex = 0): Promise<void> {
    const next = mergeGuidedTourProgress(progress, { path, dismissed: false });
    progress = next;
    await persistProgress(next);
    sceneIndex = fromIndex;
    showExit = false;
    running = true;
    welcomeOpen = false;
    trackOnce("guided_tour_started", { path, scene_count: TOUR_SCENES.length });
    await navigateToScene(sceneAt(fromIndex));
  }

  async function navigateToScene(scene: ReturnType<typeof sceneAt>): Promise<void> {
    if (!scene) return;
    const { pathname, search } = sceneRouteParts(scene.route);
    const currentSearch = page.url.search;
    if (
      page.url.pathname !== pathname ||
      !routesMatch(page.url.pathname, currentSearch, scene.route)
    ) {
      await goto(`${pathname}${search}`, { keepFocus: true, noScroll: false });
    }
  }

  function trackSceneView(sceneId: string | null): void {
    if (!sceneId || !currentScene) return;
    track("guided_tour_scene_viewed", {
      scene_id: sceneId,
      chapter: currentScene.chapter,
    });
  }

  $effect(() => {
    if (!running || showExit || !currentSceneId) return;
    trackSceneView(currentSceneId);
  });

  $effect(() => {
    if (!running || showExit || !currentScene) return;
    void currentScene.route;
    void navigateToScene(currentScene);
  });

  $effect(() => {
    if (!profile) return;
    if (!profile.settings?.guidedTour) {
      writeGuidedTourProgressLocal({});
    }
  });

  $effect(() => {
    const nonce = guidedTourUi.restartNonce;
    if (nonce === 0 || nonce === lastRestartNonce) return;
    lastRestartNonce = nonce;
    void applyTourRestart();
  });

  async function applyTourRestart(): Promise<void> {
    suppressProfileSync = true;
    running = false;
    showExit = false;
    sceneIndex = 0;
    progress = {};
    welcomeOpen = true;
    suppressProfileSync = false;
  }

  $effect(() => {
    if (!userId || !profile || bootstrapped) return;
    bootstrapped = true;
    if (shouldResumeGuidedTour(profile.settings)) {
      const idx = firstIncompleteSceneIndex(progress);
      void startTour(progress.path ?? "demo", idx);
      return;
    }
    if (shouldOfferWelcomeTour(profile.settings)) {
      welcomeOpen = true;
    }
  });

  $effect(() => {
    guidedTourUi.running = running;
    guidedTourUi.currentSceneId = currentSceneId;
    guidedTourUi.hideFirstPeriodHint = running && !showExit;
  });

  setGuidedTourContext({
    get running() {
      return guidedTourUi.running;
    },
    get currentSceneId() {
      return guidedTourUi.currentSceneId;
    },
    get hideFirstPeriodHint() {
      return guidedTourUi.hideFirstPeriodHint;
    },
    isSceneActive: (sceneId: string) =>
      guidedTourUi.running && guidedTourUi.currentSceneId === sceneId,
  });

  async function handleWelcomeDemo(): Promise<void> {
    demoLoading = true;
    try {
      if (!demoActive) {
        await seedDemoData();
        const u = requireSessionUserId();
        await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
        await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
        await queryClient.invalidateQueries({ queryKey: qk.transactions.list(u, "demo-probe") });
        await queryClient.invalidateQueries({ queryKey: qk.transactions.list(u, "count-probe") });
      }
      await startTour("demo", 0);
    } finally {
      demoLoading = false;
    }
  }

  async function handleWelcomeImport(): Promise<void> {
    const next = mergeGuidedTourProgress(dismissGuidedTour(progress), { path: "import" });
    progress = next;
    await persistProgress(next);
    welcomeOpen = false;
    await goto("/import");
  }

  async function handleSkip(): Promise<void> {
    track("guided_tour_skipped", {
      scene_id: currentSceneId ?? "exit",
      chapter: currentScene?.chapter ?? "settings",
    });
    const next = dismissGuidedTour(progress);
    progress = next;
    await persistProgress(next);
    running = false;
    showExit = false;
  }

  async function handleBack(): Promise<void> {
    if (showExit) return;
    if (sceneIndex <= 0) return;
    sceneIndex -= 1;
    await navigateToScene(sceneAt(sceneIndex));
  }

  async function handleNext(): Promise<void> {
    if (showExit) return;
    const scene = sceneAt(sceneIndex);
    if (!scene) return;

    const nextProgress = advanceGuidedTour(progress, scene.id);
    progress = nextProgress;
    await persistProgress(nextProgress);

    if (sceneIndex >= TOUR_SCENES.length - 1) {
      showExit = true;
      return;
    }

    sceneIndex += 1;
    await navigateToScene(sceneAt(sceneIndex));
  }

  async function handleExitComplete(keepDemo: boolean): Promise<void> {
    track("guided_tour_completed", { kept_demo: keepDemo });
    const next = completeGuidedTour(progress);
    progress = next;
    await persistProgress(next);
    running = false;
    showExit = false;
  }
</script>

<WelcomeTourDialog
  open={welcomeOpen}
  loading={demoLoading}
  onclose={() => {
    welcomeOpen = false;
    const next = dismissGuidedTour(progress);
    progress = next;
    void persistProgress(next);
  }}
  ondemo={() => void handleWelcomeDemo()}
  onimport={() => void handleWelcomeImport()}
/>

{#if running}
  <TourSpotlight active={!showExit} targetId={currentScene?.target ?? null} />
  <GuidedTourChrome
    chapter={currentScene?.chapter ?? "settings"}
    body={sceneBody}
    {showExit}
    canGoBack={!showExit && sceneIndex > 0}
    isLastScene={!showExit && sceneIndex >= TOUR_SCENES.length - 1}
    onback={() => void handleBack()}
    onnext={() => void handleNext()}
    onskip={() => void handleSkip()}
    onimport={() => void handleExitComplete(false)}
    onkeepDemo={() => void handleExitComplete(true)}
  />
{/if}
