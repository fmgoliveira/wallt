import { type FeedItem, unreadCount } from "@wallt/core";
import { Button, EmptyState, ListItem, Sheet, Text, useTheme } from "@wallt/ui";
import { Bell } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "../i18n";
import { placeholderIcon } from "../shell/placeholder";
import { useNotificationStore } from "./store";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Bell for page headers: unread count badge, opens the in-app notification center (the only surface on web). */
export function NotificationBell() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const feed = useNotificationStore((s) => s.feed);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const [open, setOpen] = useState(false);
  const unread = unreadCount(feed);

  const close = () => {
    setOpen(false);
    markAllRead();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0
            ? t("notifications.bell.labelUnread", { count: unread })
            : t("notifications.bell.label")
        }
        onPress={() => setOpen(true)}
        hitSlop={6}
        className="h-11 w-11 items-center justify-center rounded-md active:bg-text/5 web:cursor-pointer web:outline-none web:hover:bg-text/5 web:focus-visible:bg-text/5"
      >
        <Bell size={20} color={unread > 0 ? colors.text : colors.muted} strokeWidth={1.6} />
        {unread > 0 ? (
          <View
            className="absolute top-1.5 right-1.5 min-w-[16px] items-center rounded-full px-1"
            style={{ backgroundColor: colors.negative }}
          >
            <Text
              variant="small"
              weight="semibold"
              className="text-[10px] leading-4"
              tone="onAccent"
            >
              {unread > 9 ? "9+" : unread}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {open ? (
        <Sheet visible onClose={close} title={t("notifications.bell.title")}>
          {feed.length === 0 ? (
            <EmptyState
              icon={placeholderIcon(Bell)}
              title={t("notifications.bell.emptyTitle")}
              description={t("notifications.bell.emptyDescription")}
            />
          ) : (
            <View>
              {feed.map((n: FeedItem, i) => (
                <ListItem
                  key={n.key}
                  divider={i > 0}
                  title={n.title}
                  subtitle={t(
                    n.read ? "notifications.bell.subtitle" : "notifications.bell.subtitleNew",
                    {
                      type: t(`notifications.type.${n.type}`),
                      when: when(n.createdAt),
                    },
                  )}
                />
              ))}
            </View>
          )}
          <Button label={t("notifications.bell.close")} variant="ghost" onPress={close} />
        </Sheet>
      ) : null}
    </>
  );
}
