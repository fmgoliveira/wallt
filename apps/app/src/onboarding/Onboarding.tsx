import { Button, Card, IconTile, Text, useTheme } from "@wallt/ui";
import { useRouter } from "expo-router";
import { Check, PiggyBank, Upload, Wallet } from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useAccounts, useTransactionCount } from "../data/hooks";
import { useTranslation } from "../i18n";
import { kvGet, kvSet } from "../security/kv";
import { useEditorStore } from "../transactions/editorStore";
import { onboardingSteps } from "./steps";

const KEY = "wallt.onboarding.dismissed";

function Step({
  n,
  total,
  done,
  icon,
  title,
  description,
  children,
}: {
  n: number;
  total: number;
  done: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-start gap-3"
      accessible
      accessibilityLabel={`${t("onboarding.stepCount", { n, total })}: ${title}${done ? `, ${t("onboarding.done")}` : ""}`}
    >
      <IconTile>
        {done ? <Check size={18} color={colors.positive} strokeWidth={1.8} /> : icon}
      </IconTile>
      <View className="flex-1 gap-2">
        <View className="gap-0.5">
          <Text weight="medium" tone={done ? "muted" : "default"}>
            {title}
          </Text>
          <Text variant="small" tone="muted">
            {description}
          </Text>
        </View>
        {done ? null : children}
      </View>
    </View>
  );
}

/**
 * First-run guide on the dashboard (plan §10 P7.1): create an account, then bring in transactions by import or by
 * hand. Disappears by itself once both are done, and can be skipped for good.
 */
export function Onboarding() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const accounts = useAccounts();
  const txCount = useTransactionCount();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    void kvGet(KEY).then((v) => setDismissed(v === "1"));
  }, []);

  if (dismissed !== false || accounts.isPending || txCount.isPending) return null;
  const steps = onboardingSteps({
    accounts: accounts.data?.length ?? 0,
    transactions: txCount.data ?? 0,
  });
  if (steps.finished) return null;

  const skip = () => {
    setDismissed(true);
    void kvSet(KEY, "1");
  };

  return (
    <Card className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text variant="title" accessibilityRole="header">
            {t("onboarding.title")}
          </Text>
          <Text variant="small" tone="muted">
            {t("onboarding.subtitle")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.skipLabel")}
          onPress={skip}
          hitSlop={8}
          className="min-h-touch justify-center px-1 web:cursor-pointer web:outline-none web:hover:opacity-70"
        >
          <Text variant="small" weight="medium" tone="muted">
            {t("onboarding.skip")}
          </Text>
        </Pressable>
      </View>

      <Step
        n={1}
        total={2}
        done={steps.hasAccount}
        icon={<Wallet size={18} color={colors.muted} strokeWidth={1.6} />}
        title={t("onboarding.account.title")}
        description={t("onboarding.account.description")}
      >
        <Button
          label={t("onboarding.account.action")}
          onPress={() => router.push("/accounts?add=1")}
          className="self-start"
        />
      </Step>

      <Step
        n={2}
        total={2}
        done={steps.hasTransactions}
        icon={<Upload size={18} color={colors.muted} strokeWidth={1.6} />}
        title={t("onboarding.transactions.title")}
        description={
          steps.hasAccount
            ? t("onboarding.transactions.description")
            : t("onboarding.transactions.needAccount")
        }
      >
        {steps.hasAccount ? (
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={t("onboarding.transactions.import")}
              onPress={() => router.push("/import")}
            />
            <Button
              label={t("onboarding.transactions.add")}
              variant="secondary"
              onPress={() => useEditorStore.getState().openNew()}
            />
          </View>
        ) : null}
      </Step>

      <Step
        n={3}
        total={3}
        done={false}
        icon={<PiggyBank size={18} color={colors.muted} strokeWidth={1.6} />}
        title={t("onboarding.optional.title")}
        description={t("onboarding.optional.description")}
      >
        <Button
          label={t("onboarding.optional.action")}
          variant="ghost"
          onPress={() => router.push("/budgets")}
          className="self-start"
        />
      </Step>
    </Card>
  );
}
