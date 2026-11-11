import { createContext, type ReactNode, useContext } from "react";

/**
 * Words the UI components show or announce themselves (not passed in by screens). English by default; the app wraps
 * its tree in <UiStringsProvider> with the user's language. `locale` (BCP 47) drives date names.
 */
let currentLocale: string | undefined;

/** Locale for date text produced outside React (e.g. `formatCalendarDate`); the app sets it with the language. */
export function setUiLocale(locale: string | undefined): void {
  currentLocale = locale;
}

export function getUiLocale(): string | undefined {
  return currentLocale;
}

export interface UiStrings {
  locale: string | undefined;
  close: string;
  hiddenAmount: string;
  dragToReorder: string;
  selectPlaceholder: string;
  today: string;
  yesterday: string;
  pickDate: string;
  clear: string;
  previousMonth: string;
  nextMonth: string;
}

export const defaultUiStrings: UiStrings = {
  locale: undefined,
  close: "Close",
  hiddenAmount: "Hidden amount",
  dragToReorder: "Drag to reorder",
  selectPlaceholder: "Select…",
  today: "Today",
  yesterday: "Yesterday",
  pickDate: "Pick a date",
  clear: "Clear",
  previousMonth: "Previous month",
  nextMonth: "Next month",
};

const UiStringsContext = createContext<UiStrings>(defaultUiStrings);

export function UiStringsProvider({ value, children }: { value: UiStrings; children: ReactNode }) {
  return <UiStringsContext.Provider value={value}>{children}</UiStringsContext.Provider>;
}

export function useUiStrings(): UiStrings {
  return useContext(UiStringsContext);
}
