/** Pure helpers for crediting performer photos (no network, so they can be tested directly). */

const FILE_PATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";

/** Strips Commons' HTML (author names usually come wrapped in links) down to plain text. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The Commons file name inside a Special:FilePath thumbnail URL, decoded. */
export function commonsFileName(url: string): string | null {
  if (!url.startsWith(FILE_PATH)) return null;
  const encoded = url.slice(FILE_PATH.length).split("?")[0];
  try {
    return encoded ? decodeURIComponent(encoded) : null;
  } catch {
    return null;
  }
}

export const isDeezerImage = (url: string) => {
  try {
    return new URL(url).hostname.endsWith(".dzcdn.net");
  } catch {
    return false;
  }
};
