import { createApiClient } from "@encore/shared";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const KEY = "encore.token";

/** In-memory copy so requests don't wait on the keychain. */
let memory: string | null = null;

function apiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : "http://localhost:4000";
}

export const tokenStore = {
  async load() {
    memory = await SecureStore.getItemAsync(KEY);
    return memory;
  },
  get: () => memory,
  async set(token: string | null) {
    memory = token;
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  },
};

export const api = createApiClient({
  baseUrl: apiBaseUrl(),
  getToken: () => memory,
});
