import { createSign } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function uploadDecision(code, bundles, tracks) {
  const internal = tracks.find((track) => track.track === "internal");
  const published = internal?.releases?.some(
    (release) =>
      release.status === "completed" &&
      release.versionCodes?.some((value) => Number(value) === code),
  );
  if (published) return false;
  const used = [
    ...bundles.map((bundle) => Number(bundle.versionCode)),
    ...tracks.flatMap((track) =>
      (track.releases ?? []).flatMap((release) =>
        (release.versionCodes ?? []).map(Number),
      ),
    ),
  ];
  if (used.some((value) => value >= code)) {
    throw new Error(
      `Play already contains code ${Math.max(...used)}; release code ${code} cannot be uploaded. Prepare a new release or finish the existing Play draft.`,
    );
  }
  return true;
}

async function checkPlay() {
  let credentials;
  try {
    credentials = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("Missing or invalid PLAY_SERVICE_ACCOUNT_JSON.");
  }
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(payload)
    .sign(credentials.private_key, "base64url");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${payload}.${signature}`,
    }),
  });
  if (!tokenResponse.ok)
    throw new Error(`Play authentication failed (${tokenResponse.status})`);
  const { access_token: token } = await tokenResponse.json();
  const base =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/pl.jakstoimy.app/edits";
  const request = async (suffix, method = "GET") => {
    const response = await fetch(`${base}${suffix}`, {
      method,
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    if (!response.ok)
      throw new Error(`Play preflight ${method} failed (${response.status})`);
    return method === "DELETE" || response.status === 204
      ? null
      : response.json();
  };
  // A disposable, uncommitted edit reads Play state without changing any track.
  const { id } = await request("", "POST");
  try {
    const [bundles, tracks] = await Promise.all([
      request(`/${id}/bundles`),
      request(`/${id}/tracks`),
    ]);
    const { versions } = JSON.parse(
      readFileSync(
        new URL(
          "../apps/web-svelte/src/lib/content/changelog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const upload = uploadDecision(
      versions[0].versionCode,
      bundles.bundles ?? [],
      tracks.tracks ?? [],
    );
    appendFileSync(process.env.GITHUB_OUTPUT, `upload=${upload}\n`);
    console.log(
      upload
        ? `Play accepts release code ${versions[0].versionCode}.`
        : `Release code ${versions[0].versionCode} is already on Internal; skipping upload.`,
    );
  } finally {
    await request(`/${id}`, "DELETE");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkPlay().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
