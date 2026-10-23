import { ImportScreen, type ImportConfig } from "@/components/ImportFlow";

const LETTERBOXD: ImportConfig = {
  source: "letterboxd",
  site: "Letterboxd",
  mediaType: "movie",
  noun: "film",
  exportUrl: "https://letterboxd.com/settings/data/",
  intro: "Bring over your ratings, diary dates, reviews and watchlist. Your star ratings become your Encore scores.",
  steps: [
    'Open Letterboxd\'s export page and tap "Export your data". Sign in first if it asks.',
    "Letterboxd downloads a ZIP file. It's saved to Downloads in the Files app.",
    "Come back here and choose that ZIP file.",
  ],
  fileTypes: ["application/zip", "application/x-zip-compressed", "text/csv", "text/comma-separated-values"],
  howScores:
    'How scores carry over: each film\'s score is its stars doubled, so 4★ is 8.0. 3½★ and up is "I liked it", 2★ to 3★ is "It was fine", and 1½★ or less is "I didn\'t like it". Films with the same stars tie; re-rank any of them from its page to break the tie. Films you\'ve already ranked in Encore keep your ranking, so importing again is safe.',
};

export default function ImportLetterboxdScreen() {
  return <ImportScreen config={LETTERBOXD} />;
}
