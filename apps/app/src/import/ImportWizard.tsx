import { useQueryClient } from "@tanstack/react-query";
import type { ImportProfile } from "@wallt/core";
import {
  type Analysis,
  analyzeFile,
  checkBalance,
  columnChoices,
  type ImportMapping,
  type ImportPlan,
  isProfileConfig,
  matchProfile,
  type ParsedRow,
  type ProfileConfig,
  parseRows,
  tableFingerprint,
  uniqueName,
} from "@wallt/ingest";
import {
  Amount,
  Button,
  Card,
  Chip,
  EmptyState,
  IconTile,
  Input,
  ListItem,
  Select,
  Skeleton,
  Switch,
  Text,
  toast,
  useBreakpoint,
  useTheme,
} from "@wallt/ui";
import { useRouter } from "expo-router";
import { ArrowLeftRight, FileSpreadsheet } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import {
  useAccounts,
  useCreateImportProfile,
  useImportProfiles,
  useUpdateImportProfile,
} from "../data/hooks";
import { useRepository } from "../data/RepositoryProvider";
import { useTranslation } from "../i18n";
import { analysisNoteT, parseErrorT } from "../i18n/packages";
import { notifyLocalWrite } from "../sync/runtime";
import { applyPlan, type ImportOutcome, planForAccount } from "./apply";
import { DropZone } from "./DropZone";
import type { PickedFile } from "./files";
import { MappingEditor } from "./MappingEditor";

export interface ImportWizardProps {
  /** `import` writes transactions; `setup` only creates/updates a format (nothing is written to transactions). */
  mode: "import" | "setup";
  /** Re-test / edit an existing format against a new sample. */
  profile?: ImportProfile | undefined;
  onSaved?: () => void;
}

const PREVIEW_ROWS = 20;
const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * Upload -> auto-detect -> confirm/correct -> import (PLAN 5.1) and, in `setup` mode, the format wizard of 5.2.
 * Detection and parsing are the pure `@wallt/ingest` functions; this component only wires them to the screen and
 * the repository.
 */
