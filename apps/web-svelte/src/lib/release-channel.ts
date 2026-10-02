export const releaseChannel =
  typeof __RELEASE_CHANNEL__ === "undefined" ? "internal-beta" : __RELEASE_CHANNEL__;
export const releaseChannelLabel = {
  "internal-beta": "Internal Beta",
  "public-beta": "Public Beta",
  stable: "Stable",
}[releaseChannel];
export const appVersion = typeof __APP_VERSION__ === "undefined" ? "" : __APP_VERSION__;
