// TMDB's watch-provider data only links to its own (JustWatch-powered) page, never to the title on the
// service itself. So we build a link to each service's own search for the title. These are https links
// the services' iOS apps claim as universal links, so they open in the app when it's installed and in
// Safari when it isn't.

type Rule = { match: RegExp; url: (q: string) => string };

// Matched against the provider name, in order. Names rather than TMDB ids because TMDB lists the same
// service under several ids (ad tiers, regional variants, "X Amazon Channel" add-ons) and renames them.
const RULES: Rule[] = [
  // Add-on channels bought through another store open in that store.
  { match: /amazon channel$/, url: (q) => `https://www.primevideo.com/search?phrase=${q}` },
  { match: /apple tv channel$/, url: (q) => `https://tv.apple.com/search?term=${q}` },
  { match: /roku premium channel$/, url: (q) => `https://therokuchannel.roku.com/search/${q}` },
  { match: /netflix/, url: (q) => `https://www.netflix.com/search?q=${q}` },
  { match: /\b(hbo|max)\b/, url: (q) => `https://play.hbomax.com/search?q=${q}` },
  { match: /disney/, url: (q) => `https://www.disneyplus.com/search?q=${q}` },
  { match: /hulu/, url: (q) => `https://www.hulu.com/search?q=${q}` },
  { match: /prime video|amazon/, url: (q) => `https://www.primevideo.com/search?phrase=${q}` },
  { match: /apple tv|itunes/, url: (q) => `https://tv.apple.com/search?term=${q}` },
  { match: /peacock/, url: (q) => `https://www.peacocktv.com/search?q=${q}` },
  { match: /paramount/, url: (q) => `https://www.paramountplus.com/search/?q=${q}` },
  { match: /youtube/, url: (q) => `https://www.youtube.com/results?search_query=${q}` },
  { match: /google play/, url: (q) => `https://play.google.com/store/search?q=${q}&c=movies` },
  { match: /tubi/, url: (q) => `https://tubitv.com/search/${q}` },
  { match: /roku/, url: (q) => `https://therokuchannel.roku.com/search/${q}` },
  { match: /plex/, url: (q) => `https://watch.plex.tv/search?q=${q}` },
  { match: /crunchyroll/, url: (q) => `https://www.crunchyroll.com/search?q=${q}` },
  { match: /mubi/, url: (q) => `https://mubi.com/en/search/films?query=${q}` },
  { match: /criterion/, url: (q) => `https://www.criterionchannel.com/search?q=${q}` },
  { match: /kanopy/, url: (q) => `https://www.kanopy.com/en/search?query=${q}` },
  { match: /hoopla/, url: (q) => `https://www.hoopladigital.com/search?q=${q}` },
  { match: /shudder/, url: (q) => `https://www.shudder.com/search?q=${q}` },
  // No usable search link: open the service's home page.
  { match: /pluto/, url: () => "https://pluto.tv" },
  { match: /starz/, url: () => "https://www.starz.com" },
  { match: /amc\+|amc plus/, url: () => "https://www.amcplus.com" },
  { match: /fandango|vudu/, url: () => "https://athome.fandango.com" },
  { match: /britbox/, url: () => "https://www.britbox.com" },
  { match: /microsoft/, url: () => "https://www.microsoft.com/store/movies-and-tv" },
];

/** Where tapping a provider in "Where to watch" should go for this title. */
export function providerWatchUrl(providerName: string, titleName: string): string {
  const name = providerName.toLowerCase().trim();
  const rule = RULES.find((r) => r.match.test(name));
  if (rule) return rule.url(encodeURIComponent(titleName));
  // A service we don't know: a web search for the title on it lands on the service's page in most cases.
  return `https://www.google.com/search?q=${encodeURIComponent(`watch ${titleName} on ${providerName}`)}`;
}
