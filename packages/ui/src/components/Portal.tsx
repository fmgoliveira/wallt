import { type ReactNode, useEffect, useId } from "react";
import { View } from "react-native";
import { create } from "zustand";

interface PortalState {
  nodes: Record<string, ReactNode>;
  order: string[];
  set: (id: string, node: ReactNode) => void;
  remove: (id: string) => void;
}

const usePortalStore = create<PortalState>((set) => ({
  nodes: {},
  order: [],
  set: (id, node) =>
    set((s) => ({
      nodes: { ...s.nodes, [id]: node },
      order: s.order.includes(id) ? s.order : [...s.order, id],
    })),
  remove: (id) =>
    set((s) => {
      const { [id]: _removed, ...nodes } = s.nodes;
      return { nodes, order: s.order.filter((x) => x !== id) };
    }),
}));

/**
 * Renders `children` inside the `<PortalHost>` at the app root instead of in place. Unlike RN `Modal` or
 * a DOM portal it stays inside the theme provider, so colour variables keep working.
 */
export function Portal({ children }: { children: ReactNode }) {
  const id = useId();
  const set = usePortalStore((s) => s.set);
  const remove = usePortalStore((s) => s.remove);

  // Re-publish whenever the children change (props, state of the owner).
  useEffect(() => {
    set(id, children);
  });
  useEffect(() => () => remove(id), [id, remove]);
  return null;
}

export function PortalHost() {
  const nodes = usePortalStore((s) => s.nodes);
  const order = usePortalStore((s) => s.order);
  return (
    <View pointerEvents="box-none" className="absolute inset-0 z-50">
      {order.map((id) => (
        <View key={id} pointerEvents="box-none" className="absolute inset-0">
          {nodes[id]}
        </View>
      ))}
    </View>
  );
}
