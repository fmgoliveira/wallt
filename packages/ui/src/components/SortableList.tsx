import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, View, type ViewStyle } from "react-native";
import { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useTheme } from "../theme/context";
import { radius } from "../tokens";
import { MotionView } from "./primitives";

export interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** `handle` is the grip to render (null while not enabled). `index` is the current visual order. */
  renderItem: (item: T, ctx: { handle: ReactNode; dragging: boolean; index: number }) => ReactNode;
  /** Called once on drop with the full new order of ids. */
  onReorder: (ids: string[]) => void;
  /** Show the grips and allow dragging. */
  enabled: boolean;
}

interface DragApi {
  start: (id: string) => void;
  move: (dy: number) => void;
  end: () => void;
}

const gripStyle = {
  width: 44,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
  // web: keep the browser from scrolling or selecting while dragging; show the grab cursor
  touchAction: "none",
  cursor: "grab",
  userSelect: "none",
} as unknown as ViewStyle;

function Grip({ id, api }: { id: string; api: React.RefObject<DragApi> }) {
  const { colors } = useTheme();
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => api.current?.start(id),
      onPanResponderMove: (_e, g) => api.current?.move(g.dy),
      onPanResponderRelease: () => api.current?.end(),
      onPanResponderTerminate: () => api.current?.end(),
    }),
  ).current;
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Drag to reorder"
      style={gripStyle}
      {...responder.panHandlers}
    >
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: 3, marginVertical: 1.5 }}>
          {[0, 1].map((col) => (
            <View
              key={col}
              style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.subtle }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function Row({
  dragging,
  shift,
  dy,
  onHeight,
  children,
}: {
  dragging: boolean;
  shift: number;
  dy: { value: number };
  onHeight: (h: number) => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }] }));
  return (
    <MotionView
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={[
        dragging ? lift : { transform: [{ translateY: shift }] },
        dragging
          ? {
              zIndex: 20,
              backgroundColor: colors.elevated,
              borderRadius: radius.md,
              boxShadow: `0 8px 24px -8px rgba(0,0,0,0.45), 0 0 0 1px ${colors.borderStrong}`,
            }
          : { zIndex: 0 },
      ]}
    >
      {children}
    </MotionView>
  );
}

/**
 * Drag-and-drop reordering (no gesture library: `PanResponder` on a grip, works on web with mouse and touch and on
 * native). Rows may have different heights. The list reorders optimistically and reports the final order on drop.
 */
export function SortableList<T>({
  items,
  getId,
  renderItem,
  onReorder,
  enabled,
}: SortableListProps<T>) {
  const key = items.map(getId).join("|");
  const [ids, setIds] = useState<string[]>(() => items.map(getId));
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const dy = useSharedValue(0);
  const heights = useRef<Record<string, number>>({});
  const session = useRef<{ id: string; from: number; over: number } | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the identity of the id list
  useEffect(() => {
    if (!session.current) setIds(items.map(getId));
  }, [key]);

  const api = useRef<DragApi>({
    start(id) {
      const from = idsRef.current.indexOf(id);
      if (from < 0) return;
      session.current = { id, from, over: from };
      dy.value = 0;
      setDrag({ id, over: from });
    },
    move(delta) {
      const s = session.current;
      if (!s) return;
      dy.value = delta;
      const list = idsRef.current;
      const h = (i: number) => heights.current[list[i] ?? ""] ?? 0;
      let top = 0;
      for (let i = 0; i < s.from; i++) top += h(i);
      const center = top + h(s.from) / 2 + delta;
      let over = 0;
      let y = 0;
      for (let i = 0; i < list.length; i++) {
        if (i !== s.from && y + h(i) / 2 < center) over++;
        y += h(i);
      }
      if (over !== s.over) {
        s.over = over;
        setDrag({ id: s.id, over });
      }
    },
    end() {
      const s = session.current;
      if (!s) return;
      session.current = null;
      setDrag(null);
      dy.value = 0;
      if (s.over === s.from) return;
      const next = [...idsRef.current];
      const [moved] = next.splice(s.from, 1);
      if (moved === undefined) return;
      next.splice(s.over, 0, moved);
      setIds(next);
      onReorderRef.current(next);
    },
  });

  const byId = useMemo(() => new Map(items.map((i) => [getId(i), i])), [items, getId]);
  const ordered = ids.filter((id) => byId.has(id));
  for (const id of byId.keys()) if (!ordered.includes(id)) ordered.push(id);

  const from = drag ? ordered.indexOf(drag.id) : -1;
  const dragged = from >= 0 ? (heights.current[ordered[from] ?? ""] ?? 0) : 0;

  return (
    <View>
      {ordered.map((id, index) => {
        const item = byId.get(id) as T;
        const isDragged = drag?.id === id;
        let shift = 0;
        if (drag && !isDragged) {
          if (from < drag.over && index > from && index <= drag.over) shift = -dragged;
          if (from > drag.over && index >= drag.over && index < from) shift = dragged;
        }
        return (
          <Row
            key={id}
            dragging={isDragged}
            shift={shift}
            dy={dy}
            onHeight={(h) => {
              heights.current[id] = h;
            }}
          >
            {renderItem(item, {
              handle: enabled ? <Grip id={id} api={api as React.RefObject<DragApi>} /> : null,
              dragging: isDragged,
              index,
            })}
          </Row>
        );
      })}
    </View>
  );
}
