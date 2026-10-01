import { useInfiniteQuery } from "@tanstack/react-query";
import { FlatList, RefreshControl, View } from "react-native";
import { api } from "@/api";
import { ActivityRow } from "@/components/Activity";
import { AuthGate, Empty, ErrorText, Loading } from "@/components/ui";
import { colors } from "@/theme";

export default function ActivityScreen() {
  return (
    <AuthGate>
      <Activity />
    </AuthGate>
  );
}

/** Everything friends ranked and saw, newest first, loading older items on scroll. */
function Activity() {
  const query = useInfiniteQuery({
    queryKey: ["activity", "all"],
    queryFn: ({ pageParam }) => api.friends.activity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.items.length ? last.items.at(-1)!.at : undefined),
  });
  if (query.isLoading) return <Loading />;
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={(i) => (i.kind === "entry" ? `e:${i.entry.id}` : `s:${i.show.id}`)}
      renderItem={({ item }) => <ActivityRow item={item} />}
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} />}
      ListHeaderComponent={query.error ? <ErrorText error={query.error} /> : null}
      ListEmptyComponent={<Empty title="Nothing from friends yet" body="When friends rank something or log a show, it shows up here." />}
      ListFooterComponent={query.isFetchingNextPage ? <View style={{ paddingVertical: 12 }}><Loading /></View> : null}
    />
  );
}
