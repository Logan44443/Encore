import { performerImage } from "./deezer";
import { wikidataImage } from "./wikidata";

/**
 * Best photo we can find for a performer: Deezer's artist picture on an exact
 * name match, then Wikidata/Wikimedia Commons by MusicBrainz id. Null when
 * neither has one, and the app shows a placeholder instead.
 */
export async function performerPhoto(p: { name: string; mbid?: string | null }): Promise<string | null> {
  return (await performerImage(p.name)) ?? (p.mbid ? await wikidataImage(p.mbid) : null);
}
