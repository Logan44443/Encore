import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/auth";
import { headerOptions } from "@/theme";

const client = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={headerOptions}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Back" }} />
          <Stack.Screen name="login" options={{ title: "Sign in", presentation: "modal" }} />
          <Stack.Screen name="register" options={{ title: "Join Encore", presentation: "modal" }} />
          <Stack.Screen name="picks" options={{ title: "Picks" }} />
          <Stack.Screen name="recommended" options={{ title: "Recommended for you" }} />
          <Stack.Screen name="country" options={{ title: "Streaming country" }} />
          <Stack.Screen name="title/[type]/[id]" options={{ title: "" }} />
          <Stack.Screen name="show/new" options={{ title: "Add a show" }} />
          <Stack.Screen name="show/[id]" options={{ title: "Live show" }} />
          <Stack.Screen name="user/[username]" options={{ title: "Profile" }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
