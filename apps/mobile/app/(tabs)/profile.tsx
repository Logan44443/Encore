import { useRouter } from "expo-router";
import { View } from "react-native";
import { AuthGate, Button } from "@/components/ui";
import { useAuth, useCountry } from "@/auth";
import { countryName, flag } from "@/region";
import { ProfileBody } from "../user/[username]";

export default function ProfileTab() {
  const { user, signOut } = useAuth();
  const country = useCountry();
  const router = useRouter();
  return (
    <AuthGate>
      {user && (
        <ProfileBody
          username={user.username}
          footer={
            <View style={{ gap: 8 }}>
              <Button
                label={`Streaming country: ${flag(country)} ${countryName(country)}`}
                tone="ghost"
                onPress={() => router.push("/country")}
              />
              <Button label="Sign out" tone="ghost" onPress={() => { signOut(); router.replace("/"); }} />
            </View>
          }
        />
      )}
    </AuthGate>
  );
}
