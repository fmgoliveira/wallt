import {
  type AppNotification,
  DEFAULT_NOTIFICATION_PREFS,
  type FeedItem,
  markAllRead,
  mergeFeed,
  type NotificationPrefs,
  type NotificationType,
  rememberKeys,
  unseen,
} from "@wallt/core";
import { create } from "zustand";
import { getDeviceMeta } from "../sync/runtime";

const PREFS_KEY = "notif.prefs";
const FEED_KEY = "notif.feed";
const SEEN_KEY = "notif.seen";

interface NotificationState {
  loaded: boolean;
  prefs: NotificationPrefs;
  feed: FeedItem[];
  seen: string[];
  load: () => Promise<void>;
  setPref: (type: NotificationType, on: boolean) => void;
  /** Records candidates this device has not shown yet and returns them (to deliver); persists feed and seen keys. */
  ingest: (candidates: readonly AppNotification[], now: string) => AppNotification[];
  markAllRead: () => void;
}

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await getDeviceMeta()?.getMeta(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  void getDeviceMeta()
    ?.setMeta(key, JSON.stringify(value))
    .catch(() => undefined);
}

/**
 * Notification state of this device: per-type toggles, the in-app feed and the keys already shown. All of it lives
 * in the device-local sync_meta table: it is never synced, because "already shown" is a per-device fact (see
 * packages/core/src/notifications.ts for how duplicates are avoided).
 */
export const useNotificationStore = create<NotificationState>((set, get) => ({
  loaded: false,
  prefs: DEFAULT_NOTIFICATION_PREFS,
  feed: [],
  seen: [],
  load: async () => {
    if (get().loaded || !getDeviceMeta()) return;
    const [prefs, feed, seen] = await Promise.all([
      read<Partial<NotificationPrefs>>(PREFS_KEY, {}),
      read<FeedItem[]>(FEED_KEY, []),
      read<string[]>(SEEN_KEY, []),
    ]);
    set({
      loaded: true,
      prefs: { ...DEFAULT_NOTIFICATION_PREFS, ...prefs },
      feed: Array.isArray(feed) ? feed : [],
      seen: Array.isArray(seen) ? seen : [],
    });
  },
  setPref: (type, on) => {
    const prefs = { ...get().prefs, [type]: on };
    set({ prefs });
    write(PREFS_KEY, prefs);
  },
  ingest: (candidates, now) => {
    const fresh = unseen(candidates, new Set(get().seen));
    if (fresh.length === 0) return [];
    const feed = mergeFeed(get().feed, fresh, now);
    const seen = rememberKeys(
      get().seen,
      fresh.map((f) => f.key),
    );
    set({ feed, seen });
    write(FEED_KEY, feed);
    write(SEEN_KEY, seen);
    return fresh;
  },
  markAllRead: () => {
    const feed = markAllRead(get().feed);
    set({ feed });
    write(FEED_KEY, feed);
  },
}));
