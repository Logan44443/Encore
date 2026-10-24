import { createApiClient } from "@encore/shared";
import Constants from "expo-constants";
import { accessToken } from "./supabase";

function apiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : "http://localhost:4000";
}

/** Set by AuthProvider; runs when the server rejects the session (signed out on another device or deleted). */
let onSessionExpired: ((token: string) => void) | null = null;
export function setSessionExpiredHandler(handler: ((token: string) => void) | null) {
  onSessionExpired = handler;
}

export const api = createApiClient({
  baseUrl: apiBaseUrl(),
  getToken: accessToken,
  onUnauthorized: (token) => onSessionExpired?.(token),
});
