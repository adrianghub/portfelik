/**
 * Preserve Analizy context when drilling into Transakcje or a plan, and restore it
 * via an explicit "Wróć do analizy" link or browser back.
 */

const RETURN_PARAM = "returnTo";
const ANALYSIS_PREFIX = "/analysis";

export function encodeAnalysisReturn(analysisUrl: string | URL): string {
  const href =
    typeof analysisUrl === "string" ? analysisUrl : analysisUrl.pathname + analysisUrl.search;
  if (!href.startsWith(ANALYSIS_PREFIX)) return "";
  return href;
}

export function withAnalysisReturn(targetPath: string, analysisUrl: string | URL): string {
  const returnTo = encodeAnalysisReturn(analysisUrl);
  if (!returnTo) return targetPath;
  const url = new URL(targetPath, "https://jakstoimy.local");
  url.searchParams.set(RETURN_PARAM, returnTo);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Safe in-app return path from a `returnTo` query value. */
export function parseAnalysisReturn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith(ANALYSIS_PREFIX)) return null;
  if (decoded.includes("//") || decoded.includes("\\")) return null;
  if (/[\r\n]/.test(decoded)) return null;
  return decoded;
}

export function analysisReturnFromSearchParams(params: URLSearchParams): string | null {
  return parseAnalysisReturn(params.get(RETURN_PARAM));
}
