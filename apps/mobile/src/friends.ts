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
        ["friends", "friend-requests", "profile", "people", "blocked"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ),
    [queryClient],
  );
}
