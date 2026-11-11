import type { Category } from "@wallt/core";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconTile,
  ListItem,
  SortableList,
  Tabs,
  Text,
  useTheme,
} from "@wallt/ui";
import { ChevronRight, Plus, Tags } from "lucide-react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { View } from "react-native";
import { CategoryForm } from "../../src/categories/CategoryForm";
import { categoryTint } from "../../src/categories/color";
import { categoryIcon } from "../../src/categories/icons";
import { ListHeader } from "../../src/components/ReorderToggle";
import { DataGate } from "../../src/data/DataGate";
import { useCategories, useCategoryUsage, useReorderCategories } from "../../src/data/hooks";
import { useTranslation } from "../../src/i18n";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

type FormState = { category?: Category; parentId?: string | null } | null;

function CategoryRow({
  category,
  tint,
  uses,
  child,
  divider,
  handle,
  onOpen,
}: {
  category: Category;
  tint: string;
  uses: number;
  child: boolean;
  divider: boolean;
  /** Drag grip while reordering, otherwise null. */
  handle: ReactNode;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const Icon = categoryIcon(category.icon);
  return (
    <View className={child ? "pl-6" : undefined} style={{ opacity: category.archived ? 0.6 : 1 }}>
      <ListItem
        divider={divider}
        title={category.name}
        subtitle={uses > 0 ? t("categories.screen.uses", { count: uses }) : undefined}
        leading={
          <IconTile>
            <Icon size={18} color={tint} strokeWidth={1.6} />
          </IconTile>
        }
        trailing={
          handle ?? (
            <View className="flex-row items-center gap-2">
              {category.archived ? <Chip label={t("categories.archived")} /> : null}
              <ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />
            </View>
          )
        }
        onPress={handle ? undefined : onOpen}
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
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const query = useCategories({ includeArchived: true });
  const usage = useCategoryUsage();
  const reorder = useReorderCategories();
  const [sorting, setSorting] = useState(false);

  const all = (query.data ?? []).filter((c) => c.type === type);
  const roots = all.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => all.filter((c) => c.parentId === id);
  const uses = usage.data ?? {};

  const row = (c: Category, child: boolean, divider: boolean, handle: ReactNode) => (
    <CategoryRow
      category={c}
      tint={categoryTint(c, query.data ?? [], scheme)}
      uses={uses[c.id] ?? 0}
      child={child}
      divider={divider}
      handle={handle}
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
            title={t("categories.screen.emptyTitle")}
            description={t("categories.screen.emptyDesc")}
            actionLabel={t("categories.screen.add")}
            onAction={() => setForm({})}
          />
        </Card>
      ) : (
        <View className="gap-2">
          <ListHeader
            title={t("categories.screen.title")}
            sorting={sorting}
            canReorder={roots.length > 1}
            onToggle={() => setSorting((v) => !v)}
          />
          <Card className="p-0 tablet:p-0">
            <SortableList
              items={roots}
              getId={(r) => r.id}
              enabled={sorting}
              onReorder={(ids) => reorder.mutate(ids)}
              renderItem={(root, { handle, index }) => {
                const kids = childrenOf(root.id);
                return (
                  <View>
                    {row(root, false, index > 0, handle)}
                    <SortableList
                      items={kids}
                      getId={(k) => k.id}
                      enabled={sorting}
                      onReorder={(ids) => reorder.mutate(ids)}
                      renderItem={(k, kid) => row(k, true, true, kid.handle)}
                    />
                  </View>
                );
              }}
            />
          </Card>
        </View>
      )}
      <Text variant="small" tone="muted">
        {t("categories.screen.note")}
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
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [type, setType] = useState<Category["type"]>("expense");
  const [form, setForm] = useState<FormState>(null);
  const kinds = [
    { value: "expense", label: t("categories.screen.expenses") },
    { value: "income", label: t("categories.screen.income") },
  ] as const;
  return (
    <Page
      title={t("categories.screen.title")}
      subtitle={t("categories.screen.subtitle")}
      actions={
        <Button
          label={t("categories.screen.add")}
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
