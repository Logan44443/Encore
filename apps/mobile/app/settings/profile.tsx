import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { AuthGate, Button, ErrorText, Field, Muted, Screen } from "@/components/ui";

export default function EditProfileScreen() {
  return (
    <AuthGate>
      <EditProfile />
    </AuthGate>
  );
}

function EditProfile() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  if (!user) return null;

  const name = displayName.trim();
  const handle = username.trim();
  const changes = {
    ...(name !== user.displayName ? { displayName: name } : {}),
    ...(handle !== user.username ? { username: handle } : {}),
  };
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await api.account.updateProfile(changes);
      setUser(res.user);
      // Profile pages and feeds show the old name until refetched.
      await queryClient.invalidateQueries();
      router.back();
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  return (
    <Screen>
      <Field label="Name" value={displayName} onChangeText={setDisplayName} maxLength={60} textContentType="name" />
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
        textContentType="username"
      />
      <Muted>
        Usernames are 3 to 24 letters, numbers or underscores. Capitals show as you type them, but Bob and bob count
        as the same name. Changing yours changes your profile link, and someone else can take your old one.
      </Muted>
      <ErrorText error={error} />
      <Button label={pending ? "…" : "Save"} disabled={pending || !dirty || !name || handle.length < 3} onPress={save} />
    </Screen>
  );
}
