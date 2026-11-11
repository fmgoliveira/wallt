import type { Category } from "@wallt/core";
import { Button, Input, Select, Sheet, Tabs, Text, toast, useTheme } from "@wallt/ui";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ColorPicker } from "../components/ColorPicker";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "../data/hooks";
import { useTranslation } from "../i18n";
import { categoryIcon, categoryIconNames } from "./icons";

/**
 * Create or edit a category or subcategory. Mount only while open (it owns its field state).
 * `typeLocked`: the category has transactions or subcategories, so its type cannot change (the repository enforces it too).
 */
export function CategoryForm({
  category,
  defaultType = "expense",
  defaultParentId = null,
  typeLocked = false,
  onClose,
}: {
  category?: Category | undefined;
  defaultType?: Category["type"];
  defaultParentId?: string | null;
  typeLocked?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const all = useCategories({ includeArchived: true });
  const editing = !!category;

  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState<Category["type"]>(category?.type ?? defaultType);
  const [parentId, setParentId] = useState<string | null>(category?.parentId ?? defaultParentId);
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);
  const [color, setColor] = useState<string | null>(category?.color ?? null);
  const [submitted, setSubmitted] = useState(false);

  const kinds = [
    { value: "expense", label: t("categories.expense") },
    { value: "income", label: t("categories.income") },
  ] as const;
  const list = all.data ?? [];
  const hasChildren = !!category && list.some((c) => c.parentId === category.id);
  // Only a top-level category without children of its own may become a subcategory (two levels).
  const parents = list.filter(
    (c) => c.parentId === null && c.type === type && c.id !== category?.id,
  );
  const canHaveParent = !hasChildren;
  const nameError = submitted && name.trim() === "" ? t("categories.form.nameRequired") : undefined;
  const busy = create.isPending || update.isPending;

  async function save() {
    setSubmitted(true);
    if (name.trim() === "") return;
    const values = {
      name: name.trim(),
      type,
      parentId: canHaveParent ? parentId : null,
      icon,
      color,
    };
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, patch: values });
        toast.success(t("categories.form.updated"));
      } else {
        await create.mutateAsync(values);
        toast.success(t("categories.form.added"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("categories.form.saveFailed"));
    }
  }

  async function toggleArchive() {
    if (!category) return;
    try {
      await update.mutateAsync({ id: category.id, patch: { archived: !category.archived } });
      toast.success(
        category.archived ? t("categories.form.restored") : t("categories.form.archivedToast"),
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("categories.form.updateFailed"));
    }
  }

  async function doDelete() {
    if (!category) return;
    try {
      await remove.mutateAsync(category.id);
      toast.success(t("categories.form.deleted"));
      onClose();
    } catch (error) {
      setConfirmDelete(false);
      toast.error(error instanceof Error ? error.message : t("categories.form.deleteFailed"));
    }
  }

  function changeType(next: Category["type"]) {
    setType(next);
    setParentId(null); // a parent must share the type
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={
        editing
          ? t("categories.form.titleEdit")
          : parentId
            ? t("categories.form.titleNewSub")
            : t("categories.form.titleNew")
      }
    >
      <Input
        label={t("categories.form.name")}
        value={name}
        onChangeText={setName}
        placeholder={t("categories.form.namePlaceholder")}
        error={nameError}
        autoFocus
      />
      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          {t("categories.form.type")}
        </Text>
        {typeLocked ? (
          <>
            <Text>{type === "expense" ? t("categories.expense") : t("categories.income")}</Text>
            <Text variant="small" tone="muted">
              {t("categories.form.typeLocked")}
            </Text>
          </>
        ) : (
          <Tabs items={kinds} value={type} onChange={changeType} />
        )}
      </View>
      {canHaveParent ? (
        <Select
          label={t("categories.form.parent")}
          options={[
            { value: "none", label: t("categories.form.parentNone") },
            ...parents.map((p) => ({ value: p.id, label: p.name })),
          ]}
          value={parentId ?? "none"}
          onChange={(v) => setParentId(v === "none" ? null : v)}
        />
      ) : null}
      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          {t("categories.form.icon")}
        </Text>
        <View className="flex-row flex-wrap" accessibilityRole="radiogroup">
          {categoryIconNames.map((n) => {
            const Icon = categoryIcon(n);
            const selected = icon === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={n}
                accessibilityState={{ checked: selected }}
                onPress={() => setIcon(n)}
                className="h-11 w-11 items-center justify-center web:cursor-pointer web:outline-none"
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: selected ? colors.elevated : undefined,
                    boxShadow: selected ? `0 0 0 1.5px ${colors.text}` : undefined,
                  }}
                >
                  <Icon size={18} color={selected ? colors.text : colors.muted} strokeWidth={1.6} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ColorPicker value={color} onChange={setColor} />
      <Button
        label={editing ? t("categories.form.saveChanges") : t("categories.form.add")}
        loading={busy}
        onPress={save}
      />
      {category ? (
        <>
          <Button
            label={category.archived ? t("categories.form.restore") : t("categories.form.archive")}
            variant="secondary"
            onPress={toggleArchive}
          />
          <Button
            label={t("categories.delete")}
            variant="ghost"
            onPress={() => setConfirmDelete(true)}
          />
        </>
      ) : null}
      <Button label={t("categories.cancel")} variant="ghost" onPress={onClose} />
      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("categories.form.deleteTitle")}
      >
        <Text tone="muted">{t("categories.form.deleteBody")}</Text>
        <Button
          label={t("categories.delete")}
          variant="destructive"
          loading={remove.isPending}
          onPress={doDelete}
        />
        <Button
          label={t("categories.cancel")}
          variant="ghost"
          onPress={() => setConfirmDelete(false)}
        />
      </Sheet>
    </Sheet>
  );
}
