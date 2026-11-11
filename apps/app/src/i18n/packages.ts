import type { ConditionErrorCode } from "@wallt/categorize";
import {
  type AppNotification,
  describeRRuleParts,
  type NotificationText,
  type RecurrencePreset,
} from "@wallt/core";
import type { AnalysisNoteCode, ParseError, ProfileImportError } from "@wallt/ingest";
import {
  describeSyncParts,
  type SyncState,
  type SyncStatusParts,
  type TimeAgoParts,
} from "@wallt/sync";
import type { TFunction } from "i18next";

/** Keys built from codes cannot be checked statically; the code unions are exhaustive against the catalogue by tests. */
type LooseT = (key: string, options?: object) => string;
const loose = (t: TFunction) => t as unknown as LooseT;

/**
 * Packages stay free of UI language: they return codes (and an English fallback). These helpers turn the codes
 * into the user's language. A code the app does not know falls back to the package's English text.
 */

export function describeRRuleT(t: TFunction, rrule: string): string | null {
  const spec = describeRRuleParts(rrule);
  if (!spec) return null;
  const unit = { DAILY: "Day", WEEKLY: "Week", MONTHLY: "Month", YEARLY: "Year" }[spec.freq];
  let text = loose(t)(`shared.recurrence.every${unit}`, { count: spec.interval });
  if (spec.freq === "WEEKLY" && spec.byDay.length > 0) {
    const days = spec.byDay.map((d) =>
      t(`shared.recurrence.days.${d as 0 | 1 | 2 | 3 | 4 | 5 | 6}`),
    );
    text += ` ${t("shared.recurrence.onDays", { days: days.join(", ") })}`;
  }
  if (spec.freq === "MONTHLY") {
    if (spec.byMonthDay === -1) text += ` ${t("shared.recurrence.onLastDay")}`;
    else if (spec.byMonthDay !== null)
      text += ` ${t("shared.recurrence.onDayOfMonth", { count: spec.byMonthDay, ordinal: true })}`;
  }
  return spec.until ? `${text} ${t("shared.recurrence.until", { date: spec.until })}` : text;
}

export function presetLabelT(t: TFunction, preset: RecurrencePreset): string {
  return t(`shared.recurrence.presets.${preset}`);
}

export function conditionErrorT(t: TFunction, code: ConditionErrorCode): string {
  return t(`shared.conditionErrors.${code}`);
}

function agoT(t: TFunction, ago: TimeAgoParts): string {
  return ago.unit === "now"
    ? t("shared.syncStatus.ago.now")
    : t(`shared.syncStatus.ago.${ago.unit}`, { n: ago.n });
}

/** Translated label and tone of the sync indicator. */
export function describeSyncT(
  t: TFunction,
  state: SyncState | null,
  now: number,
): { label: string; tone: SyncStatusParts["tone"] } {
  const p = describeSyncParts(state, now);
  const queued = p.pending > 0 ? ` · ${t("shared.syncStatus.waiting", { count: p.pending })}` : "";
  switch (p.kind) {
    case "local":
      return { label: t("shared.syncStatus.local"), tone: p.tone };
    case "syncing":
      return { label: `${t("shared.syncStatus.syncing")}${queued}`, tone: p.tone };
    case "refused":
      return { label: t("shared.syncStatus.refused", { count: p.count }), tone: p.tone };
    case "problem":
      return { label: `${t(`shared.syncStatus.problems.${p.problem}`)}${queued}`, tone: p.tone };
    case "never":
      return { label: `${t("shared.syncStatus.never")}${queued}`, tone: p.tone };
    case "synced":
      return {
        label: `${t("shared.syncStatus.synced", { ago: agoT(t, p.ago) })}${queued}`,
        tone: p.tone,
      };
  }
}

const NOTIFICATION_IDS = new Set([
  "budgetOver",
  "budgetNear",
  "budgetSpent",
  "billOverdue",
  "billToday",
  "billTomorrow",
  "billInDays",
  "billOpen",
  "reviewCount",
  "reviewCheck",
]);

function notificationText(
  t: TFunction,
  text: NotificationText | undefined,
  fallback: string,
): string {
  if (!text || !NOTIFICATION_IDS.has(text.id)) return fallback;
  // The id is checked against the catalogue ids above; params carry names and counts.
  return loose(t)(`shared.notifications.${text.id}`, {
    ...text.params,
  });
}

export function notificationTitleT(t: TFunction, n: AppNotification): string {
  return notificationText(t, n.titleText, n.title);
}

export function notificationBodyT(t: TFunction, n: AppNotification): string {
  return notificationText(t, n.bodyText, n.body);
}

export function analysisNoteT(t: TFunction, code: AnalysisNoteCode): string {
  return t(`shared.ingest.notes.${code}`);
}

export function parseErrorT(t: TFunction, e: ParseError): string {
  return e.code === "unreadableDate"
    ? t("shared.ingest.rowErrors.unreadableDate", { value: e.value ?? "" })
    : t("shared.ingest.rowErrors.unreadableAmount");
}

export function profileImportErrorT(t: TFunction, e: ProfileImportError): string {
  return t(`shared.ingest.profileErrors.${e.code}`, {
    n: e.params.n ?? 0,
    name: e.params.name ?? "",
  });
}
