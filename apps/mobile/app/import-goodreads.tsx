import { ImportScreen, type ImportConfig } from "@/components/ImportFlow";

const GOODREADS: ImportConfig = {
  source: "goodreads",
  site: "Goodreads",
  mediaType: "book",
  noun: "book",
  // Goodreads' app has no export, so this opens in Safari.
  exportUrl: "https://www.goodreads.com/review/import",
  intro: "Bring over your ratings, read dates, reviews and want-to-read shelf. Your star ratings become your Encore scores.",
  steps: [
    'Open Goodreads\' export page and tap "Export Library". Sign in first if it asks.',
    'After a moment a "Your export" link appears. Tap it, and Safari saves the CSV file to Downloads in the Files app.',
    "Come back here and choose that CSV file.",
  ],
  fileTypes: ["text/csv", "text/comma-separated-values", "public.comma-separated-values-text", "text/plain"],
  howScores:
    'How scores carry over: each book\'s score is its stars doubled, so 4★ is 8.0. 4★ and 5★ are "I liked it", 2★ and 3★ are "It was fine", and 1★ is "I didn\'t like it". Books with the same stars tie; re-rank any of them from its page to break the tie. Want-to-read and currently-reading books go on your watchlist. Books you\'ve already ranked in Encore keep your ranking, so importing again is safe.',
};

export default function ImportGoodreadsScreen() {
  return <ImportScreen config={GOODREADS} />;
}
