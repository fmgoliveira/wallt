import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Skeleton, Text, toast } from "@wallt/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { queryKeys, useRepoQuery } from "../data/hooks";
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
  if (!token) throw new Error("Signed out");
  const res = await fetch(`${session.baseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok)
    throw new Error(res.status === 409 ? "Nothing to do right now" : `HTTP ${res.status}`);
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
        toast.success("Not enough categorised transactions to learn from yet");
      } else if (kind === "train" && out.status === "rejected") {
        toast.success("Trained, but the new model was not better. Keeping the current one.");
      } else {
        toast.success(kind === "train" ? "Model retrained" : "Rolled back to the previous model");
      }
      await client.invalidateQueries({ queryKey: ["ml-status"] });
      await refreshCategoryModel(session, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const s = stats.data;
  const auto = s ? s.methods.rule + s.methods.payee_memory + s.methods.ml : 0;
  const m = status.data?.active;

  return (
    <Card className="gap-4">
      <Text variant="title">Categorisation</Text>

      {stats.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : s && s.total > 0 ? (
        <View className="gap-1.5">
          <Row
            label={`Categorised automatically, last ${WINDOW_DAYS} days`}
            value={pct(auto / s.total)}
          />
          <Row label="By your rules" value={String(s.methods.rule)} />
          <Row label="By payees you categorised before" value={String(s.methods.payee_memory)} />
          <Row label="By the model" value={String(s.methods.ml)} />
          <Row label="By you" value={String(s.methods.user)} />
          <Row label="Uncategorised" value={String(s.methods.none)} />
        </View>
      ) : (
        <Text tone="muted">No transactions in the last {WINDOW_DAYS} days yet.</Text>
      )}
      {s && s.needsReview > 0 ? (
        <Button
          label={`${s.needsReview} waiting for review`}
          variant="secondary"
          onPress={() => router.push("/review")}
        />
      ) : null}

      <View className="gap-1.5">
        <Text variant="label" tone="muted">
          Model
        </Text>
        {!session ? (
          <Text tone="muted">
            Sign in to your server to train a model from your categorised transactions. Rules and
            payee memory work without it.
          </Text>
        ) : status.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : status.isError || !status.data ? (
          <Text tone="muted">Could not reach the server.</Text>
        ) : m ? (
          <>
            <Row label="Version" value={`v${m.version} · ${day(m.createdAt)}`} />
            <Row
              label={`Accuracy on ${m.metrics.heldOut} held-out transactions`}
              value={pct(m.metrics.accuracy)}
            />
            <Row
              label="Confident predictions (85% or more)"
              value={`${pct(m.metrics.autoCoverage)} of cases, ${pct(m.metrics.autoPrecision)} right`}
            />
            <Row label="Learned from" value={`${m.trainedOnCount} of your categorisations`} />
            <Text variant="small" tone="muted">
              {status.data.newSinceTraining} new since training. It retrains at night and after{" "}
              {status.data.retrainAfter} changes, and keeps the old model if a new one is worse.
            </Text>
          </>
        ) : (
          <Text tone="muted">
            Not trained yet. It needs at least {status.data.minExamples} transactions you have
            categorised yourself; you have {status.data.labelled}.
          </Text>
        )}
        {session && status.data ? (
          <View className="flex-row gap-2 pt-1">
            <Button
              label="Retrain now"
              variant="secondary"
              loading={busy === "train"}
              onPress={() => act("train")}
            />
            {status.data.previous ? (
              <Button
                label={`Roll back to v${status.data.previous.version}`}
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
