import { ImportScreen, type ImportConfig } from "@/components/ImportFlow";

const GOODREADS: ImportConfig = {
  source: "goodreads",
  site: "Goodreads",
  mediaType: "book",
  noun: "book",
  // Goodreads' app has no export, so this opens in Safari.
  exportUrl: "https://www.goodreads.com/review/import",
  intro: "Bring over your ratings, read dates, reviews and want-to-read shelf. Your star ratings set where each one starts in your rankings.",
  steps: [
    'Open Goodreads\' export page and tap "Export Library". Sign in first if it asks.',
    'After a moment a "Your export" link appears. Tap it, and Safari saves the CSV file to Downloads in the Files app.',
    "Come back here and choose that CSV file.",
  ],
  fileTypes: ["text/csv", "text/comma-separated-values", "public.comma-separated-values-text", "text/plain"],
  howScores:
    'How scores carry over: your stars set each book\'s reaction and its place in your rankings. 4★ and 5★ are "I liked it", 2★ and 3★ are "It was fine", and 1★ is "I didn\'t like it". After the import you compare books that share the same stars, a couple of taps each, so they end up with real scores instead of all tying. Want-to-read and currently-reading books go on your watchlist. Books you\'ve already ranked in Encore keep your ranking, so importing again is safe.',
};

export default function ImportGoodreadsScreen() {
  return <ImportScreen config={GOODREADS} />;
}
