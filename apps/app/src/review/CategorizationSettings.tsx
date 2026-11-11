import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Skeleton, Text, toast } from "@wallt/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { queryKeys, useRepoQuery } from "../data/hooks";
import { i18n, useTranslation } from "../i18n";
import { refreshCategoryModel, type SyncSession, useSyncUi } from "../sync/runtime";

/** How far back "auto-categorised" looks: recent behaviour matters more than the whole history. */
const WINDOW_DAYS = 90;

interface ModelInfo {
  version: number;
  createdAt: string;
  trainedOnCount: number;
  metrics: {
    accuracy: number;
    heldOut: number;
    autoCoverage: number;
    autoPrecision: number;
    classes: number;
    rejected?: string;
  };
}

/** `GET /ml/status` of the server (ADR 0009). */
interface MlStatus {
  active: ModelInfo | null;
  previous: ModelInfo | null;
  labelled: number;
  newSinceTraining: number;
  minExamples: number;
  retrainAfter: number;
}

async function call<T>(session: SyncSession, path: string, method: "GET" | "POST"): Promise<T> {
  const token = await session.getAccessToken();
  if (!token) throw new Error(i18n.t("review.settings.signedOut"));
  const res = await fetch(`${session.baseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(
      res.status === 409 ? i18n.t("review.settings.nothingToDo") : `HTTP ${res.status}`,
    );
  return (await res.json()) as T;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (iso: string) => iso.slice(0, 10);

const sinceDate = () => {
  const d = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text tone="muted">{label}</Text>
      <Text tabular weight="medium">
        {value}
      </Text>
    </View>
  );
}

/** Settings -> Categorisation (P6.5): how much Wallt categorises on its own, and how good its model is. */
export function CategorizationSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const session = useSyncUi((s) => s.session);
  const stats = useRepoQuery([...queryKeys.transactions, "categorization-stats"], (r) =>
    r.transactions.categorizationStats({ from: sinceDate() }),
  );
  const status = useQuery({
    queryKey: ["ml-status", session?.userId ?? null],
    enabled: session !== null,
    retry: false,
    queryFn: () => call<MlStatus>(session as SyncSession, "/ml/status", "GET"),
  });
  const [busy, setBusy] = useState<"train" | "rollback" | null>(null);

  async function act(kind: "train" | "rollback") {
    if (!session) return;
    setBusy(kind);
    try {
      const out = await call<{ status?: string; version?: number }>(session, `/ml/${kind}`, "POST");
      if (kind === "train" && out.status === "skipped") {
        toast.success(t("review.settings.notEnough"));
      } else if (kind === "train" && out.status === "rejected") {
        toast.success(t("review.settings.notBetter"));
      } else {
        toast.success(
          kind === "train" ? t("review.settings.retrained") : t("review.settings.rolledBack"),
        );
      }
      await client.invalidateQueries({ queryKey: ["ml-status"] });
      await refreshCategoryModel(session, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("review.settings.wentWrong"));
    } finally {
      setBusy(null);
    }
  }

  const s = stats.data;
  const auto = s ? s.methods.rule + s.methods.payee_memory + s.methods.ml : 0;
  const m = status.data?.active;

  return (
    <Card className="gap-4">
      <Text variant="title">{t("review.settings.title")}</Text>

      {stats.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : s && s.total > 0 ? (
        <View className="gap-1.5">
          <Row
            label={t("review.settings.autoLastDays", { days: WINDOW_DAYS })}
            value={pct(auto / s.total)}
          />
          <Row label={t("review.settings.byRules")} value={String(s.methods.rule)} />
          <Row label={t("review.settings.byPayees")} value={String(s.methods.payee_memory)} />
          <Row label={t("review.settings.byModel")} value={String(s.methods.ml)} />
          <Row label={t("review.settings.byYou")} value={String(s.methods.user)} />
          <Row label={t("review.settings.uncategorised")} value={String(s.methods.none)} />
        </View>
      ) : (
        <Text tone="muted">{t("review.settings.noTransactions", { days: WINDOW_DAYS })}</Text>
      )}
      {s && s.needsReview > 0 ? (
        <Button
          label={t("review.settings.waiting", { n: s.needsReview })}
          variant="secondary"
          onPress={() => router.push("/review")}
        />
      ) : null}

      <View className="gap-1.5">
        <Text variant="label" tone="muted">
          {t("review.settings.model")}
        </Text>
        {!session ? (
          <Text tone="muted">{t("review.settings.signInHint")}</Text>
        ) : status.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : status.isError || !status.data ? (
          <Text tone="muted">{t("review.settings.unreachable")}</Text>
        ) : m ? (
          <>
            <Row
              label={t("review.settings.version")}
              value={`v${m.version} · ${day(m.createdAt)}`}
            />
            <Row
              label={t("review.settings.accuracy", { n: m.metrics.heldOut })}
              value={pct(m.metrics.accuracy)}
            />
            <Row
              label={t("review.settings.confident")}
              value={t("review.settings.confidentValue", {
                coverage: pct(m.metrics.autoCoverage),
                precision: pct(m.metrics.autoPrecision),
              })}
            />
            <Row
              label={t("review.settings.learnedFrom")}
              value={t("review.settings.learnedFromValue", { n: m.trainedOnCount })}
            />
            <Text variant="small" tone="muted">
              {t("review.settings.newSince", {
                n: status.data.newSinceTraining,
                after: status.data.retrainAfter,
              })}
            </Text>
          </>
        ) : (
          <Text tone="muted">
            {t("review.settings.notTrained", {
              min: status.data.minExamples,
              have: status.data.labelled,
            })}
          </Text>
        )}
        {session && status.data ? (
          <View className="flex-row gap-2 pt-1">
            <Button
              label={t("review.settings.retrain")}
              variant="secondary"
              loading={busy === "train"}
              onPress={() => act("train")}
            />
            {status.data.previous ? (
              <Button
                label={t("review.settings.rollBack", { version: status.data.previous.version })}
                variant="ghost"
                loading={busy === "rollback"}
                onPress={() => act("rollback")}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
