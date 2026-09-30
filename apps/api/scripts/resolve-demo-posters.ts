/**
 * Resolves real cover art for the offline demo catalog and writes
 * src/providers/seed-posters.json. Movies use the poster from the film's
 * Wikipedia article; shows use TVmaze. Re-run after editing seed-catalog.ts:
 *   npx tsx scripts/resolve-demo-posters.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { SEED_MOVIES, SEED_SHOWS } from "../src/providers/seed-catalog";

const UA = { "User-Agent": "Encore/0.1 (demo poster resolver)" };

async function wikiPoster(name: string, year: number): Promise<string | null> {
  const candidates = [`${name} (${year} film)`, `${name} (film)`, name];
  for (const title of candidates) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    let res = await fetch(url, { headers: UA });
    for (let attempt = 0; res.status === 429 && attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      res = await fetch(url, { headers: UA });
    }
    await new Promise((r) => setTimeout(r, 400));
    if (!res.ok) continue;
    const d = (await res.json()) as { type?: string; description?: string; originalimage?: { source: string } };
    if (d.type === "disambiguation" || !d.originalimage) continue;
    const desc = d.description ?? "";
    if (!/film|movie/i.test(desc) || !(desc.includes(String(year)) || title.includes(String(year)))) continue;
    return d.originalimage.source.split("?")[0];
  }
  return null;
}

async function tvmazePoster(name: string, year: number): Promise<string | null> {
  const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const results = (await res.json()) as { show: { premiered?: string; image?: { original?: string } } }[];
  const match = results.find((r) => Math.abs(Number(r.show.premiered?.slice(0, 4)) - year) <= 1 && r.show.image?.original);
  return match?.show.image?.original ?? null;
}

const out: Record<string, string> = {};
for (const [id, name, year] of SEED_MOVIES) {
  const url = await wikiPoster(name, year);
  console.log(url ? "✓" : "✗", "movie", name, url ?? "");
  if (url) out[`movie:${id}`] = url;
}
for (const [id, name, year] of SEED_SHOWS) {
  const url = await tvmazePoster(name, year);
  console.log(url ? "✓" : "✗", "tv", name, url ?? "");
  if (url) out[`tv:${id}`] = url;
  await new Promise((r) => setTimeout(r, 600));
}

const file = path.resolve("src/providers/seed-posters.json");
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${Object.keys(out).length} posters → ${file}`);
