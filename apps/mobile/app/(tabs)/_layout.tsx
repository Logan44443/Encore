import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useAuth } from "@/auth";
import { Logo } from "@/components/Logo";
import { useFriendRequests } from "@/friends";
import { colors } from "@/theme";

export default function TabsLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const waiting = useFriendRequests().data?.incoming.length ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800" },
        tabBarStyle: { backgroundColor: colors.ink, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.ink },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerTitle: () => <Logo />,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: "Discover", tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: "Watchlist",
          href: user ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="bookmark" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{ title: "Rankings", tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="live"
        options={{ title: "Live", tabBarIcon: ({ color, size }) => <Ionicons name="ticket" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          href: user ? undefined : null,
          // Friend requests waiting for an answer.
          tabBarBadge: waiting || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brand2 },
          headerRight: () => (
            <Pressable onPress={() => router.push("/settings")} hitSlop={12} style={{ paddingHorizontal: 16 }} accessibilityLabel="Settings">
              <Ionicons name="settings-outline" color={colors.text} size={22} />
            </Pressable>
          ),
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
