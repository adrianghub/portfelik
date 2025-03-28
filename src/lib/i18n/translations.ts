import i18next from "i18next";

export function t(
  key: string,
  options?: Record<string, string | number>,
): string {
  return i18next.t(key, options);
}
