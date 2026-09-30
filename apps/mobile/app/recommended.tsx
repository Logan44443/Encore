import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import { FEED_KEY, FeedCard, UndoBar, useDismiss, useFeed } from "@/components/Feed";
import { AuthGate, Empty, ErrorText, Loading, Muted, Screen } from "@/components/ui";

export default function Recommended() {
  return (
    <AuthGate>
      <FeedGrid />
    </AuthGate>
  );
}

function FeedGrid() {
  const feed = useFeed();
  const queryClient = useQueryClient();
  const { hidden, dismiss, undo } = useDismiss();
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 16 * 2 - 12 * 2) / 3);

  const refresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: FEED_KEY });
    setRefreshing(false);
  };

  if (feed.isLoading) return <Loading />;
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="white" />}>
      <Muted>
        {feed.data?.personalized
          ? "Picked from what you loved, what people with your taste rank highly, and your favourite genres."
          : "Popular on Encore right now. Rank a few titles you liked to make this yours."}
      </Muted>
      <ErrorText error={feed.error} />
      {hidden ? <UndoBar name={hidden.item.title.name} onUndo={undo} /> : null}
      {feed.data?.items.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {feed.data.items.map((item) => (
            <FeedCard
              key={`${item.title.mediaType}-${item.title.tmdbId}`}
              item={item}
              width={cardWidth}
              onDismiss={() => dismiss(item)}
            />
          ))}
        </View>
      ) : (
        <Empty title="You're all caught up" body="Rank more titles for fresh picks." />
      )}
    </Screen>
  );
}
