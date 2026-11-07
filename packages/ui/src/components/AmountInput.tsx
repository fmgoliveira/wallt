import { currencyExponent, formatAmount, type NumberLocale, parseAmount } from "@wallt/core";
import { useEffect, useState } from "react";
import { Input, type InputProps } from "./Input";

export interface AmountInputProps
  extends Omit<InputProps, "value" | "onChangeText" | "keyboardType" | "error"> {
  /** Integer minor units (e.g. cents), or null when empty. Never a float. */
  value: number | null;
  onChangeValue: (minor: number | null) => void;
  currency: string;
  locale?: NumberLocale;
  /** Sign is handled by the caller (income/expense toggle); allow a leading minus only when true. */
  allowNegative?: boolean;
  error?: string | undefined;
}

function plainText(minor: number, currency: string, locale: NumberLocale): string {
  // formatAmount adds grouping and a symbol; for editing show just digits with the locale decimal mark.
  const formatted = formatAmount({ amount: minor, currency }, locale);
  const digits = formatted.replace(/[^\d.,-]/g, "");
  return currencyExponent(currency) === 0 ? digits.replace(/[.,]/g, "") : digits.replace(/ /g, "");
}

/**
 * Money field. Parsing and formatting go through `@wallt/core` (BigInt, no floats). Keeps the raw text
 * while typing and normalises on blur; emits `null` when empty and surfaces parse errors inline.
 */
export function AmountInput({
  value,
  onChangeValue,
  currency,
  locale = "pt",
  allowNegative = false,
  error,
  onBlur,
  ...rest
}: AmountInputProps) {
  const [text, setText] = useState(() =>
    value === null ? "" : plainText(value, currency, locale),
  );
  const [parseError, setParseError] = useState<string | undefined>();

  // Re-sync when the controlled value changes from outside (e.g. form reset), not while typing.
  useEffect(() => {
    setText((current) => {
      try {
        const currentMinor = current.trim() === "" ? null : parseAmount(current, currency, locale);
        if (currentMinor === value) return current;
      } catch {
        // current text is not parseable: let the external value win
      }
      return value === null ? "" : plainText(value, currency, locale);
    });
  }, [value, currency, locale]);

  function handleChange(next: string) {
    setText(next);
    if (next.trim() === "") {
      setParseError(undefined);
      onChangeValue(null);
      return;
    }
    try {
      const minor = parseAmount(next, currency, locale);
      if (minor < 0 && !allowNegative) {
        setParseError("Enter a positive amount");
        return;
      }
      setParseError(undefined);
      onChangeValue(minor);
    } catch {
      setParseError("Invalid amount");
    }
  }

  return (
    <Input
      {...rest}
      value={text}
      onChangeText={handleChange}
      keyboardType="decimal-pad"
      inputMode="decimal"
      error={error ?? parseError}
      onBlur={(e) => {
        if (!parseError && value !== null) setText(plainText(value, currency, locale));
        onBlur?.(e);
      }}
    />
  );
}
