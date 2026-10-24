import { Alert, Linking } from "react-native";

/**
 * PLACEHOLDERS until bob picks them. The support address must be a real inbox someone reads
 * before the App Store build ships, and the privacy policy also has to be hosted at a public
 * https URL for App Store Connect (guideline 5.1.1). Change them here and nowhere else.
 */
export const SUPPORT_EMAIL = "support@encore.example";
export const PRIVACY_POLICY_URL = "https://encore.example/privacy";

/** Date shown at the top of the privacy policy. Update it whenever the policy text changes. */
export const PRIVACY_POLICY_UPDATED = "October 24, 2026";

/** Opens Mail addressed to support, falling back to showing the address. */
export function contactSupport(subject = "Encore support") {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => Alert.alert("Contact support", `Email us at ${SUPPORT_EMAIL}`));
}
