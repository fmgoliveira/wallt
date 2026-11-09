import type { Account, Category } from "@wallt/core";
import {
  Amount,
  Button,
  Card,
  Chip,
  EmptyState,
  Kbd,
  ListItem,
  Select,
  Skeleton,
  Switch,
  Text,
  toast,
  useBreakpoint,
} from "@wallt/ui";
import { CheckCheck } from "lucide-react-native";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Platform, View } from "react-native";
import { categoryOptions } from "../categories/options";
import { useAccounts, useCategories } from "../data/hooks";
import { placeholderIcon } from "../shell/placeholder";
import { useEditorStore } from "../transactions/editorStore";
import {
  type ReviewItem,
  useAlwaysCategorize,
  useAssignCategory,
  useKeepAsIs,
  useReviewQueue,
} from "./data";

/** "Parent › Child" for a category id. */
function labelOf(categories: readonly Category[], id: string): string {
  const c = categories.find((x) => x.id === id);
  if (!c) return "Unknown category";
  const parent = c.parentId ? categories.find((x) => x.id === c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

const SOURCE_LABEL = {
  rule: "Rule",
  payee_memory: "You did this before",
  ml: "Suggested",
} as const;

/** What can be picked with 1-9 / one tap: a tentative category already on the row first, then the suggestions. */
function optionsOf(item: ReviewItem): { categoryId: string; hint: string }[] {
  const out: { categoryId: string; hint: string }[] = [];
  const { tx } = item;
  if (tx.categoryId) {
    out.push({
      categoryId: tx.categoryId,
      hint: `Guessed ${Math.round(tx.categorization.confidence * 100)}%`,
    });
  }
  for (const s of item.suggestions) {
    if (out.some((o) => o.categoryId === s.categoryId)) continue;
    out.push({
      categoryId: s.categoryId,
      hint:
        s.source === "ml"
          ? `${SOURCE_LABEL.ml} ${Math.round(s.confidence * 100)}%`
          : SOURCE_LABEL[s.source],
    });
  }
  return out.slice(0, 9);
}

interface Actions {
  choose: (item: ReviewItem, categoryId: string, always: boolean) => void;
  keep: (item: ReviewItem) => void;
  skip: (item: ReviewItem) => void;
  busy: boolean;
}

/** The transaction, its suggested categories and the ways to answer. Shared by the card and the desktop detail. */
function ReviewDetail({
  item,
  accounts,
  categories,
  actions,
  keyboard,
}: {
  item: ReviewItem;
  accounts: readonly Account[];
  categories: readonly Category[];
  actions: Actions;
  keyboard: boolean;
}) {
  const { tx } = item;
  const [always, setAlways] = useState(false);
  const [other, setOther] = useState<string | null>(null);
  const opts = optionsOf(item);
  const account = accounts.find((a) => a.id === tx.accountId);
  const all = useMemo(
    () => categoryOptions(categories, tx.amount < 0 ? "expense" : "income"),
    [categories, tx.amount],
  );
  const payee = tx.payee.trim() || tx.descriptionClean || "this payee";

  // 1-9 and Enter act on the shown options (desktop keyboard flow).
  const alwaysRef = useRef(always);
  alwaysRef.current = always;
  useEffect(() => {
    if (!keyboard || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= opts.length) {
        e.preventDefault();
        actions.choose(item, (opts[n - 1] as { categoryId: string }).categoryId, alwaysRef.current);
      } else if (e.key === "Enter" && opts[0]) {
        e.preventDefault();
        actions.choose(item, opts[0].categoryId, alwaysRef.current);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        actions.skip(item);
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setAlways((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keyboard, opts, actions, item]);

  return (
    <View className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text variant="title">{payee}</Text>
          <Text tone="muted">
            {tx.bookingDate}
            {account ? ` · ${account.name}` : ""}
          </Text>
        </View>
        <Amount value={tx.amount} currency={tx.currency} size="title" />
      </View>
      {tx.descriptionClean && tx.descriptionClean !== payee ? (
        <Text variant="small" tone="muted" numberOfLines={2}>
          {tx.descriptionClean}
        </Text>
      ) : null}
      {tx.notes ? <Chip tone="warning" label={tx.notes} /> : null}

      <View className="gap-2">
        {opts.length === 0 ? (
          <Text tone="muted">No suggestion yet. Pick a category and Wallt will learn from it.</Text>
        ) : (
          opts.map((o, i) => (
            <Button
              key={o.categoryId}
              label={`${labelOf(categories, o.categoryId)} · ${o.hint}`}
              variant={i === 0 ? "primary" : "secondary"}
              loading={actions.busy}
              {...(keyboard ? { kbd: String(i + 1) } : {})}
              onPress={() => actions.choose(item, o.categoryId, always)}
            />
          ))
        )}
      </View>

      <Select
        label="Another category"
        placeholder="Choose…"
        options={all}
        value={other}
        onChange={(id) => {
          setOther(null);
          actions.choose(item, id, always);
        }}
      />
      <Switch
        value={always}
        onValueChange={setAlways}
        label={`Always categorise “${payee}” this way`}
        description="Adds a rule, and fixes the other transactions it matches."
      />
      <View className="flex-row gap-2">
        <Button
          label="Skip"
          variant="ghost"
          {...(keyboard ? { kbd: "S" } : {})}
          onPress={() => actions.skip(item)}
        />
        <Button label="Keep as is" variant="ghost" onPress={() => actions.keep(item)} />
        <Button
          label="Edit"
          variant="ghost"
          onPress={() => useEditorStore.getState().openEdit(tx.id)}
        />
      </View>
    </View>
  );
}

const SWIPE_DISTANCE = 110;

const KEY_HINTS: readonly (readonly [string, string])[] = [
  ["↑↓", "move"],
  ["1", "pick"],
  ["Enter", "accept first"],
  ["A", "always"],
];

/** Phone: one card at a time. Swipe right to accept the first suggestion, left to skip; the buttons do the same. */
function SwipeCard({
  item,
  onAccept,
  onSkip,
  children,
}: {
  item: ReviewItem;
  onAccept: () => void;
  onSkip: () => void;
  children: React.ReactNode;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const handlers = useRef({ onAccept, onSkip });
  handlers.current = { onAccept, onSkip };
  const canAccept = optionsOf(item).length > 0;
  const accept = useRef(canAccept);
  accept.current = canAccept;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderMove: Animated.event([null, { dx: x }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
          if (g.dx > SWIPE_DISTANCE && accept.current) {
            Animated.timing(x, { toValue: 500, duration: 160, useNativeDriver: false }).start(
              () => {
                x.setValue(0);
                handlers.current.onAccept();
              },
            );
          } else if (g.dx < -SWIPE_DISTANCE) {
            Animated.timing(x, { toValue: -500, duration: 160, useNativeDriver: false }).start(
              () => {
                x.setValue(0);
                handlers.current.onSkip();
              },
            );
          } else {
            back();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
      }),
    [x],
  );

  const rotate = x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: ["-6deg", "0deg", "6deg"],
  });
  const acceptOpacity = x.interpolate({
    inputRange: [0, SWIPE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const skipOpacity = x.interpolate({
    inputRange: [-SWIPE_DISTANCE, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={{ transform: [{ translateX: x }, { rotate }] }}
      {...responder.panHandlers}
    >
      <Card>
        <View className="absolute right-4 top-4 flex-row justify-between" pointerEvents="none">
          <Animated.View style={{ opacity: acceptOpacity }}>
            <Chip tone="positive" label="Accept" />
          </Animated.View>
        </View>
        <View className="absolute left-4 top-4" pointerEvents="none">
          <Animated.View style={{ opacity: skipOpacity }}>
            <Chip label="Skip" />
          </Animated.View>
        </View>
        {children}
      </Card>
    </Animated.View>
  );
}

/**
 * The review queue (PLAN §6): transactions Wallt could not categorise with confidence. Phone: swipeable cards.
 * Tablet and desktop: a list with the selected transaction beside it, driven by the keyboard on web
 * (↑↓ move, 1-9 pick, Enter accept the first, S skip, A toggle "always").
 */
export function ReviewQueue() {
  const bp = useBreakpoint();
  const queue = useReviewQueue();
  const categories = useCategories({ includeArchived: true }).data ?? [];
  const accounts = useAccounts({ includeArchived: true }).data ?? [];
  const assign = useAssignCategory();
  const keep = useKeepAsIs();
  const always = useAlwaysCategorize();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);

  const items = useMemo(() => {
    const all = queue.items ?? [];
    return [
      ...all.filter((i) => !skipped.includes(i.tx.id)),
      ...all.filter((i) => skipped.includes(i.tx.id)),
    ];
  }, [queue.items, skipped]);
  const first = useMemo(
    () => (queue.items ?? []).filter((i) => !skipped.includes(i.tx.id)).length,
    [queue.items, skipped],
  );

  const actions: Actions = useMemo(
    () => ({
      busy: assign.isPending || always.isPending || keep.isPending,
      choose: async (item, categoryId, wantsRule) => {
        const name = labelOf(categories, categoryId);
        try {
          if (wantsRule) {
            const others = await always.mutateAsync({ tx: item.tx, categoryId });
            toast.success(
              others > 0
                ? `Rule added: ${name}. ${others} more transaction${others === 1 ? "" : "s"} fixed.`
                : `Rule added: ${name}`,
            );
          } else {
            await assign.mutateAsync({ id: item.tx.id, categoryId });
            toast.success(`Categorised as ${name}`);
          }
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save");
        }
      },
      keep: async (item) => {
        try {
          await keep.mutateAsync(item.tx);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save");
        }
      },
      skip: (item) => setSkipped((s) => (s.includes(item.tx.id) ? s : [...s, item.tx.id])),
    }),
    [assign, always, keep, categories],
  );

  // Desktop: ↑↓ / j k move through the list.
  const count = items.length;
  const move = useCallback(
    (d: number) => setSelected((i) => Math.max(0, Math.min(count - 1, i + d))),
    [count],
  );
  useEffect(() => {
    if (selected > count - 1) setSelected(Math.max(0, count - 1));
  }, [count, selected]);
  const wide = bp !== "phone";
  const keyboard = wide && Platform.OS === "web";
  useEffect(() => {
    if (!keyboard || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        move(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keyboard, move]);

  if (queue.isPending) return <Skeleton className="h-60 w-full" />;
  if (queue.isError) return <Text tone="negative">Could not load the review queue.</Text>;
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={placeholderIcon(CheckCheck)}
          title="Nothing to review"
          description="Everything is categorised. New imports that Wallt is unsure about will show up here."
        />
      </Card>
    );
  }

  const current = items[Math.min(selected, items.length - 1)] as ReviewItem;

  if (!wide) {
    const top = items[0] as ReviewItem;
    const topOption = optionsOf(top)[0];
    return (
      <View className="gap-4">
        <Text tone="muted">
          {items.length} to review
          {skipped.length > 0 ? ` · ${first} not skipped` : ""}
        </Text>
        <SwipeCard
          key={top.tx.id}
          item={top}
          onAccept={() => topOption && actions.choose(top, topOption.categoryId, false)}
          onSkip={() => actions.skip(top)}
        >
          <ReviewDetail
            item={top}
            accounts={accounts}
            categories={categories}
            actions={actions}
            keyboard={false}
          />
        </SwipeCard>
        <Text variant="small" tone="muted">
          Swipe right to accept the first suggestion, left to skip.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-start gap-6">
      <View className="w-[42%] gap-2">
        <Text variant="label" tone="muted">
          {items.length} to review
        </Text>
        <Card className="p-0 tablet:p-0">
          {items.map((item, i) => {
            const top = optionsOf(item)[0];
            return (
              <ListItem
                key={item.tx.id}
                divider={i > 0}
                selected={i === selected}
                title={item.tx.payee.trim() || item.tx.descriptionClean || "Transaction"}
                subtitle={`${item.tx.bookingDate}${top ? ` · ${labelOf(categories, top.categoryId)}` : " · no suggestion"}`}
                trailing={<Amount value={item.tx.amount} currency={item.tx.currency} />}
                onPress={() => setSelected(i)}
              />
            );
          })}
        </Card>
        {keyboard ? (
          <View className="flex-row flex-wrap items-center gap-2">
            {KEY_HINTS.map(([key, what]) => (
              <Fragment key={key}>
                <Kbd>{key}</Kbd>
                <Text variant="small" tone="muted">
                  {what}
                </Text>
              </Fragment>
            ))}
          </View>
        ) : null}
      </View>
      <View className="flex-1">
        <Card key={current.tx.id}>
          <ReviewDetail
            item={current}
            accounts={accounts}
            categories={categories}
            actions={actions}
            keyboard={keyboard}
          />
        </Card>
      </View>
    </View>
  );
}
