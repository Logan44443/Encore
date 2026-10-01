import { AuthGate } from "@/components/ui";
import { useAuth } from "@/auth";
import { ProfileBody } from "../user/[username]";

// Settings opens from the gear in this tab's header (see (tabs)/_layout.tsx).
export default function ProfileTab() {
  const { user } = useAuth();
  return <AuthGate>{user && <ProfileBody username={user.username} />}</AuthGate>;
}
