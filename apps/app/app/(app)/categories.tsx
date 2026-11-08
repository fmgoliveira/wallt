import type { Category } from "@wallt/core";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconTile,
  ListItem,
  Tabs,
  Text,
  useTheme,
} from "@wallt/ui";
import { ArrowDown, ArrowUp, ChevronRight, Plus, Tags } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { CategoryForm } from "../../src/categories/CategoryForm";
import { categoryIcon } from "../../src/categories/icons";
import { colorForScheme } from "../../src/components/colors";
import { DataGate } from "../../src/data/DataGate";
import { useCategories, useCategoryUsage, useReorderCategories } from "../../src/data/hooks";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

const kinds = [
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
] as const;

type FormState = { category?: Category; parentId?: string | null } | null;

function CategoryRow({
  category,
  uses,
  child,
  divider,
  sorting,
  canUp,
  canDown,
  onMove,
  onOpen,
}: {
  category: Category;
  uses: number;
  child: boolean;
  divider: boolean;
  sorting: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (delta: -1 | 1) => void;
  onOpen: () => void;
}) {
  const { scheme, colors } = useTheme();
  const Icon = categoryIcon(category.icon);
  const tint = colorForScheme(category.color, scheme) ?? colors.muted;
  const arrow = (delta: -1 | 1, enabled: boolean) => {
    const A = delta === -1 ? ArrowUp : ArrowDown;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Move ${category.name} ${delta === -1 ? "up" : "down"}`}
        disabled={!enabled}
        onPress={() => onMove(delta)}
        className="h-11 w-11 items-center justify-center"
      >
        <A size={18} color={enabled ? colors.text : colors.subtle} strokeWidth={1.6} />
      </Pressable>
    );
  };
  return (
    <View className={child ? "pl-6" : undefined} style={{ opacity: category.archived ? 0.6 : 1 }}>
      <ListItem
        divider={divider}
        title={category.name}
        subtitle={uses > 0 ? `${uses} transaction${uses === 1 ? "" : "s"}` : undefined}
        leading={
          <IconTile>
            <Icon size={18} color={tint} strokeWidth={1.6} />
          </IconTile>
        }
        trailing={
          sorting ? (
            <View className="flex-row">
              {arrow(-1, canUp)}
              {arrow(1, canDown)}
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              {category.archived ? <Chip label="Archived" /> : null}
              <ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />
            </View>
          )
        }
        onPress={sorting ? undefined : onOpen}
      />
    </View>
  );
}

function CategoriesContent({
  type,
  form,
  setForm,
}: {
  type: Category["type"];
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const query = useCategories({ includeArchived: true });
  const usage = useCategoryUsage();
  const reorder = useReorderCategories();
  const [sorting, setSorting] = useState(false);

  const all = (query.data ?? []).filter((c) => c.type === type);
  const roots = all.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => all.filter((c) => c.parentId === id);
  const uses = usage.data ?? {};

  function move(siblings: Category[], index: number, delta: -1 | 1) {
    const ids = siblings.map((c) => c.id);
    const a = ids[index];
    const b = ids[index + delta];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[index + delta] = a;
    reorder.mutate(ids);
  }

  const row = (
    c: Category,
    siblings: Category[],
    index: number,
    child: boolean,
    divider: boolean,
  ) => (
    <CategoryRow
      key={c.id}
      category={c}
      uses={uses[c.id] ?? 0}
      child={child}
      divider={divider}
      sorting={sorting}
      canUp={index > 0}
      canDown={index < siblings.length - 1}
      onMove={(d) => move(siblings, index, d)}
      onOpen={() => setForm({ category: c })}
    />
  );

  const editing = form?.category;
  const editingHasChildren = !!editing && all.some((c) => c.parentId === editing.id);

  return (
    <View className="gap-6">
      {query.isSuccess && roots.length === 0 ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(Tags)}
            title="No categories"
            description="Add a category to organise your transactions."
            actionLabel="Add category"
            onAction={() => setForm({})}
          />
        </Card>
      ) : (
        <Card className="p-0 tablet:p-0">
          {roots.map((root, i) => {
            const kids = childrenOf(root.id);
            return (
              <View key={root.id}>
                {row(root, roots, i, false, i > 0)}
                {kids.map((k, j) => row(k, kids, j, true, true))}
              </View>
            );
          })}
        </Card>
      )}
      {roots.length > 1 ? (
        <View className="flex-row">
          <Button
            label={sorting ? "Done" : "Reorder"}
            variant="ghost"
            onPress={() => setSorting((s) => !s)}
          />
        </View>
      ) : null}
      <Text variant="small" tone="muted">
        Archived categories stay on past transactions but disappear from pickers. Reordering moves a
        category among its siblings.
      </Text>
      {form ? (
        <CategoryForm
          category={editing}
          defaultType={type}
          defaultParentId={form.parentId ?? null}
          typeLocked={!!editing && (editingHasChildren || (uses[editing.id] ?? 0) > 0)}
          onClose={() => setForm(null)}
        />
      ) : null}
    </View>
  );
}

export default function CategoriesScreen() {
  const { colors } = useTheme();
  const [type, setType] = useState<Category["type"]>("expense");
  const [form, setForm] = useState<FormState>(null);
  return (
    <Page
      title="Categories"
      subtitle="Two levels, per type"
      actions={
        <Button
          label="Add category"
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => setForm({})}
        />
      }
    >
      <Tabs items={kinds} value={type} onChange={setType} />
      <DataGate>
        <CategoriesContent type={type} form={form} setForm={setForm} />
      </DataGate>
    </Page>
  );
}
