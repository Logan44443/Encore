import type { Companion, CompanionInput } from "@encore/shared";

/** One person in the "watched with" picker: a friend, or a name typed in. */
export type CompanionDraft = { userId: string; label: string } | { name: string };

export const draftLabel = (d: CompanionDraft) => ("userId" in d ? d.label : d.name);

export function draftsFrom(companions: Companion[] | undefined): CompanionDraft[] {
  return (companions ?? []).flatMap((c): CompanionDraft[] => (c.user ? [{ userId: c.user.id, label: c.user.displayName }] : c.name ? [{ name: c.name }] : []));
}

export function draftsToInput(drafts: CompanionDraft[]): CompanionInput[] {
  return drafts.map((d) => ("userId" in d ? { userId: d.userId } : { name: d.name }));
}

/** "Sam, Alex and Mum", or null for nobody. */
export function companionNames(companions: Companion[] | undefined): string | null {
  const names = (companions ?? []).map((c) => c.user?.displayName ?? c.name ?? "").filter(Boolean);
  if (!names.length) return null;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
