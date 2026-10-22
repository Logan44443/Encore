import { env } from "../env";
import { DAY } from "../lib/cache";
import { swr } from "../lib/swr-cache";

const SPARQL = "https://query.wikidata.org/sparql";
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A performer's photo from Wikidata (property P18, hosted on Wikimedia Commons),
 * found by their MusicBrainz id (P434). Matching on the id rather than the name
 * means it never picks a different artist who happens to share the name, and it
 * covers comedians and other acts Deezer doesn't know.
 */
export function wikidataImage(mbid: string): Promise<string | null> {
  if (!MBID.test(mbid)) return Promise.resolve(null);
  return swr(`wikidata:image:${mbid.toLowerCase()}`, { fresh: 7 * DAY, stale: 30 * DAY }, async () => {
    const url = new URL(SPARQL);
    url.searchParams.set("query", `SELECT ?img WHERE { ?a wdt:P434 "${mbid.toLowerCase()}"; wdt:P18 ?img } LIMIT 1`);
    url.searchParams.set("format", "json");
    const res = await fetch(url, {
      headers: { "User-Agent": env.musicBrainzUserAgent, Accept: "application/sparql-results+json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Wikidata ${res.status}`);
    const data = (await res.json()) as { results?: { bindings?: { img?: { value?: string } }[] } };
    return commonsThumb(data.results?.bindings?.[0]?.img?.value);
  }).catch(() => null);
}

/** Commons' FilePath redirect, sized down so the app isn't pulling a 20MB original. */
function commonsThumb(value: string | undefined): string | null {
  if (!value) return null;
  const file = value.split("/Special:FilePath/")[1];
  if (!file) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=500`;
}
