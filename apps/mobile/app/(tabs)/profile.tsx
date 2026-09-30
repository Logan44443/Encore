import { useRouter } from "expo-router";
import { AuthGate, Button } from "@/components/ui";
import { useAuth } from "@/auth";
import { ProfileBody } from "../user/[username]";

export default function ProfileTab() {
  const { user } = useAuth();
  const router = useRouter();
  return (
    <AuthGate>
      {user && (
        <ProfileBody
          username={user.username}
          footer={<Button label="Settings" tone="ghost" onPress={() => router.push("/settings")} />}
        />
      )}
    </AuthGate>
  );
}
