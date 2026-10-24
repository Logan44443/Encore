import { Text, View } from "react-native";
import { H1, Muted, Screen } from "@/components/ui";
import { contactSupport, PRIVACY_POLICY_UPDATED, SUPPORT_EMAIL } from "@/legal";
import { colors } from "@/theme";

const SECTIONS: [string, string][] = [
  [
    "What we collect",
    "Your account: email, username, display name and a hashed password (we never store the password itself). " +
      "What you log: the movies, shows, seasons, episodes, books and live shows you add, with your rankings, scores, " +
      "reviews, notes, dates, venues and setlists. Your watchlist, friends, friend requests, blocks, the friends you " +
      "tag as \"watched with\", and your privacy settings. Your streaming country (taken from your phone's region " +
      "unless you pick one) and the services you subscribe to.",
  ],
  [
    "Imports",
    "If you import from Letterboxd or Goodreads, the file you choose is sent to our server, read once to add the " +
      "titles and ratings it lists, and then thrown away. We keep what was added to your account and a summary of the " +
      "latest import, including any items it couldn't match so you can sort them out by hand.",
  ],
  [
    "How we use it",
    "Only to run Encore: to keep your rankings and scores, show you where to watch things, recommend titles, and " +
      "show your friends what you share with them under your privacy settings. We use your email to sign you in and " +
      "to send password reset codes.",
  ],
  [
    "What we don't do",
    "No ads, no tracking across other apps or websites, no analytics tools and no selling or sharing of your data " +
      "with data brokers. Nothing on your phone is read except the files you choose to import.",
  ],
  [
    "Services we look things up with",
    "To find titles, posters, performers and setlists, our server asks TMDB (movies, TV and where to watch), " +
      "Open Library and Google Books (books), setlist.fm (setlists), MusicBrainz, Deezer and Wikidata/Wikimedia " +
      "Commons (performer details and photos). These requests contain only what is being searched for, such as a " +
      "title or artist name, and never your email, username or anything else about you. Opening a streaming service " +
      "from a title page takes you to that service's own app or website, which has its own privacy policy.",
  ],
  [
    "Who can see your data",
    "Your profile, rankings and live shows are visible to only you, your friends, or any signed-in user, depending on " +
      "your Privacy setting. Reviews and notes are only ever shown to friends, and only if you allow it. You can " +
      "change these at any time in Settings > Privacy.",
  ],
  [
    "How long we keep it",
    "We keep your data while you have an account. When you delete your account, everything above is removed " +
      "straight away and can't be recovered. If you reported someone, the report is kept so we can act on it, but it " +
      "is no longer linked to you.",
  ],
  [
    "Your choices",
    "You can edit or delete anything you've logged, change who sees it, and delete your account in Settings > Delete " +
      "account, which withdraws your consent and erases your data. To ask for a copy of your data or for help with " +
      `anything else, email ${SUPPORT_EMAIL}.`,
  ],
  [
    "Children",
    "Encore isn't meant for children under 13, and we don't knowingly collect data from them.",
  ],
  [
    "Changes",
    "If this policy changes, we'll update it here and change the date at the top.",
  ],
];

/** Privacy policy (App Store guideline 5.1.1). Keep it in step with the hosted copy at PRIVACY_POLICY_URL. */
export default function PrivacyPolicyScreen() {
  return (
    <Screen>
      <H1>Privacy policy</H1>
      <Muted>Last updated {PRIVACY_POLICY_UPDATED}</Muted>
      {SECTIONS.map(([title, body]) => (
        <View key={title} style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{title}</Text>
          <Muted>{body}</Muted>
        </View>
      ))}
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>Contact us</Text>
        <Text style={{ color: colors.brand, fontWeight: "700" }} onPress={() => contactSupport("Privacy question")}>
          {SUPPORT_EMAIL}
        </Text>
      </View>
    </Screen>
  );
}
