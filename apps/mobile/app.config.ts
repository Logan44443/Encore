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
  const release = apiUrl.startsWith("https://");
  if (!release) return config as ExpoConfig;

  const { NSAppTransportSecurity: _ats, ...infoPlist } = config.ios?.infoPlist ?? {};
  return {
    ...config,
    ios: { ...config.ios, infoPlist },
    android: { ...config.android, usesCleartextTraffic: false },
  } as ExpoConfig;
};