export function ImportWizard({ mode, profile, onSaved }: ImportWizardProps) {
  const bp = useBreakpoint();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const describe = (a: Analysis): string[] => {
    if (a.kind === "statement")
      return [a.format === "ofx" ? t("importing.wizard.ofx") : t("importing.wizard.camt")];
    const tb = a.table;
    const out: string[] = [
      tb.kind === "spreadsheet"
        ? t("importing.wizard.spreadsheet")
        : t("importing.wizard.textFile"),
    ];
    if (tb.sheet && (tb.sheets?.length ?? 0) > 1)
      out.push(t("importing.wizard.sheetNamed", { name: tb.sheet }));
    if (tb.encoding) out.push(tb.encoding.toUpperCase());
    if (tb.delimiter)
      out.push(
        tb.delimiter === "\t"
          ? t("importing.wizard.tabSeparated")
          : t("importing.wizard.delimiterSeparated", { delimiter: tb.delimiter }),
      );
    return out;
  };
  const repo = useRepository();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const profiles = useImportProfiles();
  const createProfile = useCreateImportProfile();
  const updateProfile = useUpdateImportProfile();

  const [file, setFile] = useState<PickedFile | null>(null);
  const [accountId, setAccountId] = useState<string | null>(profile?.defaultAccountId ?? null);
  const [override, setOverride] = useState<ImportMapping | null>(null);
  const [showMapping, setShowMapping] = useState(mode === "setup");
  const [fileAccount, setFileAccount] = useState(0);
  const [sheet, setSheet] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [undone, setUndone] = useState(false);

  const account = accounts.data?.find((a) => a.id === accountId);
  const currency = account?.currency ?? "EUR";

  /* ------------------------------------------------------------ detection */

  const first = useMemo(
    () => (file ? analyzeFile(file.bytes, { currency, ...(sheet ? { sheet } : {}) }) : null),
    [file, currency, sheet],
  );
  const fp = useMemo(
    () => (first?.kind === "table" ? tableFingerprint(first.table, first.mapping.headerRow) : null),
    [first],
  );
  const matched = useMemo(() => {
    if (profile) return profile;
    return fp ? matchProfile(profiles.data ?? [], fp) : undefined;
  }, [profile, profiles.data, fp]);
  const matchedConfig =
    matched && isProfileConfig(matched.config) ? (matched.config as ProfileConfig) : null;

  // a saved format may pin the encoding / delimiter / sheet: re-read the file the way it says
  const analysis = useMemo(() => {
    if (!file || !first) return null;
    const pin = matchedConfig;
    if (first.kind === "table" && pin && (pin.encoding || pin.delimiter || pin.sheet)) {
      return analyzeFile(file.bytes, {
        currency,
        ...(pin.encoding ? { encoding: pin.encoding } : {}),
        ...(pin.delimiter ? { delimiter: pin.delimiter } : {}),
        ...((sheet ?? pin.sheet) ? { sheet: (sheet ?? pin.sheet) as string } : {}),
      });
    }
    return first;
  }, [file, first, matchedConfig, currency, sheet]);

  const mapping: ImportMapping | null =
    analysis?.kind === "table" ? (override ?? matchedConfig?.mapping ?? analysis.mapping) : null;

  const parsed = useMemo(() => {
    if (!analysis) return null;
    if (analysis.kind === "statement") {
      const a = analysis.accounts[fileAccount] ?? analysis.accounts[0];
      return { rows: a?.rows ?? [], errors: [], skipped: 0 };
    }
    return mapping ? parseRows(analysis.table.rows, mapping, currency) : null;
  }, [analysis, mapping, currency, fileAccount]);

  const rows: ParsedRow[] = parsed?.rows ?? [];
  const baseMapping =
    matchedConfig?.mapping ?? (analysis?.kind === "table" ? analysis.mapping : null);
  const mappingChanged = !!override && JSON.stringify(override) !== JSON.stringify(baseMapping);

  // sensible defaults once a file is loaded
  useEffect(() => {
    if (!file) return;
    setName((n) => n || matched?.name || baseName(file.name));
    if (!accountId) {
      if (matched?.defaultAccountId) setAccountId(matched.defaultAccountId);
      else if (accounts.data?.length === 1) setAccountId(accounts.data[0]?.id ?? null);
    }
  }, [file, matched, accounts.data, accountId]);

  useEffect(() => {
    if (analysis?.kind === "table" && !matched && analysis.confidence < 0.8) setShowMapping(true);
  }, [analysis, matched]);

  /* ---------------------------------------------------------------- plan */

  const statementCurrency = rows[0]?.currency;
  const currencyClash =
    mode === "import" &&
    analysis?.kind === "statement" &&
    account &&
    statementCurrency &&
    statementCurrency !== account.currency
      ? t("importing.wizard.currencyClash", {
          file: statementCurrency,
          account: account.name,
          currency: account.currency,
        })
      : null;

  useEffect(() => {
    if (mode !== "import" || !accountId || rows.length === 0 || currencyClash) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    setPlanning(true);
    planForAccount(repo, accountId, currency, rows)
      .then((p) => !cancelled && setPlan(p))
      .catch(() => !cancelled && setPlan(null))
      .finally(() => !cancelled && setPlanning(false));
    return () => {
      cancelled = true;
    };
  }, [mode, repo, accountId, currency, rows, currencyClash]);

  /* ------------------------------------------------------------- derived */

  const stats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const r of rows) {
      if (r.amount > 0) inflow += r.amount;
      else outflow += r.amount;
    }
    const dates = rows.map((r) => r.bookingDate).sort();
    const balance =
      analysis?.kind === "table" && mapping?.columns.balance !== undefined
        ? checkBalance(
            rows.map((r) => r.amount),
            rows.map((r) => r.balance),
          )
        : null;
    return { inflow, outflow, from: dates[0], to: dates.at(-1), balance };
  }, [rows, analysis, mapping]);

  const ready = rows.length > 0 && (mode === "setup" || (!!accountId && !currencyClash));

  /* -------------------------------------------------------------- actions */

  const reset = () => {
    setFile(null);
    setOverride(null);
    setPlan(null);
    setOutcome(null);
    setUndone(false);
    setName("");
    setFileAccount(0);
    setSheet(null);
  };

  const configNow = (): ProfileConfig | null =>
    analysis?.kind === "table" && mapping
      ? {
          version: 1,
          mapping,
          ...(analysis.table.kind === "delimited" && analysis.table.encoding
            ? { encoding: analysis.table.encoding }
            : {}),
          ...(analysis.table.delimiter ? { delimiter: analysis.table.delimiter } : {}),
          ...(analysis.table.sheet && (analysis.table.sheets?.length ?? 0) > 1
            ? { sheet: analysis.table.sheet }
            : {}),
        }
      : null;

  async function saveFormat(): Promise<boolean> {
    const config = configNow();
    if (!config || !fp) return false;
    try {
      if (matched) {
        const fingerprints = matched.fingerprints.includes(fp)
          ? matched.fingerprints
          : [...matched.fingerprints, fp];
        await updateProfile.mutateAsync({
          id: matched.id,
          patch: {
            config: config as unknown as Record<string, unknown>,
            fingerprints,
            ...(accountId && !matched.defaultAccountId ? { defaultAccountId: accountId } : {}),
          },
        });
      } else {
        await createProfile.mutateAsync({
          name: uniqueName(
            name.trim() || baseName(file?.name ?? t("importing.wizard.defaultFormatName")),
            (profiles.data ?? []).map((p) => p.name),
          ),
          fingerprints: [fp],
          config: config as unknown as Record<string, unknown>,
          defaultAccountId: accountId,
        });
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("importing.wizard.saveFailed"));
      return false;
    }
  }

  async function runImport() {
    if (!plan || !accountId) return;
    setBusy(true);
    try {
      const result = await applyPlan(repo, plan, currency);
      notifyLocalWrite();
      await queryClient.invalidateQueries();
      if (analysis?.kind === "table" && ((!matched && remember) || (matched && mappingChanged))) {
        await saveFormat();
      }
      setOutcome(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("importing.wizard.importFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!outcome) return;
    setBusy(true);
    try {
      const n = await repo.transactions.deleteImportBatch(outcome.batchId);
      notifyLocalWrite();
      await queryClient.invalidateQueries();
      setUndone(true);
      toast.success(t("importing.wizard.removed", { count: n }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("importing.wizard.undoFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSetup() {
    if (await saveFormat()) {
      toast.success(
        matched ? t("importing.wizard.formatUpdated") : t("importing.wizard.formatSaved"),
      );
      onSaved?.();
    }
  }

  /* ------------------------------------------------------------------ UI */

  if (!file) {
    return (
      <View className="gap-4">
        <DropZone
          onFile={(f) => {
            setFile(f);
            setOverride(null);
          }}
          onError={(m) => toast.error(m)}
        />
        {mode === "import" ? (
          <Button
            label={t("importing.wizard.manageFormats")}
            variant="ghost"
            onPress={() => router.push("/import-formats")}
          />
        ) : null}
      </View>
    );
  }

  if (outcome) {
    return (
      <Card className="gap-4">
        <EmptyState
          icon={<FileSpreadsheet size={20} color={colors.positive} strokeWidth={1.6} />}
          title={undone ? t("importing.outcome.undone") : t("importing.outcome.complete")}
          description={
            undone
              ? t("importing.outcome.undoneDescription")
              : [
                  t("importing.outcome.new", { count: outcome.inserted }),
                  t("importing.outcome.duplicates", { count: outcome.duplicates }),
                  t("importing.outcome.review", { count: outcome.needsReview }),
                  ...(outcome.linkedTransfers
                    ? [t("importing.outcome.linked", { count: outcome.linkedTransfers })]
                    : []),
                  ...(outcome.updatedPending
                    ? [t("importing.outcome.pending", { count: outcome.updatedPending })]
                    : []),
                ].join(" · ")
          }
        />
        <View className="flex-row flex-wrap justify-center gap-2">
          {undone ? null : (
            <Button
              label={t("importing.outcome.undo")}
              variant="secondary"
              loading={busy}
              onPress={undo}
            />
          )}
          <Button label={t("importing.outcome.another")} variant="secondary" onPress={reset} />
          <Button
            label={t("importing.outcome.view")}
            onPress={() => router.push("/transactions")}
          />
        </View>
      </Card>
    );
  }

  const columns =
    analysis?.kind === "table" && mapping
      ? columnChoices(analysis.table.rows, mapping.headerRow)
      : [];
  const sheetOptions =
    analysis?.kind === "table" && (analysis.table.sheets?.length ?? 0) > 1
      ? analysis.table.sheets?.map((s) => ({ value: s, label: s }))
      : null;

  const left = (
    <View className="gap-4 desktop:flex-[5]">
      <Card className="gap-3">
        <View className="flex-row items-center gap-3">
          <IconTile>
            <FileSpreadsheet size={18} color={colors.muted} strokeWidth={1.6} />
          </IconTile>
          <View className="flex-1">
            <Text weight="medium" numberOfLines={1}>
              {file.name}
            </Text>
            <Text variant="small" tone="muted">
              {analysis ? describe(analysis).join(" · ") : t("importing.wizard.reading")}
            </Text>
          </View>
          <Button label={t("importing.wizard.change")} variant="ghost" onPress={reset} />
        </View>
        {analysis?.kind === "statement" && analysis.accounts.length > 1 ? (
          <Select
            label={t("importing.wizard.fileAccount")}
            options={analysis.accounts.map((a, i) => ({
              value: String(i),
              label: `${a.iban ?? a.accountId ?? t("importing.wizard.fileAccountFallback", { n: i + 1 })} · ${a.currency}`,
            }))}
            value={String(fileAccount)}
            onChange={(v) => setFileAccount(Number(v))}
          />
        ) : null}
        {sheetOptions && analysis?.kind === "table" ? (
          <Select
            label={t("importing.wizard.sheet")}
            options={sheetOptions}
            value={analysis.table.sheet ?? null}
            onChange={(next) => {
              setSheet(next);
              setOverride(null);
            }}
          />
        ) : null}
      </Card>

      {mode === "import" ? (
        <Card className="gap-3">
          <Select
            label={t("importing.wizard.importInto")}
            placeholder={t("importing.wizard.chooseAccount")}
            options={(accounts.data ?? []).map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.currency}`,
            }))}
            value={accountId}
            onChange={setAccountId}
            error={currencyClash ?? undefined}
          />
          {(accounts.data ?? []).length === 0 ? (
            <Text variant="small" tone="muted">
              {t("importing.wizard.createAccountFirst")}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {analysis?.kind === "table" ? (
        <Card className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Text variant="title">{t("importing.wizard.format")}</Text>
              <Text variant="small" tone="muted">
                {matched
                  ? t("importing.wizard.usingFormat", { name: matched.name })
                  : analysis.confidence >= 0.8
                    ? t("importing.wizard.newDetected")
                    : t("importing.wizard.newCheck")}
              </Text>
            </View>
            <Chip
              tone={analysis.confidence >= 0.8 || matched ? "positive" : "warning"}
              label={
                matched
                  ? t("importing.wizard.savedFormat")
                  : t("importing.wizard.sure", { percent: Math.round(analysis.confidence * 100) })
              }
            />
          </View>
          {analysis.notes.length > 0 && !matched ? (
            <View className="gap-0.5">
              {analysis.noteCodes.map((code) => (
                <Text key={code} variant="small" tone="warning">
                  {analysisNoteT(t, code)}
                </Text>
              ))}
            </View>
          ) : null}
          <Button
            label={
              showMapping ? t("importing.wizard.hideColumns") : t("importing.wizard.adjustColumns")
            }
            variant="secondary"
            onPress={() => setShowMapping((v) => !v)}
          />
          {showMapping && mapping ? (
            <MappingEditor
              mapping={mapping}
              onChange={setOverride}
              columns={columns}
              headerCandidates={Math.min(10, analysis.table.rows.length)}
            />
          ) : null}
        </Card>
      ) : null}
    </View>
  );

  const failed = parsed?.errors ?? [];
  const right = (
    <View className="gap-4 desktop:flex-[7]">
      <Card className="gap-3">
        <Text variant="title">{t("importing.wizard.check")}</Text>
        {!parsed ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                tone={rows.length > 0 ? "positive" : "negative"}
                label={t("importing.wizard.rowsRead", { count: rows.length })}
              />
              {failed.length > 0 ? (
                <Chip
                  tone="negative"
                  label={t("importing.wizard.failed", { count: failed.length })}
                />
              ) : null}
              {parsed.skipped > 0 ? (
                <Chip label={t("importing.wizard.ignored", { count: parsed.skipped })} />
              ) : null}
              {stats.balance && stats.balance.pairs > 0 ? (
                <Chip
                  tone={stats.balance.matchRatio >= 0.8 ? "positive" : "warning"}
                  label={
                    stats.balance.matchRatio >= 0.8
                      ? t("importing.wizard.reconciles")
                      : t("importing.wizard.notReconciles")
                  }
                />
              ) : null}
            </View>
            {rows.length > 0 ? (
              <View className="gap-1">
                <Text variant="small" tone="muted">
                  {stats.from} → {stats.to}
                </Text>
                <View className="flex-row gap-6">
                  <View>
                    <Text variant="small" tone="muted">
                      {t("importing.wizard.in")}
                    </Text>
                    <Amount value={stats.inflow} currency={currency} />
                  </View>
                  <View>
                    <Text variant="small" tone="muted">
                      {t("importing.wizard.out")}
                    </Text>
                    <Amount value={stats.outflow} currency={currency} tone="text" />
                  </View>
                </View>
              </View>
            ) : (
              <Text tone="muted">{t("importing.wizard.noTransactions")}</Text>
            )}
            {failed.length > 0 && analysis?.kind === "table" ? (
              <View
                className="gap-1 rounded-md p-3"
                style={{ backgroundColor: `${colors.negative}14` }}
              >
                {failed.slice(0, 5).map((e) => (
                  <Text key={e.rowIndex} variant="small" tone="negative" numberOfLines={1}>
                    {t("importing.wizard.rowError", {
                      n: e.rowIndex + 1,
                      reason: parseErrorT(t, e),
                      cells: (analysis.table.rows[e.rowIndex] ?? []).join(" · "),
                    })}
                  </Text>
                ))}
                {failed.length > 5 ? (
                  <Text variant="small" tone="muted">
                    {t("importing.wizard.andMore", { count: failed.length - 5 })}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </Card>

      {rows.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <View className="px-4 pt-4 pb-2">
            <Text variant="title">{t("importing.wizard.preview")}</Text>
            <Text variant="small" tone="muted">
              {t("importing.wizard.previewCount", {
                shown: Math.min(PREVIEW_ROWS, rows.length),
                total: rows.length,
              })}
            </Text>
          </View>
          {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
            <ListItem
              key={r.rowIndex}
              divider={i > 0}
              title={r.payee ?? r.description ?? ""}
              subtitle={`${r.bookingDate}${r.payee && r.description ? ` · ${r.description}` : ""}`}
              trailing={<Amount value={r.amount} currency={r.currency} />}
            />
          ))}
        </Card>
      ) : null}

      {mode === "import" ? (
        <Card className="gap-3">
          <Text variant="title">{t("importing.wizard.import")}</Text>
          {planning && !plan ? (
            <Skeleton className="h-10 w-full" />
          ) : plan ? (
            <>
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  tone="positive"
                  label={t("importing.wizard.planNew", { count: plan.summary.inserted })}
                />
                {plan.summary.duplicates > 0 ? (
                  <Chip
                    label={t("importing.wizard.planDuplicates", { count: plan.summary.duplicates })}
                  />
                ) : null}
                {plan.summary.updatedPending > 0 ? (
                  <Chip
                    label={t("importing.wizard.planPending", {
                      count: plan.summary.updatedPending,
                    })}
                  />
                ) : null}
                {plan.summary.needsReview > 0 ? (
                  <Chip
                    tone="warning"
                    label={t("importing.wizard.planReview", { count: plan.summary.needsReview })}
                  />
                ) : null}
              </View>
              {plan.transfers.length > 0 ? (
                <View className="flex-row items-center gap-2">
                  <ArrowLeftRight size={14} color={colors.muted} strokeWidth={1.6} />
                  <Text variant="small" tone="muted" className="flex-1">
                    {plan.transfers.some((x) => !x.auto)
                      ? t("importing.wizard.transfersMore", {
                          count: plan.transfers.filter((x) => x.auto).length,
                          more: plan.transfers.filter((x) => !x.auto).length,
                        })
                      : t("importing.wizard.transfers", {
                          count: plan.transfers.filter((x) => x.auto).length,
                        })}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text tone="muted">
              {accountId
                ? t("importing.wizard.nothingYet")
                : t("importing.wizard.chooseAccountToImport")}
            </Text>
          )}
          {analysis?.kind === "table" && !matched ? (
            <View className="gap-3">
              <Switch
                label={t("importing.wizard.remember")}
                description={t("importing.wizard.rememberHint")}
                value={remember}
                onValueChange={setRemember}
              />
              {remember ? (
                <Input
                  label={t("importing.wizard.formatName")}
                  value={name}
                  onChangeText={setName}
                  placeholder={t("importing.wizard.formatNamePlaceholder")}
                />
              ) : null}
            </View>
          ) : null}
          {matched && mappingChanged ? (
            <Text variant="small" tone="muted">
              {t("importing.wizard.willUpdate", { name: matched.name })}
            </Text>
          ) : null}
          <Button
            label={
              plan
                ? t("importing.wizard.importCount", {
                    count: plan.summary.inserted + plan.summary.updatedPending,
                  })
                : t("importing.wizard.import")
            }
            loading={busy}
            disabled={!ready || !plan || plan.summary.inserted + plan.summary.updatedPending === 0}
            onPress={runImport}
          />
          {plan &&
          plan.summary.inserted + plan.summary.updatedPending === 0 &&
          plan.summary.total > 0 ? (
            <Text variant="small" tone="muted">
              {t("importing.wizard.alreadyThere", { account: account?.name ?? "" })}
            </Text>
          ) : null}
        </Card>
      ) : analysis?.kind === "table" ? (
        <Card className="gap-3">
          <Text variant="title">
            {matched ? t("importing.wizard.updateFormat") : t("importing.wizard.saveFormat")}
          </Text>
          <Text variant="small" tone="muted">
            {t("importing.wizard.setupNote")}
            {matched && fp && !matched.fingerprints.includes(fp)
              ? ` ${t("importing.wizard.layoutDiffers")}`
              : ""}
          </Text>
          {!matched ? (
            <Input
              label={t("importing.wizard.formatName")}
              value={name}
              onChangeText={setName}
              placeholder={t("importing.wizard.formatNamePlaceholder")}
            />
          ) : null}
          <Button
            label={matched ? t("importing.wizard.saveChanges") : t("importing.wizard.saveFormat")}
            loading={createProfile.isPending || updateProfile.isPending}
            disabled={rows.length === 0 || (!matched && name.trim() === "")}
            onPress={saveSetup}
          />
        </Card>
      ) : (
        <Card>
          <Text tone="muted">{t("importing.wizard.fixedLayout")}</Text>
        </Card>
      )}
    </View>
  );

  return (
    <View className={bp === "desktop" ? "flex-row items-start gap-4" : "gap-4"}>
      {left}
      {right}
    </View>
  );
}
