import { ImportScreen, type ImportConfig } from "@/components/ImportFlow";

const LETTERBOXD: ImportConfig = {
  source: "letterboxd",
  site: "Letterboxd",
  mediaType: "movie",
  noun: "film",
  exportUrl: "https://letterboxd.com/settings/data/",
  intro: "Bring over your ratings, diary dates, reviews and watchlist. Your star ratings set where each one starts in your rankings.",
  steps: [
    'Open Letterboxd\'s export page and tap "Export your data". Sign in first if it asks.',
    "Letterboxd downloads a ZIP file. It's saved to Downloads in the Files app.",
    "Come back here and choose that ZIP file.",
  ],
  fileTypes: ["application/zip", "application/x-zip-compressed", "text/csv", "text/comma-separated-values"],
  howScores:
    'How scores carry over: your stars set each film\'s reaction and its place in your rankings. 3½★ and up is "I liked it", 2★ to 3★ is "It was fine", and 1½★ or less is "I didn\'t like it". After the import you compare films that share the same stars, a couple of taps each, so they end up with real scores instead of all tying. Films you\'ve already ranked in Encore keep your ranking, so importing again is safe.',
};

export default function ImportLetterboxdScreen() {
  return <ImportScreen config={LETTERBOXD} />;
}
