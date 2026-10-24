import { Linking, Text, View } from "react-native";
import { H1, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";

const SOURCES: [string, string, string][] = [
  ["TMDB", "Movies, TV, posters and where to watch. This product uses the TMDB API but is not endorsed or certified by TMDB.", "https://www.themoviedb.org"],
  ["JustWatch", "Streaming availability, through TMDB.", "https://www.justwatch.com"],
  ["setlist.fm", "Setlists, tours and venues for live shows.", "https://www.setlist.fm"],
  ["MusicBrainz", "Performer details.", "https://musicbrainz.org"],
  ["Deezer", "Performer photos.", "https://www.deezer.com"],
  ["Wikidata and Wikimedia Commons", "Performer photos. Each photo's author and licence is shown on the show page.", "https://commons.wikimedia.org"],
  ["Open Library", "Books and covers.", "https://openlibrary.org"],
  ["Google Books", "Book details.", "https://books.google.com"],
];

/** Where Encore's catalog data and photos come from (App Store guideline 5.2). */
export default function CreditsScreen() {
  return (
    <Screen>
      <H1>Credits</H1>
      <Muted>Encore is built on data from these services. Tap one to visit it.</Muted>
      {SOURCES.map(([name, body, url]) => (
        <View key={name} style={{ gap: 4 }}>
          <Text
            style={{ color: colors.brand, fontWeight: "800", fontSize: 16 }}
            onPress={() => Linking.openURL(url).catch(() => {})}
            accessibilityRole="link"
          >
            {name}
          </Text>
          <Muted>{body}</Muted>
        </View>
      ))}
    </Screen>
  );
}
