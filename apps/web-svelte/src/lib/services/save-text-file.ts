import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativeCapacitor } from "$lib/services/pwa";

function isShareCancel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cancel/i.test(message);
}

function downloadInBrowser(filename: string, contents: string, mime: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Web browsers save via a download. Android WebView ignores `<a download>`,
 * so the native shell writes a cache file and opens the system share sheet.
 * Returns false when the user dismisses that sheet.
 */
export async function saveTextFile(
  filename: string,
  contents: string,
  mime: string
): Promise<boolean> {
  if (!isNativeCapacitor()) {
    downloadInBrowser(filename, contents, mime);
    return true;
  }

  await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: filename });
  } catch (err) {
    if (isShareCancel(err)) return false;
    throw err;
  }
  return true;
}
