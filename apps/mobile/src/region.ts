import { getLocales } from "expo-localization";

/** Region from iOS Settings (General → Language & Region), not GPS, so travelling doesn't change it. */
export function deviceRegion(): string | null {
  const code = getLocales()[0]?.regionCode?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function flag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
