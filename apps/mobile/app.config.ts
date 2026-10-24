import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json holds the config; this only decides whether plain-HTTP traffic is allowed.
 * Local development talks to `http://<your Mac>:4000`, which needs iOS's local-networking
 * exception and Android cleartext traffic. Once EXPO_PUBLIC_API_URL points at a hosted
 * https API (every TestFlight / store build), both are switched off so the app can only
 * talk to the server over TLS.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
  // eas.json ships a placeholder until the API is hosted; refuse to build an app that can't reach it.
  if (process.env.EAS_BUILD_PROFILE && /REPLACE/.test(apiUrl)) {
    throw new Error("Set EXPO_PUBLIC_API_URL in apps/mobile/eas.json to the hosted https API before building.");
  }
  const release = apiUrl.startsWith("https://");
  if (!release) return config as ExpoConfig;

  const { NSAppTransportSecurity: _ats, ...infoPlist } = config.ios?.infoPlist ?? {};
  return {
    ...config,
    ios: { ...config.ios, infoPlist },
    android: { ...config.android, usesCleartextTraffic: false },
  } as ExpoConfig;
};
