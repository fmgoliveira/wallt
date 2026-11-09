import type { PayeeAlias } from "@wallt/core";
import {
  Button,
  Card,
  EmptyState,
  IconTile,
  ListItem,
  Skeleton,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { ChevronRight, Plus, UserRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { usePayeeAliases } from "../data/hooks";
import { placeholderIcon } from "../shell/placeholder";
import { AliasForm } from "./AliasForm";
import { useApplyAliases } from "./data";

/**
 * Settings -> Payee names (PLAN §5/§6, P6.2): a pattern in the bank's text -> the clean payee name. Applied on
 * every import (first match wins, oldest first) and, on request, to existing transactions.
 */
export function AliasesManager() {
  const { colors } = useTheme();
  const aliases = usePayeeAliases();
  const apply = useApplyAliases();
  const [form, setForm] = useState<{ alias?: PayeeAlias } | null>(null);

  if (aliases.isPending) return <Skeleton className="h-40 w-full" />;
  const list = aliases.data ?? [];

  return (
    <View className="gap-6">
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(UserRound)}
            title="No payee names yet"
            description="Banks write the same shop in many ways. Teach Wallt that “PINGO DOCE LISBOA 4521” is just “Pingo Doce”, and every import will use the clean name."
            actionLabel="Add payee name"
            onAction={() => setForm({})}
          />
        </Card>
      ) : (
        <View className="gap-2">
          <Text variant="label" tone="muted">
            First match wins, oldest first
          </Text>
          <Card className="p-0 tablet:p-0">
            {list.map((a, i) => (
              <ListItem
                key={a.id}
                divider={i > 0}
                title={a.payee}
                subtitle={a.pattern}
                leading={
                  <IconTile>
                    <UserRound size={18} color={colors.muted} strokeWidth={1.6} />
                  </IconTile>
                }
                trailing={<ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />}
                onPress={() => setForm({ alias: a })}
              />
            ))}
          </Card>
        </View>
      )}
      <View className="gap-3">
        <Button
          label="Add payee name"
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => setForm({})}
        />
        {list.length > 0 ? (
          <Button
            label="Apply to existing transactions"
            variant="ghost"
            loading={apply.isPending}
            onPress={async () => {
              try {
                const n = await apply.mutateAsync(undefined);
                toast.success(`Renamed ${n} transaction${n === 1 ? "" : "s"}`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Something went wrong");
              }
            }}
          />
        ) : null}
      </View>
      <Text variant="small" tone="muted">
        Imports also strip card numbers, dates and long reference numbers from descriptions before
        any of this runs. Rules then see the clean payee.
      </Text>
      {form ? <AliasForm alias={form.alias} onClose={() => setForm(null)} /> : null}
    </View>
  );
}
