"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Shown only while the API runs without TMDB credentials. */
export function DemoCatalogNote() {
  const { data } = useQuery({ queryKey: ["health"], queryFn: () => api.health(), staleTime: Infinity });
  if (data?.providers.tmdb !== "demo") return null;
  return (
    <p className="mb-6 rounded-xl border border-fine/30 bg-fine/5 px-4 py-2.5 text-xs text-fine">
      Demo catalog: 46 popular titles. Add a TMDB key to <code className="font-mono">apps/api/.env</code> to unlock every movie and show.
    </p>
  );
}
