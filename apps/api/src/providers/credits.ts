import type { Credit } from "@encore/shared";
import { env } from "../env";
import { DAY } from "../lib/cache";
import { commonsFileName, isDeezerImage, plainText } from "../lib/photo-credit";
import { swr } from "../lib/swr-cache";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

/**
 * Who to credit for a performer photo. Commons photos are mostly CC BY / CC BY-SA, which
 * need the author and licence shown with the image; Deezer asks for its name on artist art.
 * Null for anything we didn't pick ourselves.
 */
export async function photoCredit(url: string): Promise<Credit | null> {
  if (isDeezerImage(url)) return { text: "Photo: Deezer", url: "https://www.deezer.com" };
  const file = commonsFileName(url);
  if (!file) return null;
  const page = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
  const fallback: Credit = { text: "Photo: Wikimedia Commons", url: page };
  return swr(`commons:credit:${file}`, { fresh: 30 * DAY, stale: 90 * DAY }, async () => {
    const api = new URL(COMMONS_API);
    api.searchParams.set("action", "query");
    api.searchParams.set("prop", "imageinfo");
    api.searchParams.set("iiprop", "extmetadata");
    api.searchParams.set("iiextmetadatafilter", "Artist|LicenseShortName");
    api.searchParams.set("titles", `File:${file}`);
    api.searchParams.set("format", "json");
    api.searchParams.set("formatversion", "2");
    const res = await fetch(api, {
      headers: { "User-Agent": env.musicBrainzUserAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    const data = (await res.json()) as {
      query?: { pages?: { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }[] };
    };
    const meta = data.query?.pages?.[0]?.imageinfo?.[0]?.extmetadata ?? {};
    const artist = plainText(meta.Artist?.value ?? "").slice(0, 80);
    const license = plainText(meta.LicenseShortName?.value ?? "");
    const parts = [artist, license].filter(Boolean).join(", ");
    return { text: parts ? `Photo: ${parts}, via Wikimedia Commons` : fallback.text, url: page };
  }).catch(() => fallback);
}

/** setlist.fm's own page for a setlist (their API terms ask apps to link back to it). */
export async function setlistCredit(setlistFmId: string): Promise<Credit> {
  const fallback: Credit = { text: "Setlist from setlist.fm", url: "https://www.setlist.fm" };
  if (!env.setlistFmApiKey || !/^[0-9a-z]{1,20}$/i.test(setlistFmId)) return fallback;
  return swr(`setlistfm:url:${setlistFmId}`, { fresh: 90 * DAY, stale: 365 * DAY }, async () => {
    const res = await fetch(`https://api.setlist.fm/rest/1.0/setlist/${setlistFmId}`, {
      headers: { "x-api-key": env.setlistFmApiKey!, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`setlist.fm ${res.status}`);
    const data = (await res.json()) as { url?: string };
    return data.url?.startsWith("https://www.setlist.fm/") ? { ...fallback, url: data.url } : fallback;
  }).catch(() => fallback);
}
