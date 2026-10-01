import { Text, View } from "react-native";
import { H1, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";

const RULES: [string, string][] = [
  ["Be kind", "Disagree about movies all you like. Don't harass, bully, threaten or demean anyone."],
  ["No hate", "Nothing that attacks people for who they are, including race, ethnicity, religion, gender, sexuality or disability."],
  ["Keep it clean", "No sexual content, graphic violence or anything illegal in reviews, notes or names."],
  ["Be yourself", "Don't pretend to be someone else or use Encore to spam."],
];

/** Community guidelines: the terms people agree to at sign-up (App Store guideline 1.2). */
export default function GuidelinesScreen() {
  return (
    <Screen>
      <H1>Community guidelines</H1>
      <Muted>
        Encore is for sharing what you watch with friends. Reviews, notes and names you share are seen by other people, so
        they have to follow these rules.
      </Muted>
      {RULES.map(([title, body]) => (
        <View key={title} style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{title}</Text>
          <Muted>{body}</Muted>
        </View>
      ))}
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>Zero tolerance</Text>
        <Muted>
          There is no tolerance for objectionable content or abusive users. We review reports within a day and remove
          content or close accounts that break these rules.
        </Muted>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>If something's wrong</Text>
        <Muted>
          Open the person's profile and tap ••• to report or block them. Blocking hides you from each other straight away,
          and they aren't told.
        </Muted>
      </View>
    </Screen>
  );
}
