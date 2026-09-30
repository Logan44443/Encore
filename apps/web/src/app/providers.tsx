"use client";

import { ApiError } from "@encore/shared";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";

const DAY = 24 * 60 * 60 * 1000;

/** Catalog-style queries worth showing instantly on the next visit (then refreshed in the background). */
const PERSISTED_KEYS = new Set(["trending", "top-rated", "genres", "recommendations", "search", "season", "title", "watchlist"]);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: DAY,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window === "undefined" ? undefined : window.localStorage,
      key: "encore.query-cache",
      throttleTime: 2000,
    }),
  );

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: DAY,
        buster: "v1",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success" && PERSISTED_KEYS.has(String(q.queryKey[0])),
        },
      }}
    >
      <AuthProvider>{children}</AuthProvider>
    </PersistQueryClientProvider>
  );
}
