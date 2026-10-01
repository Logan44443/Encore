import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

export function useFriends() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["friends"], queryFn: () => api.friends.list(), enabled: Boolean(user) });
}

export function useFriendRequests() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["friend-requests"], queryFn: () => api.friends.requests(), enabled: Boolean(user) });
}

/** Refetches everything that shows who you're friends with, after any change to it. */
export function useRefreshFriends() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        ["friends", "friend-requests", "pending-tags", "profile", "people", "blocked", "together", "activity", "friends-on-title", "compare", "feed"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ),
    [queryClient],
  );
}

/** "Watched with" tags from friends waiting for you to confirm. */
export function usePendingTags() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["pending-tags"], queryFn: () => api.companions.pending(), enabled: Boolean(user) });
}

/** Friend requests plus tags waiting for an answer: the number on the inbox bell. */
export function useInboxCount() {
  const requests = useFriendRequests();
  const tags = usePendingTags();
  return (requests.data?.incoming.length ?? 0) + (tags.data?.tags.length ?? 0);
}
