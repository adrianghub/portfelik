import { App } from "@capacitor/app";
import { goto } from "$app/navigation";
import { nativeBackDestination } from "$lib/services/native-back-policy";
import { closeTopNativeOverlay, runNativeBackPageHandler } from "$lib/services/native-overlay";
import { isNativeCapacitor } from "$lib/services/pwa";

async function minimizeOrExit(): Promise<void> {
  try {
    await App.minimizeApp();
  } catch {
    await App.exitApp();
  }
}

export async function handleNativeBack(): Promise<void> {
  if (closeTopNativeOverlay()) return;
  if (runNativeBackPageHandler()) return;

  const destination = nativeBackDestination(window.location.pathname, window.location.search);
  if (destination.kind === "goto") {
    await goto(destination.href);
    return;
  }
  if (destination.kind === "history-back" && window.history.length > 1) {
    window.history.back();
    return;
  }
  await minimizeOrExit();
}

/** Register Android hardware-back handling. Safe to call once from the root layout. */
export async function registerNativeBackButtonHandler(): Promise<() => void> {
  if (!isNativeCapacitor()) return () => {};

  const listener = await App.addListener("backButton", () => {
    void handleNativeBack();
  });

  return () => {
    void listener.remove();
  };
}
